# VerifyTrade Multi-Module System Guide

## Overview

Your application now supports **5 independent trade modules**, each completely isolated from the others:

1. **Verify+ Passive Fire** (Orange) - Fire stopping and passive fire protection
2. **Verify+ Electrical** (Yellow) - Electrical systems and installations
3. **Verify+ HVAC** (Cyan) - Heating, ventilation, and air conditioning
4. **Verify+ Plumbing** (Blue) - Plumbing and drainage systems
5. **Verify+ Active Fire** (Red) - Sprinkler systems and active fire protection

## How Module Isolation Works

### Complete Data Isolation

Each module operates as a **completely standalone unit** with its own:

- **Projects**: Each project is tagged with a trade and only visible when that trade is selected
- **Quotes**: Quotes belong to projects, so they're automatically isolated per trade
- **Rules & Criteria**: Each module can have trade-specific rules that don't affect other trades
- **Analysis Results**: All calculations, reports, and insights are trade-specific
- **No Cross-Contamination**: Data from one trade module never appears in another

### How Switching Works

When you switch trades using the dropdown in the header:

1. The page **automatically reloads** to ensure clean state
2. Your preference is **saved** so the next time you log in, you start with your last selected trade
3. Only projects for the **selected trade** are shown
4. All subsequent operations are **scoped to that trade**

## Switching Between Trades

### From the Dashboard

1. Look for the trade selector dropdown in the header (shows current trade like "Verify+ Passive Fire")
2. Click on it to see all 5 trade options
3. Select any trade module
4. The page will reload and show only projects for that trade

### First Time Login

When you first log in or click "Main App":
- You'll see a modal with all 5 trade options
- Select the trade you want to work with
- This becomes your default trade module

## Working on Different Modules

### How to Give Instructions for Specific Modules

When giving prompts to work on features, **always specify the trade name** to avoid confusion:

#### ✅ Good Examples:

```
"Add a new validation rule for HVAC quotes that checks for duct sizing"
```

```
"In the Electrical module, create a report that shows circuit load calculations"
```

```
"For Passive Fire only, update the scope matrix to include fire-rated door seals"
```

```
"Create a pricing calculator for the Plumbing module that factors in pipe material costs"
```

#### ❌ Bad Examples (Too Vague):

```
"Add a new validation rule"
→ Which trade? This could go anywhere!
```

```
"Update the scope matrix"
→ For which module? Each has different requirements!
```

```
"Create a new report"
→ Which trade-specific data should it include?
```

### Prompt Template

Use this template when requesting changes:

```
For [TRADE NAME] module: [Your request]

Context: [Any trade-specific details]

Requirements:
- [Requirement 1]
- [Requirement 2]

This should not affect: [Other modules if relevant]
```

### Example Workflows

#### Working on Electrical Module

```
Switch to Verify+ Electrical module
↓
Create new project: "Office Building Electrical Fit-Out"
↓
Import electrical contractor quotes
↓
Define Electrical-specific rules:
  - Cable sizing compliance
  - Circuit breaker specifications
  - Earthing requirements
↓
Run analysis with Electrical criteria
```

#### Working on Passive Fire Module

```
Switch to Verify+ Passive Fire module
↓
Create new project: "Commercial Tower Fire Stopping"
↓
Import passive fire quotes
↓
Define Passive Fire-specific rules:
  - Fire rating requirements (FRL)
  - Penetration sealing specifications
  - Compartmentation compliance
↓
Run analysis with Passive Fire criteria
```

## Module-Specific Features

### Passive Fire (Current Implementation)
- Fire stopping systems
- Compartmentation
- Fire-rated penetrations
- FRL compliance checks
- Scope matrix for fire protection

### Future Module Development

When developing features for other modules, follow this checklist:

#### 1. Electrical Module Features
- Circuit calculations
- Load balancing
- Cable sizing
- Switch gear specifications
- Earthing and bonding

#### 2. HVAC Module Features
- Duct sizing calculations
- Air flow requirements
- Refrigerant specifications
- Energy efficiency ratings
- Ventilation compliance

#### 3. Plumbing Module Features
- Pipe sizing calculations
- Water pressure requirements
- Drainage capacity
- Fixture specifications
- Backflow prevention

#### 4. Active Fire Module Features
- Sprinkler spacing calculations
- Water supply requirements
- Pump specifications
- Hydraulic calculations
- AS2118 compliance

## Database Structure

### Project Table
Each project has a `trade` field that determines which module it belongs to:

```sql
projects (
  id uuid,
  name text,
  organisation_id uuid,
  trade text,  -- 'passive_fire', 'electrical', 'hvac', 'plumbing', 'active_fire'
  ...
)
```

### Automatic Filtering
All queries automatically filter by the current trade:
- When loading projects: `WHERE trade = current_trade`
- When creating projects: `INSERT ... trade = current_trade`
- All related data (quotes, items, reports) inherits isolation through project relationship

## Code Organization

### Trade Context
Located at: `src/lib/tradeContext.tsx`

Provides:
- `currentTrade` - The active trade module
- `setCurrentTrade()` - Function to switch trades
- `getTradeInfo()` - Get display information for a trade

### Trade Selector Component
Located at: `src/components/TradeSelectorDropdown.tsx`

Displays:
- Current trade with color-coded icon
- Dropdown with all 5 trade options
- Descriptions for each module

### Integration Points

When building new features, remember:

1. **Use Trade Context**: Import `useTrade()` to access current trade
2. **Filter Queries**: Always include `.eq('trade', currentTrade)` when querying projects
3. **Trade-Specific Logic**: Use switch statements or configuration objects keyed by trade
4. **UI Consistency**: Use trade colors and icons from the trade info

## Testing Each Module

### Test Checklist Per Module

For each trade module, verify:

- [ ] Can select the trade from the modal on login
- [ ] Trade selector shows correct trade in header
- [ ] Can create new project (auto-tagged with current trade)
- [ ] Only projects for current trade are visible
- [ ] Can switch to different trade (triggers reload)
- [ ] After switching, only see projects for new trade
- [ ] Data from previous trade is not visible
- [ ] Can work on multiple trades by switching between them

## Best Practices

### 1. Always Specify Trade in Prompts
Never assume which module you're working on. Always state it explicitly.

### 2. Test Module Isolation
After changes, switch between trades to ensure no cross-contamination.

### 3. Document Trade-Specific Rules
When adding rules or criteria, clearly document which trade they apply to.

### 4. Use Consistent Naming
Prefix trade-specific variables/functions with trade name:
- `electricalValidationRules`
- `hvacCalculations`
- `plumbingRequirements`

### 5. Configuration Files
Create separate config files per trade when rules are complex:
- `src/config/passiveFire.config.ts`
- `src/config/electrical.config.ts`
- `src/config/hvac.config.ts`
- etc.

## Troubleshooting

### Data Showing from Wrong Module
- Check that queries include trade filter
- Verify project has correct trade value
- Confirm trade context is being used

### Can't Create Project
- Verify a trade is selected
- Check TradeProvider is in App component tree
- Confirm currentTrade is available

### Trade Not Switching
- Browser may have cached state
- Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
- Check console for errors

## Summary

The multi-trade system ensures complete isolation between modules. By always specifying the trade name in your prompts and following the module isolation guidelines, you can safely develop features for each trade without affecting the others.

Remember: **Each trade module is a complete, standalone application that happens to share the same codebase and infrastructure.**
