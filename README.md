# Mock Data Generator for IVA Projects

Converts CSV files exported from **Vault Toolbox** into mock data files (`pfv.mock.general.js` and `pfv.mock.globalPlans.js`) used by the IVA framework's local development environment.

## Features

- **Prefix-agnostic** — auto-detects field prefixes from CSV column headers (`nni_`, `abc_`, etc.)
- **LONGTEXT-aware** — strips `LONGTEXT()` / `RICHTEXT()` wrappers from CSV headers
- **RFC 4180 CSV parser** — handles quoted fields with embedded commas, newlines, and escaped quotes
- **Splits data by table type** — lookups, plans, formularies, pharmacies, global plans, and messages
- **Preserves existing mock scaffolding** — user, territory, account, and product data from previous mock files are retained
- **Auto-updates mock config** — syncs `accountId` and `accountExternalId` in `aq.config.datasvc.mock.js` from message data

## VQL Queries

Export these two queries from Vault Toolbox as CSVs. Replace `nni_` / `nni_pfv_` with your project's prefix.

**Lookups** — export ALL table types (the script splits them automatically):
```sql
SELECT id, nni_code_id__c, LONGTEXT(nni_code_label__c), nni_code_order__c, nni_table_type__c
FROM nni_pfv_message_lookup__c
```

**Messages** — filter by HCP ID:
```sql
SELECT id, nni_account_id__c,
  LONGTEXT(nni_approved_email_custom1__c),
  LONGTEXT(nni_approved_email_custom2__c),
  LONGTEXT(nni_approved_email_custom3__c),
  LONGTEXT(nni_approved_email_custom4__c),
  LONGTEXT(nni_approved_email_custom5__c),
  LONGTEXT(nni_approved_email_mainmessage__c),
  LONGTEXT(nni_approved_email_messageplans__c),
  nni_asset_type__c,
  LONGTEXT(nni_message_footnote__c),
  nni_geography_name__c,
  LONGTEXT(nni_message_attributes__c),
  nni_message_category__c,
  nni_message_code__c,
  LONGTEXT(nni_message_plan_formulary__c),
  nni_message_rank__c,
  nni_hcp_id__c,
  nni_prescriber_ims__c,
  nni_prescriber_npi__c,
  nni_primary_product_percentage__c,
  nni_product_id__c,
  nni_primary_product_name__c,
  nni_copay_amount__c
FROM nni_pfv_prescribermessage__c
WHERE nni_hcp_id__c = '264552'
```

> **Critical:** `LONGTEXT()` is required for Long Text fields. Without it, VQL truncates to 250 chars.

## Quick Start (One-Liner)

From the **IVA project directory** (the folder containing `MockData/`):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Aditya-Samdiwal-AQ/mock-data-generator/main/generate-mock.sh)
```

Or with explicit paths:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Aditya-Samdiwal-AQ/mock-data-generator/main/generate-mock.sh) \
  --lookups /path/to/lookups.csv \
  --messages /path/to/messages.csv
```

The bootstrap script will:

- Download csv-to-mock.mjs to a temp directory
- Auto-detect CSV files in `~/Downloads` matching `*lookup*` and `*message*` patterns
- Auto-detect the `MockData/` folder
- Split lookups by table type into plans, formularies, global plans, pharmacies, and non-plan lookups
- Auto-update `accountId`/`accountExternalId` in `aq.config.datasvc.mock.js`
- Run the converter and clean up on exit

## Running the App

```bash
cd IVA && npx http-server -p 8080
```
Then open `http://localhost:8080/Wegovy/`

> **Note:** Avoid VS Code Live Server for email testing — it injects a WebSocket script that corrupts email template Kendo fragments.
