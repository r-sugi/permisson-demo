import { app } from './app'

export type { AppType } from './app'

export default { fetch: app.fetch } satisfies ExportedHandler<Env>
