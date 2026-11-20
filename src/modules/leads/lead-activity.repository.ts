import { pool } from '../../database/pool';
import type { Db } from '../../database/transaction';

export const ACTIVITY_TYPES = ['LEAD_RECEIVED', 'ASSIGNED', 'TRANSFERRED', 'SLA_STARTED', 'STATUS_CHANGED', 'SLA_BREACHED', 'AUTO_REASSIGNED', 'COMMENT_ADDED', 'PROPERTY_RESOLVED'] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface ActivityRow {
  id: string;
  seq: string;
  lead_id: string;
  type: ActivityType;
  message: string;
  actor_id: string | null;
  actor_name: string | null;
  executive_id: string | null;
  created_at: Date;
}

export const toActivityDto = (a: ActivityRow) => ({
  id: a.id,
  type: a.type,
  message: a.message,
  actor: a.actor_id ? { id: a.actor_id, name: a.actor_name } : null,
  executiveId: a.executive_id,
  createdAt: a.created_at,
});

/** Always called with the transaction that makes the change, so the timeline can never disagree with the lead. */
export async function add(
  db: Db,
  a: { leadId: string; type: ActivityType; message: string; actorId?: string | null; executiveId?: string | null },
): Promise<ActivityRow> {
  const { rows } = await db.query<ActivityRow>(
    `WITH i AS (
       INSERT INTO lead_activities (lead_id, type, message, actor_id, executive_id)
       VALUES ($1, $2, $3, $4, $5) RETURNING *
     )
     SELECT i.*, u.name AS actor_name FROM i LEFT JOIN users u ON u.id = i.actor_id`,
    [a.leadId, a.type, a.message, a.actorId ?? null, a.executiveId ?? null],
  );
  return rows[0];
}

export async function listForLead(leadId: string): Promise<ActivityRow[]> {
  const { rows } = await pool.query<ActivityRow>(
    `SELECT a.*, u.name AS actor_name FROM lead_activities a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.lead_id = $1 ORDER BY a.seq`,
    [leadId],
  );
  return rows;
}

export async function findCommentForMutation(db: Db, id: string): Promise<ActivityRow | null> {
  const { rows } = await db.query<ActivityRow>(
    `SELECT a.*, u.name AS actor_name FROM lead_activities a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.id = $1 AND a.type = 'COMMENT_ADDED'`,
    [id],
  );
  return rows[0] ?? null;
}

export async function updateComment(db: Db, id: string, actorId: string, message: string): Promise<ActivityRow | null> {
  const { rows } = await db.query<ActivityRow>(
    `UPDATE lead_activities SET message = $3
     WHERE id = $1 AND actor_id = $2 AND type = 'COMMENT_ADDED' AND created_at > now() - interval '3 minutes'
     RETURNING *`,
    [id, actorId, message],
  );
  if (!rows[0]) return null;
  const actor = await db.query<{ name: string }>('SELECT name FROM users WHERE id = $1', [rows[0].actor_id]);
  rows[0].actor_name = actor.rows[0]?.name ?? null;
  return rows[0];
}

export async function deleteComment(db: Db, id: string, actorId: string): Promise<boolean> {
  const result = await db.query(
    `DELETE FROM lead_activities
     WHERE id = $1 AND actor_id = $2 AND type = 'COMMENT_ADDED' AND created_at > now() - interval '3 minutes'`,
    [id, actorId],
  );
  return result.rowCount === 1;
}
