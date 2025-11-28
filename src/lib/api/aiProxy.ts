import { supabase } from '../supabase';

interface AIProxyRequest {
  message: string;
  projectId: string;
}

interface AIProxyResponse {
  replyText: string;
  toolCalls: Array<{
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }>;
  toolResults: Array<{
    toolName: string;
    result: unknown;
  }>;
}

interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OpenAIOptions {
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: 'json_object' | 'text' };
}

export async function askAI(
  message: string,
  projectId: string
): Promise<{ data: AIProxyResponse | null; error: string | null }> {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    let userEmail = 'demo@example.com';
    let userRole = 'owner';

    if (session && session.user) {
      userEmail = session.user.email || 'demo@example.com';
      userRole = session.user.user_metadata?.role || 'owner';
    }

    const userContext = {
      email: userEmail,
      role: userRole,
    };

    const requestBody: AIProxyRequest & { userContext: typeof userContext } = {
      message,
      projectId,
      userContext,
    };

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai_proxy_ask`;
    const headers = {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      return { data: null, error: `API error: ${response.status} ${errorText}` };
    }

    const data: AIProxyResponse = await response.json();
    return { data, error: null };
  } catch (error) {
    return {
      data: null,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function callOpenAI(
  messages: OpenAIMessage[],
  options: OpenAIOptions = {}
): Promise<string> {
  try {
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai_ask`;
    const headers = {
      'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    };

    const requestBody = {
      messages,
      temperature: options.temperature || 0.3,
      max_tokens: options.max_tokens || 2000,
      response_format: options.response_format?.type || 'text',
    };

    const response = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    return data.response || data.content || JSON.stringify(data);
  } catch (error) {
    throw new Error(
      `Failed to call OpenAI: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
