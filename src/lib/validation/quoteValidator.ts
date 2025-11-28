import type {
  PassiveFireQuoteSchema,
  ValidationResult,
  ValidationError,
  ValidationWarning,
  ValidationCheck,
} from '../../types/extraction.types';

export class QuoteValidator {
  private readonly ROUNDING_TOLERANCE = 0.02;
  private readonly SUSPICIOUS_QTY_THRESHOLD = 10000;
  private readonly MIN_UNIT_RATE = 0.01;
  private readonly MAX_UNIT_RATE = 100000;

  private readonly VALID_UNITS = [
    'm²', 'm2', 'sqm', 'square meter', 'square metre',
    'lm', 'lin.m', 'linear meter', 'linear metre',
    'each', 'ea', 'no', 'item',
    'hour', 'hr', 'hrs',
    'day', 'days',
    'kg', 'kilogram',
    'tonne', 't',
    'litre', 'l', 'ltr'
  ];

  validate(quote: PassiveFireQuoteSchema): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const checks: ValidationCheck[] = [];

    this.validateMetadata(quote, errors, warnings, checks);
    this.validateLineItems(quote, errors, warnings, checks);
    this.validateFinancials(quote, errors, warnings, checks);
    this.validateArithmetic(quote, errors, warnings, checks);

    const confidence_score = this.calculateConfidence(errors, warnings, checks);
    const is_valid = errors.filter(e => e.severity === 'critical').length === 0;

    return {
      is_valid,
      confidence_score,
      errors,
      warnings,
      checks,
    };
  }

  private validateMetadata(
    quote: PassiveFireQuoteSchema,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    checks: ValidationCheck[]
  ): void {
    if (!quote.metadata.supplier_name || quote.metadata.supplier_name.trim() === '') {
      errors.push({
        type: 'missing_required',
        field: 'metadata.supplier_name',
        message: 'Supplier name is required',
        severity: 'critical',
      });
    }

    if (!quote.metadata.quote_date) {
      warnings.push({
        type: 'suspicious_value',
        field: 'metadata.quote_date',
        message: 'Quote date is missing',
      });
    } else {
      const dateCheck = this.validateDate(quote.metadata.quote_date);
      checks.push({
        name: 'quote_date_format',
        passed: dateCheck.valid,
        message: dateCheck.message,
      });
      if (!dateCheck.valid) {
        warnings.push({
          type: 'unusual_format',
          field: 'metadata.quote_date',
          message: dateCheck.message,
        });
      }
    }

    if (!quote.metadata.currency) {
      warnings.push({
        type: 'suspicious_value',
        field: 'metadata.currency',
        message: 'Currency not specified, assuming default',
        suggestion: 'AUD or NZD',
      });
    }

    checks.push({
      name: 'metadata_completeness',
      passed: !!(quote.metadata.supplier_name && quote.metadata.quote_date),
      message: 'Core metadata fields present',
    });
  }

  private validateLineItems(
    quote: PassiveFireQuoteSchema,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    checks: ValidationCheck[]
  ): void {
    if (!quote.line_items || quote.line_items.length === 0) {
      errors.push({
        type: 'missing_required',
        field: 'line_items',
        message: 'No line items found in quote',
        severity: 'critical',
      });
      return;
    }

    const descriptions = new Map<string, number[]>();

    quote.line_items.forEach((item, index) => {
      if (!item.description || item.description.trim() === '') {
        errors.push({
          type: 'missing_required',
          field: `line_items[${index}].description`,
          message: `Line item ${index + 1} has no description`,
          severity: 'high',
        });
      }

      if (item.quantity <= 0) {
        errors.push({
          type: 'arithmetic',
          field: `line_items[${index}].quantity`,
          message: `Line item ${index + 1} has invalid quantity: ${item.quantity}`,
          severity: 'high',
          actual: item.quantity,
        });
      }

      if (item.quantity > this.SUSPICIOUS_QTY_THRESHOLD) {
        warnings.push({
          type: 'suspicious_value',
          field: `line_items[${index}].quantity`,
          message: `Line item ${index + 1} has unusually high quantity: ${item.quantity}`,
        });
      }

      if (item.unit_rate < this.MIN_UNIT_RATE || item.unit_rate > this.MAX_UNIT_RATE) {
        warnings.push({
          type: 'suspicious_value',
          field: `line_items[${index}].unit_rate`,
          message: `Line item ${index + 1} has unusual unit rate: $${item.unit_rate}`,
        });
      }

      if (!this.isValidUnit(item.unit)) {
        warnings.push({
          type: 'unusual_format',
          field: `line_items[${index}].unit`,
          message: `Line item ${index + 1} has non-standard unit: "${item.unit}"`,
          suggestion: this.suggestUnit(item.unit),
        });
      }

      const calculatedTotal = item.quantity * item.unit_rate;
      const difference = Math.abs(calculatedTotal - item.line_total);
      if (difference > this.ROUNDING_TOLERANCE) {
        errors.push({
          type: 'arithmetic',
          field: `line_items[${index}].line_total`,
          message: `Line item ${index + 1}: Qty × Rate ≠ Total (${item.quantity} × $${item.unit_rate} = $${calculatedTotal.toFixed(2)}, but got $${item.line_total})`,
          severity: 'high',
          expected: calculatedTotal,
          actual: item.line_total,
        });
      }

      if (item.description) {
        const desc = item.description.toLowerCase().trim();
        if (!descriptions.has(desc)) {
          descriptions.set(desc, []);
        }
        descriptions.get(desc)!.push(index);
      }
    });

    descriptions.forEach((indices, desc) => {
      if (indices.length > 1) {
        const rates = indices.map(i => quote.line_items[i].unit_rate);
        const uniqueRates = new Set(rates);
        if (uniqueRates.size > 1) {
          warnings.push({
            type: 'duplicate',
            field: 'line_items',
            message: `Duplicate description "${desc}" appears with different rates: ${Array.from(uniqueRates).map(r => `$${r}`).join(', ')}`,
          });
        }
      }
    });

    checks.push({
      name: 'line_items_present',
      passed: quote.line_items.length > 0,
      message: `${quote.line_items.length} line items found`,
    });
  }

  private validateFinancials(
    quote: PassiveFireQuoteSchema,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    checks: ValidationCheck[]
  ): void {
    if (quote.financials.grand_total <= 0) {
      errors.push({
        type: 'arithmetic',
        field: 'financials.grand_total',
        message: 'Grand total must be greater than zero',
        severity: 'critical',
        actual: quote.financials.grand_total,
      });
    }

    if (quote.financials.subtotal && quote.financials.subtotal > quote.financials.grand_total) {
      errors.push({
        type: 'inconsistent',
        field: 'financials.subtotal',
        message: 'Subtotal cannot be greater than grand total',
        severity: 'high',
        expected: `≤ ${quote.financials.grand_total}`,
        actual: quote.financials.subtotal,
      });
    }

    if (quote.financials.tax_rate && (quote.financials.tax_rate < 0 || quote.financials.tax_rate > 0.5)) {
      warnings.push({
        type: 'suspicious_value',
        field: 'financials.tax_rate',
        message: `Unusual tax rate: ${(quote.financials.tax_rate * 100).toFixed(1)}%`,
      });
    }
  }

  private validateArithmetic(
    quote: PassiveFireQuoteSchema,
    errors: ValidationError[],
    warnings: ValidationWarning[],
    checks: ValidationCheck[]
  ): void {
    const lineItemsTotal = quote.line_items.reduce((sum, item) => sum + item.line_total, 0);

    if (quote.financials.subtotal) {
      const difference = Math.abs(lineItemsTotal - quote.financials.subtotal);
      const passed = difference <= this.ROUNDING_TOLERANCE;
      checks.push({
        name: 'line_items_sum_to_subtotal',
        passed,
        message: passed
          ? `Line items sum correctly to subtotal ($${lineItemsTotal.toFixed(2)} ≈ $${quote.financials.subtotal.toFixed(2)})`
          : `Line items sum mismatch: $${lineItemsTotal.toFixed(2)} vs subtotal $${quote.financials.subtotal.toFixed(2)}`,
        details: { lineItemsTotal, subtotal: quote.financials.subtotal, difference },
      });

      if (!passed && difference > 1) {
        errors.push({
          type: 'arithmetic',
          field: 'financials.subtotal',
          message: `Sum of line items ($${lineItemsTotal.toFixed(2)}) does not match subtotal ($${quote.financials.subtotal.toFixed(2)})`,
          severity: 'high',
          expected: lineItemsTotal,
          actual: quote.financials.subtotal,
        });
      }
    }

    if (quote.financials.tax_amount && quote.financials.subtotal) {
      let expectedTotal = quote.financials.subtotal + quote.financials.tax_amount;
      if (quote.financials.discount) {
        expectedTotal -= quote.financials.discount;
      }

      const difference = Math.abs(expectedTotal - quote.financials.grand_total);
      const passed = difference <= this.ROUNDING_TOLERANCE;

      checks.push({
        name: 'subtotal_plus_tax_equals_total',
        passed,
        message: passed
          ? `Subtotal + Tax = Grand Total ($${expectedTotal.toFixed(2)} ≈ $${quote.financials.grand_total.toFixed(2)})`
          : `Grand total mismatch: expected $${expectedTotal.toFixed(2)}, got $${quote.financials.grand_total.toFixed(2)}`,
        details: { expectedTotal, actualTotal: quote.financials.grand_total, difference },
      });

      if (!passed && difference > 1) {
        errors.push({
          type: 'arithmetic',
          field: 'financials.grand_total',
          message: `Grand total ($${quote.financials.grand_total.toFixed(2)}) does not match subtotal + tax ($${expectedTotal.toFixed(2)})`,
          severity: 'high',
          expected: expectedTotal,
          actual: quote.financials.grand_total,
        });
      }
    }

    if (quote.financials.tax_rate && quote.financials.subtotal && quote.financials.tax_amount) {
      const expectedTax = quote.financials.subtotal * quote.financials.tax_rate;
      const difference = Math.abs(expectedTax - quote.financials.tax_amount);
      if (difference > this.ROUNDING_TOLERANCE) {
        warnings.push({
          type: 'inconsistent',
          field: 'financials.tax_amount',
          message: `Tax amount ($${quote.financials.tax_amount.toFixed(2)}) doesn't match rate (${(quote.financials.tax_rate * 100).toFixed(1)}% of $${quote.financials.subtotal.toFixed(2)} = $${expectedTax.toFixed(2)})`,
        });
      }
    }
  }

  private calculateConfidence(
    errors: ValidationError[],
    warnings: ValidationWarning[],
    checks: ValidationCheck[]
  ): number {
    const criticalErrors = errors.filter(e => e.severity === 'critical').length;
    const highErrors = errors.filter(e => e.severity === 'high').length;
    const mediumErrors = errors.filter(e => e.severity === 'medium').length;

    if (criticalErrors > 0) return 0;

    const totalChecks = checks.length;
    const passedChecks = checks.filter(c => c.passed).length;
    const checkScore = totalChecks > 0 ? passedChecks / totalChecks : 0.5;

    const errorPenalty = (highErrors * 0.15) + (mediumErrors * 0.05);
    const warningPenalty = warnings.length * 0.02;

    let confidence = checkScore - errorPenalty - warningPenalty;
    confidence = Math.max(0, Math.min(1, confidence));

    return Math.round(confidence * 100) / 100;
  }

  private validateDate(dateStr: string): { valid: boolean; message: string } {
    const dateFormats = [
      /^\d{4}-\d{2}-\d{2}$/,
      /^\d{2}\/\d{2}\/\d{4}$/,
      /^\d{2}-\d{2}-\d{4}$/,
    ];

    const isValidFormat = dateFormats.some(format => format.test(dateStr));
    if (!isValidFormat) {
      return { valid: false, message: 'Date format not recognized' };
    }

    const date = new Date(dateStr);
    if (isNaN(date.getTime())) {
      return { valid: false, message: 'Invalid date value' };
    }

    const now = new Date();
    const twoYearsAgo = new Date(now.getFullYear() - 2, now.getMonth(), now.getDate());
    const oneYearAhead = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());

    if (date < twoYearsAgo || date > oneYearAhead) {
      return { valid: false, message: 'Date is outside reasonable range (2 years ago to 1 year ahead)' };
    }

    return { valid: true, message: 'Valid date format' };
  }

  private isValidUnit(unit: string): boolean {
    const normalized = unit.toLowerCase().trim();
    return this.VALID_UNITS.some(validUnit => validUnit.toLowerCase() === normalized);
  }

  private suggestUnit(unit: string): string {
    const normalized = unit.toLowerCase().trim();

    if (normalized.includes('sq') || normalized.includes('m2') || normalized.includes('²')) {
      return 'm²';
    }
    if (normalized.includes('lin') || normalized.includes('lm')) {
      return 'lm';
    }
    if (normalized.includes('ea') || normalized.includes('no') || normalized.includes('item')) {
      return 'each';
    }
    if (normalized.includes('hr') || normalized.includes('hour')) {
      return 'hour';
    }

    return 'm²';
  }
}

export const quoteValidator = new QuoteValidator();

import { supabase } from '../supabase';

export interface ReconciliationResult {
  quoteId: string;
  extractedTotal: number;
  pdfTotal: number;
  varianceAmount: number;
  variancePercent: number;
  status: 'passed' | 'failed' | 'pending';
  notes: string;
}

export async function reconcileQuoteTotal(quoteId: string): Promise<ReconciliationResult> {
  const { data, error } = await supabase.rpc('check_quote_reconciliation', {
    quote_id_param: quoteId
  });

  if (error) {
    console.error('Reconciliation check failed:', error);
    throw new Error(`Failed to reconcile quote: ${error.message}`);
  }

  return {
    quoteId: data.quote_id,
    extractedTotal: parseFloat(data.extracted_total || 0),
    pdfTotal: parseFloat(data.pdf_total || 0),
    varianceAmount: parseFloat(data.variance_amount || 0),
    variancePercent: parseFloat(data.variance_percent || 0),
    status: data.status,
    notes: data.notes
  };
}

export async function reconcileProjectQuotes(projectId: string): Promise<ReconciliationResult[]> {
  const { data, error } = await supabase.rpc('check_project_reconciliation', {
    project_id_param: projectId
  });

  if (error) {
    console.error('Project reconciliation failed:', error);
    throw new Error(`Failed to reconcile project quotes: ${error.message}`);
  }

  return data.results.map((result: any) => ({
    quoteId: result.quote_id,
    extractedTotal: parseFloat(result.extracted_total || 0),
    pdfTotal: parseFloat(result.pdf_total || 0),
    varianceAmount: parseFloat(result.variance_amount || 0),
    variancePercent: parseFloat(result.variance_percent || 0),
    status: result.status,
    notes: result.notes
  }));
}

export async function getQuotesNeedingReview(organisationId?: string) {
  let query = supabase
    .from('quotes_needing_review')
    .select('*')
    .order('reconciliation_variance', { ascending: false });

  if (organisationId) {
    query = query.eq('organisation_id', organisationId);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch quotes needing review:', error);
    throw error;
  }

  return data;
}

export async function manualOverrideReconciliation(
  quoteId: string,
  justification: string
): Promise<void> {
  const { error } = await supabase
    .from('quotes')
    .update({
      reconciliation_status: 'manual_override',
      reconciliation_notes: `MANUAL OVERRIDE: ${justification}`,
      reconciliation_checked_at: new Date().toISOString()
    })
    .eq('id', quoteId);

  if (error) {
    console.error('Failed to override reconciliation:', error);
    throw error;
  }
}
