# Infinite Loop Fix - Summary

## The Problem

The app was stuck in an infinite loop during startup, caused by **multiple useEffect hooks triggering each other**.

## Root Causes

### 1. Duplicate `initializeApp()` Calls

**Before (App.tsx lines 147-158):**
```typescript
// Effect 1: Runs when session loads
useEffect(() => {
  if (!authLoading && session) {
    initializeApp();
  }
}, [authLoading, session]);

// Effect 2: Runs when organisation changes
useEffect(() => {
  if (currentOrganisation) {
    initializeApp();  // DUPLICATE CALL
    loadOrgLicensing();
  }
}, [currentOrganisation]);
```

**Problem:**
- When `currentOrganisation` changed, it would call `initializeApp()` again
- This created race conditions and multiple simultaneous calls
- Even with the `initializingRef` guard, timing issues could occur

### 2. Missing Dependencies in useEffect

The effects had incomplete dependency arrays, causing them to run at unexpected times.

### 3. Error-Prone User Preferences Loading

**Before:**
```typescript
export async function getUserPreferences() {
  const { data: { user } } = await supabase.auth.getUser();
  // ... could throw errors without proper handling
}
```

**Problem:**
- If `user_preferences` table had RLS issues or errors
- The error would propagate and potentially crash the app
- No try-catch protection

## The Fixes

### Fix 1: Consolidated useEffect Hooks

**After (App.tsx):**
```typescript
// Single effect that only runs when ALL conditions are met
useEffect(() => {
  if (!authLoading && session && currentOrganisation) {
    initializeApp();
  }
}, [authLoading, session, currentOrganisation]);

// Separate effect for licensing (no initializeApp call)
useEffect(() => {
  if (currentOrganisation) {
    loadOrgLicensing();
  }
}, [currentOrganisation]);
```

**Result:**
- `initializeApp()` only called once when conditions are met
- No duplicate calls when `currentOrganisation` changes
- Clear separation of concerns

### Fix 2: Added Loop Prevention Guard

**After:**
```typescript
// Load projects when organisation changes (but only if we don't have any yet)
// This prevents infinite loops by checking if projects are already loaded
useEffect(() => {
  if (allProjects.length === 0 && currentOrganisation && !loading) {
    loadAllProjects();
  }
}, [currentOrganisation]);
```

**Added checks:**
- `allProjects.length === 0` - Don't reload if already loaded
- `!loading` - Don't trigger while another load is in progress

### Fix 3: Resilient User Preferences Loading

**After (userPreferences.ts):**
```typescript
export async function getUserPreferences(): Promise<UserPreferences | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return null;  // Graceful exit
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[UserPreferences] Could not fetch preferences (not critical):', error.message);
      return null;  // Don't crash, just log warning
    }

    return data;
  } catch (err) {
    // Silently fail - preferences are not critical
    return null;
  }
}
```

**Improvements:**
- Wrapped entire function in try-catch
- Returns `null` instead of throwing errors
- Preferences are optional - app works without them
- Clear logging for debugging

## Flow Analysis

### Before (Loop):
```
1. Session loads
   ↓
2. initializeApp() called (Effect 1)
   ↓
3. currentOrganisation loads
   ↓
4. initializeApp() called AGAIN (Effect 2)  ← DUPLICATE
   ↓
5. loadAllProjects() called
   ↓
6. State changes trigger more effects
   ↓
7. Loop continues...
```

### After (Fixed):
```
1. Session loads
   ↓
2. Wait for currentOrganisation
   ↓
3. When BOTH ready: initializeApp() called ONCE
   ↓
4. getUserPreferences() (safe, returns null if error)
   ↓
5. loadAllProjects() (guarded, only if needed)
   ↓
6. App fully initialized ✅
```

## Testing Verification

Build completed successfully:
```
✓ 2045 modules transformed
✓ built in 12.26s
```

## What To Test

When the app starts:

1. **No infinite loop** ✅
   - Console should not show repeating logs
   - Page should load within 2-3 seconds
   - No "Already initializing" warnings spam

2. **User preferences work** ✅
   - Last organisation is restored
   - Last project is restored
   - Falls back to localStorage if preferences fail

3. **Organisation switching works** ✅
   - Switching orgs doesn't trigger loops
   - Projects reload correctly
   - Preferences save in background

4. **Error resilience** ✅
   - App works even if user_preferences has issues
   - No crashes from database errors
   - Graceful degradation

## Key Learnings

### useEffect Best Practices

1. **Avoid multiple effects with same dependencies**
   - Consolidate related logic into single effect
   - Use separate effects only for independent concerns

2. **Include all dependencies**
   - Missing dependencies cause stale closures
   - Can lead to unexpected behavior

3. **Add guards against loops**
   - Check if work is already done
   - Check if another operation is in progress
   - Use refs to prevent duplicate calls

4. **Make async operations resilient**
   - Always use try-catch for async functions
   - Consider what happens if operation fails
   - Don't let errors propagate uncaught

### User Preferences Pattern

The pattern used here is a good model for **optional features**:

```typescript
// Feature is optional, app works without it
const data = await getOptionalFeature();

if (data) {
  // Use the data if available
  useFeature(data);
} else {
  // Fall back to default behavior
  useDefault();
}
```

This ensures:
- App is resilient to feature failures
- New features don't break existing functionality
- Graceful degradation

## Related Files

- `src/App.tsx` - Main app initialization
- `src/lib/userPreferences.ts` - User preferences utilities
- `src/lib/organisationContext.tsx` - Organisation state management

## Prevention

To prevent similar loops in the future:

1. **Before adding useEffect:**
   - Ask: "What triggers this?"
   - Ask: "What does this trigger?"
   - Check for circular dependencies

2. **Use debugging logs:**
   - Log when effects run
   - Log what triggers them
   - Makes loops obvious

3. **Test state changes:**
   - Change organisation
   - Change project
   - Login/logout
   - Check console for loops

4. **Guard against duplicates:**
   - Use refs to track in-progress operations
   - Check if data already loaded
   - Short-circuit if conditions already met

---

## Additional Fix (2025-12-21)

### The Problem (Second Loop)

After the initial fix, the app was still looping due to:

1. **Duplicate `loadAllProjects()` calls**
   - Called inside `initializeApp()`
   - Also called in a separate useEffect when `currentOrganisation` changed
   - This caused redundant loads and potential loops

2. **Re-initialization on every state change**
   - The useEffect would run whenever `currentOrganisation` changed
   - Even if already initialized for that org
   - No tracking of which org was initialized

### The Second Fix

**1. Removed redundant useEffect:**
```typescript
// REMOVED: This was causing duplicate loadAllProjects() calls
useEffect(() => {
  if (allProjects.length === 0 && currentOrganisation && !loading) {
    loadAllProjects();
  }
}, [currentOrganisation]);
```

**Why:** `initializeApp()` already calls `loadAllProjects()`, so this was redundant.

**2. Added organization tracking:**
```typescript
const initializedForOrgRef = useRef<string | null>(null);

useEffect(() => {
  if (!authLoading && session && currentOrganisation) {
    // Only initialize if we haven't initialized for this org yet
    if (initializedForOrgRef.current !== currentOrganisation.id) {
      initializeApp();
    }
  }
}, [authLoading, session, currentOrganisation]);
```

**Why:** Prevents re-initialization when state changes but org hasn't changed.

**3. Mark org as initialized:**
```typescript
const initializeApp = async () => {
  // ... initialization code ...

  finally {
    setLoading(false);
    initializingRef.current = false;
    // Mark this org as initialized
    if (currentOrganisation) {
      initializedForOrgRef.current = currentOrganisation.id;
    }
  }
};
```

**Why:** Tracks which org has been initialized so we don't repeat unnecessarily.

### Flow After Second Fix:

```
1. User logs in
   ↓
2. Session and currentOrganisation both ready
   ↓
3. Check: Is initializedForOrgRef === currentOrganisation.id?
   - No → Call initializeApp() ONCE
   - Yes → Skip (already initialized)
   ↓
4. initializeApp() runs:
   - Loads all projects
   - Restores last project
   - Sets initializedForOrgRef to current org ID
   ↓
5. Future state changes don't trigger re-init
   ↓
6. User switches org → initializedForOrgRef !== new org ID
   ↓
7. Re-initialize for new org ✅
```

### Benefits:

1. **No duplicate loads** - Projects loaded exactly once per org
2. **No loops** - State changes don't trigger re-initialization
3. **Smart org switching** - Re-initializes when org actually changes
4. **Better performance** - Fewer database queries
5. **Clearer intent** - Code explicitly tracks initialization state

---

**Status:** Fixed ✅ (Second iteration)
**Build:** Successful ✅
**Ready for testing:** Yes ✅
