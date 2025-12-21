# Contract Manager Print Engine - Quick Reference

## 🔄 Rollback Commands

### To Restore Original Implementation
```bash
bash rollback-contract-manager.sh
```
Restores the original 900-line generators with inline parsing.

### To Re-Apply Unified Engine
```bash
bash apply-contract-manager.sh
```
Restores the new unified print engine implementation.

## 📁 What's Backed Up

### Backup Files (Safe to Delete After Testing)
- `supabase/functions/export_contract_manager/generators.ts.backup` (original)
- `supabase/functions/export_contract_manager/index.ts.backup` (original)
- `supabase/functions/export_contract_manager/generators.ts.new_TIMESTAMP` (created during rollback)
- `supabase/functions/export_contract_manager/index.ts.new_TIMESTAMP` (created during rollback)

## 🎯 What Changed

### Files Modified
1. `supabase/functions/export_contract_manager/generators.ts`
   - **Before:** 900 lines with inline parsing
   - **After:** 130 lines calling unified engine

2. `supabase/functions/export_contract_manager/index.ts`
   - **Before:** Direct data fetching + generation
   - **After:** Same (no changes to edge function interface)

### Files Created
1. `src/lib/reports/contractPrintEngine.ts` (1000+ lines)
2. `rollback-contract-manager.sh`
3. `apply-contract-manager.sh`
4. `CONTRACT_MANAGER_PRINT_ENGINE.md`
5. `UNIFIED_PRINT_ENGINE_IMPLEMENTATION.md`
6. `ROLLBACK_QUICK_REFERENCE.md` (this file)

## ✅ Build Status

```bash
npm run build
# ✓ built in 13.36s
```

Build succeeds with new implementation.

## 🧪 Testing Checklist

Quick validation before deploying:

### Generate PDFs
1. Site Team Pack (junior_pack mode)
2. Senior Management Pack (senior_report mode)
3. Pre-let Appendix (prelet_appendix mode)

### Visual Inspection
- [ ] No blank pages
- [ ] Tables show: Description | Service | Type | Material | Qty | Unit
- [ ] No "—" should appear where data exists
- [ ] Headers/footers don't overlap
- [ ] Tables paginate cleanly

### Rollback Test
```bash
bash rollback-contract-manager.sh  # Should work
bash apply-contract-manager.sh     # Should work
```

## 📞 Quick Troubleshooting

| Issue | Solution |
|-------|----------|
| Blank pages | Check validation output in console |
| Data not parsed | Verify `details` array format in input |
| Build fails | Run `npm run build` and check errors |
| Rollback fails | Check backup files exist |
| Re-apply fails | Ensure rollback was run first |

## 📚 Full Documentation

- **Architecture & Usage:** `CONTRACT_MANAGER_PRINT_ENGINE.md`
- **Implementation Details:** `UNIFIED_PRINT_ENGINE_IMPLEMENTATION.md`
- **This Quick Reference:** `ROLLBACK_QUICK_REFERENCE.md`

## 💡 Key Improvements

1. **No Blank Pages** - Fixed CSS pagination rules
2. **Data Normalized** - Parsing happens before rendering
3. **Single Source** - All 3 packs use same engine
4. **Validated Output** - Automatic checks for empty pages/unparsed data
5. **Safe Rollback** - One command to restore original
6. **✨ NEW: Flexible Parser** - Handles ANY attribute combination (Material optional!)
7. **✨ NEW: Smart Edge Function** - Detects pre-formatted vs plain descriptions

## 🚀 Ready to Use

The unified print engine is active and ready for testing. Build succeeds. Rollback available if needed.

---

**If you're happy with the changes:** Delete backup files after successful deployment

**If you're not happy:** Run `bash rollback-contract-manager.sh` immediately
