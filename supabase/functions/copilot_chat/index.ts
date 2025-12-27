import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface OpenAIRequest {
  model: string;
  messages: Message[];
  temperature: number;
  max_tokens: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { messages } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      throw new Error("Messages array is required");
    }

    const openAIKey = Deno.env.get("OPENAI_API_KEY");
    if (!openAIKey) {
      console.error("OPENAI_API_KEY not configured");
      throw new Error("AI service not configured");
    }

    const openAIRequest: OpenAIRequest = {
      model: "gpt-4-turbo-preview",
      messages: messages.map((msg: Message) => ({
        role: msg.role,
        content: msg.content,
      })),
      temperature: 0.7,
      max_tokens: 1000,
    };

    console.log("Calling OpenAI API...");
    const openAIResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${openAIKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(openAIRequest),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API failed: ${openAIResponse.status}`);
    }

    const openAIResult = await openAIResponse.json();
    const assistantMessage = openAIResult.choices?.[0]?.message?.content;

    if (!assistantMessage) {
      throw new Error("No response from AI");
    }

    return new Response(
      JSON.stringify({ message: assistantMessage }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error: any) {
    console.error("Error in copilot_chat:", error);
    return new Response(
      JSON.stringify({
        error: error.message || "Failed to process chat message",
        message: "I apologize, but I'm having trouble processing your request right now. Please try again in a moment.",
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
