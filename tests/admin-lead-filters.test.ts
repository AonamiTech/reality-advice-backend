import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/database/pool';
import { startTestApp } from './helpers';

let t: Awaited<ReturnType<typeof startTestApp>>;
let manager: any, outsider: any, amit: any, rahul: any;
let filterProperty: any, otherProperty: any, pendingProperty: any;
let managerCall: ReturnType<typeof t.asToken>, outsiderCall: ReturnType<typeof t.asToken>, executiveCall: ReturnType<typeof t.asToken>;

const lead = (extra: object = {}) => t.call('/admin/leads', 'POST', {
  name: `Filter Customer ${Math.random()}`,
  mobile: `98${String(Math.floor(Math.random() * 1_000_000_00)).padStart(8, '0')}`,
  propertyName: filterProperty.name,
  source: 'MANUAL',
  ...extra,
});

before(async () => {
  t = await startTestApp();
  manager = await t.manager('filter.manager');
  outsider = await t.manager('filter.outsider');
  amit = await t.exec('filter.amit', manager.id);
  rahul = await t.exec('filter.rahul', outsider.id);
  filterProperty = await t.property('Filter Tower', [amit.id]);
  otherProperty = await t.property('Other Tower', [rahul.id]);
  pendingProperty = await t.property('Pending Tower');
  managerCall = t.asToken(await t.login('manager', 'filter.manager@test.com', 'TempPass123'));
  outsiderCall = t.asToken(await t.login('manager', 'filter.outsider@test.com', 'TempPass123'));
  executiveCall = t.asToken(await t.login('executive', 'filter.amit@test.com', 'TempPass123'));
});

after(() => t.close());

describe('Admin lead filters', () => {
  let manual: any, connected: any, portal: any, other: any, pending: any, searchable: any;

  before(async () => {
    manual = (await lead({ name: 'Manual Connected', propertyName: filterProperty.name })).body;
    connected = (await lead({ name: 'Manual Connected Second', propertyName: filterProperty.name })).body;
    portal = (await lead({ name: 'Portal Lead', source: '99ACRES', propertyName: filterProperty.name })).body;
    other = (await lead({ name: 'Other Manager Lead', source: 'MAGICBRICKS', propertyName: otherProperty.name })).body;
    pending = (await lead({ name: 'Pending Manual Lead', propertyName: pendingProperty.name })).body;
    searchable = (await lead({ name: 'Unique Search Customer', mobile: '9812345678', email: 'unique.search@example.com', propertyName: 'Searchable Residency' })).body;
    await t.call(`/admin/leads/${manual.id}/status`, 'PATCH', { status: 'CONNECTED' });
    await t.call(`/admin/leads/${connected.id}/status`, 'PATCH', { status: 'CONNECTED' });
    await t.call(`/admin/leads/${connected.id}/important`, 'POST');
    await t.call(`/admin/leads/${manual.id}/follow-up`, 'PUT', { followUpAt: new Date(Date.now() + 60 * 60 * 1000).toISOString() });
    await t.call(`/admin/leads/${connected.id}/follow-up`, 'PUT', { followUpAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() });
    await pool.query('UPDATE leads SET follow_up_at = now() - interval \'1 hour\' WHERE id = $1', [portal.id]);
  });

  it('applies source, status, property, executive and important filters', async () => {
    const manualRows = (await t.call('/admin/leads?source=MANUAL&limit=200')).body;
    assert.ok(manualRows.some((row: any) => row.id === manual.id));
    assert.ok(manualRows.every((row: any) => row.source === 'MANUAL'));
    assert.ok((await t.call('/admin/leads?status=CONNECTED&limit=200')).body.every((row: any) => row.status === 'CONNECTED'));
    assert.ok((await t.call(`/admin/leads?propertyId=${filterProperty.id}&limit=200`)).body.every((row: any) => row.property.id === filterProperty.id));
    assert.ok((await t.call(`/admin/leads?executiveId=${amit.id}&limit=200`)).body.every((row: any) => row.assignedExecutive?.id === amit.id));
    assert.ok((await t.call('/admin/leads?important=true&limit=200')).body.every((row: any) => row.isImportant === true));
  });

  it('searches customer name, mobile, email and property name', async () => {
    for (const term of ['Unique Search Customer', '9812345678', 'unique.search@example.com', 'Searchable Residency']) {
      const rows = (await t.call(`/admin/leads?search=${encodeURIComponent(term)}&limit=200`)).body;
      assert.ok(rows.some((row: any) => row.id === searchable.id), `search should match ${term}`);
    }
  });

  it('combines filters with AND semantics and paginates after filtering', async () => {
    const combined = (await t.call('/admin/leads?source=MANUAL&status=CONNECTED&important=true&limit=200')).body;
    assert.deepEqual(combined.map((row: any) => row.id), [connected.id]);
    const firstPage = (await t.call('/admin/leads?source=MANUAL&limit=1&offset=0')).body;
    const secondPage = (await t.call('/admin/leads?source=MANUAL&limit=1&offset=1')).body;
    assert.equal(firstPage.length, 1);
    assert.equal(secondPage.length, 1);
    assert.notEqual(firstPage[0].id, secondPage[0].id);
  });

  it('supports overdue, today, upcoming and none follow-up buckets', async () => {
    assert.ok((await t.call('/admin/leads?followUp=overdue&limit=200')).body.some((row: any) => row.id === portal.id));
    assert.ok((await t.call('/admin/leads?followUp=today&limit=200')).body.some((row: any) => row.id === manual.id));
    assert.ok((await t.call('/admin/leads?followUp=upcoming&limit=200')).body.some((row: any) => row.id === connected.id));
    assert.ok((await t.call('/admin/leads?followUp=none&limit=200')).body.some((row: any) => row.id === pending.id));
  });

  it('ignores empty query values', async () => {
    const all = (await t.call('/admin/leads?limit=200')).body;
    const empty = await t.call('/admin/leads?search=&status=&propertyId=&executiveId=&followUp=&source=&important=&limit=&offset=');
    assert.equal(empty.status, 200);
    assert.equal(empty.body.length, all.length);
  });

  it('keeps role scope and supports assigned leads of inactive executives', async () => {
    assert.ok((await managerCall('/manager/leads?limit=200')).body.some((row: any) => row.id === manual.id));
    assert.equal((await outsiderCall('/manager/leads?limit=200')).body.some((row: any) => row.id === manual.id), false);
    assert.ok((await executiveCall('/executive/leads?limit=200')).body.every((row: any) => row.assignedExecutive?.id === amit.id));
    assert.ok((await executiveCall(`/executive/leads?executiveId=${rahul.id}&limit=200`)).body.some((row: any) => row.id === manual.id), 'executiveId cannot expand an executive beyond own scope');
    await t.setActive(amit.id, false);
    const inactiveAssigned = (await t.call(`/admin/leads?executiveId=${amit.id}&limit=200`)).body;
    assert.ok(inactiveAssigned.some((row: any) => row.id === manual.id));
  });
});
