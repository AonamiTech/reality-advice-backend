import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import XLSX from 'xlsx';
import { parseLeadImportFile } from '../src/modules/lead-import/lead-import.parser';

const csv = (text: string) => ({ buffer: Buffer.from(text), filename: 'leads.csv', mimeType: 'text/csv' });

describe('lead import parser', () => {
  it('parses CSV headers and quoted commas, normalizes values, and validates rows', () => {
    const result = parseLeadImportFile(csv([
      'Name,Mobile,Email id,Project name,Source,Enquiry,Budget',
      'Asha Shah,9876543210,asha@example.com,"Palm, Residency",manual,Rent,"₹ 25,00,000"',
      'Bad Row,123,not-an-email,,99ACRES,invalid,not-money',
    ].join('\n')));

    assert.equal(result.format, 'CSV');
    assert.equal(result.rows.length, 2);
    assert.equal(result.rows[0].payload.propertyName, 'Palm, Residency');
    assert.equal(result.rows[0].payload.source, 'MANUAL');
    assert.equal(result.rows[0].payload.enquiryType, 'RENT');
    assert.equal(result.rows[0].payload.budget, 2500000);
    assert.equal(result.rows[0].errors.length, 0);
    assert.ok(result.rows[1].errors.some((e) => e.field === 'mobile'));
    assert.ok(result.rows[1].errors.some((e) => e.field === 'email'));
    assert.ok(result.rows[1].errors.some((e) => e.field === 'propertyName'));
  });

  it('parses the first XLSX worksheet and rejects missing required headers', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['name', 'mobile', 'propertyName', 'source'],
      ['Rahul Mehta', '9876543211', 'Lake View', 'MAGICBRICKS'],
    ]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Leads');
    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const result = parseLeadImportFile({ buffer, filename: 'leads.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    assert.equal(result.format, 'XLSX');
    assert.equal(result.rows[0].payload.name, 'Rahul Mehta');
    assert.equal(result.rows[0].errors.length, 0);

    assert.throws(() => parseLeadImportFile(csv('name,mobile\nRahul,9876543211')),
      /Missing required columns: propertyName, source/);
  });

  it('rejects unsupported files, unknown headers, and oversized row counts', () => {
    assert.throws(() => parseLeadImportFile({ buffer: Buffer.from('x'), filename: 'leads.txt', mimeType: 'text/plain' }), /Only CSV and XLSX files are supported/);
    assert.throws(() => parseLeadImportFile(csv('name,mobile,propertyName,source')), /at least one data row/);
    assert.throws(() => parseLeadImportFile(csv('name,mobile,propertyName,source,unexpected\nA,9876543212,P,MANUAL,x')), /Unknown columns: unexpected/);
    const rows = ['name,mobile,propertyName,source', ...Array.from({ length: 5001 }, (_, i) => `A${i},987654${String(i).padStart(4, '0')},P,MANUAL`)].join('\n');
    assert.throws(() => parseLeadImportFile(csv(rows)), /at most 5000 data rows/);
  });
});
