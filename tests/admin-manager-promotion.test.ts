import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/database/pool';
import { startTestApp } from './helpers';

let t: Awaited<ReturnType<typeof startTestApp>>;

before(async () => { t = await startTestApp(); });
after(() => t.close());

describe('admin promotes a manager to admin', () => {
  it('grants admin access while preserving the manager role, designation, and sessions', async () => {
    const manager = await t.manager('promote.target');
    const executive = await t.exec('promote.sales', manager.id);
    const oldManagerToken = await t.login('manager', 'promote.target@test.com', 'TempPass123');

    const promoted = await t.call(`/admin/managers/${manager.id}/promote`, 'POST');
    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.role, 'MANAGER');
    assert.equal(promoted.body.designation, 'MANAGER');
    assert.equal(promoted.body.isAdmin, true);

    assert.equal((await t.asToken(oldManagerToken)('/manager/leads')).status, 200);
    const adminToken = await t.login('admin', 'promote.target@test.com', 'TempPass123');
    assert.equal((await t.asToken(adminToken)('/admin/managers')).status, 200);
    assert.equal((await t.asToken(oldManagerToken)('/admin/managers')).status, 200);
    assert.equal((await t.asToken(adminToken)(`/admin/executives/${executive.id}`)).body.manager.id, manager.id);
  });

  it('requires an admin token and rejects non-manager targets', async () => {
    const manager = await t.manager('promote.auth');
    const otherManager = await t.manager('promote.other');
    const managerToken = await t.login('manager', 'promote.auth@test.com', 'TempPass123');

    assert.equal((await t.asToken(managerToken)(`/admin/managers/${otherManager.id}/promote`, 'POST')).status, 403);
    assert.equal((await t.call(`/admin/managers/${(await t.exec('promote.sales.target')).id}/promote`, 'POST')).status, 400);
  });

  it('is idempotent and persists the additional access in the database', async () => {
    const manager = await t.manager('promote.idempotent');
    assert.equal((await t.call(`/admin/managers/${manager.id}/promote`, 'POST')).status, 200);
    assert.equal((await t.call(`/admin/managers/${manager.id}/promote`, 'POST')).status, 200);
    const row = (await pool.query('SELECT role, designation, admin_access FROM users WHERE id = $1', [manager.id])).rows[0];
    assert.deepEqual(row, { role: 'MANAGER', designation: 'MANAGER', admin_access: true });
  });
});
