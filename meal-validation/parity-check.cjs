/**
 * Run the Node MEAL engine and print a compact summary for parity checks.
 *
 * Usage:
 *   node meal-validation/parity-check.cjs [path/to/file.xlsx]
 *
 * Compare with Python (optional, if venv exists):
 *   cd meal-validation && .venv\Scripts\python -c "from vendor.volunteer_upload_validation import validate_volunteer_upload; import json,sys; print(json.dumps(validate_volunteer_upload(sys.argv[1]), ensure_ascii=False)[:500])" path/to/file.xlsx
 */

const fs = require('fs');
const path = require('path');

const enginePath = path.join(__dirname, '..', 'Frontend', 'netlify', 'functions', 'utils', 'meal', 'validate.cjs');
const { validateVolunteerUpload, VALIDATION_ENGINE_VERSION } = require(enginePath);

function buildMinimalXlsx() {
  const XLSX = require(path.join(__dirname, '..', 'Frontend', 'node_modules', 'xlsx'));
  const wb = XLSX.utils.book_new();
  const header = [
    'name', 'phone', 'State', 'Nationality', 'age', 'gender',
    'personal_identification_number', 'national_id',
    'Product', 'Actual Amount', 'Actual Date', 'Expected Date',
  ];
  const row = [
    'Ahmed Mohamed Ali Hassan', '01012345678', 'Cairo', 'Egyptian', '30', 'Male',
    '12345', '', 'Cash Assistance', '500', '2024-06-01', '2024-05-01',
  ];
  const ws = XLSX.utils.aoa_to_sheet([header, row]);
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function main() {
  const argPath = process.argv[2];
  let buffer;
  let label;

  if (argPath && fs.existsSync(argPath)) {
    buffer = fs.readFileSync(argPath);
    label = argPath;
  } else {
    buffer = buildMinimalXlsx();
    label = '(synthetic minimal workbook)';
  }

  const result = validateVolunteerUpload(buffer);
  const issueKeys = result.issues.map((i) => `${i.code}@${i.excel_row ?? 'sheet'}`);

  const summary = {
    file: label,
    engine_version: VALIDATION_ENGINE_VERSION,
    ok: result.ok,
    errors_count: result.errors_count,
    warnings_count: result.warnings_count,
    validate_mode: result.validate_mode,
    issue_keys: issueKeys.slice(0, 50),
    issue_keys_truncated: issueKeys.length > 50,
    summary_en: result.summary_en,
    messages_en_preview: (result.messages_en || '').slice(0, 400),
  };

  console.log(JSON.stringify(summary, null, 2));
}

main();
