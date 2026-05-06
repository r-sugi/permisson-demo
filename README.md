# poc-permission

Cloudflare Workers（Hono）上の API と React（Vite）フロントを一体で動かす、権限制御まわりの検証（PoC）用リポジトリです。Drizzle ORM と D1 を使い、フロントは Tailwind CSS v4 で構築しています。

## パッケージ

- **名前**: `poc-permission`（`package.json`）
- **バージョン**: `0.0.0`
- **`type`**: `module`（ネイティブ ESM）
- **`private`**: `true`（npm 公開対象外）

## 前提

- [Node.js](https://nodejs.org/)（プロジェクトでは `typescript`・`vite` を利用）
- [Cloudflare アカウント](https://dash.cloudflare.com/)（`wrangler deploy` 利用時）

## セットアップ

```bash
npm install
```

`npm run dev` の起動前に `npm run cf-typegen` が走り、`wrangler types` に基づく型が生成されます。

## 環境変数（ローカル）

`wrangler.jsonc` で `JWT_SECRET` が必須シークレットとして定義されています。ローカルではリポジトリ直下の `.dev.vars` に設定してください（ファイルは `.gitignore` 対象のためコミットしないでください）。

## npm スクリプト（`package.json` と同期）

### 開発・ビルド・デプロイ

| コマンド | 説明 |
|----------|------|
| `npm run dev` | `cf-typegen` の後、`vite` で開発サーバを起動 |
| `npm run build` | `tsc -b` の後、`vite build` |
| `npm run preview` | ビルド後に `vite preview` |
| `npm run deploy` | ビルド後に `wrangler deploy` |

### Lint / フォーマット（Biome）

| コマンド | 説明 |
|----------|------|
| `npm run lint` | `biome lint .` |
| `npm run lint:fix` | `biome lint --write .` |
| `npm run format` | `biome format .` |
| `npm run format:fix` | `biome format --write .` |
| `npm run fix` | `lint:fix` と `format:fix` を順に実行 |

### テスト（Vitest）

| コマンド | 説明 |
|----------|------|
| `npm run test` | `test:frontend` → `test:unit` → `test:e2e`（`npm-run-all2` の `run-s`） |
| `npm run test:frontend` | `vitest run --config vitest.config.frontend.ts` |
| `npm run test:unit` | `vitest run --config vitest.config.unit.ts` |
| `npm run test:e2e` | `vitest run --config vitest.config.e2e.ts` |
| `npm run test:unit:cov` | ユニットテスト＋カバレッジ（`@vitest/coverage-v8`） |
| `npm run test:e2e:cov` | E2E＋カバレッジ |

### データベース（Drizzle / ローカル D1）

| コマンド | 説明 |
|----------|------|
| `npm run db:gen` | `drizzle-kit generate` でマイグレーション生成 |
| `npm run db:migrate:local` | `wrangler d1 migrations apply poc-permission --local` |
| `npm run db:reset:local` | `vite-node` で `worker/cli/run-local-reset.ts` |
| `npm run db:seed:local` | `vite-node` で `worker/cli/run-local-seed.ts` |
| `npm run db:reset:seed` | `db:migrate:local` → `db:reset:local` → `db:seed:local` |

### Cloudflare 型

| コマンド | 説明 |
|----------|------|
| `npm run cf-typegen` | `wrangler types` で Workers の `Env` などを生成 |

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

## ライセンス

非公開リポジトリです（`package.json` の `private` は上記「パッケージ」を参照）。
