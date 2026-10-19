import { auditLogs, type Database } from '@sharry/database'

export async function writeAudit(
  db: Database,
  event: {
    actorUserId?: string | null
    action: string
    entityType: string
    entityId?: string | null
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  await db.insert(auditLogs).values({
    actorUserId: event.actorUserId ?? null,
    action: event.action,
    entityType: event.entityType,
    entityId: event.entityId ?? null,
    metadata: event.metadata ?? {},
  })
}
