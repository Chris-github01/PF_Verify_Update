import { supabase } from './supabase';

export type ActivityType =
  | 'project_created'
  | 'quote_imported'
  | 'report_generated'
  | 'user_invited'
  | 'invitation_accepted'
  | 'user_archived'
  | 'project_deleted'
  | 'quote_deleted';

interface LogActivityParams {
  organisationId: string;
  userId: string;
  activityType: ActivityType;
  projectId?: string;
  metadata?: Record<string, any>;
}

export async function logActivity({
  organisationId,
  userId,
  activityType,
  projectId,
  metadata = {}
}: LogActivityParams): Promise<void> {
  try {
    const { error } = await supabase
      .from('user_activity_log')
      .insert({
        organisation_id: organisationId,
        user_id: userId,
        activity_type: activityType,
        project_id: projectId || null,
        metadata
      });

    if (error) {
      console.error('Error logging activity:', error);
    }
  } catch (error) {
    console.error('Error logging activity:', error);
  }
}
