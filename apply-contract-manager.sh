#!/bin/bash

###############################################################################
# CONTRACT MANAGER PDF RE-APPLY SCRIPT
#
# This script re-applies the unified print engine migration
# (opposite of rollback-contract-manager.sh)
#
# Usage: bash apply-contract-manager.sh
###############################################################################

set -e

BACKUP_DIR="supabase/functions/export_contract_manager"

echo "=========================================="
echo "Contract Manager PDF Re-Apply"
echo "=========================================="
echo ""

LATEST_NEW=$(ls -t ${BACKUP_DIR}/generators.ts.new_* 2>/dev/null | head -1)

if [ -z "$LATEST_NEW" ]; then
    echo "❌ ERROR: No saved 'new' version found."
    echo "The rollback script should have created generators.ts.new_TIMESTAMP"
    echo "Cannot re-apply without saved version."
    exit 1
fi

echo "📋 Found saved new version:"
echo "  ✓ ${LATEST_NEW}"
echo ""

read -p "⚠️  This will restore the unified print engine. Continue? (y/N): " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Re-apply cancelled."
    exit 0
fi

echo ""
echo "♻️  Restoring unified print engine..."
cp "$LATEST_NEW" "${BACKUP_DIR}/generators.ts"

LATEST_INDEX=$(echo "$LATEST_NEW" | sed 's/generators\.ts/index.ts/')
if [ -f "$LATEST_INDEX" ]; then
    cp "$LATEST_INDEX" "${BACKUP_DIR}/index.ts"
    echo "  ✓ ${BACKUP_DIR}/index.ts"
fi

echo "  ✓ ${BACKUP_DIR}/generators.ts"
echo ""
echo "✅ Re-apply complete!"
echo ""
echo "The unified print engine is now active again."
echo ""
echo "🔄 To rollback again, run:"
echo "  bash rollback-contract-manager.sh"
echo ""
echo "=========================================="
