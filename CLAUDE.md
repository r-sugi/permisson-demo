# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Cloudflare Workers (Hono) + React (Vite) の一体型権限制御 PoC（[authz-sandbox](https://github.com/r-sugi/authz-sandbox)）。バックエンドは Hono + Drizzle ORM + D1、フロントは React + Tailwind CSS v4、デプロイ先は Cloudflare Workers。

## Commands

```bash
# 開発
npm run dev            # cf-typegen 後に Vite 開発サーバ起動
npm run cf-typegen     # wrangler types で Env 型を生成

# ビルド・デプロイ
npm run build
npm run deploy

# Lint / フォーマット（Biome）
npm run lint           # チェックのみ
npm run fix            # lint + format を自動修正

# テスト（3種類の vitest config が分離）
npm run test:unit      # worker/**/*.test.ts, shared/**/*.test.ts（node環境）
npm run test:e2e       # worker/**/*.e2e-spec.ts（Miniflare + D1 マイグレーション適用）
npm run test:frontend  # src/**/*.{test,spec}.{ts,tsx}（happy-dom）
npm run test           # 上記3つを順に実行

# 単一ファイル指定
npx vitest run --config vitest.config.unit.ts worker/usecase/shop.usecase.test.ts

# DB（ローカル D1）
npm run db:gen          # drizzle-kit generate でマイグレーション生成
npm run db:reset:seed   # migrate → reset → seed を一括実行
```

### ローカル環境変数

`.dev.vars`（gitignore対象）に `JWT_SECRET` を設定する必要がある。

## Architecture

### ディレクトリ構成

```
shared/          # フロント・ワーカー共通（権限モデルの中核）
  permission/
    types.ts     # Role, Plan, AuthContext, Brand型（TenantId/ShopId/CustomerId）
    policy/      # PBAC ポリシークラス群
    scope/       # 一覧取得のSQLスコープ + ReBAC Resolver
worker/          # Cloudflare Workers（API サーバ）
  app.ts         # Hono アプリ本体・ミドルウェア適用順
  middleware/
    auth.ts      # JWT → DB で plan 取得 → AuthContext 注入
    authorize.ts # Gate1(PBAC) + Gate2(ReBAC) の二段認可ミドルウェア
    di.ts        # UseCase・Repository を Context にバインド
  routes/        # Hono ルートハンドラ（customers, shops, auth）
  usecase/       # ビジネスロジック
  repository/    # Drizzle を使った DB アクセス
  rdb/
    models/      # Drizzle スキーマ定義
    migrations/  # drizzle-kit 生成マイグレーション
src/             # React フロントエンド
  providers/permission/  # 権限コンテキスト（usePermission hook）
  components/    # Permission コンポーネント（表示制御）
  pages/         # ルートページ
```

### パスエイリアス

- `@/` → `src/`
- `@shared/` → `shared/`
- `@worker/` → `worker/`

### 権限モデル（二段ゲート）

`worker/middleware/authorize.ts` の `authorize()` が全保護ルートで使われる。

**Gate 1 — PBAC**（`policy` オプション）: role + plan でインメモリ評価。`POLICY_MAP[target][role](ctx)` でポリシークラスを取得し `listPermissions()` を照合。DB アクセスなし。

**Gate 2 — ReBAC**（`relation` オプション）: `GateRelationResolver = (repo, auth) => Promise<boolean>` を実行。DB にアクセスしてリソースとユーザーの関係を確認。403ではなく**404**を返す（存在隠蔽）。

どちらか片方のみでも両方同時も可。

### PBAC ポリシー

`shared/permission/policy/context.ts` の `POLICY_MAP` が target（`customer` / `settings` / `shop`）× role でポリシークラスをマッピング。`developer / tenant_staff / system` は `tenant_owner` と同一クラスを共有。

### ReBAC Resolver

`shared/permission/scope/resolver-map.ts` の `useResolver(key, args)` でリゾルバーを取得。キー一覧:
- `tenant` — JWT の tenantId 一致チェック
- `shop` — shop_assignments テーブルでユーザーのショップ割り当て確認
- `shopViaTenant` — ショップの tenantId が JWT と一致するか確認
- `shopInTenant` — tenantId + shopId の両方を確認
- `customerViaShop` — 購入履歴経由でカスタマーへのアクセス権を確認

### 一覧SQLスコープ（ReBAC とは別）

`shared/permission/scope/customer/` に一覧取得時の WHERE 句を組み立てるスコープ実装。`tenant_assignment` ロールは全顧客、`shop_assignment` ロールは担当ショップの顧客のみに絞り込む。

### テスト種別の使い分け

| ファイルパターン | config | 実行環境 |
|---|---|---|
| `**/*.test.ts`（worker/, shared/） | unit | Node.js |
| `**/*.e2e-spec.ts` | e2e | Miniflare（D1 + JWT） |
| `src/**/*.spec.{ts,tsx}` | frontend | happy-dom |

E2E テストは Miniflare の Workers プールを使うため `fileParallelism: false`、タイムアウトは 60s。

### Hono Context の Variables

`worker/type.ts` で定義:
- `auth`: `AuthContext`（userId, tenantId, role, plan）
- `db`: Drizzle インスタンス
- `repo`: `Repositories`（Gate2 用の最小リポジトリセット）
- `useCase`: `UseCases`（CustomerUseCase, ShopUseCase）

### アーキテクチャ詳細ドキュメント

`specs/architecture/` に PBAC/ReBAC の設計詳細と ADR がある。読む順番は `specs/architecture/README.md` を参照。
