export interface ParseInput {
  rawText?: string;
  fileUrl?: string;
  fileType?: 'pdf' | 'xlsx' | 'csv';
  metadata?: Record<string, unknown>;
}

export interface ParsedLineItem {
  description: string;
  quantity?: number;
  unit?: string;
  unit_rate?: number;
  total_amount?: number;
  classification?: string;
  confidence?: number;
  raw_line?: string;
}

export interface ParseResult {
  success: boolean;
  line_items: ParsedLineItem[];
  total_amount?: number;
  warnings: string[];
  metadata: Record<string, unknown>;
  parser_version: string;
  module_key: string;
}

export interface RuleVersion {
  version_id: string;
  module_key: string;
  rules: Record<string, unknown>;
  created_at: string;
}

export interface RegressionCase {
  id: string;
  module_key: string;
  input: ParseInput;
  expected_output: Partial<ParseResult>;
  description: string;
}

export interface ParserModuleAdapter {
  readonly moduleKey: string;
  parse(input: ParseInput): Promise<ParseResult>;
  postProcess(result: ParseResult): ParseResult;
  getRuleConfig(): Record<string, unknown>;
  applyRuleVersion(version: RuleVersion): void;
  getRegressionSuite(): RegressionCase[];
  validateOutput(result: ParseResult): { valid: boolean; errors: string[] };
}

export abstract class BaseParserAdapter implements ParserModuleAdapter {
  abstract readonly moduleKey: string;

  abstract parse(input: ParseInput): Promise<ParseResult>;

  postProcess(result: ParseResult): ParseResult {
    return result;
  }

  abstract getRuleConfig(): Record<string, unknown>;

  applyRuleVersion(_version: RuleVersion): void {
    console.warn(`[${this.moduleKey}] applyRuleVersion is a no-op for this adapter — use shadow testing`);
  }

  getRegressionSuite(): RegressionCase[] {
    return [];
  }

  validateOutput(result: ParseResult): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!result.module_key) errors.push('Missing module_key');
    if (!Array.isArray(result.line_items)) errors.push('line_items must be an array');
    return { valid: errors.length === 0, errors };
  }

  protected makeResult(overrides: Partial<ParseResult>): ParseResult {
    return {
      success: false,
      line_items: [],
      warnings: [],
      metadata: {},
      parser_version: '0.0.0',
      module_key: this.moduleKey,
      ...overrides,
    };
  }
}


export { BaseParserAdapter }