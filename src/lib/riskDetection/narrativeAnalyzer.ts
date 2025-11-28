import { supabase } from '../supabase';
import { detectRisks, RISK_PATTERNS, type RiskPattern } from './riskPatterns';

export interface NarrativeSection {
  type: 'header' | 'body' | 'exclusions' | 'assumptions' | 'terms' | 'footer';
  content: string;
  risks: Array<{
    pattern: RiskPattern;
    matches: string[];
  }>;
}

export interface NarrativeAnalysis {
  totalRisks: number;
  criticalRisks: number;
  highRisks: number;
  mediumRisks: number;
  lowRisks: number;
  sections: NarrativeSection[];
  risksByCategory: Record<string, number>;
  recommendations: string[];
  riskScore: number;
}

export function parseQuoteNarrative(fullText: string): NarrativeSection[] {
  const sections: NarrativeSection[] = [];

  const lines = fullText.split('\n');
  let currentSection: NarrativeSection = {
    type: 'body',
    content: '',
    risks: []
  };

  for (const line of lines) {
    const lowerLine = line.toLowerCase().trim();

    if (lowerLine.includes('exclusion') || lowerLine.includes('not included') || lowerLine.includes('excluded')) {
      if (currentSection.content) {
        sections.push(currentSection);
      }
      currentSection = {
        type: 'exclusions',
        content: line + '\n',
        risks: []
      };
    } else if (lowerLine.includes('assumption') || lowerLine.includes('based on') || lowerLine.includes('subject to')) {
      if (currentSection.content) {
        sections.push(currentSection);
      }
      currentSection = {
        type: 'assumptions',
        content: line + '\n',
        risks: []
      };
    } else if (lowerLine.includes('terms') || lowerLine.includes('condition') || lowerLine.includes('payment')) {
      if (currentSection.content) {
        sections.push(currentSection);
      }
      currentSection = {
        type: 'terms',
        content: line + '\n',
        risks: []
      };
    } else {
      currentSection.content += line + '\n';
    }
  }

  if (currentSection.content) {
    sections.push(currentSection);
  }

  for (const section of sections) {
    section.risks = detectRisks(section.content);
  }

  return sections;
}

export function analyzeQuoteNarrative(
  quoteText: string,
  supplierName: string
): NarrativeAnalysis {
  const sections = parseQuoteNarrative(quoteText);

  let totalRisks = 0;
  let criticalRisks = 0;
  let highRisks = 0;
  let mediumRisks = 0;
  let lowRisks = 0;
  const risksByCategory: Record<string, number> = {};

  for (const section of sections) {
    for (const risk of section.risks) {
      totalRisks++;

      switch (risk.pattern.severity) {
        case 'critical':
          criticalRisks++;
          break;
        case 'high':
          highRisks++;
          break;
        case 'medium':
          mediumRisks++;
          break;
        case 'low':
          lowRisks++;
          break;
      }

      const category = risk.pattern.category;
      risksByCategory[category] = (risksByCategory[category] || 0) + 1;
    }
  }

  const recommendations = generateRecommendations(sections, supplierName);

  const riskScore = calculateRiskScore(criticalRisks, highRisks, mediumRisks, lowRisks);

  return {
    totalRisks,
    criticalRisks,
    highRisks,
    mediumRisks,
    lowRisks,
    sections,
    risksByCategory,
    recommendations,
    riskScore
  };
}

function generateRecommendations(sections: NarrativeSection[], supplierName: string): string[] {
  const recommendations: string[] = [];

  const exclusionSection = sections.find(s => s.type === 'exclusions');
  if (exclusionSection && exclusionSection.risks.length > 0) {
    recommendations.push(
      `Review all exclusions with ${supplierName} and ensure they don't overlap with project requirements.`
    );
  }

  const assumptionSection = sections.find(s => s.type === 'assumptions');
  if (assumptionSection && assumptionSection.risks.length > 0) {
    recommendations.push(
      `Validate all assumptions with ${supplierName} through site inspection before contract award.`
    );
  }

  const allRisks = sections.flatMap(s => s.risks);
  const criticalRisks = allRisks.filter(r => r.pattern.severity === 'critical');
  if (criticalRisks.length > 0) {
    recommendations.push(
      `Address ${criticalRisks.length} critical risk(s) before proceeding with ${supplierName}.`
    );
  }

  const pricingRisks = allRisks.filter(r => r.pattern.category === 'pricing');
  if (pricingRisks.length > 2) {
    recommendations.push(
      `Request firm fixed pricing from ${supplierName} to enable accurate comparison.`
    );
  }

  const scopeRisks = allRisks.filter(r => r.pattern.category === 'scope');
  if (scopeRisks.length > 2) {
    recommendations.push(
      `Clarify scope boundaries with ${supplierName} to avoid disputes during execution.`
    );
  }

  if (recommendations.length === 0) {
    recommendations.push(`Quote from ${supplierName} appears well-defined with minimal risks.`);
  }

  return recommendations;
}

function calculateRiskScore(critical: number, high: number, medium: number, low: number): number {
  const score = (critical * 10) + (high * 5) + (medium * 2) + (low * 1);

  const maxScore = 100;
  const normalizedScore = Math.min(score, maxScore);

  return 100 - normalizedScore;
}

export async function analyzeAllQuotesInProject(projectId: string): Promise<Map<string, NarrativeAnalysis>> {
  const { data: quotes } = await supabase
    .from('quotes')
    .select('id, supplier_name, raw_data, notes')
    .eq('project_id', projectId);

  if (!quotes || quotes.length === 0) {
    return new Map();
  }

  const results = new Map<string, NarrativeAnalysis>();

  for (const quote of quotes) {
    const fullText = [
      quote.notes || '',
      JSON.stringify(quote.raw_data || {})
    ].join('\n\n');

    const analysis = analyzeQuoteNarrative(fullText, quote.supplier_name);
    results.set(quote.id, analysis);
  }

  return results;
}

export async function analyzeQuoteWithLLM(
  quoteText: string,
  supplierName: string
): Promise<{
  risks: Array<{ category: string; severity: string; description: string; recommendation: string }>;
  summary: string;
}> {
  const { data: configData } = await supabase
    .from('system_config')
    .select('value')
    .eq('key', 'OPENAI_API_KEY')
    .single();

  const openaiApiKey = configData?.value;

  if (!openaiApiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const prompt = `Analyze this construction quote for risks, vague wording, exclusions, and assumptions.

SUPPLIER: ${supplierName}

QUOTE TEXT:
${quoteText}

Identify all risks including:
- Exclusions and "by others" clauses
- Vague wording (TBC, estimated, approximately)
- Assumptions and subject-to clauses
- Pricing risks (provisional, escalation)
- Scope ambiguity
- Timeline risks
- Access and site condition risks
- Compliance and quality issues

For each risk found, provide:
- Category (exclusion, assumption, vague, pricing, scope, timeline, quality, access, compliance)
- Severity (critical, high, medium, low)
- Description (what the risk is)
- Recommendation (how to address it)

Also provide a brief summary of the overall risk profile.

Return JSON:
{
  "risks": [
    {
      "category": "string",
      "severity": "string",
      "description": "string",
      "recommendation": "string"
    }
  ],
  "summary": "string"
}`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openaiApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are an expert construction quantity surveyor specializing in risk analysis. Respond only with valid JSON.'
        },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_completion_tokens: 2000
    })
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.status}`);
  }

  const result = await response.json();
  const content = result.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return JSON.parse(content);
}
