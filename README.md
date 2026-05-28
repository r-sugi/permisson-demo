# authz-sandbox

権限管理デモ — RBAC + ReBAC + PBAC サンプル。

Cloudflare Workers（Hono）上の API と React（Vite）フロントを一体で動かす PoC 用リポジトリです。Drizzle ORM と D1 を使い、フロントは Tailwind CSS v4 で構築しています。

- **リポジトリ**: [github.com/r-sugi/authz-sandbox](https://github.com/r-sugi/authz-sandbox)

## パッケージ

- **名前**: `authz-sandbox`（`package.json`）
- **バージョン**: `0.0.0`
- **`type`**: `module`（ネイティブ ESM）
- **`private`**: `true`（レジストリ公開対象外）
- **`packageManager`**: `pnpm@10.12.1`（Corepack 推奨）

## 前提

- [Node.js](https://nodejs.org/)（プロジェクトでは `typescript`・`vite` を利用）
- [pnpm](https://pnpm.io/) 10.x（`package.json` の `packageManager` に合わせる。Corepack: `corepack enable`）
- [Cloudflare アカウント](https://dash.cloudflare.com/)（`wrangler deploy` 利用時）

## セットアップ

```bash
git clone https://github.com/r-sugi/authz-sandbox.git
cd authz-sandbox
corepack enable   # 初回のみ（pnpm を packageManager から取得）
pnpm install
cp .dev.vars.sample .dev.vars  # 値を埋めてから dev を起動
```

`pnpm run dev` の起動前に `pnpm run cf-typegen` が走り、`wrangler types` に基づく型が生成されます。

CI では `pnpm install --frozen-lockfile` を使い、ロックファイルと `package.json` の不一致で止めます。

## 環境変数（ローカル）

`wrangler.jsonc` で `JWT_SECRET`・`BASIC_AUTH_USERNAME`・`BASIC_AUTH_PASSWORD` が必須シークレットとして定義されています。ローカルでは `.dev.vars.sample` をコピーして `.dev.vars` を作成し、値を設定してください（`.dev.vars` は `.gitignore` 対象）。

```bash
cp .dev.vars.sample .dev.vars
```

本番環境では `wrangler secret put JWT_SECRET` 等で設定してください。

## pnpm スクリプト（`package.json` と同期）

### 開発・ビルド・デプロイ

| コマンド | 説明 |
|----------|------|
| `pnpm run dev` | `cf-typegen` の後、`vite` で開発サーバを起動 |
| `pnpm run build` | `tsc -b` の後、`vite build` |
| `pnpm run preview` | ビルド後に `vite preview` |
| `pnpm run deploy` | ビルド後に `wrangler deploy` |

### Lint / フォーマット（Biome）

| コマンド | 説明 |
|----------|------|
| `pnpm run lint` | `biome lint .` |
| `pnpm run lint:fix` | `biome lint --write .` |
| `pnpm run format` | `biome format .` |
| `pnpm run format:fix` | `biome format --write .` |
| `pnpm run fix` | `lint:fix` と `format:fix` を順に実行 |

### テスト（Vitest）

| コマンド | 説明 |
|----------|------|
| `pnpm run test` | `test:frontend` → `test:unit` → `test:e2e`（`npm-run-all2` の `run-s`） |
| `pnpm run test:frontend` | `vitest run --config vitest.config.frontend.ts` |
| `pnpm run test:unit` | `vitest run --config vitest.config.unit.ts` |
| `pnpm run test:e2e` | `vitest run --config vitest.config.e2e.ts` |
| `pnpm run test:unit:cov` | ユニットテスト＋カバレッジ（`@vitest/coverage-v8`） |
| `pnpm run test:e2e:cov` | E2E＋カバレッジ |

### データベース（Drizzle / ローカル D1）

| コマンド | 説明 |
|----------|------|
| `pnpm run db:gen` | `drizzle-kit generate` でマイグレーション生成 |
| `pnpm run db:migrate:local` | `wrangler d1 migrations apply authz-sandbox --local` |
| `pnpm run db:reset:local` | `vite-node` で `worker/cli/run-local-reset.ts` |
| `pnpm run db:seed:local` | `vite-node` で `worker/cli/run-local-seed.ts` |
| `pnpm run db:reset:seed` | `db:migrate:local` → `db:reset:local` → `db:seed:local` |

### Cloudflare 型

| コマンド | 説明 |
|----------|------|
| `pnpm run cf-typegen` | `wrangler types` で Workers の `Env` などを生成 |

## 構成のメモ

- **Worker エントリ**: `worker/index.ts` → `worker/app.ts`
- **静的アセット**: ビルド出力 `dist/client`（Wrangler の `assets`）
- **`/api/*`**: アセットより先に Worker が処理（`run_worker_first`）
- **D1**: `wrangler.jsonc` の `d1_databases`（開発用の `database_id` プレースホルダあり。本番では `wrangler d1 create` 等で取得した ID に差し替え）

## パスエイリアス（Vite）

- `@/` → `src/`
- `@shared/` → `shared/`
- `@worker/` → `worker/`

## 主要依存関係（抜粋）

ランタイムは `package.json` の `dependencies` を参照してください。例: `hono`、`@hono/zod-validator`、`drizzle-orm`、`react`、`react-router-dom`、`zod`、`ulidx`。開発用は `devDependencies`（例: `vite`、`wrangler`、`vitest`、`@cloudflare/vite-plugin`、`tailwindcss`、`biome` など）。
