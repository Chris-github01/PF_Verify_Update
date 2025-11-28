import type {
  PassiveFireQuoteSchema,
  ExtractionResult,
  ConfidenceBreakdown,
  ExtractionMetadata,
} from '../../types/extraction.types';
import { quoteValidator } from '../validation/quoteValidator';

interface AIProvider {
  name: string;
  extract: (text: string, schema: any) => Promise<PassiveFireQuoteSchema>;
}

export class TwoPassExtractor {
  private providers: AIProvider[] = [];

  registerProvider(provider: AIProvider): void {
    this.providers.push(provider);
  }

  async extract(
    text: string,
    metadata: { pageCount: number; ocrUsed: boolean }
  ): Promise<ExtractionResult> {
    const startTime = Date.now();

    if (this.providers.length === 0) {
      throw new Error('No AI providers registered');
    }

    const primary = await this.providers[0].extract(text, this.getSchema());

    const validationPass1 = quoteValidator.validate(primary);
    primary.validation = validationPass1;

    if (validationPass1.confidence_score >= 0.9 && validationPass1.is_valid) {
      const processingTime = Date.now() - startTime;
      return this.buildResult(primary, null, null, processingTime, metadata, ['primary']);
    }

    const validated = await this.runValidatorPass(primary, text);

    if (this.providers.length > 1 && validationPass1.confidence_score < 0.7) {
      const secondary = await this.providers[1].extract(text, this.getSchema());
      const validationPass2 = quoteValidator.validate(secondary);
      secondary.validation = validationPass2;

      const consensus = this.buildConsensus(validated, secondary);
      const validationConsensus = quoteValidator.validate(consensus);
      consensus.validation = validationConsensus;

      const processingTime = Date.now() - startTime;
      return this.buildResult(
        validated,
        secondary,
        consensus,
        processingTime,
        metadata,
        [this.providers[0].name, this.providers[1].name]
      );
    }

    const processingTime = Date.now() - startTime;
    return this.buildResult(validated, null, null, processingTime, metadata, ['primary+validator']);
  }

  private async runValidatorPass(
    initial: PassiveFireQuoteSchema,
    originalText: string
  ): Promise<PassiveFireQuoteSchema> {
    const validation = initial.validation;

    if (!validation || validation.errors.length === 0) {
      return initial;
    }

    const validatorPrompt = this.buildValidatorPrompt(initial, validation);

    try {
      const corrected = await this.providers[0].extract(
        `${originalText}\n\n---VALIDATION FEEDBACK---\n${validatorPrompt}`,
        this.getSchema()
      );

      const revalidation = quoteValidator.validate(corrected);
      corrected.validation = revalidation;

      if (revalidation.confidence_score > validation.confidence_score) {
        return corrected;
      }

      return initial;
    } catch (error) {
      console.error('Validator pass failed:', error);
      return initial;
    }
  }

  private buildValidatorPrompt(
    quote: PassiveFireQuoteSchema,
    validation: any
  ): string {
    let prompt = 'The extracted data has the following issues that need correction:\n\n';

    if (validation.errors.length > 0) {
      prompt += '**ERRORS (must fix):**\n';
      validation.errors.forEach((err: any, i: number) => {
        prompt += `${i + 1}. ${err.message}\n`;
        if (err.expected !== undefined) {
          prompt += `   Expected: ${err.expected}, Got: ${err.actual}\n`;
        }
      });
      prompt += '\n';
    }

    if (validation.warnings.length > 0) {
      prompt += '**WARNINGS (review and fix if incorrect):**\n';
      validation.warnings.forEach((warn: any, i: number) => {
        prompt += `${i + 1}. ${warn.message}\n`;
        if (warn.suggestion) {
          prompt += `   Suggestion: ${warn.suggestion}\n`;
        }
      });
      prompt += '\n';
    }

    prompt += 'Please re-extract the data with these corrections applied. Pay special attention to:\n';
    prompt += '- Arithmetic accuracy (quantity × unit_rate = line_total)\n';
    prompt += '- Sum of line items = subtotal\n';
    prompt += '- Subtotal + tax = grand_total\n';
    prompt += '- Proper unit formatting (m², lm, each)\n';
    prompt += '- Reasonable quantity and rate values\n';

    return prompt;
  }

  private buildConsensus(
    primary: PassiveFireQuoteSchema,
    secondary: PassiveFireQuoteSchema
  ): PassiveFireQuoteSchema {
    const consensus: PassiveFireQuoteSchema = {
      metadata: this.mergeMetadata(primary.metadata, secondary.metadata),
      line_items: this.mergeLineItems(primary.line_items, secondary.line_items),
      financials: this.mergeFinancials(primary.financials, secondary.financials),
      validation: primary.validation,
    };

    return consensus;
  }

  private mergeMetadata(m1: any, m2: any): any {
    return {
      supplier_name: this.pickBest(m1.supplier_name, m2.supplier_name),
      quote_number: this.pickBest(m1.quote_number, m2.quote_number),
      quote_date: this.pickBest(m1.quote_date, m2.quote_date),
      quote_reference: this.pickBest(m1.quote_reference, m2.quote_reference),
      project_name: this.pickBest(m1.project_name, m2.project_name),
      customer_name: this.pickBest(m1.customer_name, m2.customer_name),
      currency: this.pickBest(m1.currency, m2.currency),
      payment_terms: this.pickBest(m1.payment_terms, m2.payment_terms),
      validity_period: this.pickBest(m1.validity_period, m2.validity_period),
    };
  }

  private mergeLineItems(items1: any[], items2: any[]): any[] {
    if (items1.length === items2.length) {
      return items1.map((item1, i) => {
        const item2 = items2[i];
        return {
          line_number: item1.line_number || item2.line_number,
          item_code: this.pickBest(item1.item_code, item2.item_code),
          description: this.pickBest(item1.description, item2.description),
          quantity: this.pickNumeric(item1.quantity, item2.quantity),
          unit: this.pickBest(item1.unit, item2.unit),
          unit_rate: this.pickNumeric(item1.unit_rate, item2.unit_rate),
          line_total: this.pickNumeric(item1.line_total, item2.line_total),
          trade: this.pickBest(item1.trade, item2.trade),
          system_code: this.pickBest(item1.system_code, item2.system_code),
          fire_rating: this.pickBest(item1.fire_rating, item2.fire_rating),
          notes: this.pickBest(item1.notes, item2.notes),
          confidence: Math.max(item1.confidence || 0, item2.confidence || 0),
        };
      });
    }

    return items1.length > items2.length ? items1 : items2;
  }

  private mergeFinancials(f1: any, f2: any): any {
    return {
      subtotal: this.pickNumeric(f1.subtotal, f2.subtotal),
      tax_rate: this.pickNumeric(f1.tax_rate, f2.tax_rate),
      tax_amount: this.pickNumeric(f1.tax_amount, f2.tax_amount),
      discount: this.pickNumeric(f1.discount, f2.discount),
      grand_total: this.pickNumeric(f1.grand_total, f2.grand_total),
      currency: this.pickBest(f1.currency, f2.currency),
    };
  }

  private pickBest(val1: any, val2: any): any {
    if (val1 && !val2) return val1;
    if (val2 && !val1) return val2;
    if (!val1 && !val2) return undefined;

    if (typeof val1 === 'string' && typeof val2 === 'string') {
      return val1.length >= val2.length ? val1 : val2;
    }

    return val1;
  }

  private pickNumeric(val1: number, val2: number): number {
    if (val1 && !val2) return val1;
    if (val2 && !val1) return val2;
    if (!val1 && !val2) return 0;

    if (Math.abs(val1 - val2) < 0.01) {
      return val1;
    }

    return val1 > 0 ? val1 : val2;
  }

  private buildResult(
    primary: PassiveFireQuoteSchema,
    secondary: PassiveFireQuoteSchema | null,
    consensus: PassiveFireQuoteSchema | null,
    processingTime: number,
    metadata: { pageCount: number; ocrUsed: boolean },
    modelsUsed: string[]
  ): ExtractionResult {
    const finalQuote = consensus || primary;
    const validation = finalQuote.validation;

    const confidence_breakdown: ConfidenceBreakdown = {
      overall: validation.confidence_score,
      metadata: this.calculateMetadataConfidence(finalQuote.metadata),
      line_items: this.calculateLineItemsConfidence(finalQuote.line_items),
      financials: this.calculateFinancialsConfidence(finalQuote.financials),
      cross_model_agreement: secondary ? this.calculateAgreement(primary, secondary) : 1.0,
      arithmetic_consistency: this.calculateArithmeticScore(validation),
      format_validity: this.calculateFormatScore(validation),
    };

    const extraction_metadata: ExtractionMetadata = {
      models_used: modelsUsed,
      extraction_method: consensus ? 'consensus' : secondary ? 'fallback' : 'primary',
      processing_time_ms: processingTime,
      page_count: metadata.pageCount,
      ocr_used: metadata.ocrUsed,
    };

    return {
      primary,
      secondary: secondary || undefined,
      consensus: consensus || undefined,
      confidence_breakdown,
      extraction_metadata,
    };
  }

  private calculateMetadataConfidence(metadata: any): number {
    const fields = [
      metadata.supplier_name,
      metadata.quote_number,
      metadata.quote_date,
      metadata.currency,
    ];
    const filledFields = fields.filter(f => f && f !== '').length;
    return filledFields / fields.length;
  }

  private calculateLineItemsConfidence(items: any[]): number {
    if (items.length === 0) return 0;
    const avgConfidence = items.reduce((sum, item) => sum + (item.confidence || 0.5), 0) / items.length;
    return avgConfidence;
  }

  private calculateFinancialsConfidence(financials: any): number {
    if (!financials.grand_total || financials.grand_total <= 0) return 0;
    return financials.subtotal && financials.tax_amount ? 1.0 : 0.7;
  }

  private calculateAgreement(q1: PassiveFireQuoteSchema, q2: PassiveFireQuoteSchema): number {
    let agreements = 0;
    let total = 0;

    if (q1.metadata.supplier_name === q2.metadata.supplier_name) agreements++;
    total++;

    if (q1.line_items.length === q2.line_items.length) agreements++;
    total++;

    const totalDiff = Math.abs(q1.financials.grand_total - q2.financials.grand_total);
    if (totalDiff < 1) {
      agreements++;
    } else if (totalDiff / q1.financials.grand_total < 0.05) {
      agreements += 0.5;
    }
    total++;

    return agreements / total;
  }

  private calculateArithmeticScore(validation: any): number {
    const arithmeticChecks = validation.checks.filter((c: any) =>
      c.name.includes('sum') || c.name.includes('total') || c.name.includes('equals')
    );
    if (arithmeticChecks.length === 0) return 0.5;
    const passed = arithmeticChecks.filter((c: any) => c.passed).length;
    return passed / arithmeticChecks.length;
  }

  private calculateFormatScore(validation: any): number {
    const formatErrors = validation.errors.filter((e: any) => e.type === 'format').length;
    const formatWarnings = validation.warnings.filter((w: any) => w.type === 'unusual_format').length;
    return Math.max(0, 1 - (formatErrors * 0.2) - (formatWarnings * 0.05));
  }

  private getSchema(): any {
    return {
      type: 'object',
      properties: {
        metadata: {
          type: 'object',
          properties: {
            supplier_name: { type: 'string' },
            quote_number: { type: 'string' },
            quote_date: { type: 'string' },
            quote_reference: { type: 'string' },
            project_name: { type: 'string' },
            customer_name: { type: 'string' },
            currency: { type: 'string' },
            payment_terms: { type: 'string' },
            validity_period: { type: 'string' },
          },
          required: ['supplier_name', 'currency'],
        },
        line_items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              line_number: { type: 'number' },
              item_code: { type: 'string' },
              description: { type: 'string' },
              quantity: { type: 'number' },
              unit: { type: 'string' },
              unit_rate: { type: 'number' },
              line_total: { type: 'number' },
              trade: { type: 'string' },
              system_code: { type: 'string' },
              fire_rating: { type: 'string' },
              notes: { type: 'string' },
              confidence: { type: 'number' },
            },
            required: ['description', 'quantity', 'unit', 'unit_rate', 'line_total'],
          },
        },
        financials: {
          type: 'object',
          properties: {
            subtotal: { type: 'number' },
            tax_rate: { type: 'number' },
            tax_amount: { type: 'number' },
            discount: { type: 'number' },
            grand_total: { type: 'number' },
            currency: { type: 'string' },
          },
          required: ['grand_total', 'currency'],
        },
      },
      required: ['metadata', 'line_items', 'financials'],
    };
  }
}

export const twoPassExtractor = new TwoPassExtractor();
