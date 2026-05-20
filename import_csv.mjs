import fs from 'fs';
import { createClient } from '@supabase/supabase-js';
import { parse } from 'csv-parse/sync';

const envFile = fs.readFileSync('.env', 'utf-8');
const supabaseUrl = envFile.match(/VITE_SUPABASE_URL=(.*)/)[1].trim();
const supabaseKey = envFile.match(/VITE_SUPABASE_PUBLISHABLE_KEY=(.*)/)[1].trim();
const supabase = createClient(supabaseUrl, supabaseKey);

async function fetchCSV(url, skipFirstLine = false) {
  const response = await fetch(url);
  let text = await response.text();
  if (skipFirstLine) {
    text = text.substring(text.indexOf('\n') + 1);
  }
  return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true });
}

function parseAmount(str) {
  if (!str) return 0;
  return parseFloat(str.replace(/,/g, '').replace(/"/g, '').trim()) || 0;
}

function parseDate(dateStr) {
  if (!dateStr || dateStr.trim() === '') return null;
  // Clean double dots like "13..03.2020"
  let cleaned = dateStr.replace(/\.\./g, '.').replace(/-/g, '.').trim();
  const parts = cleaned.split('.');
  if (parts.length === 3) {
    const day = parts[0].padStart(2, '0');
    const month = parts[1].padStart(2, '0');
    const year = parts[2].length === 2 ? '20' + parts[2] : parts[2];
    return `${year}-${month}-${day}`;
  }
  return null;
}

async function main() {
  // ============================================================
  // CSV 1: CP FUND data (first Google Sheet)
  // ============================================================
  console.log("📥 Fetching CSV 1 (CP FUND)...");
  const records1 = await fetchCSV(
    'https://docs.google.com/spreadsheets/d/11ZtKMEspESmYBWJfE9urfHr1xPaQJCTSWuonu6hPunI/export?format=csv',
    true // skip first line (it has "FUND,,,,,,,,," header)
  );

  const toInsert1 = [];
  for (const row of records1) {
    const empNo = row['EMPLOYEE NUMBER']?.trim();
    const empName = row['EMPLOYEE NAME']?.trim();
    
    // Skip empty/total rows
    if (!empName || empName === '' || empName === 'TOTAL') continue;
    if (row['S.NO'] === 'TOTAL') continue;

    const gross = parseAmount(row[' GROSS ']);
    const deduction = parseAmount(row[' DEDUCTION ']);
    const net = parseAmount(row[' NET  ']);
    const chequeAmt = parseAmount(row[' CHEQUE AMOUNT ']);
    const balanceAmt = parseAmount(row[' BALANCE AMOUNT ']);
    const passingDate = parseDate(row[' PASSING DATE']);
    const entryDate = parseDate(row['ENTERY DATE ']);
    const paymentDate = parseDate(row['PAYMENT DATE']);

    // Skip rows with no meaningful data
    if (gross === 0 && net === 0 && chequeAmt === 0) continue;

    toInsert1.push({
      employee_no: empNo || null,
      full_name: empName,
      total_amount: gross,
      balance_amount: balanceAmt,
      cheque_amount: net || chequeAmt,
      sub_category_regular: 'cp-fund',
      category: 'Employed',
      status: 'active',
      serial_no: row['S.NO']?.trim() || null,
      bank_details: row['BANK AC NUMBER']?.trim() || null,
      appointment_date: entryDate,
      disbursed_date: paymentDate || passingDate,
    });
  }

  console.log(`✅ Parsed ${toInsert1.length} CP Fund records from CSV 1`);

  // ============================================================
  // CSV 2: Disbursements data (second Google Sheet)
  // ============================================================
  console.log("📥 Fetching CSV 2 (Disbursements)...");
  const records2 = await fetchCSV(
    'https://docs.google.com/spreadsheets/d/1sSKmkgro7359hgBNxfv-IuOQALjuGARCy-GwUaUBKu8/export?format=csv'
  );

  // Map fund column keys to sub_category values used in the frontend
  const fundMapping = [
    { key: ' FUND ',  subCatRegular: 'funds',            subCatRetired: 'fund',              category: 'Employed' },
    { key: ' SAL ',   subCatRegular: 'supp-salary',      subCatRetired: null,                 category: 'Employed' },
    { key: ' PEN ',   subCatRegular: null,                subCatRetired: 'pension-gratuity',   category: 'Retired'  },
    { key: ' LPR ',   subCatRegular: null,                subCatRetired: 'lpr',                category: 'Retired'  },
    { key: ' DISB ',  subCatRegular: null,                subCatRetired: 'financial-assistance', category: 'Retired' },
    { key: ' MED ',   subCatRegular: null,                subCatRetired: 'financial-assistance', category: 'Retired' },
    { key: ' G INS ', subCatRegular: null,                subCatRetired: 'financial-assistance', category: 'Retired' },
    { key: ' OTHER ', subCatRegular: null,                subCatRetired: 'financial-assistance', category: 'Retired' },
  ];

  const toInsert2 = [];
  for (const row of records2) {
    const empName = row['EMPLOYEE NAME']?.trim();
    if (!empName || empName === '' || empName === 'TOTAL') continue;

    const empNo = row['EMP NO']?.trim() || null;
    const chequeNo = row['CHEQUE NO']?.trim() || null;
    const passingDate = parseDate(row['PASSING DATE']);
    const totalAmt = parseAmount(row[' TOTAL ']);

    for (const fund of fundMapping) {
      const amount = parseAmount(row[fund.key]);
      if (amount > 0) {
        toInsert2.push({
          employee_no: empNo,
          full_name: empName,
          total_amount: amount,
          balance_amount: 0,
          cheque_amount: amount,
          sub_category_regular: fund.subCatRegular || null,
          sub_category_retired: fund.subCatRetired || null,
          category: fund.category,
          status: 'close', // historical/deposited records
          disbursed_date: passingDate,
          bank_details: chequeNo ? `Cheque: ${chequeNo}` : null,
        });
      }
    }
  }

  console.log(`✅ Parsed ${toInsert2.length} Disbursement records from CSV 2`);

  // ============================================================
  // MERGE & INSERT both into book_section_employees
  // ============================================================
  const allRecords = [...toInsert1, ...toInsert2];
  console.log(`\n📊 Total merged records: ${allRecords.length}`);
  console.log(`   - CP Fund:        ${toInsert1.length}`);
  console.log(`   - Disbursements:  ${toInsert2.length}`);
  console.log(`\n🚀 Uploading to book_section_employees table...`);

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < allRecords.length; i += 50) {
    const batch = allRecords.slice(i, i + 50);
    const { error } = await supabase.from('book_section_employees').insert(batch);
    if (error) {
      console.error(`❌ Batch ${Math.floor(i/50) + 1} error:`, error.message);
      errorCount += batch.length;
    } else {
      successCount += batch.length;
      process.stdout.write(`\r   ✅ Inserted ${successCount}/${allRecords.length} records...`);
    }
  }

  console.log(`\n\n🎉 Upload complete!`);
  console.log(`   ✅ Success: ${successCount}`);
  if (errorCount > 0) console.log(`   ❌ Failed: ${errorCount}`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
