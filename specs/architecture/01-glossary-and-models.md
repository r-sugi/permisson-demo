# 01. 用語とモデル（RBAC / PBAC / ReBAC）

この章では、権限モデルの役割分担を「まず頭に入れる」ための最小セットを整理します。

## 用語（このプロジェクトの前提）

- **Tenant（テナント）**: フランチャイズ本部の単位です。ユーザーは 1 つのテナントに所属します（JWT の `tenantId`）。
- **Shop（店舗）**: 加盟店の単位です。テナント配下に存在します。
- **Role（ロール）**: 役職（例: `tenant_owner`, `shop_staff`）です。ユーザーの振る舞い（できる操作）を大枠で決めます。
- **Plan（プラン）**: 課金プラン（例: `starter`, `pro`）です。数量制限や機能フラグに影響します。

ロールとプランは、認可判断の入力（コンテキスト）として扱います。

- `AuthContext`: [`shared/permission/types.ts`](../../shared/permission/types.ts)
- `PolicyContext`: [`shared/permission/types.ts`](../../shared/permission/types.ts)

## 3つのモデルの役割分担

このプロジェクトでは、現実の SaaS に近い形でモデルを分けています。

- **RBAC**: 「役職（ロール）そのもの」を表します（`tenant_owner` など）。
- **PBAC**: 「宣言されたポリシーに基づき、その操作が許されるか」を判断します（403）。
- **ReBAC**: 「ユーザーとリソースの間に関係（エッジ）が存在するか」を判断します（404 で秘匿）。

重要なのは、PBAC と ReBAC が **独立した層**であることです。

## 何をどの層で判断するか（直感）

```mermaid
flowchart TD
  request[request] --> needAuth{authContext\n(userId, tenantId, role, plan)\nがあるか}
  needAuth -->|no| status401[401]
  needAuth -->|yes| gate1[Gate1:PBAC\npolicy(target, action)\nrole + plan で評価]
  gate1 -->|deny| status403[403]
  gate1 -->|allow| gate2[Gate2:ReBAC\nrelation(edge)\nrepo を使って評価]
  gate2 -->|deny| status404[404]
  gate2 -->|allow| handler[handler/usecase]
```

PBAC は「やってよい操作か」を、ReBAC は「そのリソースに辿り着ける関係があるか」を見ます。

## ReBACが答える問い（このプロジェクトの定義）

ReBAC は常に次の問いに答えます。

- 「このユーザーと、このリソースの間に、必要な関係（tuple/edge）が存在するか」

逆に、次は ReBAC の責務ではありません（別レイヤで扱います）。

- 集計（店舗数が上限か、エクスポート回数など）
- 入力値のバリデーション
- 課金状態の反映（plan の取得そのもの）
- 一覧の集合生成（スコープで SQL に落とす）

深掘り（判断理由・却下案）は ADR を参照してください。

- [`specs/changes/20260505_add_rebac_pbac.md`](../changes/20260505_add_rebac_pbac.md)

