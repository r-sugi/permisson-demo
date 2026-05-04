import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { HonoEnv } from '../type'
import { ShopId, TenantId } from 'shared/permission/types'
import { useResolver } from 'shared/permission/scope/resolver-map'
import { authorize } from '../middleware/authorize'

// GET /api/shops - 店舗一覧
export const shopListRoutes = new Hono<HonoEnv>().get('/', async (c) => {
  const shops = await c.get('useCase').shop.listShops()
  return c.json(shops)
})

// POST /api/tenants/:tenantId/shops / DELETE /api/tenants/:tenantId/shops/:shopId
export const tenantShopRoutes = new Hono<HonoEnv>()
  .post(
    '/:tenantId/shops',
    authorize({
      policy: { target: 'settings', action: 'createShop' },
      relation: {
        resolver: (c) =>
          useResolver('tenant', { tenantId: TenantId(c.req.param('tenantId') ?? '') }),
      },
    }),
    zValidator('json', z.object({ name: z.string().min(1).max(100) })),
    async (c) => {
      const tenantId = c.req.param('tenantId')
      const { name } = c.req.valid('json')
      const shop = await c.get('useCase').shop.createShop(tenantId, name)
      return c.json(shop, 201)
    },
  )
  .delete(
    '/:tenantId/shops/:shopId',
    authorize({
      policy: { target: 'settings', action: 'deleteShop' },
      relation: {
        resolver: (c) =>
          useResolver('shopInTenant', {
            tenantId: TenantId(c.req.param('tenantId') ?? ''),
            shopId: ShopId(c.req.param('shopId') ?? ''),
          }),
      },
    }),
    async (c) => {
      const shopId = c.req.param('shopId')
      const result = await c.get('useCase').shop.deleteShop(shopId)
      return c.json(result)
    },
  )
