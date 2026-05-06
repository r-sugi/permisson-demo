import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import type { HonoEnv } from '../type'
import { CustomerId, ShopId } from '@shared/permission/types'
import { useResolver } from '@shared/permission/scope/resolver-map'
import { authorize } from '../middleware/authorize'

// Gate2 relation: 単一リソース ID または POST body の shopId。一覧・エクスポートは CustomerRepository のスコープに委ねる。

const customerListQuerySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const customerPostJsonSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  shopId: z.string().min(1),
  tag: z.string().optional(),
  memo: z.string().optional(),
})

const customerIdParamSchema = z.object({
  id: z.string().min(1),
})

type CustomerPostJson = z.infer<typeof customerPostJsonSchema>

type CustomerPostInput = {
  in: { json: CustomerPostJson }
  out: { json: CustomerPostJson }
}

type CustomerIdInput = {
  in: { param: z.infer<typeof customerIdParamSchema> }
  out: { param: z.infer<typeof customerIdParamSchema> }
}

export const customerRoutes = new Hono<HonoEnv>()

  // GET /api/customers - 顧客一覧（スコープ解決済み・カーソルページネーション）
  .get(
    '/',
    authorize({ policy: { target: 'customer', action: 'read' } }),
    zValidator('query', customerListQuerySchema),
    async (c) => {
      const q = c.req.valid('query')
      const page = await c.get('useCase').customer.listCustomers(q.cursor ?? null, q.limit)
      return c.json(page)
    },
  )

  // POST /api/customers - 顧客作成
  .post(
    '/',
    authorize({ policy: { target: 'customer', action: 'create' } }),
    zValidator('json', customerPostJsonSchema),
    authorize<CustomerPostInput>({
      relation: {
        resolver: (c) =>
          useResolver('shopViaTenant', {
            shopId: ShopId(c.req.valid('json').shopId),
          }),
      },
    }),
    async (c) => {
      const body = c.req.valid('json')
      const customer = await c.get('useCase').customer.createCustomer(body)
      return c.json(customer, 201)
    },
  )

  // PATCH /api/customers/:id - 顧客更新（スコープ内のみ）
  .patch(
    '/:id',
    zValidator('param', customerIdParamSchema),
    authorize<CustomerIdInput>({
      policy: { target: 'customer', action: 'update' },
      relation: {
        resolver: (c) =>
          useResolver('customerViaShop', {
            customerId: CustomerId(c.req.valid('param').id),
          }),
      },
    }),
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(100).optional(),
        tag: z.string().nullable().optional(),
        memo: z.string().nullable().optional(),
      }),
    ),
    async (c) => {
      const customerId = c.req.valid('param').id
      const updates = c.req.valid('json')
      const customer = await c.get('useCase').customer.updateCustomer(customerId, updates)
      return c.json(customer)
    },
  )

  // DELETE /api/customers/:id - 顧客削除（スコープ内のみ）
  .delete(
    '/:id',
    zValidator('param', customerIdParamSchema),
    authorize<CustomerIdInput>({
      policy: { target: 'customer', action: 'delete' },
      relation: {
        resolver: (c) =>
          useResolver('customerViaShop', {
            customerId: CustomerId(c.req.valid('param').id),
          }),
      },
    }),
    async (c) => {
      const customerId = c.req.valid('param').id
      const result = await c.get('useCase').customer.deleteCustomer(customerId)
      return c.json(result)
    },
  )

  // GET /api/customers/export - CSV エクスポート（プラン制御）
  .get('/export', authorize({ policy: { target: 'customer', action: 'exportCsv' } }), async (c) => {
    const customers = await c.get('useCase').customer.exportCsv()
    return c.json({ customers, exportedAt: new Date().toISOString(), count: customers.length })
  })
