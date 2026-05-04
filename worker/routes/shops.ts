import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { HonoEnv } from '../type'
import { ShopId, TenantId } from '@shared/permission/types'
import { useResolver } from '@shared/permission/scope/resolver-map'
import { authorize } from '../middleware/authorize'

const tenantIdParamSchema = z.object({
  tenantId: z.string().min(1),
})

const tenantAndShopParamSchema = z.object({
  tenantId: z.string().min(1),
  shopId: z.string().min(1),
})

type TenantParamInput = {
  in: { param: z.infer<typeof tenantIdParamSchema> }
  out: { param: z.infer<typeof tenantIdParamSchema> }
}

type TenantShopParamInput = {
  in: { param: z.infer<typeof tenantAndShopParamSchema> }
  out: { param: z.infer<typeof tenantAndShopParamSchema> }
}

// GET /api/shops - 店舗一覧
export const shopListRoutes = new Hono<HonoEnv>().get('/', async (c) => {
  const shops = await c.get('useCase').shop.listShops()
  return c.json(shops)
})

// POST /api/tenants/:tenantId/shops / DELETE /api/tenants/:tenantId/shops/:shopId
export const tenantShopRoutes = new Hono<HonoEnv>()
  .post(
    '/:tenantId/shops',
    zValidator('param', tenantIdParamSchema),
    authorize<TenantParamInput>({
      policy: { target: 'settings', action: 'createShop' },
      relation: {
        resolver: (c) =>
          useResolver('tenant', {
            tenantId: TenantId(c.req.valid('param').tenantId),
          }),
      },
    }),
    zValidator('json', z.object({ name: z.string().min(1).max(100) })),
    async (c) => {
      const { tenantId } = c.req.valid('param')
      const { name } = c.req.valid('json')
      const shop = await c.get('useCase').shop.createShop(tenantId, name)
      return c.json(shop, 201)
    },
  )
  .delete(
    '/:tenantId/shops/:shopId',
    zValidator('param', tenantAndShopParamSchema),
    authorize<TenantShopParamInput>({
      policy: { target: 'settings', action: 'deleteShop' },
      relation: {
        resolver: (c) => {
          const { tenantId, shopId } = c.req.valid('param')
          return useResolver('shopInTenant', {
            tenantId: TenantId(tenantId),
            shopId: ShopId(shopId),
          })
        },
      },
    }),
    async (c) => {
      const { shopId } = c.req.valid('param')
      const result = await c.get('useCase').shop.deleteShop(shopId)
      return c.json(result)
    },
  )
