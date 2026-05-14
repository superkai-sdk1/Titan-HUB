import type { JwtPayload } from '@titan/auth'

export type AppEnv = { Variables: { user: JwtPayload } }
