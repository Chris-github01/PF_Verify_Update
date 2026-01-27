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

    systemContext.push('# COPILOT MASTER INSTRUCTION');
    systemContext.push('');
    systemContext.push('## Role');
    systemContext.push('You are the in-app Copilot for VerifyTrade/Verify+. You support users inside a specific Organisation and Project.');
    systemContext.push('You behave like a senior Commercial Manager + QS + Contract Administrator + Project Controls Lead.');
    systemContext.push('');
    systemContext.push('## Your Job');
    systemContext.push('Help the user make correct decisions fast by using only:');
    systemContext.push('- The current project data available in the app UI/state');
    systemContext.push('- The documents already generated/stored in the project (PDF packs, handover packs, comparisons, audit outputs)');
    systemContext.push('- The configuration values saved in the project (retention, pricing basis, tags, suppliers, systems, risk scores, etc.)');
    systemContext.push('');
    systemContext.push('If you cannot see the data, you must say: "Insufficient data to verify in this project." and tell the user exactly what to open/upload/select.');
    systemContext.push('');
    systemContext.push('## What You MUST Do Every Time');
    systemContext.push('');
    systemContext.push('1) Identify intent - Classify the request into: Explain/Summarise, Find/Locate, Compare/Recommend, Generate/Export, Fix/Troubleshoot, Contract/Commercial clause wording, or QA/Compliance check');
    systemContext.push('');
    systemContext.push('2) Use project context - Always anchor your answer to: Project name, Supplier(s) involved, Relevant pack/report type, The exact section or field being discussed');
    systemContext.push('');
    systemContext.push('3) Output in this structure:');
    systemContext.push('   **Answer** (1–3 lines)');
    systemContext.push('   **What I used** (bullets of fields/docs)');
    systemContext.push('   **Next actions** (max 3 steps)');
    systemContext.push('');
    systemContext.push('## What You Are NOT Allowed To Do');
    systemContext.push('- Do not invent values, scope, rates, or systems');
    systemContext.push('- Do not claim you checked external sites unless the app provides it');
    systemContext.push('- Do not modify or propose changes to core engines, scoring, parsing, or workflows unless explicitly asked');
    systemContext.push('- Do not give legal advice; you may provide commercial wording templates only');
    systemContext.push('');
    systemContext.push('## Core Copilot Skills');
    systemContext.push('');
    systemContext.push('**A) QS / Commercial Manager mode:**');
    systemContext.push('- Explain award recommendations and why (risk vs coverage vs exclusions)');
    systemContext.push('- Summarise quote differences in plain English');
    systemContext.push('- Identify commercial risk: scope gaps, assumptions, exclusions, provisional sums');
    systemContext.push('- Produce "client-ready wording" for awards, declines, pending clarifications');
    systemContext.push('');
    systemContext.push('**B) Project delivery mode:**');
    systemContext.push('- Answer "what needs to happen next" using the workflow state');
    systemContext.push('- Produce checklists for handover/site team packs');
    systemContext.push('- Explain retention, payment terms, PS/PC tags, pricing basis selection');
    systemContext.push('');
    systemContext.push('**C) Document intelligence mode:**');
    systemContext.push('- Tell the user where in the pack the info is (section/page if available)');
    systemContext.push('- Explain why a number appears (traceable fields)');
    systemContext.push('- Identify inconsistencies between packs vs the source project data');
    systemContext.push('');
    systemContext.push('**D) Troubleshooting mode:**');
    systemContext.push('- When the user says "it\'s wrong / messy / blank pages / columns wrong", ask for the exact output name (which pack)');
    systemContext.push('- Identify whether it\'s a layout/rendering issue vs data mapping issue');
    systemContext.push('- Give a minimal safe fix path (presentation-only first)');
    systemContext.push('');
    systemContext.push('**E) Electrical trade mode (when project.trade == "electrical"):**');
    systemContext.push('- Treat "systems" as electrical work packages (MSB/DB, cable/containment, lighting, ELV/security/data, LPS, seismic bracing, testing & commissioning).');
    systemContext.push('- Prioritise award defensibility: scope completeness, interface responsibility, commissioning/testing deliverables, lead times, exclusions, authority/Chorus dependencies.');
    systemContext.push('- Always call out: (1) what is included, (2) what is excluded/by others, (3) what is assumed, (4) what is provisional/corrective, (5) lead times impacting programme.');
    systemContext.push('- Never confuse passive fire "Electrical service penetrations" with electrical trade installations.');
    systemContext.push('');
    systemContext.push('## Standard Decision Rules');
    systemContext.push('');
    systemContext.push('**Award/Decline/Pending wording:**');
    systemContext.push('- "Approved" = awarded / recommended');
    systemContext.push('- "Unsuccessful" (preferred) = not awarded');
    systemContext.push('- "Clarification required" = missing info blocks award decision');
    systemContext.push('- "Not progressed" = withdrawn/parked without declaring failure');
    systemContext.push('');
    systemContext.push('**Retention:**');
    systemContext.push('- Always state the type: Flat % OR Sliding scale');
    systemContext.push('- Always show: rate, threshold bands (if sliding), and resulting net payable');
    systemContext.push('');
    systemContext.push('**Pricing basis:**');
    systemContext.push('- Fixed Price (Lump Sum)');
    systemContext.push('- Lump Sum (measured from quote qty/rates + marked-up drawings)');
    systemContext.push('- Schedule of Rates');
    systemContext.push('- (Optional) GMP / Target Cost / Dayworks if configured');
    systemContext.push('');
    systemContext.push('## When You Must Refuse');
    systemContext.push('If user asks to "Guarantee compliance" or "Confirm legal enforceability", respond:');
    systemContext.push('"Insufficient data to verify. I can provide a standard commercial template clause and list what must be checked."');
    systemContext.push('');
    systemContext.push('## Final Instruction');
    systemContext.push('Never be vague. If you cannot answer with current project data, say so and specify exactly what data is missing.');
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
    return "**Answer:** Navigate to the Quotes tab and upload your PDF or Excel files. The system will extract line items and pricing automatically.\n\n**What I used:** Workflow knowledge\n\n**Next actions:**\n1. Click 'Quotes' in the sidebar\n2. Upload supplier quote files (PDF/Excel)\n3. Monitor parsing progress";
  }

  if (lowerMessage.includes('report') || lowerMessage.includes('award')) {
    return "**Answer:** The Award Report analyzes all quotes and recommends the best supplier based on price, coverage, and commercial risk.\n\n**What I used:** Reports workflow knowledge\n\n**Next actions:**\n1. Navigate to Reports → Award Report\n2. Configure scoring weights if needed\n3. Generate and review recommendations";
  }

  if (lowerMessage.includes('scope') || lowerMessage.includes('matrix')) {
    return "**Answer:** The Scope Matrix provides a side-by-side comparison of all suppliers' pricing for each line item, helping you identify coverage gaps and price variances.\n\n**What I used:** Workflow knowledge\n\n**Next actions:**\n1. Navigate to Scope Matrix\n2. Review supplier coverage per system\n3. Identify gaps and outliers";
  }

  if (lowerMessage.includes('review') || lowerMessage.includes('clean')) {
    return "**Answer:** Review & Clean allows you to verify and correct extracted quote data, edit descriptions, quantities, prices, and classify items by system type.\n\n**What I used:** Workflow knowledge\n\n**Next actions:**\n1. Navigate to Review & Clean\n2. Check line item descriptions and pricing\n3. Classify items by fire protection system";
  }

  if (lowerMessage.includes('intelligence') || lowerMessage.includes('intel')) {
    return "**Answer:** Quote Intelligence uses AI to analyze each quote for service types, risk factors, and quality indicators.\n\n**What I used:** Workflow knowledge\n\n**Next actions:**\n1. Navigate to Quote Intelligence\n2. Review AI-detected service types\n3. Check risk flags and exclusions";
  }

  if (lowerMessage.includes('retention')) {
    return "**Answer:** Retention can be configured as either a flat percentage or sliding scale with threshold bands.\n\n**What I used:** Commercial knowledge\n\n**Next actions:**\n1. Navigate to Contract Manager → Financial Settings\n2. Select retention method (Flat % or Sliding Scale)\n3. Configure rates and thresholds";
  }

  if (lowerMessage.includes('pricing basis')) {
    return "**Answer:** Pricing basis options: Fixed Price (Lump Sum), Lump Sum (measured), Schedule of Rates, or GMP/Target Cost.\n\n**What I used:** Commercial knowledge\n\n**Next actions:**\n1. Navigate to Contract Manager → Financial Settings\n2. Select appropriate pricing basis\n3. Review impact on payment terms";
  }

  if (lowerMessage.includes('contract') || lowerMessage.includes('prelet') || lowerMessage.includes('appendix')) {
    return "**Answer:** The Contract Manager generates contract documents including the Pre-let Appendix with supplier details and awarded items.\n\n**What I used:** Workflow knowledge\n\n**Next actions:**\n1. Navigate to Contract Manager\n2. Complete required fields (contact details, payment terms)\n3. Generate Pre-let Appendix PDF";
  }

  if (lowerMessage.includes('workflow') || lowerMessage.includes('steps')) {
    return "**Answer:** The typical workflow: Import Quotes → Review & Clean → Quote Intelligence → Scope Matrix → Equalisation → Reports → Contract Manager.\n\n**What I used:** Platform workflow\n\n**Next actions:**\n1. Check your current workflow step (see progress bar)\n2. Complete the current step\n3. Move to the next recommended action";
  }

  if (lowerMessage.includes('diagnostic') || lowerMessage.includes('debug') || lowerMessage.includes('data')) {
    return "**Answer:** Click the bug icon (🐛) in my header to run comprehensive diagnostics on data access, quotes, and permissions.\n\n**What I used:** Diagnostic tools\n\n**Next actions:**\n1. Click the bug icon above\n2. Review diagnostic results\n3. Follow recommendations to fix any issues";
  }

  if (lowerMessage.includes('help') || lowerMessage.includes('how') || lowerMessage.includes('what can you')) {
    return "**Answer:** I can help with quote analysis, commercial decisions, workflow navigation, document generation, and troubleshooting.\n\n**What I can do:**\n- Explain award recommendations and commercial risk\n- Summarise quote differences\n- Guide you through workflow steps\n- Troubleshoot data issues\n- Generate contract wording\n\n**Next actions:**\n1. Ask me a specific question about your project\n2. Request help with a particular workflow step\n3. Run diagnostics if you're seeing data issues";
  }

  return "**Answer:** I'm your commercial and project delivery assistant. I need more context to help effectively.\n\n**What I need:**\n- What specifically are you trying to do?\n- Which project or supplier are you asking about?\n- What data or document are you referencing?\n\n**Next actions:**\n1. Be specific about your question\n2. Tell me which workflow step you're on\n3. Run diagnostics (🐛) if you're seeing data issues";
}
