# 04. ReBAC（Gate 2）と Resolver

ReBAC は「ユーザーとリソースの間に、必要な関係（edge）が存在するか」を判定します。

このプロジェクトでは ReBAC は `authorize` の **Gate 2** に相当し、否認時は **404** を返します（存在の秘匿）。

- Gate 2 実装: [`worker/middleware/authorize.ts`](../../worker/middleware/authorize.ts)
- Resolver 型: [`shared/permission/scope/resolver-types.ts`](../../shared/permission/scope/resolver-types.ts)
- Resolver 生成: [`shared/permission/scope/resolver-map.ts`](../../shared/permission/scope/resolver-map.ts)

## GateRelationResolver（Gate 2 の型）

Gate 2 が扱うのは、次の関数です。

- 入力: `repo`（DB アクセスを隠蔽した repository 群）と `auth`（`AuthContext`）
- 出力: `Promise<boolean>`（許可される関係なら `true`）

この型は **スコープ用の型（`scope/types.ts`）と混同しない**ために、Gate 専用として命名されています。

## なぜ 404 なのか（存在の秘匿）

ReBAC の否認は「権限がない」ではなく、より具体的に次を意味します。

- 「そのリソースに辿り着ける関係がない（＝存在を見せない）」

たとえば「別テナントの shopId を叩いた」ようなケースで 403 を返すと、リソースの存在が推測できてしまいます。そこで Gate 2 は 404 を返します。

## useResolver（URL 等から Resolver を組み立てる）

`authorize` は resolver の中身を知りません。リクエストごとに「URL パラメータ等」から resolver を組み立てて注入します。

`useResolver` は resolver の **カタログ**です。

- [`shared/permission/scope/resolver-map.ts`](../../shared/permission/scope/resolver-map.ts)

キーと意味（代表例）:

- `tenant`: JWT の `tenantId` と URL の `tenantId` が一致するか
- `shop`: ユーザーがその `shopId` に割り当てられているか
- `shopViaTenant`: shop が JWT の tenant に属しているか
- `shopInTenant`: URL の `tenantId` と JWT が一致し、かつ shop がその tenant に属しているか
- `customerViaShop`: 顧客が購入履歴を通じて shop と繋がり、ユーザーの到達範囲にあるか

```mermaid
flowchart TD
  route[route params] --> build[useResolver(key, args)]
  build --> resolver[GateRelationResolver]
  resolver -->|repo + auth| eval[boolean]
  eval -->|false| deny404[deny -> 404]
  eval -->|true| allow[allow]
```

## ReBAC の実装の例（何を見ているか）

Resolver は repository を通して、必要な最小情報だけを引きます。

- `resolveTenantAssignment`: `auth.tenantId === tenantId`
- `resolveShopAssignment`: `shop_assignments` の存在
- `resolveShopViaTenant`: `shops.tenantId === auth.tenantId`
- `resolveCustomerViaShop`: `purchase_histories` 等から評価（ロールにより判定分岐）

実装: [`shared/permission/scope/resolvers.ts`](../../shared/permission/scope/resolvers.ts)

## ReBAC がやらないこと（境界線）

ReBAC は「関係の存在」に集中します。次は ReBAC の責務ではありません。

- プラン上限（店舗数など）や集計
- 入力値バリデーション
- 一覧の集合生成（顧客一覧の絞り込みなど）

一覧のスコープ（SQL）については次々章で扱います。

