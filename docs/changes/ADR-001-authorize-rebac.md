# ADR-001: authorize() の ReBAC 拡張設計

| 項目 | 内容 |
|---|---|
| ステータス | Accepted |
| 作成日 | 2026-05-04 |
| 対象リポジトリ | r-sugi/permisson-demo |
| 関連ファイル | `shared/permission/scope/*`, `worker/middleware/authorize.ts` |

---

## 1. コンテキスト

本プロジェクトは Cloudflare Workers + Hono + Drizzle ORM + TypeScript で構築された SaaS 管理画面である。

### ドメイン構造

```
Tenant
  └── Shop（shop_assignments で User と紐付く）
        └── Customer（purchase_histories で店舗と紐付く）
```

### ロール定義

| ロール | 権限範囲 |
|---|---|
| tenant_owner / tenant_staff / developer | テナント全体を管理 |
| shop_owner / shop_staff | 担当店舗のみ管理 |

### 既存実装の問題

- `authorize()` 内の if 文でリソース種別ごとに DB 操作を手書き → リソース追加のたびに肥大化
- Resolver が直接 DB スキーマ（`schema`）に依存しており `shared/` に置くには不適切
- グラフトラバーサルが 1 段のみ（User → リソース直接）で多段に対応できない
- PBAC と ReBAC の責務が `authorize()` 内で混在している

---

## 2. 決定

### 2-1. 権限チェックの 2 Gate 構造

```
Gate 1: PBAC  → role + plan でアクション可否をインメモリ評価（DB アクセスなし）
Gate 2: ReBAC → repository をたどってユーザーとリソースの関係を boolean で返す
```

2 つの Gate は独立した責務を持ち、混在させない。

### 2-2. authorize() の I/F

```typescript
type AuthorizeOptions = {
  policy?: {
    target: PolicyTarget
    action: string
  }
  relation?: {
    resolver: RelationResolver  // (repo, auth) => Promise<boolean>
  }
}
```

**`require` を持たない理由**
role 評価は Gate 1（PBAC）の `policy.action` が担う。`require` を追加すると PBAC と ReBAC の責務が曖昧になる。

### 2-3. authorize() 本体

```typescript
export function authorize(options: AuthorizeOptions) {
  return async (c, next) => {
    const auth = c.get('auth')

    // Gate 1: PBAC
    if (options.policy) {
      const { target, action } = options.policy
      const perms = POLICY_MAP[target][auth.role](...).listPermissions()
      if (!perms[action]) {
        throw new HTTPException(403, { message: 'Permission denied' })
      }
    }

    // Gate 2: ReBAC（repo をそのまま渡すだけ。中身を知らない）
    if (options.relation) {
      const allowed = await options.relation.resolver(c.get('repo'), auth)
      if (!allowed) {
        throw new HTTPException(404, { message: 'Not Found' })  // 存在を秘匿
      }
    }

    await next()
  }
}
```

### 2-4. 型定義（shared/permission/scope/resolver-types.ts）

```typescript
import type { AuthContext } from '../types'

export interface ShopAssignmentRepository {
  findByUserIdAndShopId(userId: string, shopId: string): Promise<{ userId: string; shopId: string } | null>
}
export interface ShopRepository {
  findById(shopId: string): Promise<{ tenantId: string; deletedAt: string | null } | null>
}
export interface PurchaseHistoryRepository {
  findByCustomerId(customerId: string): Promise<{ shopId: string } | null>
}

export type Repositories = {
  shopAssignment:  ShopAssignmentRepository
  shop:            ShopRepository
  purchaseHistory: PurchaseHistoryRepository
}

export type RelationResolver = (repo: Repositories, auth: AuthContext) => Promise<boolean>
```

### 2-5. Resolver 関数（shared/permission/scope/resolvers.ts）

命名規則：`resolve{対象}Via{経路}` で経路を関数名から読めるようにする。DB スキーマへの依存なし。

```typescript
import type { RelationResolver } from './resolver-types'
import type { TenantId, ShopId } from '../types'

// 1 段
export const resolveTenantAssignment =
  (tenantId: TenantId): RelationResolver =>
  async (_repo, auth) => auth.tenantId === tenantId

export const resolveShopAssignment =
  (shopId: ShopId): RelationResolver =>
  async (repo, auth) => {
    const row = await repo.shopAssignment.findByUserIdAndShopId(auth.userId, shopId)
    return row !== null
  }

// 2 段
export const resolveShopViaTenant =
  (shopId: ShopId): RelationResolver =>
  async (repo, auth) => {
    const shop = await repo.shop.findById(shopId)
    if (!shop || shop.deletedAt) return false
    return shop.tenantId === auth.tenantId
  }

export const resolveCustomerViaShop =
  (customerId: string): RelationResolver =>
  async (repo, auth) => {
    const history = await repo.purchaseHistory.findByCustomerId(customerId)
    if (!history) return false
    const shop = await repo.shop.findById(history.shopId)
    if (!shop || shop.deletedAt) return false
    // tenant_owner / tenant_staff / developer はテナント境界で許可。それ以外は shop_assignment で判定。
    if (auth.role === 'tenant_owner' || auth.role === 'tenant_staff' || auth.role === 'developer') {
      return shop.tenantId === auth.tenantId
    }
    const assignment = await repo.shopAssignment.findByUserIdAndShopId(auth.userId, history.shopId)
    return assignment !== null
  }

export const resolveShopInTenantContext =
  (tenantId: TenantId, shopId: ShopId): RelationResolver =>
  async (repo, auth) => {
    if (auth.tenantId !== tenantId) return false
    const shop = await repo.shop.findById(shopId)
    if (!shop || shop.deletedAt) return false
    return shop.tenantId === auth.tenantId
  }
```

### 2-6. useResolver（shared/permission/scope/resolver-map.ts）

Resolver を一元管理し、キー名と引数の型を対応付ける。

```typescript
import type { RelationResolver } from './resolver-types'
import type { TenantId, ShopId } from '../types'
import {
  resolveTenantAssignment,
  resolveShopAssignment,
  resolveShopViaTenant,
  resolveCustomerViaShop,
} from './resolvers'

// 1. 引数の型マップ（Resolver 一覧の仕様書になる）
type ResolverArgMap = {
  tenant:          { tenantId: TenantId }
  shop:            { shopId: ShopId }
  shopViaTenant:   { shopId: ShopId }
  customerViaShop: { customerId: string }
}

// 2. Resolver 関数のマップ
//    ResolverArgMap と同期が取れていないとコンパイルエラーになる
const RESOLVER_MAP: {
  [K in keyof ResolverArgMap]: (args: ResolverArgMap[K]) => RelationResolver
} = {
  tenant:          ({ tenantId })   => resolveTenantAssignment(tenantId),
  shop:            ({ shopId })     => resolveShopAssignment(shopId),
  shopViaTenant:   ({ shopId })     => resolveShopViaTenant(shopId),
  customerViaShop: ({ customerId }) => resolveCustomerViaShop(customerId),
}

// 3. key と args を同一の T で束縛することで as キャスト不要
function callResolver<T extends keyof ResolverArgMap>(
  map: { [K in keyof ResolverArgMap]: (args: ResolverArgMap[K]) => RelationResolver },
  key: T,
  args: ResolverArgMap[T],
): RelationResolver {
  return map[key](args)
}

// 4. T を指定すると引数の型が自動で確定する
export function useResolver<T extends keyof ResolverArgMap>(
  key: T,
  args: ResolverArgMap[T],
): RelationResolver {
  return callResolver(RESOLVER_MAP, key, args)
}
```

### 2-7. DI 層（worker/middleware/di.ts）

Repositories の組み立てはここだけ。他は中身を知らない。

```typescript
import { ShopAssignmentRepository } from '../repository/shop-assignment.repository'
import { ShopRepository } from '../repository/shop.repository'
import { PurchaseHistoryRepository } from '../repository/purchase-history.repository'

export async function diMiddleware(c, next) {
  const db = c.get('db')
  c.set('repo', {
    shopAssignment:  new ShopAssignmentRepository(db),
    shop:            new ShopRepository(db),
    purchaseHistory: new PurchaseHistoryRepository(db),
  })
  await next()
}
```

### 2-8. ルート定義での使用例（worker/routes/*.ts）

```typescript
// 1 段・テナント操作
authorize({
  policy:   { target: 'settings', action: 'createShop' },
  relation: { resolver: useResolver('tenant', { tenantId: TenantId(c.req.param('tenantId')) }) },
})

// 1 段・店舗操作
authorize({
  policy:   { target: 'customer', action: 'read' },
  relation: { resolver: useResolver('shop', { shopId: ShopId(c.req.param('shopId')) }) },
})

// 2 段・テナント管理者が店舗削除
authorize({
  policy:   { target: 'settings', action: 'deleteShop' },
  relation: { resolver: useResolver('shopViaTenant', { shopId: ShopId(c.req.param('shopId')) }) },
})

// 2 段・shop_staff が担当顧客を更新
authorize({
  policy:   { target: 'customer', action: 'update' },
  relation: { resolver: useResolver('customerViaShop', { customerId: c.req.param('id') }) },
})
```

---

## 3. ファイル構成

```
shared/permission/
  scope/
    resolver-types.ts  ← RelationResolver・Repositories インターフェースのみ
    resolvers.ts       ← Resolver 関数（インターフェースに依存。DB スキーマ知識なし）
    resolver-map.ts    ← ResolverArgMap・RESOLVER_MAP・useResolver
  policy/
    ...                ← 既存のまま
  types.ts             ← 既存のまま

worker/
  middleware/
    di.ts              ← Repositories の組み立て（一点集中）
    authorize.ts       ← Gate1 / Gate2 の実行
  repository/
    *.ts               ← Repositories インターフェースの実装
  routes/
    *.ts               ← useResolver() で宣言的に指定
```

---

## 4. 採用理由と却下案

### 採用：Resolver 関数アプローチ

- 型安全。`unknown` キャストなし
- ユースケースごとに個別定義。共通化しない
- `authorize()` 本体は resolver を呼ぶだけ。経路の知識を持たない
- 多段の複雑さは Resolver 関数内に閉じる

### 却下：Chain アプローチ

- `prevRow` が `unknown` 型になりキャストだらけ
- 共通化しようとすると各ユースケース固有の知識を chain に押し込む必要が生じ複雑化

### 却下：require オプション

- role 評価は Gate 1（PBAC）の `policy.action` が担う
- このドメインでは Resolver と require が常に 1:1 対応になり冗長
- 追加すると PBAC と ReBAC の責務が曖昧になる

---

## 5. 設計方針まとめ

| 判断 | 結論 |
|---|---|
| Gate1 / Gate2 の責務 | PBAC（インメモリ）と ReBAC（repository 経由）を明確に分離 |
| `require` の要否 | 不要。role 評価は PBAC の `policy` が担う |
| resolver の戻り値 | `boolean`。Relation 型を外部に露出しない |
| DB アクセスの依存 | `resolvers.ts` は Repositories インターフェースのみに依存。スキーマ知識なし |
| Repositories の組み立て | `di.ts` のみ。`authorize.ts` は中身を知らない |
| Resolver 一元管理 | `useResolver(key, args)` でキーと引数型を対応付け |
| 引数の形式 | オブジェクト渡し。引数が増えてもシグネチャが変わらない |
| `as` キャストの回避 | `callResolver` で key・args を同一 T で束縛。union 拡大を防ぐ |
| 404 vs 403 | ReBAC の失敗は 404。リソースの存在を秘匿する |
