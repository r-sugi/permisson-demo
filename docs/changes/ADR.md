# ADR: SaaS権限管理の設計方針

## ステータス
承認済み

## コンテキスト

小売販売CRM管理アプリケーション（マルチテナント）における権限管理を設計するにあたり、以下の要件を満たす必要があった。

- テナント（フランチャイズ本部）とショップ（加盟店）の階層構造によるアクセス制御
- リソース（テナント・ショップ・カスタマー等）との関係性によるアクセス制御
- 権限ロジックがコードに散らばらず、宣言的・型安全に管理できること
- 新しいリソース種別の追加が容易であること
- ReBACのミスがPBACをすり抜けないよう、2層を独立して監査できること

**テナント構成例**

```
テナントS社
  └─→ 店舗s1
  └─→ 店舗s2
テナントF社
  └─→ 店舗f1
  └─→ 店舗f2
```

**ロール**

| ロール | 所属 | イメージ |
|---|---|---|
| tenant_owner | テナント | フランチャイズ本部オーナー |
| tenant_staff | テナント | フランチャイズ本部スタッフ |
| shop_owner | ショップ | 加盟店オーナー |
| shop_staff | ショップ | 加盟店スタッフ |

---

## 決定

### 1. 権限モデルの使い分け

| モデル | 判断基準 | 該当例 |
|---|---|---|
| **RBAC** | ロール（役職） | tenant_owner / tenant_staff / shop_owner / shop_staff |
| **ReBAC** | リソースとの関係性 | テナントのowner・staff、ショップのowner・staff |
| **PBAC** | 宣言されたポリシー | 加盟店舗のCRUD権限、自店情報の閲覧のみ |

実際のSaaSはこれらを組み合わせて使う。「誰がどのリソースに触れるか（ReBAC）」と「触れた後に何が必要か（PBAC）」は独立した層として設計する。

---

### 2. 2層構造：PBACとReBACを分離する

```
リクエスト
    ↓
【auth middleware】JWTデコード → plan を DB から取得 → PolicyContext に注入
    ↓
【Gate 1: PBAC】PolicyContext（role + plan）でインメモリ評価 → 403
    ↓
【Gate 2: ReBAC】関係性チェック → 404
    ↓
実行 + 監査ログ（どちらの層で弾かれたかを記録）
```

PBACを先に評価することでDBアクセスを最小化できる。ReBACのミスはPBACでは防げないため、2層を別々に設計・テスト・監査する。

| Gate | 判断基準 | DB | 否認時 |
|---|---|---|---|
| **Gate 1: PBAC** | ポリシー（インメモリ） | 不要 | 403 |
| **Gate 2: ReBAC** | リソースとの関係性 | 必要 | 404 |

---

### 3. 型安全な宣言的設計

> **ファイル分割方針**：元の `relation.ts` に混在していた4つの責務を以下のとおり分割する。
>
> | ブロック | 内容 | 分割先 |
> |---|---|---|
> | 型定義（BrandType） | `TenantId`, `ShopId` のブランド型 | `shared/permission/types.ts` |
> | リレーション型群 | `RelationMap`, `ResourceMap`, `ResourceIdMap`, `Relation`, `RelationResolver` | `shared/permission/scope/types.ts` |
> | registry | テーブルごとの Resolver 実装 | `shared/permission/scope/registry.ts` |
> | resolveRelation | registry を呼び出す薄い関数 | `shared/permission/scope/registry.ts` |

---

#### shared/permission/types.ts（BrandType・Plan を追記）

`Role`, `AuthContext`, `PolicyContext` に加え、BrandType・Plan・SHOP_LIMIT_UNLIMITED を同居させる。

```typescript
// ================================
// Role・Plan
// ================================
type Role = 'developer' | 'tenant_owner' | 'tenant_staff' | 'shop_owner' | 'shop_staff' | 'system'
type Plan = 'starter' | 'basic' | 'pro'

// Plan 定数：文字列リテラルを直接書かず、定数経由で参照する
const PLAN = {
  STARTER: 'starter',
  BASIC:   'basic',
  PRO:     'pro',
} as const satisfies Record<string, Plan>

// ================================
// コンテキスト型
// ================================
type AuthContext = {
  userId:   string
  tenantId: string  // JWT から取得。tenant_assignment の ReBAC チェックはインメモリ照合（§B）
  role:     Role
  plan:     Plan    // JWT ではなく auth middleware で DB から取得（課金失敗の即時反映のため）
}

type PolicyContext = {
  role:     Role
  plan:     Plan
  shop_ids: string[]
}

// ================================
// BrandType：IDの種別を型レベルで区別する
// ================================
type TenantId = string & { readonly _brand: 'TenantId' }
type ShopId   = string & { readonly _brand: 'ShopId' }

const TenantId = (id: string): TenantId => id as TenantId
const ShopId   = (id: string): ShopId   => id as ShopId

// ================================
// 数量制限：無制限を表す定数
// null より数値に統一する方が比較処理がシンプルになる
// フロント表示では各定数と比較して「無制限」と出し分ける
// ================================
const SHOP_LIMIT_UNLIMITED   = Number.MAX_SAFE_INTEGER
const EXPORT_LIMIT_UNLIMITED = Number.MAX_SAFE_INTEGER
```

---

#### shared/permission/scope/types.ts（relation.ts の「型定義」ブロック）

```typescript
import { TenantId, ShopId, Role } from '../types'

type TenantAssignmentResource = {
  role: Role
}

type ShopAssignmentResource = {
  adminUserId: string
  shopId: ShopId
}

type RelationMap = {
  tenant_assignment: 'tenant_owner' | 'tenant_staff' | 'developer'
  shop_assignment:   'shop_assigned'
}

type ResourceMap = {
  tenant_assignment: TenantAssignmentResource
  shop_assignment:   ShopAssignmentResource
}

type ResourceIdMap = {
  tenant_assignment: TenantId
  shop_assignment:   ShopId
}

type Relation = RelationMap[keyof RelationMap]
type RelationResolver<T> = (userId: string, resource: T) => Relation | null
```

---

#### shared/permission/scope/registry.ts（純粋関数のみ・DB アクセスなし）

DB アクセスを伴う `resolveRelation` / `resolveUserRelation` は `shared/` に置けない（§C・§9 参照）。
`registry` は渡された `resource` オブジェクトから Relation を返す純粋関数として実装する。
DB からリソースを取得して `registry` を呼び出すコードは `worker/middleware/authorize.ts` に置く。

```typescript
import type { ResourceMap, Relation, RelationResolver } from './types'

// 純粋関数：DBアクセスなし。resource は Worker 層で DB から取得して渡す
export const registry: {
  [K in keyof ResourceMap]: RelationResolver<ResourceMap[K]>
} = {
  tenant_assignment: (_userId, resource) => {
    return resource.role as Relation
  },
  shop_assignment: (userId, resource) => {
    if (resource.adminUserId === userId) return 'shop_assigned'
    return null
  },
}
```

#### worker/middleware/authorize.ts（DB アクセス・resolveUserRelation）

`registry` を呼び出すための DB 取得ロジックと `resolveUserRelation` は Worker 層に配置する。

```typescript
// Gate 2: ReBAC（DBアクセス）
if (options.relation.resourceTable === 'tenant_assignment') {
  // JWT の tenantId と URL の tenantId を照合するだけ（DBアクセス不要）
  if (auth.tenantId === tenantId) {
    relation = registry.tenant_assignment(auth.userId, { role: auth.role })
  }
} else if (options.relation.resourceTable === 'shop_assignment') {
  const row = await db.select().from(schema.shopAssignments)
    .where(eq(schema.shopAssignments.userId, auth.userId)).all()
    .then((rows) => rows.find((r) => r.shopId === shopId) ?? null)
  if (row) {
    relation = registry.shop_assignment(auth.userId, {
      adminUserId: row.userId,
      shopId: row.shopId as ShopId,
    })
  }
}

// ユーザーのassignmentを引き、relationとresourceIdを返す
export async function resolveUserRelation(
  db: DrizzleDb,
  userId: string
): Promise<{ relation: Relation; resourceId: string }> {
  // admin_users を引いて role に応じて tenant / shop の resourceId を返す
}
```

---

#### apps/cms/worker/repository/subscription.repository.ts

```typescript
// apps/cms/worker/repository/subscription.repository.ts

class SubscriptionRepository {
  // findValidOne: 課金ステータスが有効なレコードのみ取得する
  // → 失効済みの場合は null が返る
  async findValidByTenantId(tenantId: string): Promise<Subscription | null> {
    return db.subscriptions.findValidOne({ tenantId })
  }
}
```

---

#### worker/middleware/auth.ts（plan は DB から取得）

`role` は管理側の意図的な操作（降格・退職等）で変わるため JWT でも許容範囲。
`plan` は Stripe など外部システム起因で突然失効するため、毎リクエスト DB から取得して即時反映する。
`db` は直接叩かず、`SubscriptionRepository` 経由でアクセスする。

```typescript
// worker/middleware/auth.ts

export async function authContextMiddleware(c: Context<HonoEnv>, next: Next) {
  const payload = c.get('jwtPayload') as JwtPayload

  // plan は SubscriptionRepository 経由で毎回取得（課金失敗の即時反映のため）
  // 失効済みの場合は null が返り、plan を解決できないため認証エラーになる
  const subscriptionRepo = new SubscriptionRepository(c.get('db'))
  const subscription = await subscriptionRepo.findValidByTenantId(payload.tenantId)
  if (!subscription) {
    throw new HTTPException(401, { message: 'Subscription is not active' })
  }

  c.set('auth', {
    userId:   payload.sub,
    tenantId: payload.tenantId,  // tenant_assignment の ReBAC はインメモリ照合（§B）
    role:     payload.role,       // role は JWT でOK（即時性不要）
    plan:     subscription.plan,  // plan は DB（即時反映が必要）
  } satisfies AuthContext)

  await next()
}
```

---

#### apps/cms/worker/middleware/authorize.ts（AuthorizeOptions + ミドルウェア本体）

```typescript
import type { RelationMap, ResourceIdMap } from 'shared/permission/scope/types'
import { resolveRelation } from 'shared/permission/scope/registry'
import { POLICY_MAP } from 'shared/permission/policy/context'
import type { PolicyTarget } from 'shared/permission/policy/context'
import type { Action } from 'shared/permission/permissions'

type PolicyOption = {
  target: PolicyTarget
  action: Action
}

type ReBACOption<K extends keyof RelationMap> = {
  resourceTable: K
  anyOfRoles?: RelationMap[K] | RelationMap[K][]
  getId: (c: Context) => ResourceIdMap[K]
}

type AuthorizeOptions<K extends keyof RelationMap = keyof RelationMap> = {
  policy?:   PolicyOption
  relation?: ReBACOption<K>
}

export const authorize = <K extends keyof RelationMap>(
  options: AuthorizeOptions<K>
) =>
  createMiddleware<{ Variables: Variables }>(async (c, next) => {
    const auth = c.get('auth') as AuthContext

    // Gate 1: PBAC（role + plan でインメモリ評価・DBアクセスなし）
    if (options.policy) {
      const { target, action } = options.policy
      const context: PolicyContext = { role: auth.role, plan: auth.plan, shop_ids: [] }
      const policy = POLICY_MAP[target][auth.role](context)
      const permissions = policy.listPermissions()

      if (!permissions[action]) {
        throw new HTTPException(403, {
          message: buildPermissionDeniedMessage(target, action)
        })
      }
    }

    // Gate 2: ReBAC（DBアクセス）
    if (options.relation) {
      const resourceId = options.relation.getId(c)
      const relation = await resolveRelation(
        auth.userId,
        options.relation.resourceTable,
        resourceId
      )

      const required = options.relation.anyOfRoles
      const allowed = !required
        ? relation !== null
        : Array.isArray(required)
          ? required.includes(relation)
          : relation === required

      if (!allowed) {
        throw new HTTPException(404, { message: 'Not Found' })
      }
    }

    await next()
  })
```

---

#### 呼び出し側

```typescript
// PBACのみ（カスタマー閲覧）
app.get('/customers',
  authorize({ policy: { target: 'customer', action: 'read' } }),
  async (c) => { ... }
)

// PBAC + ReBAC（shop_owner / tenant_owner / tenant_staffが自店情報を閲覧）
app.get('/shops/:shopId',
  authorize({
    policy:   { target: 'shop', action: 'read' },
    relation: {
      resourceTable: 'shop_assignment',
      getId: (c) => ShopId(c.req.param('shopId')),
    }
  }),
  handler
)

// PBAC + ReBAC（テナントオーナー・スタッフが加盟店舗を論理削除）
app.delete('/tenants/:tenantId/shops/:shopId',
  authorize({
    policy:   { target: 'settings', action: 'deleteShop' },
    relation: {
      resourceTable: 'tenant_assignment',
      anyOfRoles:    ['tenant_owner', 'tenant_staff'],
      getId: (c) => TenantId(c.req.param('tenantId')),
    }
  }),
  handler
)
```

---

### 4. CustomerRepository + CustomerScope（一覧取得・一括操作のスコープ絞り込み）

#### 判断基準：IDがURLパラメータで固定されているか否か

| ケース | authorizeで十分か | 対応 |
|---|---|---|
| 単一リソースのMutation（`/shops/:shopId`） | ✅ 十分 | authorizeのみ |
| READ一覧取得（`/customers`） | ❌ 不十分 | CustomerRepository経由でスコープ解決 |
| 一括操作のMutation（bodyにIDリスト） | ❌ 不十分 | CustomerRepository経由でスコープ検証 |

---

#### CustomerScope（インターフェース・抽象基底クラス）

DB アクセスのない interface / 抽象基底クラスのみ `shared/` に置く（§C 参照）。
`TenantCustomerScope` / `ShopCustomerScope` / `scopeMap` は DB が必要なため Worker 層に置く。

```typescript
// shared/permission/scope/customer/scope.ts

export interface CustomerScope {
  resolveIds(): Promise<string[]>
  validateIds(customerIds: string[]): Promise<string[]>
}

export abstract class BaseCustomerScope implements CustomerScope {
  abstract resolveIds(): Promise<string[]>

  async validateIds(customerIds: string[]): Promise<string[]> {
    const accessibleIds = await this.resolveIds()
    const accessibleSet = new Set(accessibleIds)
    const invalidIds = customerIds.filter(id => !accessibleSet.has(id))
    if (invalidIds.length > 0) {
      throw new HTTPException(403, {
        message: 'アクセス権のないカスタマーIDが含まれています',
      })
    }
    return customerIds
  }
}
```

```typescript
// shared/permission/scope/customer/scope-map.ts（型定義のみ）

export type CustomerScopeFactory = (resourceId: string) => CustomerScope

export type ScopeMap = {
  [K in Relation]: CustomerScopeFactory
}
```

---

#### CustomerRepository（Worker 層）

`TenantCustomerScope` / `ShopCustomerScope` / `scopeMap` は Drizzle DB インスタンスが必要なため
`worker/repository/customer.repository.ts` に配置する（§C 参照）。

```typescript
// worker/repository/customer.repository.ts

class TenantCustomerScope extends BaseCustomerScope {
  constructor(private readonly tenantId: string, private readonly db: DrizzleDb) { super() }
  async resolveIds(): Promise<string[]> { /* Drizzle で shops → purchaseHistories を結合 */ }
}

class ShopCustomerScope extends BaseCustomerScope {
  constructor(private readonly shopId: string, private readonly db: DrizzleDb) { super() }
  async resolveIds(): Promise<string[]> { /* Drizzle で purchaseHistories を取得 */ }
}

const scopeMap: Record<Relation, (resourceId: string, db: DrizzleDb) => CustomerScope> = {
  tenant_owner:  (resourceId, db) => new TenantCustomerScope(resourceId, db),
  tenant_staff:  (resourceId, db) => new TenantCustomerScope(resourceId, db),
  developer:     (resourceId, db) => new TenantCustomerScope(resourceId, db),
  shop_assigned: (resourceId, db) => new ShopCustomerScope(resourceId, db),
}

export class CustomerRepository {
  private scopeCache?: CustomerScope

  private constructor(private readonly userId: string, private readonly db: DrizzleDb) {}

  static create(userId: string, db: DrizzleDb): CustomerRepository {
    return new CustomerRepository(userId, db)
  }

  private async resolveScope(): Promise<CustomerScope> {
    if (!this.scopeCache) {
      const { relation, resourceId } = await resolveUserRelation(this.db, this.userId)
      this.scopeCache = scopeMap[relation](resourceId, this.db)
    }
    return this.scopeCache
  }

  async findAll(): Promise<Customer[]> {
    const scope = await this.resolveScope()
    const accessibleIds = await scope.resolveIds()
    return this.db.select().from(schema.customers).where(inArray(schema.customers.id, accessibleIds)).all()
  }

  async validateIds(customerIds: string[]): Promise<string[]> {
    const scope = await this.resolveScope()
    return scope.validateIds(customerIds)
  }
}
```

---

#### DIミドルウェア・ルート

`c.env` は Cloudflare Workers の bindings であるため UseCase の注入先には使えない。
Hono の `c.set()` / `c.get()` と `Variables` 型を使う。

```typescript
// worker/middleware/di.ts
export async function diMiddleware(c: Context<HonoEnv>, next: Next) {
  const auth = c.get('auth')
  const db = c.get('db')
  const customerRepo = CustomerRepository.create(auth.userId, db)
  c.set('useCase', {
    customer: new CustomerUseCase(customerRepo, auth),
    shop:     new ShopUseCase(db, auth),
  })
  await next()
}
```

```typescript
// worker/type.ts
type UseCases = {
  customer: CustomerUseCase
  shop:     ShopUseCase
}

type Variables = {
  auth:     AuthContext
  db:       DrizzleDb
  useCase: UseCases
}
```

**routes の責務ルール**：route ハンドラは `c.get('useCase')` 経由で UseCase を呼ぶだけ。`db` を直接操作してはならない。

```
✅ route → c.get('useCase').xxx → useCase → repository → db
❌ route → db（直接）
```

```typescript
// worker/routes/customers.ts
app.get('/customers',
  authorize({ policy: { target: 'customer', action: 'read' } }),
  async (c) => {
    const customers = await c.get('useCase').customer.listCustomers()
    return c.json(customers)
  }
)

// CSVエクスポート（plan 条件は exportCsv に織り込まれている → authorize 本体の変更不要）
app.get('/customers/export',
  authorize({ policy: { target: 'customer', action: 'exportCsv' } }),
  async (c) => {
    const customers = await c.get('useCase').customer.exportCsv()
    return c.json({ customers, exportedAt: new Date().toISOString(), count: customers.length })
  }
)
```

---

### 5. POLICY_MAP（PBACのポリシー定義）

#### PolicyBase・XxxPolicyBase・ロール実装クラス

```typescript
abstract class PolicyBase {
  constructor(protected context: PolicyContext) {}
}

// ================================
// Settings
// ================================

// role に起因する権限（plan によらず固定）
type SettingsPermissions = {
  createShop: boolean
  updateShop: boolean
  deleteShop: boolean
}

// plan に起因する機能制限（role × plan で決まる）
type SettingsPlanFeatures = {
  createShopLimit: number
}

abstract class SettingsPolicyBase extends PolicyBase {
  abstract listPermissions(): SettingsPermissions & SettingsPlanFeatures
}

// ================================
// Customer
// ================================

type CustomerPermissions = {
  create: boolean
  read:   boolean
  update: boolean
  delete: boolean
}

type CustomerPlanFeatures = {
  exportCsv:      boolean
  exportCsvLimit: number
}

abstract class CustomerPolicyBase extends PolicyBase {
  abstract listPermissions(): CustomerPermissions & CustomerPlanFeatures
}

// ================================
// Settings 実装
// ================================

// settings: tenant_owner / tenant_staff
class TenantOwnerSettingsPolicy extends SettingsPolicyBase {
  listPermissions() {
    return {
      ...this.rolePermissions(),
      ...this.planFeatures(),
    }
  }

  private rolePermissions(): SettingsPermissions {
    return { createShop: true, updateShop: true, deleteShop: true }
  }

  private planFeatures(): SettingsPlanFeatures {
    return { createShopLimit: this.resolveCreateShopLimit() }
  }

  private resolveCreateShopLimit(): number {
    const limits: Record<Plan, number> = {
      [PLAN.STARTER]: 5,
      [PLAN.BASIC]:   30,
      [PLAN.PRO]:     SHOP_LIMIT_UNLIMITED,
    }
    return limits[this.context.plan]
  }
}

// shop_owner / shop_staff は createShop 自体が false
class ShopOwnerSettingsPolicy extends SettingsPolicyBase {
  listPermissions() {
    return {
      ...this.rolePermissions(),
      ...this.planFeatures(),
    }
  }

  private rolePermissions(): SettingsPermissions {
    return { createShop: false, updateShop: false, deleteShop: false }
  }

  private planFeatures(): SettingsPlanFeatures {
    return { createShopLimit: 0 }
  }
}

// ================================
// Customer 実装
// ================================

// customer: tenant_owner / tenant_staff
class TenantOwnerCustomerPolicy extends CustomerPolicyBase {
  listPermissions() {
    return {
      ...this.rolePermissions(),
      ...this.planFeatures(),
    }
  }

  private rolePermissions(): CustomerPermissions {
    return { create: true, read: true, update: true, delete: true }
  }

  private planFeatures(): CustomerPlanFeatures {
    return {
      exportCsv:      this.context.plan !== PLAN.STARTER,
      exportCsvLimit: this.resolveExportCsvLimit(),
    }
  }

  private resolveExportCsvLimit(): number {
    const limits: Record<Plan, number> = {
      [PLAN.STARTER]: 0,
      [PLAN.BASIC]:   100,
      [PLAN.PRO]:     EXPORT_LIMIT_UNLIMITED,
    }
    return limits[this.context.plan]
  }
}

// customer: shop_owner
class ShopOwnerCustomerPolicy extends CustomerPolicyBase {
  listPermissions() {
    return {
      ...this.rolePermissions(),
      ...this.planFeatures(),
    }
  }

  private rolePermissions(): CustomerPermissions {
    return { create: false, read: true, update: true, delete: false }
  }

  private planFeatures(): CustomerPlanFeatures {
    return {
      exportCsv:      this.context.plan !== PLAN.STARTER,
      exportCsvLimit: this.resolveExportCsvLimit(),
    }
  }

  private resolveExportCsvLimit(): number {
    const limits: Record<Plan, number> = {
      [PLAN.STARTER]: 0,
      [PLAN.BASIC]:   100,
      [PLAN.PRO]:     EXPORT_LIMIT_UNLIMITED,
    }
    return limits[this.context.plan]
  }
}

// customer: shop_staff（role で全面不可）
class ShopStaffCustomerPolicy extends CustomerPolicyBase {
  listPermissions() {
    return {
      ...this.rolePermissions(),
      ...this.planFeatures(),
    }
  }

  private rolePermissions(): CustomerPermissions {
    return { create: false, read: false, update: false, delete: false }
  }

  private planFeatures(): CustomerPlanFeatures {
    return { exportCsv: false, exportCsvLimit: 0 }
  }
}
```

---

#### POLICY_MAP

```typescript
const POLICY_MAP = {
  customer: {
    developer:    (ctx) => new TenantOwnerCustomerPolicy(ctx),
    tenant_owner: (ctx) => new TenantOwnerCustomerPolicy(ctx),
    tenant_staff: (ctx) => new TenantOwnerCustomerPolicy(ctx),
    shop_owner:   (ctx) => new ShopOwnerCustomerPolicy(ctx),
    shop_staff:   (ctx) => new ShopStaffCustomerPolicy(ctx),
    system:       (ctx) => new TenantOwnerCustomerPolicy(ctx),
  },
  settings: {
    developer:    (ctx) => new TenantOwnerSettingsPolicy(ctx),
    tenant_owner: (ctx) => new TenantOwnerSettingsPolicy(ctx),
    tenant_staff: (ctx) => new TenantOwnerSettingsPolicy(ctx),
    shop_owner:   (ctx) => new ShopOwnerSettingsPolicy(ctx),
    shop_staff:   (ctx) => new ShopOwnerSettingsPolicy(ctx),
    system:       (ctx) => new TenantOwnerSettingsPolicy(ctx),
  },
  // 全ロールで read=true（一覧の絞り込みは Repository 層で行う）
  shop: {
    developer:    (ctx) => new AllReadShopPolicy(ctx),
    tenant_owner: (ctx) => new AllReadShopPolicy(ctx),
    tenant_staff: (ctx) => new AllReadShopPolicy(ctx),
    shop_owner:   (ctx) => new AllReadShopPolicy(ctx),
    shop_staff:   (ctx) => new AllReadShopPolicy(ctx),
    system:       (ctx) => new AllReadShopPolicy(ctx),
  },
} as const

export type PolicyTarget = keyof typeof POLICY_MAP
```

---

#### PermissionsMap（ログイン時に計算・JWTに載せる）

```typescript
// shared/permission/permissions.ts

// listPermissions() の返り値型を再利用（intersection で合成済み）
interface PermissionsMap {
  customer: CustomerPermissions & CustomerPlanFeatures
  settings: SettingsPermissions & SettingsPlanFeatures
  // dashboard, shop ... 同様に追加
}

function buildPermissionsMap(context: PolicyContext): PermissionsMap {
  return Object.fromEntries(
    Object.entries(POLICY_MAP).map(([target, roles]) => [
      target,
      roles[context.role](context).listPermissions()
    ])
  ) as PermissionsMap
}
```

---

#### apps/cms/worker/usecase/shop.usecase.ts（数量チェックはUseCaseで）

`createShop: true` は Gate 1 で保証済み。UseCaseでは現在の件数と `createShopLimit` を比較するだけ。

```typescript
async createShop(tenantId: string, data: CreateShopData) {
  const { createShopLimit } = POLICY_MAP
    .settings[this.context.role](this.context)
    .listPermissions()

  const currentCount = await this.shopRepo.countByTenant(tenantId)
  if (currentCount >= createShopLimit) {
    throw new ShopQuotaExceededException(
      `このプランで作成できる店舗数は${createShopLimit === SHOP_LIMIT_UNLIMITED ? '無制限' : `${createShopLimit}件`}までです（現在: ${currentCount}件）`
    )
  }

  return this.shopRepo.create(tenantId, data)
}
```

---

#### apps/cms/worker/usecase/customer.usecase.ts（exportCsv の数量チェック）

`exportCsv: true` は Gate 1 で保証済み。UseCaseでは `exportCsvLimit` と比較するだけ。

```typescript
async exportCsv() {
  const { exportCsvLimit } = POLICY_MAP
    .customer[this.context.role](this.context)
    .listPermissions()

  const currentMonthCount = await this.customerRepo.countExportsThisMonth()
  if (currentMonthCount >= exportCsvLimit) {
    throw new ExportQuotaExceededException(
      `このプランのエクスポート上限（月${exportCsvLimit === EXPORT_LIMIT_UNLIMITED ? '無制限' : `${exportCsvLimit}件`}）に達しています`
    )
  }

  return this.customerRepo.exportAll()
}
```

---

#### エラーの意味の分離

| 状況 | 層 | HTTPステータス |
|---|---|---|
| そもそも権限がない（role で不可、または plan で不可） | Gate 1: PBAC | 403 |
| 権限はあるが数量上限に達している（店舗数・エクスポート数等） | UseCase | 422 |
| テナントへの所属関係がない | Gate 2: ReBAC | 404 |

---

### 6. ReBACの責務：該当するもの・しないもの

ReBACが答える問いは常に **「このユーザーと、このリソースの間にエッジ（tuple）が存在するか」** である。集計・集約・状態比較はこの問いに当てはまらない。

#### 該当するもの ✅

| チェック内容 | 例 |
|---|---|
| ユーザーとリソースの**関係の存在** | `(user_A, tenant_owner, tenant_S)` が存在するか |
| 特定リソースへの**到達可否** | user_A は shop_s1 に辿り着けるか |
| 関係の**種別チェック** | tenant_owner か tenant_staff かどちらか |
| **存在の秘匿**（404返却） | 関係がなければそのリソースの存在自体を隠す |

#### 該当しないもの ❌

| チェック内容 | 理由 | 担当 |
|---|---|---|
| 店舗数が上限を超えているか | リソースの**集計**であってエッジの有無ではない | UseCase |
| プランごとの上限値は何か | role + plan から決まる**宣言的な値** | PBAC |
| そもそも createShop の権限があるか | ユーザーとリソースの関係ではなく**ロールの能力** | PBAC |
| カスタマー一覧のスコープ絞り込み | 関係の存在チェックではなく**集合の取得** | CustomerScope / UseCase |
| APIレート制限 | リソースとの関係ではなく**時間軸の集計** | Middleware |
| 入力値のバリデーション | リソースとの関係と無関係 | Validation / UseCase |
| 課金状態（planの有効・失効） | リソースとの関係ではなく**外部システムの状態** | auth middleware → PolicyContext |

#### 店舗数が「ReBAC っぽく見える」理由と違い

```
ReBAC が答える問い：
  「user_A は tenant_S に tenant_owner として紐づいているか？」
  → YES / NO のバイナリ・エッジの有無

店舗数チェックが答える問い：
  「tenant_S 配下の店舗は今何件あり、上限を超えているか？」
  → COUNT の比較・リソースの集計状態
```

ReBACはグラフのエッジを辿るものであり、集合のサイズを測るものではない。`count >= limit` はユーザーとリソースの関係性ではなく、**テナントというリソースの状態に対するビジネスルール**である。

---

### 7. フロント制御（PermissionsMapによるUI表示制御）

```typescript
// apps/cms/src/providers/permission/permissionProvider.tsx
export function PermissionProvider({ children }: PermissionProviderProps) {
  const [permissions, setPermissions] = useState<PermissionsMap | null>(null)

  const checkAuth = async () => {
    const res = await apiClient.api.auth.me.$get()
    setPermissions(res.data.permissions ?? null)
  }

  return (
    <PermissionContext.Provider value={{ permissions, checkAuth }}>
      {children}
    </PermissionContext.Provider>
  )
}
```

```typescript
// apps/cms/src/providers/permission/usePermission.ts
export function usePermission() {
  const { permissions } = usePermissionContext()

  const hasPermission = (target: Target, action: Action): boolean =>
    hasPermissionInMap(permissions, target, action)

  // 数量制限の表示用ヘルパー
  const createShopLimit = permissions?.settings.createShopLimit
  const isCreateShopLimitUnlimited = createShopLimit === SHOP_LIMIT_UNLIMITED

  const exportCsvLimit = permissions?.customer.exportCsvLimit
  const isExportCsvLimitUnlimited = exportCsvLimit === EXPORT_LIMIT_UNLIMITED

  return { hasPermission, createShopLimit, isCreateShopLimitUnlimited, exportCsvLimit, isExportCsvLimitUnlimited }
}
```

```typescript
// apps/cms/src/components/Permission.tsx
export function Permission({ target, action, children, fallback = null }: PermissionProps) {
  const { hasPermission } = usePermission()
  return hasPermission(target, action) ? <>{children}</> : <>{fallback}</>
}

// 使用例：plan 条件が exportCsv に織り込まれているので <Permission> がそのまま使える
<Permission
  target="customer"
  action="exportCsv"
  fallback={<p className="text-muted">CSVエクスポートは Basic プラン以上でご利用いただけます</p>}
>
  <button>CSVエクスポート</button>
</Permission>

<Permission
  target="settings"
  action="createShop"
  fallback={<p className="text-muted">店舗の追加権限がありません</p>}
>
  <button>店舗を追加する</button>
</Permission>

<Permission
  target="customer"
  action="delete"
  fallback={<button disabled>削除（権限なし）</button>}
>
  <button>このカスタマーを削除する</button>
</Permission>

// 上限表示
const { createShopLimit, isCreateShopLimitUnlimited, exportCsvLimit, isExportCsvLimitUnlimited } = usePermission()
<span>{isCreateShopLimitUnlimited ? '無制限' : `最大 ${createShopLimit} 店舗`}</span>
<span>{isExportCsvLimitUnlimited ? '無制限' : `月 ${exportCsvLimit} 件まで`}</span>
```

---

### 8. ファイルツリー

```
shared/
└── permission/
    ├── types.ts              # Role, Plan, PLAN 定数, AuthContext（tenantId 含む）, PolicyContext
    │                         # BrandType: TenantId, ShopId + コンストラクタ関数
    │                         # SHOP_LIMIT_UNLIMITED, EXPORT_LIMIT_UNLIMITED
    │
    ├── permissions.ts        # PermissionsMap, Action
    │                         # hasPermissionInMap(), buildPermissionDeniedMessage()
    │                         # buildPermissionsMap()
    │
    ├── policy/
    │   ├── base.ts           # PolicyBase（抽象基底）
    │   ├── context.ts        # POLICY_MAP（customer / settings / shop）, PolicyTarget
    │   │                     # buildPermissionDeniedMessage()
    │   │
    │   └── {resource}/       # customer/, shop/, settings/ ...
    │       ├── types.ts     # XxxPermissions, XxxPlanFeatures
    │       ├── base.ts      # XxxPolicyBase（listPermissions(): XxxPermissions & XxxPlanFeatures）
    │       └── roles/
    │           ├── developer.ts
    │           ├── tenant-owner.ts
    │           ├── tenant-staff.ts
    │           ├── shop-owner.ts
    │           ├── shop-staff.ts
    │           └── system.ts
    │
    └── scope/
        ├── types.ts          # RelationMap, ResourceMap, ResourceIdMap
        │                     # TenantAssignmentResource, ShopAssignmentResource
        │                     # Relation, RelationResolver
        │                     # ※ BrandType は ../types.ts から import
        │
        ├── registry.ts       # registry（純粋関数のみ・DBアクセスなし）
        │                     # ※ resolveRelation / resolveUserRelation は Worker 層
        │
        └── customer/
            ├── scope.ts      # CustomerScope interface
            │                 # BaseCustomerScope（抽象基底・DBアクセスなし）
            └── scope-map.ts  # CustomerScopeFactory 型, ScopeMap 型（型定義のみ）
                              # ※ TenantCustomerScope / ShopCustomerScope / scopeMap 実装は Worker 層

worker/                       # Cloudflare Workers × Hono
├── middleware/
│   ├── auth.ts               # JWTデコード + SubscriptionRepository 経由で plan を取得 → AuthContext に注入
│   ├── authorize.ts          # authorize MW 本体（Gate 1: PBAC / Gate 2: ReBAC）
│   │                         # AuthorizeOptions, PolicyOption, ReBACOption
│   │                         # resolveUserRelation()（DB アクセスが必要なため Worker 層に配置）
│   └── di.ts                 # DIミドルウェア（CustomerRepository / UseCase を c.set('useCase', ...) で注入）
│
├── repository/
│   ├── customer.repository.ts      # TenantCustomerScope, ShopCustomerScope, scopeMap
│   │                               # CustomerRepository（resolveScope, findAll, findById, update, delete）
│   └── subscription.repository.ts  # SubscriptionRepository（findValidByTenantId）
│
├── usecase/
│   ├── customer.usecase.ts   # CustomerUseCase（listCustomers, updateCustomer, deleteCustomer, exportCsv）
│   └── shop.usecase.ts       # ShopUseCase（listShops, createShop, deleteShop）
│
├── type.ts                   # HonoEnv, Variables（auth / db / useCase）, UseCases 型
│
└── routes/
    ├── auth.ts               # ログイン・/me ルート
    ├── customers.ts          # Hono ルート定義（c.get('useCase').customer 経由）
    └── shops.ts              # Hono ルート定義（c.get('useCase').shop 経由）

src/                          # フロントエンド（React）
├── providers/
│   └── permission/
│       ├── permissionProvider.tsx  # PermissionProvider（PermissionsMap 保持・供給）
│       └── usePermission.ts        # hasPermission(), createShopLimit, isCreateShopLimitUnlimited
└── components/
    └── Permission.tsx             # <Permission target action> 表示制御
```

---

### 9. 依存方向

`shared/` は `worker/` / `src/` を import しない（一方向）。

```
src/（React）
  └── import ← shared/permission/permissions.ts
                shared/permission/types.ts        （SHOP_LIMIT_UNLIMITED も含む）

worker/（Hono / Cloudflare Workers）
  └── import ← shared/permission/scope/types.ts
                shared/permission/scope/registry.ts   （純粋関数のみ）
                shared/permission/policy/context.ts
                shared/permission/types.ts

shared/permission/scope/types.ts
  └── import ← shared/permission/types.ts（BrandType）

shared/ には DB アクセスを含むコードを置かない。
DB アクセス・resolveUserRelation・TenantCustomerScope 等は worker/ に配置する。
```

---

### 10. 全体の型の流れ

```
XxxPermissions / XxxPlanFeatures（型レベルの責務分離）
  XxxPermissions                role 起因 → plan によらず固定
  XxxPlanFeatures               plan 起因 → role × plan で決まる
  listPermissions()             intersection で合成 → authorize は変更不要

Plan / PLAN 定数              [shared/permission/types.ts]
  └─→ PolicyContext.plan      auth middleware で DB から解決（即時反映）
        └─→ planFeatures()    Policy クラス内で plan 分岐を集約
              ├─→ createShopLimit       settings の数量上限
              ├─→ exportCsvLimit        customer の数量上限
              └─→ exportCsv: boolean    plan 条件を action に織り込む（B案）

PermissionsMap / POLICY_MAP
  ├─→ PolicyTarget            POLICY_MAPのキー
  ├─→ PolicyOption            authorize()のpolicy引数
  └─→ buildPermissionsMap()   ログイン時に計算・JWTに載せる
       └─→ XxxPermissions & XxxPlanFeatures がフラットにフロントへ届く

RelationMap                   [shared/permission/scope/types.ts]
  ├─→ ReBACOption<K>          resourceTableとanyOfRolesを連動
  ├─→ AuthorizeOptions<K>     optionsに組み込む
  ├─→ authorize<K>()          MW関数で型推論        [worker/middleware/authorize.ts]
  └─→ registry                実装漏れをコンパイル時に検知  [shared/permission/scope/registry.ts]

ResourceIdMap（BrandType）     [shared/permission/types.ts]
  ├─→ TenantId / ShopId       IDの種別を型レベルで区別
  ├─→ ReBACOption<K>.getId    resourceTableに対応するID型のみ返せる
  └─→ resolveRelation         resourceIdの型を保証

Relation（RelationMapの値の型）
  └─→ scopeMap               relationとScopeの対応を宣言的に定義
        ├─→ TenantCustomerScope
        └─→ ShopCustomerScope

IDの固定/不定で使い分け
  URLパラメータでID固定  → authorize のみ
  IDが不定（一覧・bulk） → scope.resolveIds() / scope.validateIds()

createShop の多層チェック
  Gate 1 PBAC  → createShop: false なら 403         （rolePermissions）
  UseCase      → currentCount >= createShopLimit なら 422  （planFeatures）
  Gate 2 ReBAC → テナントへの所属関係なければ 404

exportCsv の多層チェック（B案パターン）
  Gate 1 PBAC  → exportCsv: false なら 403           （planFeatures で plan 条件を織り込み済み）
  UseCase      → monthlyCount >= exportCsvLimit なら 422  （planFeatures）
```

---

### 11. 新しいリソースを追加するときの作業

```
【PBAC側】
1. XxxPermissions 型を追加            → role 起因の権限を定義
2. XxxPlanFeatures 型を追加           → plan 起因の機能制限を定義（不要なら省略可）
3. XxxPolicyBase を追加               → listPermissions(): XxxPermissions & XxxPlanFeatures
4. ロールごとの実装クラスを追加        → rolePermissions() / planFeatures() で分離実装
5. POLICY_MAPに登録                   → authorize()で評価される
6. PermissionsMapにリソースを追加      → フロントの型が効く

【ReBAC側】
7. RelationMapに型を追加              → authorizeの引数に型が効く  [scope/types.ts]
8. ResourceMapに型を追加              → registryのfetchに型が効く  [scope/types.ts]
9. registryに実装を追加               → 追加漏れはコンパイルエラーで検知  [scope/registry.ts]

【数量制限を伴うリソース（XxxPlanFeatures に追加）】
10. XxxPlanFeatures に xLimit: number を追加
11. resolveXLimit() で PLAN 定数ごとの上限を宣言
12. UseCase で countBy～ + xLimit を比較

【plan 依存で可否が変わるアクション（B案パターン・XxxPlanFeatures に追加）】
13. XxxPlanFeatures に action: boolean を追加
14. planFeatures() で this.context.plan !== PLAN.STARTER 等の分岐を返す
15. authorize は変更不要 → ルート側は action 名だけで宣言的に書ける
16. PermissionsMap に反映されるためフロントの <Permission> もそのまま使える
```

ミドルウェア本体（`authorize`）は一切変更不要。

---

### 12. 否認時のステータスコード方針

| Gate | 否認時 | 理由 |
|---|---|---|
| **Gate 1: PBAC** | 403 | role で不可、または plan 条件が action に織り込まれて不可 |
| **UseCase: 数量超過** | 422 | 権限はあるが数量上限に達した |
| **Gate 2: ReBAC** | 404 | リソースの存在自体を隠す |

B案により、plan で不可のケース（例：starter の exportCsv）も Gate 1 の 403 に統合される。
呼び出し側やフロントから見ると「role で弾かれた」のと「plan で弾かれた」の区別は不要で、単に「権限がない」として扱える。

---

## 結果

- `authorize`はtarget + actionで意図が明確になり、ロールの列挙がルートから消える
- `POLICY_MAP`でリソース×ロールのポリシーを一元管理し、ロール変更はクラスだけ修正すれば良い
- `plan` は auth middleware で毎リクエストDBから取得することで、課金失敗を即時反映できる
- plan 依存の可否は action 名に織り込む（B案）ことで、authorize 本体の変更なしに plan 条件を追加でき、`<Permission>` もそのまま使える
- `XxxPermissions`（role 起因）と `XxxPlanFeatures`（plan 起因）を型レベルで分離し、Policy クラスの `rolePermissions()` / `planFeatures()` で実装を明確に分ける
- plan 文字列は `PLAN.STARTER` 等の定数で参照し、リテラル散在を防ぐ
- `createShopLimit` / `exportCsvLimit` は `SHOP_LIMIT_UNLIMITED` / `EXPORT_LIMIT_UNLIMITED` で統一し、null チェック不要でシンプルな比較処理を保つ
- 数量チェックは「上限値の宣言（PBAC）」と「現在値との比較（UseCase）」に分離し、ReBACの責務と明確に区別する
- `PermissionsMap`をフロント・バックエンドで共有し、`<Permission target action>`でUI表示制御を統一できる
- `RelationMap`と`ResourceMap`を追加するだけで新リソースに対応でき、実装漏れはコンパイル時に検知される
- ReBACとPBACが独立しているため、どちらの層で問題が起きたか特定できる
- 404返却によりリソースの存在自体を秘匿できる
- `apps/` → `shared/` の一方向依存を守ることで、worker・フロントの両方から安全に共有型を参照できる

## 実装上の設計判断

---

### A. データモデル：`role` と `tenantId` を `admin_users` に集約

ユーザーとテナントの関係には以下の業務制約がある。

- ユーザーは必ず **1テナントにのみ** 所属する（1:1）
- ショップへの所属は **1:n**（複数店舗に所属できる）
- 1人のユーザーの role は全所属ショップで **同一**

この制約下では `role` はリレーションのラベルではなくユーザー固有の属性として扱える。
そのため `tenant_assignments` テーブルは設けず、`role` と `tenant_id` を直接 `admin_users` に持つ設計とした。

```
admin_users:      (id, email, password_hash, tenant_id, role)
shop_assignments: (user_id, shop_id)   ← 所属関係のみ。role は不要
```

これによりログイン時の JWT 解決（role・tenantId の取得）が **1クエリ**（`admin_users` SELECT のみ）で完結する。

> **注意**
> `role` が全ショップで同一であることはアプリケーション層で保証する（DB レベルでは制約不可）。
> ユーザー作成・招待のロジックで role を一元管理すること。

---

### B. `tenant_assignment` の ReBAC チェックはインメモリ照合

ログイン時に `tenantId` を JWT に埋め込み、auth middleware で `AuthContext.tenantId` として保持する。
これにより `POST /api/tenants/:tenantId/shops` 等のテナント所属チェックは、**JWT の `tenantId` と URL の `tenantId` を比較するだけ**でよく、DB アクセスは不要になる。

```ts
// authorize.ts — tenant_assignment チェック（DB アクセスなし）
if (auth.tenantId === tenantId) {
  relation = registry.tenant_assignment(auth.userId, { role: auth.role })
}
```

Gate 2（ReBAC）の `tenant_assignment` チェックが Gate 1（PBAC）と同様にインメモリで完結する。

---

### C. `registry` と `CustomerScope` の実装は Worker 層に配置

`shared/` は `worker/` を import しない一方向依存の原則（§9）があるため、DB アクセスを伴うコードは `shared/` に置けない。

| モジュール | 配置 | 理由 |
|---|---|---|
| `registry`（純粋関数・Relation 判定） | `shared/permission/scope/registry.ts` | DB 不要 |
| DB クエリ → registry 呼び出し / `resolveUserRelation` | `worker/middleware/authorize.ts` | Worker 専有の DB を使用 |
| `CustomerScope` interface / `BaseCustomerScope` | `shared/permission/scope/customer/scope.ts` | DB 不要 |
| `CustomerScopeFactory` 型 / `ScopeMap` 型 | `shared/permission/scope/customer/scope-map.ts` | 型定義のみ・DB 不要 |
| `TenantCustomerScope` / `ShopCustomerScope` / `scopeMap` 実装 | `worker/repository/customer.repository.ts` | Drizzle DB インスタンスが必要 |

---

### D. Hono JWT は `alg` の明示指定が必要（Hono 4.x）

Hono 4.x では `sign()` / `jwt()` ミドルウェアに `alg` オプションの省略が不可になった。
必ず `'HS256'` を明示すること。

```ts
sign(payload, secret, 'HS256')
jwt({ secret, alg: 'HS256' })
```

テストヘルパーの `createTestJwt` も同様。

---

### E. ULID は `ulid()` を使用（`monotonicUlid` は使わない）

`ulidx` の `monotonicUlid` は ESM ビルド専用で、`@cloudflare/vitest-pool-workers`（Miniflare 経由の CJS バンドル）では `undefined` になりテストが壊れる。
ソート性は `ulid()` でも ULID の単調増加性で保証されるため、`monotonicUlid` は使わない。

---

### F. 店舗ルートは 2 つの Hono インスタンスに分割

`/api/shops` と `/api/tenants/:tenantId/shops` はプレフィックスが異なるため、単一インスタンスにまとめるとマウントが衝突する。

```ts
// worker/routes/shops.ts
export const shopListRoutes   // → app.route('/api/shops', shopListRoutes)
export const tenantShopRoutes // → app.route('/api/tenants', tenantShopRoutes)
```

---

### G. フロントエンドからの Worker 型参照

`hc<AppType>` パターンは `worker/index.ts`（Cloudflare Workers 専用型を含む）を `src/` から import するため `tsconfig.app.json` と非互換になる。
サンプルでは `apiFetch<T>(path)` のシンプルなラッパーで代替する。実運用では `worker/app-type.ts` に Cloudflare 固有型を含まない `AppType` を別途エクスポートし `tsconfig.app.json` の `include` に追加する。

---

## 参考

- [Google Zanzibar論文](https://research.google/pubs/pub48190/)
- [OPA (Open Policy Agent)](https://www.openpolicyagent.org/)
