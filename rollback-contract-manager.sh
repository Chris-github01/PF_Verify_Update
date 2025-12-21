#!/bin/bash

###############################################################################
# CONTRACT MANAGER PDF ROLLBACK SCRIPT
#
# This script restores the original Contract Manager PDF generators
# before the unified print engine migration.
#
# Usage: bash rollback-contract-manager.sh
###############################################################################

set -e

BACKUP_DIR="supabase/functions/export_contract_manager"
ENGINE_FILE="src/lib/reports/contractPrintEngine.ts"

echo "=========================================="
echo "Contract Manager PDF Rollback"
echo "=========================================="
echo ""

if [ ! -f "${BACKUP_DIR}/generators.ts.backup" ]; then
    echo "❌ ERROR: Backup file not found: ${BACKUP_DIR}/generators.ts.backup"
    echo "Cannot rollback - backup does not exist."
    exit 1
fi

if [ ! -f "${BACKUP_DIR}/index.ts.backup" ]; then
    echo "❌ ERROR: Backup file not found: ${BACKUP_DIR}/index.ts.backup"
    echo "Cannot rollback - backup does not exist."
    exit 1
fi

echo "📋 Found backup files:"
echo "  ✓ ${BACKUP_DIR}/generators.ts.backup"
echo "  ✓ ${BACKUP_DIR}/index.ts.backup"
echo ""

read -p "⚠️  This will restore the original files. Continue? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Rollback cancelled."
    exit 0
fi

echo ""
echo "📦 Creating safety backup of current files..."
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
cp "${BACKUP_DIR}/generators.ts" "${BACKUP_DIR}/generators.ts.new_${TIMESTAMP}" 2>/dev/null || true
cp "${BACKUP_DIR}/index.ts" "${BACKUP_DIR}/index.ts.new_${TIMESTAMP}" 2>/dev/null || true

echo "♻️  Restoring original files..."
cp "${BACKUP_DIR}/generators.ts.backup" "${BACKUP_DIR}/generators.ts"
cp "${BACKUP_DIR}/index.ts.backup" "${BACKUP_DIR}/index.ts"

echo ""
echo "✅ Rollback complete!"
echo ""
echo "Restored files:"
echo "  ✓ ${BACKUP_DIR}/generators.ts (restored from backup)"
echo "  ✓ ${BACKUP_DIR}/index.ts (restored from backup)"
echo ""
echo "📝 Note: The new unified print engine file remains at:"
echo "  ${ENGINE_FILE}"
echo ""
echo "🔄 To switch back to the new system later, run:"
echo "  bash apply-contract-manager.sh"
echo ""
echo "=========================================="
