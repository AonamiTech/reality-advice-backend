import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/database/pool';
import { startTestApp } from './helpers';

let t: Awaited<ReturnType<typeof startTestApp>>;
let executive: any;
let executiveCall: ReturnType<typeof t.asToken>;
let lead: any;

before(async () => {
  t = await startTestApp();
  executive = await t.exec('operations.exec');
  await t.property('Operations Tower', [executive.id]);
  executiveCall = t.asToken(await t.login('executive', 'operations.exec@test.com', 'TempPass123'));
  lead = (await t.call('/admin/leads', 'POST', {
    name: 'Operations Customer', mobile: '9898989898', propertyName: 'Operations Tower', source: 'MANUAL',
  })).body;
});

after(() => t.close());

describe('operational status and remarks flow', () => {
  it('supports PRE_CONNECT, NOT_CONNECTED and HOLD statuses', async () => {
    for (const status of ['PRE_CONNECT', 'NOT_CONNECTED', 'HOLD']) {
      const result = await executiveCall(`/executive/leads/${lead.id}/status`, 'PATCH', { status });
      assert.equal(result.status, 200);
      assert.equal(result.body.status, status);
    }
  });

  it('allows the comment author to edit/delete within three minutes and locks it afterwards', async () => {
    const created = await executiveCall(`/executive/leads/${lead.id}/comments`, 'POST', { comment: 'Initial observation' });
    assert.equal(created.status, 200);
    const comment = created.body.activity.find((entry: any) => entry.type === 'COMMENT_ADDED' && entry.message === 'Initial observation');
    assert.ok(comment?.id);

    const edited = await executiveCall(`/executive/leads/${lead.id}/comments/${comment.id}`, 'PATCH', { comment: 'Updated observation' });
    assert.equal(edited.status, 200);
    assert.ok(edited.body.activity.some((entry: any) => entry.id === comment.id && entry.message === 'Updated observation'));

    const removable = await executiveCall(`/executive/leads/${lead.id}/comments`, 'POST', { comment: 'Temporary observation' });
    const temporary = removable.body.activity.find((entry: any) => entry.type === 'COMMENT_ADDED' && entry.message === 'Temporary observation');
    assert.equal((await executiveCall(`/executive/leads/${lead.id}/comments/${temporary.id}`, 'DELETE')).status, 200);
    assert.equal((await executiveCall(`/executive/leads/${lead.id}`)).body.activity.some((entry: any) => entry.id === temporary.id), false);

    const expired = await executiveCall(`/executive/leads/${lead.id}/comments`, 'POST', { comment: 'Expired observation' });
    const expiredComment = expired.body.activity.find((entry: any) => entry.type === 'COMMENT_ADDED' && entry.message === 'Expired observation');
    await pool.query("UPDATE lead_activities SET created_at = now() - interval '4 minutes' WHERE id = $1", [expiredComment.id]);
    assert.equal((await executiveCall(`/executive/leads/${lead.id}/comments/${expiredComment.id}`, 'PATCH', { comment: 'Too late' })).status, 409);
    assert.equal((await executiveCall(`/executive/leads/${lead.id}/comments/${expiredComment.id}`, 'DELETE')).status, 409);
  });
});
