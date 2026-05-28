# 05. 一覧スコープ（CustomerScope）と Gate 2 の違い

初見で混同しやすいのが、次の 2 つです。

- `authorize` の **Gate 2（ReBAC）**: 「この 1 件のリソースに到達できるか」を boolean で判定する
- 一覧の **スコープ（CustomerScope）**: 「このユーザーが見える集合（SQL）」を作り、一覧・件数・ID 検証に使う

どちらも「関係性」に見えますが、責務と形が異なります。

## 役割の対比

```mermaid
flowchart TD
  subgraph gate2 [Gate2_ReBAC_boolean]
    resolver[GateRelationResolver] --> allowed{allowed?}
    allowed -->|false| deny404[404]
    allowed -->|true| ok[continue]
  end

  subgraph scope [ListScope_SQL]
    resolve[resolveScope] --> customerScope[CustomerScope]
    customerScope --> list[findCustomerRows]
    customerScope --> count[countCustomers]
    customerScope --> contains[isCustomerInScope]
    customerScope --> validate[validateCustomerIds]
  end
```

## CustomerScope は Worker 層で実装される

`shared/permission/scope/customer/` は **interface と型だけ**を提供します。

- `CustomerScope` / `BaseCustomerScope`: [`shared/permission/scope/customer/scope.ts`](../../shared/permission/scope/customer/scope.ts)
- `ScopeMap`（型）: [`shared/permission/scope/customer/scope-map.ts`](../../shared/permission/scope/customer/scope-map.ts)

実際の SQL 実装は Worker 層にあり、認証ミドルウェア（`AuthContextRepository`）で **`AuthContext.shopIds`（閲覧可能店舗ID一覧）**を解決し、それを使ってスコープを生成します。

- 実装（SQL）: [`worker/repository/customer-scope.ts`](../../worker/repository/customer-scope.ts)
- 解決（ロール/割当 → shopIds）: [`worker/repository/auth-context.repository.ts`](../../worker/repository/auth-context.repository.ts)
- 利用（キャッシュして使い回す）: [`worker/repository/customer.repository.ts`](../../worker/repository/customer.repository.ts)

## スコープの流れ（一覧・単体・ID検証の共通基盤）

```mermaid
sequenceDiagram
  participant UseCase as UseCase/Route
  participant Repo as CustomerRepository
  participant Auth as authContextMiddleware
  participant AuthRepo as AuthContextRepository
  participant Scope as CustomerScope
  participant DB as DB

  UseCase->>Repo: list / count / findById / validateIds
  Note over Auth,AuthRepo: リクエスト開始時に auth を注入
  Auth->>AuthRepo: tryAuthenticateUser(sub, tenantId)
  AuthRepo->>DB: select admin_users + subscriptions
  AuthRepo->>DB: resolve shopIds（shops or shop_assignments JOIN shops）
  AuthRepo-->>Auth: plan, role, tenantId, shopIds
  Repo-->>Repo: createCustomerScope(auth)
  Repo->>Scope: scope.findCustomerRows / countCustomers / isCustomerInScope
  Scope->>DB: purchase_histories WHERE tenant_id AND shop_id IN (shopIds)
  DB-->>Scope: rows
  Scope-->>UseCase: result
```

## なぜスコープは boolean ではなく SQL なのか

一覧は「候補が多い」ため、ReBAC のように「各 ID を 1 件ずつ boolean 判定」すると DB 往復や `IN (...)` が巨大になりがちです。

このため、スコープは次の方針で実装されています。

- **EXISTS + JOIN で DB 内で完結**させる
- `validateCustomerIds` では SQLite のパラメータ上限に配慮し、ID 配列をチャンクに分ける

実装例:

- `UnifiedCustomerScope`: `purchase_histories(tenant_id, shop_id)` を条件にする（`tenant_id = auth.tenantId AND shop_id IN auth.shopIds`）

（詳細は [`worker/repository/customer-scope.ts`](../../worker/repository/customer-scope.ts) を参照）

