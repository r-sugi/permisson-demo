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

## POLICY_MAP（target × role → policy）

PBAC は「対象（target）」と「ロール（role）」でポリシークラスを選び、そこから **許可マップ**を得ます。

- `POLICY_MAP`: [`shared/permission/policy/context.ts`](../../shared/permission/policy/context.ts)

```mermaid
flowchart TD
  ctx[PolicyContext\n(role, plan)] --> map[POLICY_MAP]
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

## プラン上限（数量制限）: Gate 1 とユースケースの役割分担

プランに紐づく **店舗数の上限**のように、最終的には「拒否する／しない」を決めるルールであっても、**PBAC が担うのは `role + plan` から導ける部分に限る**のがこのプロジェクトの切り口です。

- **Gate 1（PBAC）**: 「その操作は許可リストに載っているか」「上限値（または無制限フラグ）はいくつか」といった **契約上の宣言**を `listPermissions()` 等で返す。
- **ユースケース（やハンドラ）**: `countActiveByTenantId` のように **現在のリソース件数を問い合わせ**、宣言された上限と比較して **このリクエストだけの可否**を決める。拒否時の HTTP ステータス（例: 422）もここで確定させる。

後者を `authorize` に押し込むと、ミドルウェアがルートごとの集計クエリや業務ルールを知ることになり、汎用性とテスト容易性が落ちます。この境界の狙いは、パイプライン全体の説明として [`02-request-authorization-pipeline.md`](./02-request-authorization-pipeline.md) にまとめています。

## PBACがやらないこと

PBAC は **単一リソースへの到達可否（関係チェック）**を扱いません。これは Gate 2（ReBAC）の責務です。

また、一覧の絞り込み（どの顧客行を返すか）は PBAC ではなく、スコープ（SQL）として別レイヤで表現します（次章以降）。

