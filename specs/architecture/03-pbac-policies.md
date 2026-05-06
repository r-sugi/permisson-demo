# 03. PBAC（Policy Based Access Control）

PBAC は「その操作をしてよいか（許可／不許可）」を **宣言されたポリシー**で判断します。

このプロジェクトでは、PBAC は `authorize` の **Gate 1** に相当し、否認時は **403** を返します。

- Gate 1 実装: [`worker/middleware/authorize.ts`](../../worker/middleware/authorize.ts)
- ポリシー定義: [`shared/permission/policy/`](../../shared/permission/policy/)

## PBACの入力（PolicyContext）

Gate 1 は `PolicyContext` を入力として、ポリシーを評価します。

- `PolicyContext`: [`shared/permission/types.ts`](../../shared/permission/types.ts)
  - `role`: 役職（RBAC）
  - `plan`: 課金プラン
  - `shop_ids`: 将来拡張用（現状は `[]`）

## POLICY_MAP（target × role → policy）

PBAC は「対象（target）」と「ロール（role）」でポリシークラスを選び、そこから **許可マップ**を得ます。

- `POLICY_MAP`: [`shared/permission/policy/context.ts`](../../shared/permission/policy/context.ts)

```mermaid
flowchart TD
  ctx[PolicyContext\n(role, plan, shop_ids)] --> map[POLICY_MAP]
  map --> policy[policy instance]
  policy --> perms[listPermissions()\n{action: boolean}]
  perms --> check{perms[action] == true?}
  check -->|yes| allow[allow]
  check -->|no| deny[deny -> 403]
```

### target / action の例

`PolicyOption` は `target` ごとに `action` の集合が型で決まります。

- `customer`: `create/read/update/delete` + `exportCsv`
  - 定義: [`shared/permission/policy/customer/types.ts`](../../shared/permission/policy/customer/types.ts)
- `shop`: 現状 `read` のみ（全ロール共通で `true`）
  - 実装: [`shared/permission/policy/shop/index.ts`](../../shared/permission/policy/shop/index.ts)

## 403 の意味（PBAC deny）

PBAC の否認は次を意味します。

- 「その操作は、ロールやプランの観点で許可されていない」

たとえば、プラン機能（`exportCsv`）や CRUD 権限のように、関係性（ReBAC）ではなく **能力・契約**で決まるものは PBAC で扱います。

## PBACがやらないこと

PBAC は **単一リソースへの到達可否（関係チェック）**を扱いません。これは Gate 2（ReBAC）の責務です。

また、一覧の絞り込み（どの顧客行を返すか）は PBAC ではなく、スコープ（SQL）として別レイヤで表現します（次章以降）。

