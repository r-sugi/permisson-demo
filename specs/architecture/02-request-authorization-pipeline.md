# 02. リクエストの認証・認可パイプライン

この章では、1 リクエストが「どの順番で」「どのデータに依存して」認証・認可されるかを固定します。

## パイプライン全体（Gate 1 → Gate 2）

```mermaid
flowchart TD
  request[request] --> jwt[JWT decode]
  jwt --> authMW[authContextMiddleware]
  authMW --> authorizeMW[authorize middleware]
  authorizeMW --> handler[route handler / usecase]

  authMW -->|401| reject401[HTTP 401]
  authorizeMW -->|403| reject403[HTTP 403]
  authorizeMW -->|404| reject404[HTTP 404]
```

## どこで何を作るか（AuthContext / PolicyContext）

- `AuthContext` は **認証ミドルウェア**で作ります。
  - 入力: `jwtPayload`（`sub`, `role`, `tenantId`）
  - 追加取得: DB から `plan`（`admin_users.plan`）
  - 出力: `AuthContext`（`userId`, `tenantId`, `role`, `plan`）
  - 実装: [`worker/middleware/auth.ts`](../../worker/middleware/auth.ts)

- `PolicyContext` は **authorize（Gate 1）内部**で組み立てます。
  - 入力: `AuthContext.role`, `AuthContext.plan`
  - 現状: `shop_ids` は未使用のため `[]`
  - 実装: [`worker/middleware/authorize.ts`](../../worker/middleware/authorize.ts), [`shared/permission/types.ts`](../../shared/permission/types.ts)

## 1リクエストの時系列（DB参照のタイミング）

```mermaid
sequenceDiagram
  participant Client as Client
  participant Worker as Worker(route)
  participant Auth as authContextMiddleware
  participant DB as DB
  participant Authorize as authorize(Gate1->2)
  participant Repo as repo(resolvers)
  participant Handler as Handler

  Client->>Worker: HTTP request
  Worker->>Auth: middleware
  Auth->>DB: findValidByTenantId(tenantId)
  DB-->>Auth: subscription or null
  alt subscription is not active
    Auth-->>Worker: 401
    Worker-->>Client: 401
  else active
    Auth->>DB: select admin_users.plan by userId
    DB-->>Auth: plan or null
    alt user not found
      Auth-->>Worker: 404
      Worker-->>Client: 404
    else ok
      Auth-->>Worker: set AuthContext
      Worker->>Authorize: middleware
      Authorize-->>Authorize: Gate1 PBAC (in-memory)
      alt PBAC deny
        Authorize-->>Worker: 403
        Worker-->>Client: 403
      else PBAC allow
        Authorize->>Repo: Gate2 ReBAC (resolver)
        Repo-->>Authorize: allowed? boolean
        alt ReBAC deny
          Authorize-->>Worker: 404
          Worker-->>Client: 404
        else allow
          Authorize->>Handler: next()
          Handler-->>Client: 2xx/4xx
        end
      end
    end
  end
```

ポイントは次の 2 つです。

- **PBAC は DB アクセスなしで評価する**（Gate 1 は `role + plan` のみ）。
- **ReBAC は repository 経由で評価する**（Gate 2 は resolver に DB アクセスを閉じ込める）。

## Gate 1 / Gate 2 の責務（実装に即した定義）

| Gate | 目的 | 入力 | 主な実装 | 否認時 |
|---|---|---|---|---|
| Gate 1: PBAC | 「その操作をしてよいか」 | `PolicyContext` | `POLICY_MAP` | 403 |
| Gate 2: ReBAC | 「そのリソースに辿り着ける関係があるか」 | `(repo, auth)` | `GateRelationResolver` / `useResolver` | 404 |

次章から、それぞれの層（PBAC → ReBAC）を個別に分解します。

