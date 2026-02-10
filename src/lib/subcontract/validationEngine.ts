import { FieldDefinition, FieldValue } from '../../components/SubcontractFormField';

export interface ValidationError {
  fieldKey: string;
  fieldLabel: string;
  section: string;
  errorType: 'required' | 'regex' | 'conditional';
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  completionPercentage: number;
  totalRequired: number;
  totalCompleted: number;
}

export class SubcontractValidationEngine {
  private fields: FieldDefinition[];
  private values: Record<string, FieldValue>;

  constructor(fields: FieldDefinition[], values: Record<string, FieldValue>) {
    this.fields = fields;
    this.values = values;
  }

  private getAllValuesMap(): Record<string, string> {
    const map: Record<string, string> = {};
    for (const [key, value] of Object.entries(this.values)) {
      map[key] = value.field_value || '';
    }
    return map;
  }

  private isFieldVisible(field: FieldDefinition): boolean {
    if (!field.required_when_json || Object.keys(field.required_when_json).length === 0) {
      return true;
    }

    const allValues = this.getAllValuesMap();
    return Object.entries(field.required_when_json).every(([key, requiredValue]) => {
      return allValues[key] === requiredValue;
    });
  }

  private isFieldRequired(field: FieldDefinition): boolean {
    if (field.is_required) {
      return true;
    }

    if (!field.required_when_json || Object.keys(field.required_when_json).length === 0) {
      return false;
    }

    const allValues = this.getAllValuesMap();
    return Object.entries(field.required_when_json).every(([key, requiredValue]) => {
      return allValues[key] === requiredValue;
    });
  }

  private isFieldEmpty(fieldValue: string | undefined): boolean {
    return !fieldValue || fieldValue.trim() === '';
  }

  private validateRegex(field: FieldDefinition, fieldValue: string): boolean {
    if (!field.validation_regex || !fieldValue) {
      return true;
    }

    try {
      const regex = new RegExp(field.validation_regex);
      return regex.test(fieldValue);
    } catch {
      return true;
    }
  }

  validate(): ValidationResult {
    const errors: ValidationError[] = [];
    const allValues = this.getAllValuesMap();

    const visibleFields = this.fields.filter(f => this.isFieldVisible(f));
    const requiredFields = visibleFields.filter(f => this.isFieldRequired(f));

    let completedCount = 0;

    for (const field of visibleFields) {
      const fieldValue = this.values[field.field_key]?.field_value;
      const isEmpty = this.isFieldEmpty(fieldValue);
      const isRequired = this.isFieldRequired(field);

      if (isRequired && isEmpty) {
        errors.push({
          fieldKey: field.field_key,
          fieldLabel: field.field_label,
          section: field.section,
          errorType: field.is_required ? 'required' : 'conditional',
          message: field.is_required
            ? `${field.field_label} is required`
            : `${field.field_label} is required when certain conditions are met`
        });
      } else if (!isEmpty) {
        if (isRequired) {
          completedCount++;
        }

        if (!this.validateRegex(field, fieldValue || '')) {
          errors.push({
            fieldKey: field.field_key,
            fieldLabel: field.field_label,
            section: field.section,
            errorType: 'regex',
            message: `${field.field_label} format is invalid`
          });
        }
      }
    }

    const completionPercentage = requiredFields.length > 0
      ? Math.round((completedCount / requiredFields.length) * 100)
      : 100;

    return {
      isValid: errors.length === 0,
      errors,
      completionPercentage,
      totalRequired: requiredFields.length,
      totalCompleted: completedCount
    };
  }

  validateSection(sectionName: string): ValidationResult {
    const sectionFields = this.fields.filter(f => f.section === sectionName);
    const sectionEngine = new SubcontractValidationEngine(sectionFields, this.values);
    return sectionEngine.validate();
  }

  getRequiredFieldsForSection(sectionName: string): FieldDefinition[] {
    const sectionFields = this.fields.filter(f => f.section === sectionName);
    return sectionFields.filter(f => this.isFieldVisible(f) && this.isFieldRequired(f));
  }

  getCompletedFieldsForSection(sectionName: string): FieldDefinition[] {
    const requiredFields = this.getRequiredFieldsForSection(sectionName);
    return requiredFields.filter(f => {
      const fieldValue = this.values[f.field_key]?.field_value;
      return !this.isFieldEmpty(fieldValue);
    });
  }

  getSectionCompletionStatus(): Record<string, { completed: number; required: number; percentage: number }> {
    const sections = [...new Set(this.fields.map(f => f.section))];
    const status: Record<string, { completed: number; required: number; percentage: number }> = {};

    for (const section of sections) {
      const required = this.getRequiredFieldsForSection(section).length;
      const completed = this.getCompletedFieldsForSection(section).length;
      const percentage = required > 0 ? Math.round((completed / required) * 100) : 100;

      status[section] = { completed, required, percentage };
    }

    return status;
  }

  canComplete(): { canComplete: boolean; blockingErrors: ValidationError[] } {
    const result = this.validate();
    const blockingErrors = result.errors.filter(e =>
      e.errorType === 'required' || e.errorType === 'conditional'
    );

    return {
      canComplete: blockingErrors.length === 0,
      blockingErrors
    };
  }
}

export function groupErrorsBySection(errors: ValidationError[]): Record<string, ValidationError[]> {
  const grouped: Record<string, ValidationError[]> = {};

  for (const error of errors) {
    if (!grouped[error.section]) {
      grouped[error.section] = [];
    }
    grouped[error.section].push(error);
  }

  return grouped;
}

export function formatValidationReport(result: ValidationResult): string {
  if (result.isValid) {
    return 'All validation checks passed. Agreement is ready for completion.';
  }

  const grouped = groupErrorsBySection(result.errors);
  const sections = Object.keys(grouped);

  let report = `Validation Report - ${result.errors.length} issue(s) found:\n\n`;

  for (const section of sections) {
    const sectionErrors = grouped[section];
    report += `${section} (${sectionErrors.length} issue${sectionErrors.length !== 1 ? 's' : ''}):\n`;

    for (const error of sectionErrors) {
      report += `  - ${error.message}\n`;
    }

    report += '\n';
  }

  report += `Overall completion: ${result.totalCompleted} / ${result.totalRequired} required fields (${result.completionPercentage}%)`;

  return report;
}
