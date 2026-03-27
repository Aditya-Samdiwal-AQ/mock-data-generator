#!/usr/bin/env node
// ============================================================================
// CSV-to-Mock Data Converter
// ============================================================================
// Converts CSV files exported from Vault Toolbox into mock data files
// (pfv.mock.general.js and pfv.mock.globalPlans.js).
//
// Prefix-agnostic: auto-detects field prefixes from CSV headers by matching
// column suffix patterns (e.g., *_table_type__c, *_message_code__c).
// Works with any Vault field prefix (nni_, abc_, xyz_, etc.).
//
// Usage:
//   node csv-to-mock.mjs --lookups <lookups.csv> --messages <messages.csv> [--output-dir ./MockData]
//
// One-liner (fetches from GitHub and runs):
//   bash <(curl -fsSL https://raw.githubusercontent.com/Aditya-Samdiwal-AQ/mock-data-generator/main/generate-mock.sh) \
//     --lookups <lookups.csv> --messages <messages.csv>
// ============================================================================

import fs from 'fs';
import path from 'path';

// Output directory — configurable via --output-dir CLI arg.
// Defaults to ./MockData relative to CWD.
let MOCK_DIR = path.resolve(process.cwd(), 'MockData');

// ── Header Normalization ─────────────────────────────────────────────────────
// VQL LONGTEXT()/RICHTEXT() functions may appear in CSV column headers.
// Strip them to get the underlying field name.

function normalizeHeader(h) {
  const trimmed = h.trim();
  const match = trimmed.match(/^(?:LONGTEXT|RICHTEXT)\((.+)\)$/i);
  return match ? match[1] : trimmed;
}

// ── CSV Parser ──────────────────────────────────────────────────────────────
// RFC 4180 compliant parser that handles quoted fields with embedded commas,
// newlines, and escaped double quotes.

function parseCSV(text) {
  const rows = [];
  let i = 0;
  const len = text.length;

  function parseField() {
    if (i >= len) return '';

    if (text[i] === '"') {
      // Quoted field
      i++; // skip opening quote
      let field = '';
      while (i < len) {
        if (text[i] === '"') {
          if (i + 1 < len && text[i + 1] === '"') {
            field += '"';
            i += 2;
          } else {
            i++; // skip closing quote
            break;
          }
        } else {
          field += text[i];
          i++;
        }
      }
      return field;
    } else {
      // Unquoted field
      let field = '';
      while (i < len && text[i] !== ',' && text[i] !== '\n' && text[i] !== '\r') {
        field += text[i];
        i++;
      }
      return field;
    }
  }

  function parseRow() {
    const fields = [];
    fields.push(parseField());
    while (i < len && text[i] === ',') {
      i++; // skip comma
      fields.push(parseField());
    }
    // Skip line ending
    if (i < len && text[i] === '\r') i++;
    if (i < len && text[i] === '\n') i++;
    return fields;
  }

  // Parse header
  if (i >= len) return [];
  const headers = parseRow();

  // Parse data rows
  while (i < len) {
    // Skip empty trailing lines
    if (text[i] === '\n' || text[i] === '\r') {
      i++;
      continue;
    }
    const row = parseRow();
    if (row.length === 1 && row[0] === '') continue; // skip empty rows
    const obj = {};
    headers.forEach((h, idx) => {
      obj[normalizeHeader(h)] = idx < row.length ? row[idx] : '';
    });
    rows.push(obj);
  }

  return rows;
}

// ── Column Detection ────────────────────────────────────────────────────────
// Instead of hardcoded field maps with a fixed prefix (e.g., nni_), detect
// columns by their suffix pattern. This makes the script work with ANY field
// prefix across different projects.

function findColumnBySuffix(headers, suffix) {
  return headers.find(h => h.endsWith(suffix)) || null;
}

function detectLookupColumns(headers) {
  return {
    tableType:  findColumnBySuffix(headers, '_table_type__c'),
    codeId:     findColumnBySuffix(headers, '_code_id__c'),
    codeLabel:  findColumnBySuffix(headers, '_code_label__c'),
    codeOrder:  findColumnBySuffix(headers, '_code_order__c'),
  };
}

function detectMessageColumns(headers) {
  return {
    messageAttributes:     findColumnBySuffix(headers, '_message_attributes__c'),
    messagePlanFormulary:  findColumnBySuffix(headers, '_message_plan_formulary__c'),
    messageRank:           findColumnBySuffix(headers, '_message_rank__c'),
  };
}

// Derived/computed fields not in vault—set to empty defaults on messages
const MESSAGE_EXTRA_FIELDS = {
  'category': '',
  'comp1perform': '',
  'comp2perform': '',
  'copaycardcopayperform': '',
  'formularies': '',
  'messagetext': '',
  'pharmacies': '',
  'prodperform': '',
  'tiernotes': '',
};

// ── Table Type Routing ──────────────────────────────────────────────────────
// Vault lookup records are split into separate mock sections by Table_Type.

const PLAN_TYPE = 'Plan';
const FORMULARY_TYPE = 'Formulary_Plan';
const PHARMACY_TYPE = 'Pharmacy';
const GLOBAL_PLAN_TYPE = 'Global_Plans';

// ── Data Transformers ───────────────────────────────────────────────────────

function tryParseJSON(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return value;
    }
  }
  return value;
}

function transformLookup(row, cols) {
  const result = { ...row };
  // Convert order to number
  if (cols.codeOrder && result[cols.codeOrder] !== undefined) {
    result[cols.codeOrder] = Number(result[cols.codeOrder]) || 0;
  }
  return result;
}

function transformFormulary(row, cols) {
  const result = transformLookup(row, cols);
  // Formulary code_label is stored as JSON object (not string) in mock
  if (cols.codeLabel && result[cols.codeLabel]) {
    result[cols.codeLabel] = tryParseJSON(result[cols.codeLabel]);
  }
  return result;
}

function transformGlobalPlan(row, cols) {
  const result = { ...row };
  if (cols.codeOrder && result[cols.codeOrder] !== undefined) {
    result[cols.codeOrder] = Number(result[cols.codeOrder]) || 0;
  }
  return result;
}

function transformMessage(row, cols) {
  const result = { ...row };

  // Parse JSON fields
  if (cols.messageAttributes && result[cols.messageAttributes]) {
    result[cols.messageAttributes] = tryParseJSON(result[cols.messageAttributes]);
  }
  if (cols.messagePlanFormulary && result[cols.messagePlanFormulary]) {
    result[cols.messagePlanFormulary] = tryParseJSON(result[cols.messagePlanFormulary]);
  }

  // Numeric id if possible
  const numId = Number(result['id']);
  if (!isNaN(numId) && String(numId) === String(result['id'])) {
    result['id'] = numId;
  }

  // Add derived/computed fields with empty defaults
  for (const [key, defaultValue] of Object.entries(MESSAGE_EXTRA_FIELDS)) {
    result[key] = defaultValue;
  }

  return result;
}

function transformProduct(row) {
  return {
    'description__v': row['description__v'] || '',
    'external_id__v': row['external_id__v'] || '',
    'id': row['id'] || '',
    'manufacturer__v': row['manufacturer__v'] || '',
    'name__v': row['name__v'] || '',
    'product_type__v': row['product_type__v'] || '',
  };
}

// ── File Writers ─────────────────────────────────────────────────────────────

function jsonStringify(obj, indent = 2) {
  return JSON.stringify(obj, null, indent);
}

function readExistingGeneral() {
  const filePath = path.join(MOCK_DIR, 'pfv.mock.general.js');
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath, 'utf-8');
}

function writeGeneralFile({ user, territory, recordTypes, accounts, childAccounts, parentAccount, products, messages, lookups, plans, formularies, pharmacies }) {
  const lines = [];

  lines.push('if (pfv == undefined) pfv = {};');
  lines.push('if (pfv.mock === undefined) pfv.mock = {};');
  lines.push('');

  lines.push(`pfv.mock.user = ${jsonStringify(user)};`);
  lines.push('');
  lines.push(`pfv.mock.territory = ${jsonStringify(territory)};`);
  lines.push('');
  lines.push(`pfv.mock.recordTypes = ${jsonStringify(recordTypes)};`);
  lines.push('');
  lines.push(`pfv.mock.accounts = ${jsonStringify(accounts)};`);
  lines.push('');
  lines.push(`pfv.mock.childAccounts = ${jsonStringify(childAccounts)};`);
  lines.push('');
  lines.push(`pfv.mock.parentAccount = ${jsonStringify(parentAccount)};`);
  lines.push('');
  lines.push(`pfv.mock.products = ${jsonStringify(products)};`);
  lines.push('');
  lines.push(`pfv.mock.messages = ${jsonStringify(messages)};`);
  lines.push('');
  lines.push(`pfv.mock.lookups = ${jsonStringify(lookups)};`);
  lines.push('');
  lines.push(`pfv.mock.plans = ${jsonStringify(plans)};`);
  lines.push('');
  lines.push(`pfv.mock.formularies = ${jsonStringify(formularies)};`);
  lines.push('');
  lines.push(`pfv.mock.pharmacies = ${jsonStringify(pharmacies)};`);
  lines.push('');

  const outputPath = path.join(MOCK_DIR, 'pfv.mock.general.js');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  console.log(`  Written: ${outputPath}`);
}

function writeGlobalPlansFile(globalPlans) {
  const lines = [];
  lines.push('if (pfv == undefined) pfv = {};');
  lines.push('if (pfv.mock === undefined) pfv.mock = {};');
  lines.push('');
  lines.push(`pfv.mock.globalPlans = ${jsonStringify(globalPlans)};`);
  lines.push('');

  const outputPath = path.join(MOCK_DIR, 'pfv.mock.globalPlans.js');
  fs.writeFileSync(outputPath, lines.join('\n'), 'utf-8');
  console.log(`  Written: ${outputPath}`);
}

// ── Existing Mock Data Extractor ─────────────────────────────────────────────
// Extracts static sections (user, territory, etc.) from existing mock file so
// they are preserved when regenerating.

function extractExistingSection(content, sectionName) {
  // Match: pfv.mock.sectionName = <value>;
  // This is a best-effort extraction for simple sections.
  const regex = new RegExp(`pfv\\.mock\\.${sectionName}\\s*=\\s*`);
  const match = regex.exec(content);
  if (!match) return undefined;

  const start = match.index + match[0].length;
  let depth = 0;
  let inString = false;
  let stringChar = '';
  let escaped = false;
  let i = start;

  while (i < content.length) {
    const ch = content[i];

    if (escaped) {
      escaped = false;
      i++;
      continue;
    }

    if (ch === '\\') {
      escaped = true;
      i++;
      continue;
    }

    if (inString) {
      if (ch === stringChar) {
        inString = false;
      }
      i++;
      continue;
    }

    if (ch === '"' || ch === "'") {
      inString = true;
      stringChar = ch;
      i++;
      continue;
    }

    if (ch === '{' || ch === '[') {
      depth++;
      i++;
      continue;
    }

    if (ch === '}' || ch === ']') {
      depth--;
      if (depth === 0) {
        i++; // include closing bracket
        break;
      }
      i++;
      continue;
    }

    i++;
  }

  const valueStr = content.substring(start, i).trim();
  try {
    // Use Function constructor to evaluate JavaScript object literals (handles unquoted keys, trailing commas)
    return new Function(`return ${valueStr}`)();
  } catch {
    console.warn(`  Warning: Could not parse existing pfv.mock.${sectionName}, using default.`);
    return undefined;
  }
}

// ── Default Sections ─────────────────────────────────────────────────────────

const DEFAULT_USER = {
  "alias__sys": "Dr. Novo",
  "email__sys": "dataintegration@precsionvh.com",
  "id": "_UserId_",
  "name__v": "Novo User",
  "office_phone__sys": "317-555-1212",
  "title__sys": "Dr.",
  "username__sys": "Novo@vvtechpartner-precision-medicine-group.com"
};

const DEFAULT_TERRITORY = {
  "id": "_TerritoryId_",
  "name__v": "_TerritoryName_"
};

const DEFAULT_RECORD_TYPES = [
  { "api_name__v": "base__v", "id": "OOT00000000V001" },
  { "api_name__v": "personaccount__v", "id": "OOT00000000V298" },
  { "api_name__v": "practice__v", "id": "OOT00000000V300" },
  { "api_name__v": "professional__v", "id": "OOT00000000V301" }
];

const DEFAULT_ACCOUNTS = [{
  "external_id__v": "_AccountExternalId_",
  "first_name_cda__v": "???",
  "id": "_AccountId_",
  "last_name_cda__v": "???",
  "name__v": "???",
  "object_type__v": "OOT00000000V301",
  "suffix_cda__v": "",
  "persontitle__v": ""
}];

const DEFAULT_CHILD_ACCOUNTS = [];
const DEFAULT_PARENT_ACCOUNT = {
  "Id": "_ParentAccountId_",
  "External_ID_vod__c": "_ParentAccountExternalId_",
  "RecordTypeId": "OOT00000000V300",
  "Name": "Parent Account",
  "LastName": "",
  "FirstName": "",
  "PersonTitle": "",
  "Suffix_vod__c": "",
  "isGroupPractice": true
};

const DEFAULT_PRODUCTS = [{
  "description__v": "NNI_401",
  "external_id__v": "NNI_401",
  "id": "_VaultProductId_",
  "manufacturer__v": "Novo",
  "name__v": "Wegovy",
  "product_type__v": "Detail"
}];

// ── CLI Argument Parsing ─────────────────────────────────────────────────────

function parseArgs(args) {
  const result = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--lookups' && i + 1 < args.length) {
      result.lookups = args[++i];
    } else if (args[i] === '--messages' && i + 1 < args.length) {
      result.messages = args[++i];
    } else if (args[i] === '--products' && i + 1 < args.length) {
      result.products = args[++i];
    } else if (args[i] === '--output-dir' && i + 1 < args.length) {
      result.outputDir = args[++i];
    } else if (args[i] === '--help' || args[i] === '-h') {
      result.help = true;
    }
  }
  return result;
}

function printUsage() {
  console.log(`
CSV-to-Mock Data Converter
==========================

Converts Vault Toolbox CSV exports into mock data files for local IVA development.
Prefix-agnostic: auto-detects field prefixes from CSV headers.

Usage:
  node csv-to-mock.mjs --lookups <lookups.csv> --messages <messages.csv> [--output-dir ./MockData]

One-liner (fetches from GitHub and runs):
  bash <(curl -fsSL https://raw.githubusercontent.com/Aditya-Samdiwal-AQ/mock-data-generator/main/generate-mock.sh) \\
    --lookups <lookups.csv> --messages <messages.csv>

Arguments:
  --lookups     Path to the lookups CSV (from message_lookup query)
  --messages    Path to the messages CSV (from prescribermessage query)
  --products    Path to the products CSV (from product__v query) [optional]
  --output-dir  Path to MockData directory [default: ./MockData]
  --help        Show this help message

Output:
  MockData/pfv.mock.general.js     - Lookups, plans, formularies, pharmacies, messages
  MockData/pfv.mock.globalPlans.js - Global plan data
`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || (!args.lookups && !args.messages)) {
    printUsage();
    process.exit(args.help ? 0 : 1);
  }

  // Set output directory
  if (args.outputDir) {
    MOCK_DIR = path.resolve(args.outputDir);
  }

  if (!fs.existsSync(MOCK_DIR)) {
    console.error(`Error: Output directory not found: ${MOCK_DIR}`);
    console.error(`Run this from the IVA/ directory, or use --output-dir to specify the MockData path.`);
    process.exit(1);
  }

  console.log('CSV-to-Mock Converter');
  console.log('=====================');
  console.log(`Output: ${MOCK_DIR}`);

  // Try to preserve existing sections from current mock file
  const existingContent = readExistingGeneral();
  let user = DEFAULT_USER;
  let territory = DEFAULT_TERRITORY;
  let recordTypes = DEFAULT_RECORD_TYPES;
  let accounts = DEFAULT_ACCOUNTS;
  let childAccounts = DEFAULT_CHILD_ACCOUNTS;
  let parentAccount = DEFAULT_PARENT_ACCOUNT;
  let products = DEFAULT_PRODUCTS;
  let messages = [];
  let lookups = [];
  let plans = [];
  let formularies = [];
  let pharmacies = [];
  let globalPlans = [];

  if (existingContent) {
    console.log('\nPreserving existing static sections from pfv.mock.general.js...');
    user = extractExistingSection(existingContent, 'user') || user;
    territory = extractExistingSection(existingContent, 'territory') || territory;
    recordTypes = extractExistingSection(existingContent, 'recordTypes') || recordTypes;
    accounts = extractExistingSection(existingContent, 'accounts') || accounts;
    childAccounts = extractExistingSection(existingContent, 'childAccounts') || childAccounts;
    parentAccount = extractExistingSection(existingContent, 'parentAccount') || parentAccount;
    // Products preserved unless --products CSV is provided
    if (!args.products) {
      products = extractExistingSection(existingContent, 'products') || products;
    }
  }

  // ── Process Lookups CSV ──────────────────────────────────────────────────
  if (args.lookups) {
    console.log(`\nProcessing lookups: ${args.lookups}`);
    const csv = fs.readFileSync(args.lookups, 'utf-8');
    const rows = parseCSV(csv);
    console.log(`  Parsed ${rows.length} lookup records`);

    // Auto-detect columns by suffix
    const headers = Object.keys(rows[0] || {});
    const cols = detectLookupColumns(headers);
    console.log(`  Detected prefix: ${cols.tableType ? cols.tableType.replace(/_table_type__c$/, '_') : '(unknown)'}`);

    for (const row of rows) {
      const tableType = cols.tableType ? row[cols.tableType] : '';

      if (tableType === PLAN_TYPE) {
        plans.push(transformLookup(row, cols));
      } else if (tableType === FORMULARY_TYPE) {
        formularies.push(transformFormulary(row, cols));
      } else if (tableType === PHARMACY_TYPE) {
        lookups.push(transformLookup(row, cols));
      } else if (tableType === GLOBAL_PLAN_TYPE) {
        globalPlans.push(transformGlobalPlan(row, cols));
      } else {
        lookups.push(transformLookup(row, cols));
      }
    }

    console.log(`  Split into:`);
    console.log(`    Lookups (non-plan): ${lookups.length}`);
    console.log(`    Plans:              ${plans.length}`);
    console.log(`    Formularies:        ${formularies.length}`);
    console.log(`    Global Plans:       ${globalPlans.length}`);
  } else {
    // Preserve existing data sections
    if (existingContent) {
      lookups = extractExistingSection(existingContent, 'lookups') || [];
      plans = extractExistingSection(existingContent, 'plans') || [];
      formularies = extractExistingSection(existingContent, 'formularies') || [];
      pharmacies = extractExistingSection(existingContent, 'pharmacies') || [];
    }
  }

  // ── Process Messages CSV ─────────────────────────────────────────────────
  if (args.messages) {
    console.log(`\nProcessing messages: ${args.messages}`);
    const csv = fs.readFileSync(args.messages, 'utf-8');
    const rows = parseCSV(csv);
    console.log(`  Parsed ${rows.length} message records`);

    // Auto-detect columns by suffix
    const headers = Object.keys(rows[0] || {});
    const cols = detectMessageColumns(headers);

    messages = rows.map(row => transformMessage(row, cols));
  } else if (existingContent) {
    messages = extractExistingSection(existingContent, 'messages') || [];
  }

  // ── Process Products CSV (optional) ──────────────────────────────────────
  if (args.products) {
    console.log(`\nProcessing products: ${args.products}`);
    const csv = fs.readFileSync(args.products, 'utf-8');
    const rows = parseCSV(csv);
    console.log(`  Parsed ${rows.length} product records`);
    products = rows.map(transformProduct);
  }

  // ── Write Output Files ───────────────────────────────────────────────────
  console.log('\nWriting output files...');

  writeGeneralFile({ user, territory, recordTypes, accounts, childAccounts, parentAccount, products, messages, lookups, plans, formularies, pharmacies });

  if (globalPlans.length > 0) {
    writeGlobalPlansFile(globalPlans);
  } else {
    console.log('  Skipping pfv.mock.globalPlans.js (no Global_Plans records found)');
  }

  console.log('\nDone! Mock data files have been updated.');
}

main();
