import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface CreateUserRequest {
  email: string;
  full_name: string;
  organisation_id: string;
  role: 'owner' | 'admin' | 'member';
  make_owner?: boolean;
  password?: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    // Verify the calling user is a platform admin
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error('Unauthorized');
    }

    // Check if user is a platform admin
    const { data: adminCheck, error: adminError } = await supabase
      .from('platform_admins')
      .select('is_active')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    if (adminError || !adminCheck) {
      throw new Error('Platform admin access required');
    }

    // Parse request body
    const body: CreateUserRequest = await req.json();
    const { email, full_name, organisation_id, role, make_owner, password } = body;

    if (!email || !organisation_id || !role) {
      throw new Error('Missing required fields: email, organisation_id, role');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // Determine the final role - if make_owner is true OR role is 'owner', set as owner
    const finalRole = make_owner || role === 'owner' ? 'owner' : role;

    // If making this user the owner, demote existing owner first
    if (make_owner || role === 'owner') {
      const { error: demoteError } = await supabase
        .from('organisation_members')
        .update({ role: 'admin' })
        .eq('organisation_id', organisation_id)
        .eq('role', 'owner');

      if (demoteError) {
        console.warn('Error demoting existing owner:', demoteError);
      }

      // Update organisation owner_email
      const { error: orgUpdateError } = await supabase
        .from('organisations')
        .update({ owner_email: email })
        .eq('id', organisation_id);

      if (orgUpdateError) {
        console.warn('Error updating organisation owner_email:', orgUpdateError);
      }
    }

    // Check if user already exists
    const { data: existingUser } = await supabase.auth.admin.listUsers();
    const userExists = existingUser?.users.find(u => u.email === email);

    let userId: string;

    if (userExists) {
      // User already exists, just add them to the organisation
      userId = userExists.id;

      // Check if already a member
      const { data: existingMember } = await supabase
        .from('organisation_members')
        .select('id, archived_at')
        .eq('organisation_id', organisation_id)
        .eq('user_id', userId)
        .maybeSingle();

      if (existingMember && !existingMember.archived_at) {
        throw new Error('User is already a member of this organisation');
      }

      if (existingMember && existingMember.archived_at) {
        // Reactivate archived member with the final role
        const { error: updateError } = await supabase
          .from('organisation_members')
          .update({
            role: finalRole,
            status: 'active',
            archived_at: null,
            activated_at: new Date().toISOString()
          })
          .eq('id', existingMember.id);

        if (updateError) throw updateError;
      } else {
        // Add as new member with the final role
        const { error: insertError } = await supabase
          .from('organisation_members')
          .insert({
            organisation_id,
            user_id: userId,
            role: finalRole,
            status: 'active',
            activated_at: new Date().toISOString()
          });

        if (insertError) throw insertError;
      }
    } else {
      // Create new user with provided password or generate a random one
      const userPassword = password || crypto.randomUUID();

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: userPassword,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          full_name: full_name || email.split('@')[0]
        }
      });

      if (createError) throw createError;
      if (!newUser.user) throw new Error('Failed to create user');

      userId = newUser.user.id;

      // Add user to organisation with the final role
      const { error: memberError } = await supabase
        .from('organisation_members')
        .insert({
          organisation_id,
          user_id: userId,
          role: finalRole,
          status: 'active',
          activated_at: new Date().toISOString()
        });

      if (memberError) throw memberError;
    }

    // Log the admin action
    await supabase.rpc('log_admin_action', {
      p_admin_email: user.email,
      p_action: userExists ? 'add_existing_user_to_org' : 'create_user_and_add_to_org',
      p_target_type: 'user',
      p_target_id: userId,
      p_details: {
        email,
        organisation_id,
        role: finalRole,
        make_owner: make_owner || false,
        full_name
      }
    });

    // Get organisation details
    const { data: org } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', organisation_id)
      .single();

    // Build success message
    let message = '';
    if (userExists) {
      message = `User ${email} added to organisation${make_owner ? ' as owner' : ''}`;
    } else {
      message = `User ${email} created and added to organisation${make_owner ? ' as owner' : ''}. ${password ? 'Use the provided password to login.' : 'They will need to reset their password on first login.'}`;
    }

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        email,
        organisation_name: org?.name,
        role: finalRole,
        message
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );

  } catch (error) {
    console.error('Error creating user:', error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
