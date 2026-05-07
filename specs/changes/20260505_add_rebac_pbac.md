# ADR: SaaS権限管理の設計方針

## ステータス
承認済み

本書は権限モデル全体（PBAC／ReBAC／データモデル／フロント連携など）と、**`authorize` の Gate 2（Resolver）詳細**を **1ファイル** に集約している。**記載と実装が食い違う場合はリポジトリ上のソースを正とする**。

初見の方向けの読み物は [`specs/architecture/`](../architecture/README.md) を参照。

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

#### 実装上の追記（ソース準拠）

- **Gate 2 型名**: `resolver-types.ts` の型は **`GateRelationResolver`** と命名し、`scope/types.ts` のロール・Relation 定義と混同しない。
- **`PurchaseHistoryRepository.evaluateCustomerShopAccess`**: `resolveCustomerViaShop` は `purchase_histories` × `shops` × `shop_assignments` を **1クエリ**で集約し、テナント一致／店舗割当の可否を返す（同一顧客に複数履歴がある場合も全行を踏まえる）。
- **一覧スコープ**: `UserRelationRepository.resolveForUser` は `{ kind: 'tenant', tenantId } | { kind: 'shops', shopIds }`。店舗割当ロールは **`shop_assignments` を複数行**ユニオン。`TenantCustomerScope` / `ShopsCustomerScope` は **EXISTS・JOIN** で SQL にスコープを表現し、全顧客 ID のメモリ展開と巨大 `IN` を避ける。
- **POLICY_MAP**（`shared/permission/policy/context.ts`）: `tenant_owner` と同一 `TenantOwner*Policy` を共有するロール（`developer` / `tenant_staff` / `system` 等）は **共通ファクトリ関数**にまとめ、コメントで意図を明示する。
- **ルートパラメータ**: `tenantId` / `shopId` / 顧客 `:id` は **`zValidator('param', z.object({…}))`** で検証したうえで Brand（`TenantId` / `ShopId` / `CustomerId`）へ渡す（空文字を Brand にキャストしない）。
- **未実装（意図的に範囲外）**: Gate ごとの構造化監査ログ。
- **実装済み**: `policy` と `relation` の両方が欠ける（不正呼び出し）場合は **`authorize` が HTTP 403（fallback-deny）**。

---

### 3. 型安全な宣言的設計

> **ファイル分割方針**：元の `relation.ts` に混在していた4つの責務を以下のとおり分割する。
>
> | ブロック | 内容 | 分割先 |
> |---|---|---|
> | 型定義（BrandType） | `TenantId`, `ShopId` のブランド型 | `shared/permission/types.ts` |
> | リレーション型群 | `RelationMap`, `ResourceMap`, `ResourceIdMap`, `Relation` 等 | `shared/permission/scope/types.ts` |
> | Repository IF / `GateRelationResolver` | Gate 2 が `(repo, auth) => Promise<boolean>` で評価するための型（Drizzle 非依存） | `shared/permission/scope/resolver-types.ts` |
> | Resolver 実装・レジストリ | `resolveShopAssignment` 等と `useResolver('tenant', { ... })` | `shared/permission/scope/resolvers.ts`, `resolver-map.ts` |

---

#### shared/permission/types.ts（BrandType・Plan を追記）

`Role`, `AuthContext`, `PolicyContext` に加え、BrandType・Plan・SHOP_LIMIT_UNLIMITED を同居させる。（CSV 出力上限など他リソースで同様の「無制限」定数が必要になった場合は、このファイルまたは該当 policy 側に追加する。）

```typescript
// ================================
// Role・Plan
// ================================
export type Role = 'developer' | 'tenant_owner' | 'tenant_staff' | 'shop_owner' | 'shop_staff' | 'system'
export type Plan = 'starter' | 'basic' | 'pro'

// Plan 定数：文字列リテラルを直接書かず、定数経由で参照する
export const PLAN = {
  STARTER: 'starter',
  BASIC:   'basic',
  PRO:     'pro',
} as const satisfies Record<string, Plan>

// ================================
// コンテキスト型
// ================================
export type AuthContext = {
  userId:   string
  tenantId: string  // JWT から取得。tenant_assignment の ReBAC チェックはインメモリ照合（§B）
  role:     Role
  plan:     Plan    // JWT ではなく auth middleware で DB から取得（課金失敗の即時反映のため）
}

export type PolicyContext = {
  role:     Role
  plan:     Plan
  shop_ids: string[]
}

// ================================
// BrandType：IDの種別を型レベルで区別する
// ================================
export type TenantId = string & { readonly _brand: 'TenantId' }
export type ShopId   = string & { readonly _brand: 'ShopId' }
export type CustomerId = string & { readonly _brand: 'CustomerId' }

export const TenantId = (id: string): TenantId => id as TenantId
export const ShopId   = (id: string): ShopId   => id as ShopId
export const CustomerId = (id: string): CustomerId => id as CustomerId

// ================================
// 数量制限：無制限を表す定数（店舗作成上限など）
// null より数値に統一する方が比較処理がシンプルになる
// ================================
export const SHOP_LIMIT_UNLIMITED = Number.MAX_SAFE_INTEGER
```

---

#### shared/permission/scope/types.ts（relation.ts の「型定義」ブロック）

```typescript
import type { TenantId, ShopId, Role } from '../types'

/** Relation の tenant_assignment と同期する単一ソース */
export const TENANT_ASSIGNMENT_ROLES = ['tenant_owner', 'tenant_staff', 'developer'] as const
export type TenantAssignmentRole = (typeof TENANT_ASSIGNMENT_ROLES)[number]

export function isTenantAssignmentRole(role: Role): role is TenantAssignmentRole {
  return (TENANT_ASSIGNMENT_ROLES as readonly Role[]).includes(role)
}

export type TenantAssignmentResource = {
  role: Role
}

export type ShopAssignmentResource = {
  adminUserId: string
  shopId: ShopId
}

export type RelationMap = {
  tenant_assignment: TenantAssignmentRole
  shop_assignment: 'shop_assigned'
}

export type ResourceMap = {
  tenant_assignment: TenantAssignmentResource
  shop_assignment: ShopAssignmentResource
}

export type ResourceIdMap = {
  tenant_assignment: TenantId
  shop_assignment: ShopId
}

export type Relation = RelationMap[keyof RelationMap]
```

（過去案であった `RelationResolver<T>` は Gate 2 用の型名 **`GateRelationResolver`** と衝突しうるため、`scope/types.ts` には置かない。）

`authorize` の Gate 2 が import するのは **`resolver-types.ts`** の **`GateRelationResolver`**（`(repo, auth) => Promise<boolean>`）。`resolvers.ts` の `resolveCustomerViaShop` などでは **`isTenantAssignmentRole`** でテナント割当ロールを判定する。

---

#### shared/permission/scope/resolvers.ts・resolver-map.ts（Gate 2 の関係チェック）

DB アクセスを伴う処理は `shared/` に置けないため、`GateRelationResolver` は **`Repositories` インターフェース**（`resolver-types.ts`）経由で Worker が注入する `c.get('repo')` を受け取る。

- **具体的な関係判定**（例：`shop_assignments` を引く、`purchase_histories` 経由で顧客の店舗を解決する）は `resolvers.ts` に集約する。
- **ルートからの組み立て**は `useResolver(key, args)`（`resolver-map.ts`）でキーと引数に型を載せる。

`authorize` ミドルウェア本体は `GateRelationResolver` すなわち `(repo, auth) => Promise<boolean>` を評価するだけで、スキーマや SQL を知らない（§C・[Gate 2（ReBAC）の Resolver 詳細アーキテクチャ](#gate2-rebac-resolver-detail)参照）。

---

#### worker/repository/user-relation.repository.ts（一覧スコープ用・authorize 外）

`CustomerRepository` / `ShopAccessRepository` が **`UserScopeResolution`**（`{ kind: 'tenant', tenantId }` または `{ kind: 'shops', shopIds: string[] }`）を返すために `admin_users` / `shop_assignments` を参照する。テナント割当ロール以外は **`shop_assignments` を複数行 `.all()`** し、店舗 ID のユニオンでスコープする。Gate 2 の単一リソース用 Resolver とは別経路だが、同じデータモデルに基づく。

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

import { SubscriptionInactiveError } from '@shared/error/my-app-error'

export async function authContextMiddleware(c: Context<HonoEnv>, next: Next) {
  const payload = c.get('jwtPayload') as JwtPayload

  // plan は SubscriptionRepository 経由で毎回取得（課金失敗の即時反映のため）
  // 失効済みの場合は null が返り、plan を解決できないため認証エラーになる
  const subscriptionRepo = new SubscriptionRepository(c.get('db'))
  const subscription = await subscriptionRepo.findValidByTenantId(payload.tenantId)
  if (!subscription) {
    throw new SubscriptionInactiveError()
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

#### worker/middleware/authorize.ts（AuthorizeOptions + ミドルウェア本体）

```typescript
import type { Context } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { HonoEnv } from '../type'
import type { AuthContext, PolicyContext } from '@shared/permission/types'
import type { GateRelationResolver } from '@shared/permission/scope/resolver-types'
import { PermissionDeniedError, ResourceNotFoundError } from '@shared/error/my-app-error'
import {
  POLICY_MAP,
  type PolicyOption,
  buildPermissionDeniedMessage,
} from '@shared/permission/policy/context'

type AuthorizeOptions = {
  policy?: PolicyOption
  /** リクエストごとに URL 等から Resolver を組み立てる（Hono の Context が必要なため） */
  relation?: {
    resolver: (c: Context<HonoEnv>) => GateRelationResolver
  }
}

export function authorize(options: AuthorizeOptions) {
  return createMiddleware<HonoEnv>(async (c, next) => {
    const auth = c.get('auth') as AuthContext

    // Gate 1: PBAC（role + plan でインメモリ評価・DBアクセスなし）
    if (options.policy) {
      const { target, action } = options.policy
      const context: PolicyContext = { role: auth.role, plan: auth.plan, shop_ids: [] }
      const policy = POLICY_MAP[target][auth.role](context)
      const permissions = policy.listPermissions() as Record<string, unknown>

      if (!permissions[action]) {
        throw new PermissionDeniedError(buildPermissionDeniedMessage(target, action))
      }
    }

    // Gate 2: ReBAC（repository 経由。authorize 本体は resolver の中身を知らない）
    if (options.relation) {
      const relationResolver = options.relation.resolver(c)
      const allowed = await relationResolver(c.get('repo'), auth)
      if (!allowed) {
        throw new ResourceNotFoundError('Resource not found')
      }
    }

    await next()
  })
}
```

**ロール可否は Gate 1 の `policy.action` に集約する**ため、`relation` に `anyOfRoles` 等は持たない（[Gate 2 節](#gate2-rebac-resolver-detail)の「require オプションを却下」参照）。

---

#### 呼び出し側

パスパラメータは **`zValidator('param', …)` を `authorize` より前に**置き、検証済みの `c.req.valid('param')` から Brand へ渡す。

```typescript
import { useResolver } from '@shared/permission/scope/resolver-map'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { TenantId, ShopId } from '@shared/permission/types'
import { authorize } from '../middleware/authorize'

// PBAC のみ（カスタマー閲覧）
app.get('/customers', authorize({ policy: { target: 'customer', action: 'read' } }), handler)

// PBAC + ReBAC（テナント配下で店舗作成：JWT tenantId と URL tenantId の一致）
app.post(
  '/:tenantId/shops',
  zValidator('param', z.object({ tenantId: z.string().min(1) })),
  authorize({
    policy: { target: 'settings', action: 'createShop' },
    relation: {
      resolver: (c) =>
        useResolver('tenant', { tenantId: TenantId(c.req.valid('param').tenantId) }),
    },
  }),
  handler,
)

// PBAC + ReBAC（テナント文脈で店舗削除：tenant・shop・JWT の整合）
app.delete(
  '/:tenantId/shops/:shopId',
  zValidator(
    'param',
    z.object({ tenantId: z.string().min(1), shopId: z.string().min(1) }),
  ),
  authorize({
    policy: { target: 'settings', action: 'deleteShop' },
    relation: {
      resolver: (c) => {
        const p = c.req.valid('param')
        return useResolver('shopInTenant', {
          tenantId: TenantId(p.tenantId),
          shopId: ShopId(p.shopId),
        })
      },
    },
  }),
  handler,
)
```

---

<a id="gate2-rebac-resolver-detail"></a>

### Gate 2（ReBAC）の Resolver 詳細アーキテクチャ

旧 `ADR-001-authorize-rebac.md` にあった内容を本文書へ統合した。**以下のコード抜粋は実行可能なソースと同一**（インポートパスだけ `@shared/permission/…` と記す）。

#### ドメインとロールの前提

```
Tenant
  └── Shop（shop_assignments で User と紐付く）
        └── Customer（purchase_histories で店舗と紐付く）
```

| ロール | 権限イメージ |
|---|---|
| tenant_owner / tenant_staff / developer | テナント単位での管理 |
| shop_owner / shop_staff | 担当店舗のみ |

#### 抱えていた課題（Resolver 分割で緩和した点）

`authorize()` 内でリソース種別ごとに DB を書き下ろすと改修コストが高い。また Resolver が Drizzle スキーマ直依存になると **`shared/` に置けない**。多段グラフが必要なときは関数に閉じ込め、`authorize` は **`(repo, auth) => boolean` の評価だけ** に留める。

#### `AuthorizeOptions` と Hono の `Context`

現行実装では `relation.resolver` は **`(c) => GateRelationResolver`**。URL の `tenantId` などはルート単位で取り込み、そのリクエスト専用の Resolver を返す。パス検証は **`zValidator('param')` 後の `c.req.valid('param')`** から **Brand**（`TenantId` / `ShopId` / `CustomerId`）へ渡す。

#### `resolver-types.ts`（`Repositories` と Gate 2 用 `GateRelationResolver`）

```typescript
import type { AuthContext } from '@shared/permission/types'

export interface ShopAssignmentRepository {
  findByUserIdAndShopId(
    userId: string,
    shopId: string,
  ): Promise<{ userId: string; shopId: string } | null>
}

export interface ShopRepository {
  findById(shopId: string): Promise<{ tenantId: string } | null>
}

export interface PurchaseHistoryRepository {
  findByCustomerId(customerId: string): Promise<{ shopId: string } | null>
  evaluateCustomerShopAccess(
    customerId: string,
    userId: string,
    authTenantId: string,
  ): Promise<{ allowedByTenant: boolean; allowedByShopAssignment: boolean } | null>
}

export type Repositories = {
  shopAssignment: ShopAssignmentRepository
  shop: ShopRepository
  purchaseHistory: PurchaseHistoryRepository
}

export type GateRelationResolver = (repo: Repositories, auth: AuthContext) => Promise<boolean>
```

#### `resolvers.ts`（`resolveXViaY` 命名規則・多段チェック）

```typescript
import type { GateRelationResolver } from './resolver-types'
import type { TenantId, ShopId } from '@shared/permission/types'
import { isTenantAssignmentRole } from './types'

export const resolveTenantAssignment =
  (tenantId: TenantId): GateRelationResolver =>
  async (_repo, auth) =>
    auth.tenantId === tenantId

export const resolveShopAssignment =
  (shopId: ShopId): GateRelationResolver =>
  async (repo, auth) => {
    const row = await repo.shopAssignment.findByUserIdAndShopId(auth.userId, shopId)
    return row !== null
  }

export const resolveShopViaTenant =
  (shopId: ShopId): GateRelationResolver =>
  async (repo, auth) => {
    const shop = await repo.shop.findById(shopId)
    if (!shop) return false
    return shop.tenantId === auth.tenantId
  }

export const resolveCustomerViaShop =
  (customerId: string): GateRelationResolver =>
  async (repo, auth) => {
    const ev = await repo.purchaseHistory.evaluateCustomerShopAccess(
      customerId,
      auth.userId,
      auth.tenantId,
    )
    if (ev === null) return false
    if (isTenantAssignmentRole(auth.role)) {
      return ev.allowedByTenant
    }
    return ev.allowedByShopAssignment
  }

/** URL の tenantId・JWT・shopId が一致し、店舗が当該テナントに属することを検証する（DELETE 店舗など）。 */
export const resolveShopInTenantContext =
  (tenantId: TenantId, shopId: ShopId): GateRelationResolver =>
  async (repo, auth) => {
    if (auth.tenantId !== tenantId) return false
    const shop = await repo.shop.findById(shopId)
    if (!shop) return false
    return shop.tenantId === auth.tenantId
  }
```

#### `resolver-map.ts`（`ResolverArgMap` と `useResolver`）

キーと引数型を **`ResolverArgMap`** で一元管理する。実装には **`shopInTenant`**（`tenantId` + `shopId`）、**`customerViaShop`** は **`customerId` に `CustomerId` を使うブランド型**が含まれる。

```typescript
import type { GateRelationResolver } from './resolver-types'
import type { TenantId, ShopId, CustomerId } from '@shared/permission/types'
import {
  resolveTenantAssignment,
  resolveShopAssignment,
  resolveShopViaTenant,
  resolveCustomerViaShop,
  resolveShopInTenantContext,
} from './resolvers'

type ResolverArgMap = {
  tenant: { tenantId: TenantId }
  shop: { shopId: ShopId }
  shopViaTenant: { shopId: ShopId }
  shopInTenant: { tenantId: TenantId; shopId: ShopId }
  customerViaShop: { customerId: CustomerId }
}

const RESOLVER_MAP: {
  [K in keyof ResolverArgMap]: (args: ResolverArgMap[K]) => GateRelationResolver
} = {
  tenant: ({ tenantId }) => resolveTenantAssignment(tenantId),
  shop: ({ shopId }) => resolveShopAssignment(shopId),
  shopViaTenant: ({ shopId }) => resolveShopViaTenant(shopId),
  shopInTenant: ({ tenantId, shopId }) => resolveShopInTenantContext(tenantId, shopId),
  customerViaShop: ({ customerId }) => resolveCustomerViaShop(customerId),
}

function callResolver<T extends keyof ResolverArgMap>(
  map: { [K in keyof ResolverArgMap]: (args: ResolverArgMap[K]) => GateRelationResolver },
  key: T,
  args: ResolverArgMap[T],
): GateRelationResolver {
  return map[key](args)
}

export function useResolver<T extends keyof ResolverArgMap>(
  key: T,
  args: ResolverArgMap[T],
): GateRelationResolver {
  return callResolver(RESOLVER_MAP, key, args)
}
```

#### Worker の DI と `Repositories`

Gate 2 用の具象は **`worker/middleware/di.ts`** で `c.set('repo', { … })` により注入する。一覧スコープ用の **`CustomerRepository`**／**`ShopAccessRepository`**／**useCase** も同じミドルウェアで組むが、Resolver が直接触れるのは **`c.get('repo')`**（上記インターフェース準拠）に限定される。

```typescript
c.set('repo', {
  shopAssignment: new ShopAssignmentRepository(db),
  shop: shopRepo,
  purchaseHistory: purchaseHistoryRepo,
})
```

（実ファイルでは `customerRepo` 生成のために他リポジトリも参照するが、その責務は Gate 2 外である。）

#### 採用理由と却下案

**採用：Resolver 関数アプローチ**

- 型が追える。不必要な **`unknown`** キャストを避ける
- ユースケースごとに個別定義し、強い共通化でロジックを膨らませない
- `authorize()` 本体は Resolver を評価するだけで traversing を知らない
- 多段の複雑さは Resolver 関数内に閉じる

**却下：Chain アプローチ**

- 中間行が **`unknown`** になりやすくキャストばかりになる
- 「汎用 chain」へ押し込むとユースケース固有の前提が混入し複雑化する

**却下：`require` オプション（ReBAC でロール列挙）**

- role 可否は Gate 1（PBAC）の **`policy.action`** に集約する
- Resolver と **`require`** がほぼ 1:1 になるまでドメインが単純なら冗長
- 持ち込むと PBAC と ReBAC の線引きが曖昧になる

#### Gate 2 まわりの設計判断一覧

| 判断 | 結論 |
|---|---|
| Gate1 / Gate2 の責務 | PBAC（インメモリ）と ReBAC（repo）を混ぜない |
| `relation.resolver` | **`(c) => GateRelationResolver`**。URL はルート側で読み、`zValidator('param')` 後に Brand へ渡す |
| `require` | 不要。ロール評価は **`policy`** |
| Resolver の戻り値 | `boolean`。Relationship オブジェクトは外に出さない |
| DB への依存 | `resolvers.ts` は **`Repositories` IF のみ**。Drizzle 非依存 |
| repo の組み立て | DI ミドルウェアに集約。**`authorize.ts` は中身を知らない** |
| Resolver の登録 | **`useResolver(key, args)`** でキーと引数を型連動 |
| 引数の形 | オブジェクト。将来の引数増に強い |
| `as` 回避 | **`callResolver`** で `key` と `args` を同一ジェネリクス **`T`** に束縛 |
| 403 / 404 | ReBAC で否認なら **404**（存在秘匿）（§12 も参照） |

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

import { ForbiddenError } from '@shared/error/my-app-error'

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
      throw new ForbiddenError('アクセス権のないカスタマーIDが含まれています')
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
      [PLAN.PRO]:     SHOP_LIMIT_UNLIMITED,
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
      [PLAN.PRO]:     SHOP_LIMIT_UNLIMITED,
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

`tenant_owner` と同一ポリシーを共有するロールは **ファクトリ関数**にまとめ、マッピングの意図をコメントで明示する（実装は `shared/permission/policy/context.ts`）。

```typescript
function tenantOwnerCustomerPolicy(ctx: PolicyContext) {
  return new TenantOwnerCustomerPolicy(ctx)
}
function tenantOwnerSettingsPolicy(ctx: PolicyContext) {
  return new TenantOwnerSettingsPolicy(ctx)
}
function allReadShopPolicy(ctx: PolicyContext) {
  return new AllReadShopPolicy(ctx)
}

const POLICY_MAP = {
  customer: {
    developer: tenantOwnerCustomerPolicy,
    tenant_owner: tenantOwnerCustomerPolicy,
    tenant_staff: tenantOwnerCustomerPolicy,
    shop_owner: (ctx) => new ShopOwnerCustomerPolicy(ctx),
    shop_staff: (ctx) => new ShopStaffCustomerPolicy(ctx),
    system: tenantOwnerCustomerPolicy,
  },
  settings: {
    developer: tenantOwnerSettingsPolicy,
    tenant_owner: tenantOwnerSettingsPolicy,
    tenant_staff: tenantOwnerSettingsPolicy,
    shop_owner: (ctx) => new ShopOwnerSettingsPolicy(ctx),
    shop_staff: (ctx) => new ShopOwnerSettingsPolicy(ctx),
    system: tenantOwnerSettingsPolicy,
  },
  // 全ロールで read=true（一覧の絞り込みは Repository 層で行う）
  shop: {
    developer: allReadShopPolicy,
    tenant_owner: allReadShopPolicy,
    tenant_staff: allReadShopPolicy,
    shop_owner: allReadShopPolicy,
    shop_staff: allReadShopPolicy,
    system: allReadShopPolicy,
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
      `このプランのエクスポート上限（月${exportCsvLimit === SHOP_LIMIT_UNLIMITED ? '無制限' : `${exportCsvLimit}件`}）に達しています`
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
  const isExportCsvLimitUnlimited = exportCsvLimit === SHOP_LIMIT_UNLIMITED

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
    │                         # BrandType: TenantId, ShopId, CustomerId + コンストラクタ関数
    │                         # SHOP_LIMIT_UNLIMITED
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
        ├── types.ts          # TENANT_ASSIGNMENT_ROLES / isTenantAssignmentRole
        │                     # RelationMap, ResourceMap, ResourceIdMap, Relation
        │                     # TenantAssignmentResource, ShopAssignmentResource
        │                     # ※ BrandType は ../types.ts から import
        │
        ├── resolver-types.ts # Repositories IF, GateRelationResolver（Gate 2）
        ├── resolvers.ts      # resolveTenantAssignment, resolveShopAssignment 等
        ├── resolver-map.ts   # useResolver(key, args)
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
│   │                         # AuthorizeOptions, PolicyOption, relation.resolver
│   └── di.ts                 # c.set('repo', …) と CustomerRepository / UseCase を注入
│
├── repository/
│   ├── customer.repository.ts      # TenantCustomerScope, ShopCustomerScope, scopeMap
│   │                               # CustomerRepository（resolveScope, findAll, findById, update, delete）
│   ├── user-relation.repository.ts # 一覧スコープ用：admin_users / shop_assignments から Relation を解決
│   └── subscription.repository.ts  # SubscriptionRepository（findValidByTenantId）
│
├── usecase/
│   ├── customer.usecase.ts   # CustomerUseCase（listCustomers, updateCustomer, deleteCustomer, exportCsv）
│   └── shop.usecase.ts       # ShopUseCase（listShops, createShop, deleteShop）
│
├── type.ts                   # HonoEnv, Variables（auth / db / repo / useCase）
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
                shared/permission/scope/resolver-types.ts
                shared/permission/scope/resolvers.ts
                shared/permission/scope/resolver-map.ts
                shared/permission/policy/context.ts
                shared/permission/types.ts

shared/permission/scope/types.ts
  └── import ← shared/permission/types.ts（BrandType）

shared/ には DB アクセスを含むコードを置かない。
`GateRelationResolver` 内の DB 呼び出しは `Repositories` インターフェース越しに Worker 実装を注入する。`UserRelationRepository`・`TenantCustomerScope` / `ShopsCustomerScope` 等の実体は worker/ に配置する。
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

RelationMap / ResourceIdMap（BrandType）  [shared/permission/scope/types.ts, types.ts]
  ├─→ TenantId / ShopId / CustomerId      IDの種別を型レベルで区別
  └─→ useResolver の引数・スコープマップの型に利用

GateRelationResolver          [shared/permission/scope/resolver-types.ts]
  ├─→ (repo, auth) => Promise<boolean>    Gate 2 のみが評価
  ├─→ useResolver(key, args)              [resolver-map.ts] ルートから組み立て
  └─→ resolvers.ts                        具体判定（DB は repo 経由）

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
7. `resolver-types.ts` の `Repositories` に必要なメソッドを追加（Worker の repo 実装と整合）
8. `resolvers.ts` に Resolver を追加、`resolver-map.ts` の `ResolverArgMap` / `RESOLVER_MAP` にキーを追加（型は `GateRelationResolver`）
9. ルートで `authorize({ relation: { resolver: (c) => useResolver(...)}})` を記述

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

新しい **PBAC の action** を追加する場合は `authorize` の型は `PolicyOption` 経由で追従する。新しい **ReBAC パターン** を追加する場合は `resolvers` / `resolver-map` の変更が必要になる。

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
- `createShopLimit` / `exportCsvLimit` は「無制限」を **`SHOP_LIMIT_UNLIMITED`（Number.MAX_SAFE_INTEGER）** と同義に扱い、null チェック不要で比較を書ける（サンプルの PBAC コードはこの前提で記載）
- 数量チェックは「上限値の宣言（PBAC）」と「現在値との比較（UseCase）」に分離し、ReBACの責務と明確に区別する
- `PermissionsMap`をフロント・バックエンドで共有し、`<Permission target action>`でUI表示制御を統一できる
- Gate 2 は `useResolver`＋`Repositories` IF で拡張し、authorize 本体を増やさずに新しい関係チェックを足せる
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

`resolveTenantAssignment(tenantId)`（`resolvers.ts`）は `auth.tenantId === tenantId` のみで評価し、DB アクセスをしない。

Gate 2（ReBAC）のテナント所属チェックが Gate 1（PBAC）と同様にインメモリで完結する。

---

### C. `GateRelationResolver` の Worker 実装と `CustomerScope` は Worker 層に配置

`shared/` は `worker/` を import しない一方向依存の原則（§9）があるため、Drizzle を直接叩くコードは `shared/` に置けない。Gate 2 は **`Repositories` の実装**が Worker にあり、`authorize` が `c.get('repo')` を Resolver に渡す。

| モジュール | 配置 | 理由 |
|---|---|---|
| `Repositories` IF・`GateRelationResolver` 型 | `shared/permission/scope/resolver-types.ts` | Drizzle 非依存の契約のみ |
| `resolveShopAssignment` 等（repo を呼ぶ関数） | `shared/permission/scope/resolvers.ts` | IF 越し。実装は Worker の repo が注入される |
| repo の具象（`shopAssignment.findByUserIdAndShopId` 等） | `worker/repository/*.ts` | D1 / Drizzle に依存 |
| `CustomerScope` interface / `BaseCustomerScope` | `shared/permission/scope/customer/scope.ts` | DB 不要 |
| `CustomerScopeFactory` 型 / `ScopeMap` 型 | `shared/permission/scope/customer/scope-map.ts` | 型定義のみ・DB 不要 |
| `TenantCustomerScope` / `ShopCustomerScope` / `scopeMap` 実装 | `worker/repository/customer.repository.ts` 等 | Drizzle DB インスタンスが必要 |
| `UserRelationRepository` | `worker/repository/user-relation.repository.ts` | 一覧スコープ用の DB アクセス |

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
