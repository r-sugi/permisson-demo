# poc-permission

Cloudflare Workers（Hono）上の API と React（Vite）フロントを一体で動かす、権限制御まわりの検証（PoC）用リポジトリです。Drizzle ORM と D1 を使い、フロントは Tailwind CSS v4 で構築しています。

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

## よく使うコマンド

| コマンド | 説明 |
|----------|------|
| `npm run dev` | `cf-typegen` の後、Vite + Cloudflare プラグインで開発サーバを起動 |
| `npm run build` | TypeScript ビルド後、Vite でクライアントをビルド |
| `npm run preview` | ビルド後に `vite preview` で確認 |
| `npm run deploy` | ビルド後に `wrangler deploy` でデプロイ |
| `npm run test:unit` | Vitest（ユニット、`vitest.config.unit.ts`） |
| `npm run test:e2e` | Vitest（E2E / Workers プール、`vitest.config.e2e.ts`） |
| `npm run test:frontend` | フロント向け Vitest（`vitest.config.frontend.ts`） |
| `npm run db:gen` | Drizzle Kit でマイグレーション生成 |
| `npm run db:migrate:local` | ローカル D1 に `worker/rdb/migrations` を適用 |
| `npm run cf-typegen` | Workers の `Env` 型などを再生成 |

## 構成のメモ

- **Worker エントリ**: `worker/index.ts` → `worker/app.ts`
- **静的アセット**: ビルド出力 `dist/client`（Wrangler の `assets`）
- **`/api/*`**: アセットより先に Worker が処理（`run_worker_first`）
- **D1**: `wrangler.jsonc` の `d1_databases`（開発用の `database_id` プレースホルダあり。本番では `wrangler d1 create` 等で取得した ID に差し替え）

## パスエイリアス（Vite）

- `@/` → `src/`
- `@shared/` → `shared/`
- `@worker/` → `worker/`

## ライセンス

このリポジトリは `private` パッケージです（`package.json` の `"private": true`）。
