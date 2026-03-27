#!/usr/bin/env bash
# ============================================================================
# Mock Data Generator — Bootstrap Script
# ============================================================================
# Downloads csv-to-mock.mjs from GitHub and generates mock data files.
# Run via one-liner from the IVA/ directory of any project:
#
#   bash <(curl -fsSL https://raw.githubusercontent.com/Aditya-Samdiwal-AQ/mock-data-generator/main/generate-mock.sh) \
#     --lookups <lookups.csv> --messages <messages.csv>
#
# The script auto-detects field prefixes from CSV headers, so it works
# with any Vault project (nni_, abc_, xyz_, etc.).
# ============================================================================

set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/Aditya-Samdiwal-AQ/mock-data-generator/main"
TMP_SCRIPT="/tmp/csv-to-mock-$$.mjs"

RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1" >&2; }

# ── Detect MockData directory ────────────────────────────────────────────────
detect_mock_dir() {
  if [[ -d "./MockData" ]]; then
    echo "./MockData"
  elif [[ -d "./IVA/MockData" ]]; then
    echo "./IVA/MockData"
  else
    # Search one level deep: */IVA/MockData
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

# ── Detect output directory if not specified in args ─────────────────────────
OUTPUT_DIR=""
PASS_ARGS=()
HAS_OUTPUT_DIR=false

for arg in "$@"; do
  if [[ "$arg" == "--output-dir" ]]; then
    HAS_OUTPUT_DIR=true
  fi
  PASS_ARGS+=("$arg")
done

if [[ "$HAS_OUTPUT_DIR" == false ]]; then
  OUTPUT_DIR=$(detect_mock_dir)
  if [[ -z "$OUTPUT_DIR" ]]; then
    error "Could not find MockData/ directory."
    error "Run this from the IVA/ project directory, or pass --output-dir <path>."
    exit 1
  fi
  info "Found MockData at: $OUTPUT_DIR"
  PASS_ARGS+=("--output-dir" "$OUTPUT_DIR")
fi

# ── Run ──────────────────────────────────────────────────────────────────────
node "$TMP_SCRIPT" "${PASS_ARGS[@]}"

echo ""
info "Done! Start the server and open the app:"
info "  python3 -m http.server 8080"
info "  open http://localhost:8080/Wegovy/index.html"
