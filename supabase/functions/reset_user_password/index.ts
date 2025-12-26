import { createClient } from 'npm:@supabase/supabase-js@2.57.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

interface ResetPasswordRequest {
  email: string;
  new_password: string;
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
    const body: ResetPasswordRequest = await req.json();
    const { email, new_password } = body;

    if (!email || !new_password) {
      throw new Error('Missing required fields: email, new_password');
    }

    // Validate password length
    if (new_password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    // Get user by email
    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) throw listError;

    const targetUser = users.find(u => u.email === email);

    if (!targetUser) {
      throw new Error('User not found');
    }

    // Update user password
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      targetUser.id,
      { password: new_password }
    );

    if (updateError) throw updateError;

    // Log the admin action
    await supabase.rpc('log_admin_action', {
      p_admin_email: user.email,
      p_action: 'reset_user_password',
      p_target_type: 'user',
      p_target_id: targetUser.id,
      p_details: {
        email,
        reset_by_admin: user.email
      }
    });

    return new Response(
      JSON.stringify({
        success: true,
        message: `Password reset successfully for ${email}`
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
    console.error('Error resetting password:', error);

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
