import { Hono } from 'hono'
import { zValidator } from '@hono/zod-validator'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { ulid } from "ulidx"
import type { HonoEnv } from '../type'
import { schema } from '../rdb/index'
import { authorize } from '../middleware/authorize'

export const customerRoutes = new Hono<HonoEnv>()

  // GET /api/customers - 顧客一覧（スコープ解決済み）
  .get(
    '/',
    authorize({ policy: { target: 'customer', action: 'read' } }),
    async (c) => {
      const customers = await c.get('usecases').customers.listCustomers()
      return c.json(customers)
    },
  )

  // POST /api/customers - 顧客作成
  .post(
    '/',
    authorize({ policy: { target: 'customer', action: 'create' } }),
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(100),
        email: z.string().email(),
        shopId: z.string().min(1),
        tag: z.string().optional(),
        memo: z.string().optional(),
      }),
    ),
    async (c) => {
      const { name, email, shopId, tag, memo } = c.req.valid('json')
      const db = c.get('db')
      const customerId = ulid()
      await db.insert(schema.customers).values({ id: customerId, name, email, tag, memo }).run()
      await db.insert(schema.purchaseHistories).values({ id: ulid(), customerId, shopId }).run()
      const customer = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.id, customerId))
        .get()
      return c.json(customer, 201)
    },
  )

  // PATCH /api/customers/:id - 顧客更新（スコープ内のみ）
  .patch(
    '/:id',
    authorize({ policy: { target: 'customer', action: 'update' } }),
    zValidator(
      'json',
      z.object({
        name: z.string().min(1).max(100).optional(),
        tag: z.string().nullable().optional(),
        memo: z.string().nullable().optional(),
      }),
    ),
    async (c) => {
      const customerId = c.req.param('id')
      const updates = c.req.valid('json')
      const customer = await c.get('usecases').customers.updateCustomer(customerId, updates)
      return c.json(customer)
    },
  )

  // DELETE /api/customers/:id - 顧客削除（スコープ内のみ）
  .delete(
    '/:id',
    authorize({ policy: { target: 'customer', action: 'delete' } }),
    async (c) => {
      const customerId = c.req.param('id')
      const result = await c.get('usecases').customers.deleteCustomer(customerId)
      return c.json(result)
    },
  )

  // GET /api/customers/export - CSV エクスポート（プラン制御）
  .get(
    '/export',
    authorize({ policy: { target: 'customer', action: 'exportCsv' } }),
    async (c) => {
      const customers = await c.get('usecases').customers.exportCsv()
      return c.json({ customers, exportedAt: new Date().toISOString(), count: customers.length })
    },
  )
