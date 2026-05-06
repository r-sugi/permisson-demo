# アーキテクチャ（初見向け）

このフォルダは、初めてこのプロジェクトを見る人が **PBAC / ReBAC** と、それを支える設計（`authorize`, scope）を順序立てて理解できるようにまとめたものです。

設計判断の一次情報（経緯・却下案・背景）は ADR にあります。

- [`specs/changes/20260505_add_rebac_pbac.md`](../changes/20260505_add_rebac_pbac.md)

**実装スナップショット（AS-IS、ファイル名が基準日）**: [`specs/as-is/20260506_as-is.md`](../as-is/20260506_as-is.md)

実装とドキュメントが食い違う場合は、リポジトリ上のソースコードを正とします。

## 推奨読書順

1. [`01-glossary-and-models.md`](./01-glossary-and-models.md)
2. [`02-request-authorization-pipeline.md`](./02-request-authorization-pipeline.md)
3. [`03-pbac-policies.md`](./03-pbac-policies.md)
4. [`04-rebac-gates-and-resolvers.md`](./04-rebac-gates-and-resolvers.md)
5. [`05-list-scopes.md`](./05-list-scopes.md)
6. [`06-http-status-and-extension.md`](./06-http-status-and-extension.md)

## まず見るべき実装ファイル

- 認証コンテキストの注入（JWT → plan 取得 → `AuthContext`）: [`worker/middleware/auth.ts`](../../worker/middleware/auth.ts)
- 認可の二段ゲート（Gate 1: PBAC / Gate 2: ReBAC）: [`worker/middleware/authorize.ts`](../../worker/middleware/authorize.ts)
- PBAC の中核（`POLICY_MAP` と `PolicyContext`）: [`shared/permission/policy/context.ts`](../../shared/permission/policy/context.ts)
- ReBAC の中核（`GateRelationResolver` と `useResolver`）:
  - [`shared/permission/scope/resolver-types.ts`](../../shared/permission/scope/resolver-types.ts)
  - [`shared/permission/scope/resolver-map.ts`](../../shared/permission/scope/resolver-map.ts)
- 一覧の SQL スコープ（ReBAC とは別責務）: [`shared/permission/scope/customer/`](../../shared/permission/scope/customer/)

