import { supabase } from './supabase';

export interface UserPreferences {
  id: string;
  user_id: string;
  last_organisation_id: string | null;
  last_project_id: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Get user preferences for the current user
 */
export async function getUserPreferences(): Promise<UserPreferences | null> {
  try {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return null;
    }

    const { data, error } = await supabase
      .from('user_preferences')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[UserPreferences] Could not fetch preferences (not critical):', error.message);
      return null;
    }

    return data;
  } catch (err) {
    // Silently fail - preferences are not critical
    return null;
  }
}

/**
 * Update last accessed organisation
 */
export async function updateLastOrganisation(organisationId: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.warn('[UserPreferences] No authenticated user');
    return;
  }

  const { error } = await supabase
    .from('user_preferences')
    .upsert({
      user_id: user.id,
      last_organisation_id: organisationId,
      updated_at: new Date().toISOString()
    }, {
      onConflict: 'user_id'
    });

  if (error) {
    console.error('[UserPreferences] Error updating last organisation:', error);
  }
}

/**
 * Update last accessed project
 */
export async function updateLastProject(projectId: string, organisationId?: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.warn('[UserPreferences] No authenticated user');
    return;
  }

  const updateData: any = {
    user_id: user.id,
    last_project_id: projectId,
    updated_at: new Date().toISOString()
  };

  // Optionally update organisation at the same time
  if (organisationId) {
    updateData.last_organisation_id = organisationId;
  }

  const { error } = await supabase
    .from('user_preferences')
    .upsert(updateData, {
      onConflict: 'user_id'
    });

  if (error) {
    console.error('[UserPreferences] Error updating last project:', error);
  }
}

/**
 * Clear last accessed project (when switching organisations)
 */
export async function clearLastProject(): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    console.warn('[UserPreferences] No authenticated user');
    return;
  }

  const { error } = await supabase
    .from('user_preferences')
    .update({
      last_project_id: null,
      updated_at: new Date().toISOString()
    })
    .eq('user_id', user.id);

  if (error) {
    console.error('[UserPreferences] Error clearing last project:', error);
  }
}
