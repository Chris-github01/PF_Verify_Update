import type { CopilotProjectData } from './copilotDataProvider';
import { formatProjectDataForAI, fetchOrganisationContext } from './copilotDataProvider';

export interface CopilotMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface CopilotChatRequest {
  messages: CopilotMessage[];
  projectData?: CopilotProjectData | null;
  organisationId?: string;
}

export async function sendCopilotMessage(
  request: CopilotChatRequest
): Promise<string> {
  try {
    const systemContext: string[] = [];

    systemContext.push('You are an AI assistant for VerifyPlus, a construction quote analysis and comparison platform.');
    systemContext.push('Your role is to help users understand their projects, quotes, and guide them through the workflow.');
    systemContext.push('Be helpful, concise, and professional. Focus on practical insights and actionable recommendations.');
    systemContext.push('');

    if (request.organisationId) {
      const orgContext = await fetchOrganisationContext(request.organisationId);
      systemContext.push(orgContext);
    }

    if (request.projectData) {
      const projectContext = formatProjectDataForAI(request.projectData);
      systemContext.push(projectContext);
    } else {
      systemContext.push('Note: No specific project is currently selected. You can help with general questions about the platform or guide the user to select a project.');
    }

    const messages: CopilotMessage[] = [
      {
        role: 'system',
        content: systemContext.join('\n'),
      },
      ...request.messages,
    ];

    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/copilot_chat`;
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Copilot API error:', errorText);
      throw new Error(`Failed to get response from AI: ${response.status}`);
    }

    const result = await response.json();
    return result.message || 'I apologize, but I encountered an error processing your request.';
  } catch (error) {
    console.error('Error in sendCopilotMessage:', error);

    return getFallbackResponse(request.messages[request.messages.length - 1]?.content || '');
  }
}

function getFallbackResponse(userMessage: string): string {
  const lowerMessage = userMessage.toLowerCase();

  if (lowerMessage.includes('quote') || lowerMessage.includes('import')) {
    return "To import quotes, navigate to the **Quotes** tab and upload your PDF or Excel files. The system will automatically extract line items and pricing. I can help you troubleshoot if you encounter any parsing issues.";
  }

  if (lowerMessage.includes('report') || lowerMessage.includes('award')) {
    return "The **Award Report** analyzes all your quotes and provides AI-powered recommendations on the best supplier based on price, coverage, and risk factors. Navigate to the Reports section to generate one.";
  }

  if (lowerMessage.includes('scope') || lowerMessage.includes('matrix')) {
    return "The **Scope Matrix** provides a side-by-side comparison of all suppliers' pricing for each line item. It helps you identify coverage gaps and price variances across suppliers.";
  }

  if (lowerMessage.includes('review') || lowerMessage.includes('clean')) {
    return "The **Review & Clean** step allows you to verify and correct extracted quote data. You can edit descriptions, quantities, prices, and classify items by system type.";
  }

  if (lowerMessage.includes('intelligence') || lowerMessage.includes('intel')) {
    return "**Quote Intelligence** uses AI to analyze each quote for service types, risk factors, and quality indicators. It helps you understand what's included in each supplier's offer.";
  }

  if (lowerMessage.includes('equalisation') || lowerMessage.includes('equalize')) {
    return "**Equalisation** adjusts quote comparisons by normalizing units and accounting for different measurement standards across suppliers.";
  }

  if (lowerMessage.includes('contract')) {
    return "The **Contract Manager** helps you prepare contract documents, including the Pre-let Appendix with all supplier details and awarded items.";
  }

  if (lowerMessage.includes('workflow') || lowerMessage.includes('steps')) {
    return "The typical workflow is:\n1. **Import Quotes** - Upload supplier quotes\n2. **Review & Clean** - Verify extracted data\n3. **Quote Intelligence** - AI analysis of quotes\n4. **Scope Matrix** - Compare all quotes side-by-side\n5. **Equalisation** - Normalize and adjust\n6. **Reports** - Generate award recommendations\n7. **Contract Manager** - Prepare contract documents";
  }

  if (lowerMessage.includes('help') || lowerMessage.includes('how')) {
    return "I can help you with:\n- Understanding quote data and pricing\n- Navigating between workflow steps\n- Interpreting reports and recommendations\n- Troubleshooting import issues\n- Explaining system features\n\nWhat specific aspect would you like help with?";
  }

  return "I'm here to help! I can assist with quote analysis, workflow navigation, and understanding your project data. Could you please be more specific about what you'd like to know?";
}
