import type { JwtPayload } from '@titan/auth'
import type { Database } from '@titan/database'

/**
 * Описание клуба-арендатора в контексте запроса (Фаза 1, database-per-club).
 * null — одно-клубный/дефолтный режим (резолюции по поддомену ещё нет).
 */
export interface ClubContext {
  id: string
  slug: string
  dbName: string
}

export type AppEnv = {
  Variables: {
    user: JwtPayload
    // БД текущего клуба, инжектится middleware tenantContext. В одно-клубном
    // режиме = дефолтный синглтон (поведение идентично прежнему).
    db: Database
    club: ClubContext | null
  }
}
