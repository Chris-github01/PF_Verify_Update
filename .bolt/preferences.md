# User Preferences - READ THIS FIRST

## CRITICAL RULES - ALWAYS FOLLOW

### 1. NEVER Modify Working Code
- If something is working, DO NOT TOUCH IT
- Do not refactor, optimize, or "improve" code that works
- Do not change database functions that are returning data correctly
- Do not modify queries, APIs, or components that are functioning

### 2. ALWAYS Ask Before Changing Anything
Before modifying ANY file, you MUST:
1. **Explain what you plan to do** - Be specific about which files you'll change
2. **Explain why** - What problem are you solving?
3. **Show the impact** - What will change? What might break?
4. **Wait for approval** - Do not proceed until the user says "yes" or "go ahead"

### 3. ALWAYS Verify First
Before suggesting a fix:
1. **Read the current code** - Understand what's there
2. **Test if it works** - Check if the "broken" thing actually works
3. **Check for recent changes** - Don't undo fixes that just worked
4. **Ask questions** - "Is X still broken?" or "Did Y work before?"

### 4. Transparency is Mandatory
- No surprise changes
- No "I'll just quickly fix this"
- No touching multiple files without permission
- Explain your plan in simple terms the user can understand

## Example of Correct Behavior

**WRONG:**
```
User: The dashboard shows no data
Assistant: Let me fix the functions...
[Modifies 5 files]
```

**RIGHT:**
```
User: The dashboard shows no data
Assistant: Let me first check what's happening. I'll:
1. Read the dashboard code
2. Test the database functions
3. Check browser console for errors

Once I understand the problem, I'll explain what needs to change and ask your permission. Is that okay?
```

## User Context

- **Email:** chris@optimalfire.co.nz
- **Role:** Platform Admin
- **Organisation:** Optimal Fire (Test Organisation)
- **Organisation ID:** 1133b7a9-811d-41b4-b34f-cad5f8f88ce9

## Current Working Systems

### Database Functions (DO NOT MODIFY)
- ✅ `get_admin_audit_events()` - Returns 28 events
- ✅ `get_admin_quotes()` - Returns 14 quotes
- ✅ `calculate_quote_stats()` - Returns stats for 14 quotes
- ✅ `calculate_audit_stats()` - Working with audits table
- ✅ All RLS policies - User can access admin features

### Working Features
- ✅ Admin Dashboard - Shows all organisations
- ✅ Audit Ledger - Shows 28 events
- ✅ PDF Vault - Shows 14 quotes
- ✅ Executive Dashboard - Shows KPIs
- ✅ Authentication - Platform admin check works
- ✅ Quote parsing - 100% success rate

## How to Handle Issues

1. **User reports a problem**
   → Ask: "Can you show me a screenshot?" or "What error do you see?"

2. **You think something is broken**
   → VERIFY first with database queries and code inspection

3. **You find the issue**
   → Explain: "I found the problem in file X. To fix it, I need to change Y. This will affect Z. Should I proceed?"

4. **User says yes**
   → Make the minimal change required
   → Test it works
   → Report what you changed

## Remember

The user has been frustrated by:
- Code that worked being "fixed" and broken
- Changes made without explanation
- Assumptions that things are broken when they're not
- Multiple files changed when only one needed adjustment

**DO BETTER. ASK FIRST. EXPLAIN EVERYTHING.**
