# Mock Data Generator for IVA Projects

Converts CSV files exported from **Vault Toolbox** into mock data files (`pfv.mock.general.js` and `pfv.mock.globalPlans.js`) used by the IVA framework's local development environment.

## Features

- **Prefix-agnostic** — auto-detects field prefixes from CSV column headers (`nni_`, `abc_`, etc.)
- **LONGTEXT-aware** — strips `LONGTEXT()` / `RICHTEXT()` wrappers from CSV headers
- **RFC 4180 CSV parser** — handles quoted fields with embedded commas, newlines, and escaped quotes
- **Splits data by table type** — lookups, plans, formularies, pharmacies, global plans, and messages
- **Preserves existing mock scaffolding** — user, territory, account, and product data from previous mock files are retained

## Quick Start (One-Liner)

From the **IVA project directory** (the folder containing `MockData/`):

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Aditya-Samdiwal-AQ/mock-data-generator/main/generate-mock.sh) \
  --lookups /path/to/lookups.csv \
  --messages /path/to/messages.csv
```

The bootstrap script will:

Download csv-to-mock.mjs to a temp directory
Auto-detect the MockData/ folder
Run the converter
Clean up the temp file on exit
