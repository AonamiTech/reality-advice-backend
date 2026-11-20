import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/database/pool';
import { startTestApp } from './helpers';

let t: Awaited<ReturnType<typeof startTestApp>>;
let property: any;

before(async () => {
  t = await startTestApp();
  property = await t.property('Import Tower');
});

after(() => t.close());

async function upload(csv: string) {
  const token = await t.login('admin', 'admin@test.com', 'Admin-pass-123');
  const form = new FormData();
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'leads.csv');
  const response = await fetch(`${t.base}/api/v1/admin/leads/imports`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: response.status, body: await response.json() as any };
}

describe('lead upload imports', () => {
  it('previews CSV rows, reports errors, confirms valid rows, and is idempotent', async () => {
    const existing = await t.call('/admin/leads', 'POST', {
      name: 'Existing Import Lead', mobile: '9811111111', propertyName: property.name, source: 'MANUAL', externalLeadId: 'IMPORT-DUP-1',
    });
    assert.equal(existing.status, 201);

    const preview = await upload([
      'name,mobile,email,propertyName,source,enquiryType,budget,externalLeadId',
      `Asha Import,9822222222,asha@example.com,"${property.name}",MANUAL,BUY,2500000,IMPORT-NEW-1`,
      `Bad Import,123,,"${property.name}",MANUAL,BUY,1000000,IMPORT-BAD-1`,
      `Duplicate Import,9833333333,,"${property.name}",MANUAL,BUY,1000000,IMPORT-DUP-1`,
    ].join('\n'));
    assert.equal(preview.status, 201);
    assert.equal(preview.body.status, 'PREVIEW');
    assert.deepEqual(preview.body.counts, { totalRows: 3, validRows: 2, invalidRows: 1, processedRows: 0, importedRows: 0, duplicateRows: 0, failedRows: 0 });
    assert.equal(preview.body.rows.find((row: any) => row.rowNumber === 3).status, 'INVALID');
    assert.equal(preview.body.rows.find((row: any) => row.rowNumber === 3).validationErrors[0].field, 'mobile');

    const confirmed = await t.call(`/admin/leads/imports/${preview.body.id}/confirm`, 'POST');
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.status, 'COMPLETED_WITH_ERRORS');
    assert.deepEqual(confirmed.body.counts, { totalRows: 3, validRows: 2, invalidRows: 1, processedRows: 2, importedRows: 1, duplicateRows: 1, failedRows: 0 });
    assert.equal(confirmed.body.rows.find((row: any) => row.rowNumber === 2).status, 'IMPORTED');
    assert.equal(confirmed.body.rows.find((row: any) => row.rowNumber === 4).status, 'DUPLICATE');

    const leadCount = (await pool.query('SELECT count(*)::int AS count FROM leads')).rows[0].count;
    const repeated = await t.call(`/admin/leads/imports/${preview.body.id}/confirm`, 'POST');
    assert.deepEqual(repeated.body.counts, confirmed.body.counts);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM leads')).rows[0].count, leadCount);
  });

  it('requires Admin authentication and rejects missing files', async () => {
    assert.equal((await fetch(`${t.base}/api/v1/admin/leads/imports`, { method: 'POST' })).status, 401);
    const result = await upload('');
    assert.equal(result.status, 400);
    assert.equal(result.body.errors[0].field, 'file');
  });
});
