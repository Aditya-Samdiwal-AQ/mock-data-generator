#!/usr/bin/env bash
# ============================================================================
# Mock Data Generator — Bootstrap Script
# ============================================================================
# Downloads csv-to-mock.mjs from GitHub and generates mock data files.
#
# Zero-config usage (auto-detects CSVs in ~/Downloads):
#   bash <(curl -fsSL https://raw.githubusercontent.com/Aditya-Samdiwal-AQ/mock-data-generator/main/generate-mock.sh)
#
# With explicit paths:
#   bash <(curl -fsSL https://raw.githubusercontent.com/Aditya-Samdiwal-AQ/mock-data-generator/main/generate-mock.sh) \
#     --lookups <lookups.csv> --messages <messages.csv>
#
# Auto-detects:
#   - CSV files in ~/Downloads matching *lookup* and *message* patterns
#   - MockData/ directory from current working directory
#   - Field prefixes from CSV column headers (nni_, abc_, xyz_, etc.)
# ============================================================================

set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/Aditya-Samdiwal-AQ/mock-data-generator/main"
TMP_SCRIPT="/tmp/csv-to-mock-$$.mjs"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# ── Auto-detect CSV in ~/Downloads ───────────────────────────────────────────
# Finds the most recently modified CSV matching a pattern in ~/Downloads.
find_csv() {
  local pattern="$1"
  local label="$2"
  # Find matching CSVs sorted by modification time (newest first)
  local found
  found=$(find ~/Downloads -maxdepth 1 -iname "*${pattern}*.csv" -type f -print0 2>/dev/null \
    | xargs -0 ls -t 2>/dev/null | head -1)
  if [[ -n "$found" ]]; then
    echo "$found"
  else
    echo ""
  fi
}

# ── Detect MockData directory ────────────────────────────────────────────────
detect_mock_dir() {
  if [[ -d "./MockData" ]]; then
    echo "./MockData"
  elif [[ -d "./IVA/MockData" ]]; then
    echo "./IVA/MockData"
  else
    local found
    found=$(find . -maxdepth 3 -type d -name "MockData" -path "*/IVA/*" 2>/dev/null | head -1)
    if [[ -n "$found" ]]; then
      echo "$found"
    else
      echo ""
    fi
  fi
}

# ── Check Node.js ────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null; then
  error "Node.js is required. Install v18+ from https://nodejs.org"
  exit 1
fi

# ── Download converter ───────────────────────────────────────────────────────
info "Downloading csv-to-mock.mjs..."
if ! curl -fsSL -o "$TMP_SCRIPT" "$REPO_RAW/csv-to-mock.mjs"; then
  error "Failed to download from $REPO_RAW/csv-to-mock.mjs"
  exit 1
fi

# ── Cleanup on exit ──────────────────────────────────────────────────────────
cleanup() { rm -f "$TMP_SCRIPT"; }
trap cleanup EXIT

# ── Parse args & auto-detect missing ones ────────────────────────────────────
PASS_ARGS=()
HAS_LOOKUPS=false
HAS_MESSAGES=false
HAS_OUTPUT_DIR=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --lookups)    HAS_LOOKUPS=true;    PASS_ARGS+=("$1" "$2"); shift 2 ;;
    --messages)   HAS_MESSAGES=true;   PASS_ARGS+=("$1" "$2"); shift 2 ;;
    --output-dir) HAS_OUTPUT_DIR=true; PASS_ARGS+=("$1" "$2"); shift 2 ;;
    *)            PASS_ARGS+=("$1"); shift ;;
  esac
done

# Auto-detect lookups CSV
if [[ "$HAS_LOOKUPS" == false ]]; then
  LOOKUPS_CSV=$(find_csv "lookup" "lookups")
  if [[ -z "$LOOKUPS_CSV" ]]; then
    error "No lookups CSV found in ~/Downloads."
    error "Either place a CSV with 'lookup' in the name in ~/Downloads, or pass --lookups <path>."
    exit 1
  fi
  info "Auto-detected lookups: $LOOKUPS_CSV"
  PASS_ARGS+=("--lookups" "$LOOKUPS_CSV")
fi

# Auto-detect messages CSV
if [[ "$HAS_MESSAGES" == false ]]; then
  MESSAGES_CSV=$(find_csv "message" "messages")
  if [[ -z "$MESSAGES_CSV" ]]; then
    error "No messages CSV found in ~/Downloads."
    error "Either place a CSV with 'message' in the name in ~/Downloads, or pass --messages <path>."
    exit 1
  fi
  info "Auto-detected messages: $MESSAGES_CSV"
  PASS_ARGS+=("--messages" "$MESSAGES_CSV")
fi

# Auto-detect output directory
if [[ "$HAS_OUTPUT_DIR" == false ]]; then
  OUTPUT_DIR=$(detect_mock_dir)
  if [[ -z "$OUTPUT_DIR" ]]; then
    error "Could not find MockData/ directory."
    error "Run this from the IVA/ project directory, or pass --output-dir <path>."
    exit 1
  fi
  info "Auto-detected MockData: $OUTPUT_DIR"
  PASS_ARGS+=("--output-dir" "$OUTPUT_DIR")
fi

# ── Run ──────────────────────────────────────────────────────────────────────
echo ""
node "$TMP_SCRIPT" "${PASS_ARGS[@]}"

echo ""
info "Done! Run 'cd IVA && npx http-server -p 8080' then open http://localhost:8080/Wegovy/"
info "Note: Avoid VS Code Live Server for email testing — it injects scripts that break email template fragments."
