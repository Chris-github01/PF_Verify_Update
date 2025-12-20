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
    const { email, full_name, organisation_id, role } = body;

    if (!email || !organisation_id || !role) {
      throw new Error('Missing required fields: email, organisation_id, role');
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
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
        // Reactivate archived member
        const { error: updateError } = await supabase
          .from('organisation_members')
          .update({
            role,
            status: 'active',
            archived_at: null
          })
          .eq('id', existingMember.id);

        if (updateError) throw updateError;
      } else {
        // Add as new member
        const { error: insertError } = await supabase
          .from('organisation_members')
          .insert({
            organisation_id,
            user_id: userId,
            role,
            status: 'active'
          });

        if (insertError) throw insertError;
      }
    } else {
      // Create new user with a random password (they'll need to reset it)
      const randomPassword = crypto.randomUUID();

      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email,
        password: randomPassword,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          full_name: full_name || email.split('@')[0]
        }
      });

      if (createError) throw createError;
      if (!newUser.user) throw new Error('Failed to create user');

      userId = newUser.user.id;

      // Add user to organisation
      const { error: memberError } = await supabase
        .from('organisation_members')
        .insert({
          organisation_id,
          user_id: userId,
          role,
          status: 'active'
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
        role,
        full_name
      }
    });

    // Get organisation details
    const { data: org } = await supabase
      .from('organisations')
      .select('name')
      .eq('id', organisation_id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        user_id: userId,
        email,
        organisation_name: org?.name,
        message: userExists
          ? `User ${email} added to organisation`
          : `User ${email} created and added to organisation. They will need to reset their password on first login.`
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
