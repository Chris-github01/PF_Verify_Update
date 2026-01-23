# Quick Start: Multi-Trade System

## What Changed?

Your app now supports **5 independent trade modules** instead of just Passive Fire:

- 🔥 **Verify+ Passive Fire** (Orange)
- ⚡ **Verify+ Electrical** (Yellow)
- 💨 **Verify+ HVAC** (Cyan)
- 💧 **Verify+ Plumbing** (Blue)
- 🛡️ **Verify+ Active Fire** (Red)

## How to Use It

### 1. Selecting Your Trade Module

**On First Login:**
- Click "Main App"
- You'll see a modal with all 5 trade options
- Click on the trade you want to work with
- The app loads with that trade active

**Switching Trades:**
- Look for the dropdown in the header (e.g., "Verify+ Passive Fire")
- Click it to see all 5 options
- Select a different trade
- Page reloads with the new trade

### 2. Working with Projects

**Each trade has its own projects:**
- When you create a project, it's automatically tagged with your current trade
- Only projects for the selected trade are shown
- Switch trades to see different projects

**Example Flow:**
```
1. Select "Verify+ Electrical"
2. Create project "Office Electrical Fit-Out"
3. Import electrical quotes
4. Work on analysis

Switch to "Verify+ HVAC"
5. Create project "Office HVAC System"
6. Import HVAC quotes
7. Work on analysis

Neither project sees the other's data!
```

### 3. Data Isolation (IMPORTANT!)

✅ **What's Isolated:**
- Projects are separate per trade
- Quotes are separate per trade
- All analysis results are separate
- Reports are separate
- Everything is completely isolated

❌ **What's Shared:**
- Your organization
- Your user account
- Your team members
- System settings

## Giving Instructions for Development

### The Golden Rule

**ALWAYS specify which trade module you're working on in your prompts!**

### ✅ Correct Way to Give Instructions

```
"For the HVAC module, add a duct sizing calculator"
```

```
"In Verify+ Electrical, create a circuit load report"
```

```
"Update the Passive Fire scope matrix to include door seals"
```

```
"Add cable sizing validation to the Electrical module only"
```

### ❌ Wrong Way (Don't Do This!)

```
"Add a new calculator"
→ For which trade? This is unclear!
```

```
"Update the scope matrix"
→ Which module's scope matrix?
```

```
"Add new validation rules"
→ For which trade? Each has different rules!
```

## Prompt Template

Copy and use this template:

```
Module: [TRADE NAME]
Task: [What you want to do]
Details: [Any specifics]
Note: [Should not affect other modules]
```

**Example:**

```
Module: HVAC
Task: Add air flow calculation feature
Details:
- Calculate CFM based on room size
- Include temperature delta
- Show in dashboard
Note: This should only apply to HVAC projects
```

## How the System Works

### Behind the Scenes

1. **Trade Context**: Tracks which module you're currently in
2. **Automatic Filtering**: All database queries automatically filter by current trade
3. **Project Tagging**: Every project is tagged with its trade
4. **Isolated Workflows**: Each module has its own complete workflow

### File Structure

```
src/
  lib/
    tradeContext.tsx          ← Manages current trade
  components/
    TradeSelectorDropdown.tsx ← Trade switching UI
    TradeSelectionModal.tsx   ← Initial trade selection
  [All other components work with trade context]
```

## Testing Your Changes

After making changes to a specific trade module:

1. ✅ Build the project (`npm run build`)
2. ✅ Switch to that trade module
3. ✅ Test the feature works
4. ✅ Switch to a different trade module
5. ✅ Verify the feature doesn't appear there
6. ✅ Switch back and verify feature still works

## Common Scenarios

### Scenario 1: Adding a New Calculation

**Prompt:**
```
Module: Electrical
Add a voltage drop calculator that:
- Takes cable length and size
- Calculates voltage drop
- Shows warning if exceeds 5%
- Only available in Electrical module
```

### Scenario 2: Custom Report

**Prompt:**
```
Module: Plumbing
Create a water pressure report that:
- Lists all fixtures
- Shows pressure requirements
- Flags any issues
- Only for Plumbing projects
```

### Scenario 3: Validation Rule

**Prompt:**
```
Module: HVAC
Add validation that checks:
- Duct sizing is within standards
- Air flow meets minimum requirements
- Should only validate HVAC quotes
```

## Troubleshooting

**Problem**: Can't see my projects
- **Solution**: Check you're in the right trade module (use dropdown to switch)

**Problem**: Feature showing in wrong module
- **Solution**: The feature needs trade-specific filtering. Ask to "Add trade isolation to [feature name]"

**Problem**: Trade not switching
- **Solution**: Hard refresh browser (Ctrl+Shift+R or Cmd+Shift+R)

## Key Benefits

✨ **Complete Isolation**: Work on one trade without affecting others
✨ **Trade-Specific Rules**: Each module can have its own validation and calculations
✨ **Easy Switching**: One click to switch between trades
✨ **Data Safety**: No risk of cross-contamination between trades
✨ **Scalable**: Easy to add new features per trade

## Next Steps

1. **Read**: Full guide in `TRADE_MODULE_GUIDE.md`
2. **Explore**: Try switching between different trades
3. **Create**: Make a test project in each trade module
4. **Develop**: Start adding trade-specific features

---

## Quick Reference Card

| Action | How To Do It |
|--------|-------------|
| Switch Trade | Click dropdown in header |
| Create Project | Automatically tagged with current trade |
| Give Instructions | Always specify module name in prompt |
| View Different Trade | Use dropdown to switch, page reloads |
| Test Isolation | Create projects in multiple trades |

---

**Remember**: Each trade module is a complete, standalone application. Always specify which one you're working on when giving instructions!
