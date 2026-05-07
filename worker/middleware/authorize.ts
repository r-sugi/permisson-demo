import type { Context, Input } from 'hono'
import { createMiddleware } from 'hono/factory'
import type { HonoEnv } from '../type'
import type { AuthContext } from '@shared/permission/types'
import type { GateRelationResolver } from '@shared/permission/scope/resolver-types'
import {
  POLICY_MAP,
  type PolicyOption,
  buildPermissionDeniedMessage,
} from '@shared/permission/policy/context'
import {
  ForbiddenError,
  PermissionDeniedError,
  ResourceNotFoundError,
} from '@shared/error/my-app-error'
import { policyContextFromAuth } from '@shared/permission/permissions'

// biome-ignore lint/complexity/noBannedTypes: Hono の既定 Input（空オブジェクト）はフレームワーク慣例
type RelationAuthorizeOption<I extends Input = {}> =
  | {
      /** ReBAC を単一の GateRelationResolver で評価 */
      resolver: (c: Context<HonoEnv, string, I>) => GateRelationResolver
      resolvers?: never
    }
  | {
      /** 複数 Resolver を並列評価し、すべて true のときのみ許可（AND） */
      resolvers: (c: Context<HonoEnv, string, I>) => GateRelationResolver[]
      resolver?: never
    }

function usesRelationResolvers<I extends Input>(
  rel: RelationAuthorizeOption<I>,
): rel is Extract<
  RelationAuthorizeOption<I>,
  { resolvers: (c: Context<HonoEnv, string, I>) => GateRelationResolver[] }
> {
  return 'resolvers' in rel
}

// biome-ignore lint/complexity/noBannedTypes: Hono の既定 Input（空オブジェクト）はフレームワーク慣例
type AuthorizeOptions<I extends Input = {}> =
  | { policy: PolicyOption; relation?: RelationAuthorizeOption<I> }
  | { relation: RelationAuthorizeOption<I>; policy?: PolicyOption }

/**
 * 認可ミドルウェア
 * @param options - 認可オプション
 * - policy: PBAC ポリシー
 * - relation: ReBAC リゾルバ
 *   - resolver: 単一の ReBAC リゾルバ
 *   - resolvers: 複数の ReBAC リゾルバ
 * @returns 認可ミドルウェア
 */
// biome-ignore lint/complexity/noBannedTypes: 同上
export function authorize<I extends Input = {}>(options: AuthorizeOptions<I>) {
  return createMiddleware<HonoEnv, string, I>(async (c, next) => {
    if (!options.policy && !options.relation) {
      // 実装もれ時のフォールバック防止のため、必ず例外を投げる
      throw new ForbiddenError(
        'Permission denied: authorize() requires policy and/or relation (misconfigured route)',
      )
    }

    const auth = c.get('auth') satisfies AuthContext

    // Gate 1: PBAC（role + plan でインメモリ評価・DBアクセスなし）
    if (options.policy) {
      const { target, action } = options.policy
      const context = policyContextFromAuth(auth)
      const policy = POLICY_MAP[target][auth.role](context)
      const permissions = policy.listPermissions() as Record<string, unknown>

      if (!permissions[action]) {
        throw new PermissionDeniedError(buildPermissionDeniedMessage(target, action))
      }
    }

    // Gate 2: ReBAC（repository 経由。authorize 本体は resolver の中身を知らない）
    if (options.relation) {
      const repo = c.get('repo')
      let allowed: boolean
      const rel = options.relation
      if (usesRelationResolvers(rel)) {
        const list = rel.resolvers(c)
        if (list.length === 0) {
          // 実装もれ時のフォールバック防止のため、必ず例外を投げる
          throw new ForbiddenError(
            'Permission denied: authorize() relation.resolvers must be a non-empty array',
          )
        }
        const results = await Promise.all(list.map((r) => r(repo, auth)))
        allowed = results.every((ok) => ok === true)
      } else {
        allowed = await rel.resolver(c)(repo, auth)
      }
      if (!allowed) {
        throw new ResourceNotFoundError('Resource not found')
      }
    }

    await next()
  })
}
