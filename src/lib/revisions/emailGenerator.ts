import { callOpenAI } from '../api/aiProxy';

interface EmailGenerationParams {
  supplierName: string;
  projectName: string;
  clientName?: string;
  coveragePercent: number;
  gapsCount: number;
  deadline: string;
  scopeGaps: Array<{
    system: string;
    category?: string;
    itemsCount: number;
    estimatedImpact: string;
  }>;
  contactName?: string;
  senderName?: string;
  senderPosition?: string;
  companyName?: string;
}

export async function generateRevisionRequestEmail(
  params: EmailGenerationParams
): Promise<{ subject: string; body: string }> {
  const hasGaps = params.gapsCount > 0;

  const gapsSummary = params.scopeGaps
    .slice(0, 5)
    .map(gap => `- ${gap.system}${gap.category ? ` (${gap.category})` : ''}: ${gap.estimatedImpact}`)
    .join('\n');

  const prompt = `Generate a professional, polite email requesting quote revisions from a supplier. This must comply with NZ Government Procurement Rules for fair and transparent tendering.

Project: ${params.projectName}
${params.clientName ? `Client: ${params.clientName}` : ''}
Supplier: ${params.supplierName}
${params.contactName ? `Contact: ${params.contactName}` : ''}
Coverage: ${params.coveragePercent.toFixed(1)}%
Gaps Identified: ${params.gapsCount}
Deadline: ${params.deadline}

${hasGaps ? `
Scope Gaps Summary:
${gapsSummary}
${params.scopeGaps.length > 5 ? `... and ${params.scopeGaps.length - 5} more items` : ''}
` : 'Note: No significant gaps identified - this is an equitable opportunity for all suppliers to review/confirm.'}

Requirements:
1. Professional, respectful tone
2. Focus on scope COMPLETENESS (not price negotiation)
3. Emphasize "apples-to-apples" comparison goal
4. Mention attached PDF report with detailed gap analysis
5. Clear deadline: ${params.deadline}
6. NO mention of other suppliers or competitive information
7. Comply with NZ Procurement Rule 40 (post-tender clarifications)
8. Emphasize fairness and transparency
9. Keep it concise but complete (3-4 paragraphs)
${!hasGaps ? '10. For this supplier with high coverage, frame as "opportunity to confirm/review if needed"' : ''}

Email Structure:
- Subject line (professional, clear)
- Greeting${params.contactName ? ` to ${params.contactName}` : ''}
- Thank them for submission
- Explain scope gap analysis${hasGaps ? ' identified some items' : ' shows strong alignment, but giving opportunity to review'}
- Reference attached PDF
- Request revised quote by deadline (focus on adding missed items, not changing existing prices)
- Offer to answer questions
- Professional closing

${params.senderName ? `Sign off as:\n${params.senderName}\n${params.senderPosition || 'Quantity Surveyor'}\n${params.companyName || 'VerifyTrade'}\n` : 'Sign off as [Your Name], [Position], [Company]'}

Generate ONLY the email subject and body. Use appropriate line breaks. Be specific about the attached PDF report.`;

  try {
    const response = await callOpenAI([
      {
        role: 'system',
        content: 'You are a professional procurement specialist helping draft compliant and clear supplier communication emails.'
      },
      {
        role: 'user',
        content: prompt
      }
    ], {
      max_tokens: 1000,
      temperature: 0.7,
    });

    const lines = response.trim().split('\n');
    let subject = '';
    let body = '';
    let inBody = false;

    for (const line of lines) {
      if (line.toLowerCase().startsWith('subject:')) {
        subject = line.replace(/^subject:\s*/i, '').trim();
      } else if (subject && !inBody && line.trim()) {
        inBody = true;
        body = line;
      } else if (inBody) {
        body += '\n' + line;
      }
    }

    if (!subject) {
      subject = `Request for Clarification on Scope Gaps – ${params.projectName} Quote`;
    }

    if (!body || body.length < 100) {
      body = generateFallbackEmail(params);
    }

    return {
      subject,
      body: body.trim(),
    };
  } catch (error) {
    console.error('Error generating email with AI:', error);
    return {
      subject: `Request for Clarification on Scope Gaps – ${params.projectName} Quote`,
      body: generateFallbackEmail(params),
    };
  }
}

function generateFallbackEmail(params: EmailGenerationParams): string {
  const hasGaps = params.gapsCount > 0;

  return `Dear ${params.contactName || `${params.supplierName} Team`},

Thank you for your submission on the ${params.projectName} ${params.clientName ? `for ${params.clientName}` : 'project'}. We appreciate the detail provided in your quote.

${hasGaps ? `Upon review, our analysis has identified ${params.gapsCount} potential scope gap${params.gapsCount !== 1 ? 's' : ''} in your submission compared to the project baseline. These appear to be omissions rather than pricing decisions, and we're giving you an opportunity to review and provide a revised quote to ensure completeness.` : `Our analysis shows your quote demonstrates strong alignment with project requirements (${params.coveragePercent.toFixed(1)}% coverage). To ensure fairness and transparency in our evaluation process, we're providing all suppliers an opportunity to review and confirm their submissions.`}

Attached is a customized PDF report ${hasGaps ? 'highlighting the specific items/systems that may have been missed' : 'summarizing our analysis'}. This is based solely on your quote and the project requirements – no information from other suppliers is included.

Please review the attached and submit any revisions ${hasGaps ? 'addressing these gaps' : 'or confirmations'} by ${params.deadline}. ${hasGaps ? 'Revisions should focus on adding missed items for an apples-to-apples comparison, without changes to existing pricing unless directly related to the gaps.' : ''}

If you have questions, reply to this email. We aim for a fair and transparent procurement process in accordance with NZ Government Procurement Rules.

Best regards,
${params.senderName || '[Your Name]'}
${params.senderPosition || '[Your Position]'}
${params.companyName || '[Company Name]'}

Date: ${new Date().toLocaleDateString('en-NZ', { year: 'numeric', month: 'long', day: 'numeric' })}`;
}
