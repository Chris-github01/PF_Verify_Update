import { ChevronDown, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import SubcontractFormField, { FieldDefinition, FieldValue } from './SubcontractFormField';

interface SubcontractFormSectionProps {
  sectionName: string;
  fields: FieldDefinition[];
  values: Record<string, FieldValue>;
  allValues: Record<string, string>;
  onChange: (fieldKey: string, fieldValue: string, comment: string) => void;
  disabled?: boolean;
  showValidation?: boolean;
  defaultExpanded?: boolean;
}

export default function SubcontractFormSection({
  sectionName,
  fields,
  values,
  allValues,
  onChange,
  disabled = false,
  showValidation = false,
  defaultExpanded = false
}: SubcontractFormSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const isFieldRequired = (field: FieldDefinition): boolean => {
    if (field.is_required) return true;

    if (!field.required_when_json || Object.keys(field.required_when_json).length === 0) {
      return false;
    }

    return Object.entries(field.required_when_json).every(([key, requiredValue]) => {
      return allValues[key] === requiredValue;
    });
  };

  const isFieldVisible = (field: FieldDefinition): boolean => {
    if (!field.required_when_json || Object.keys(field.required_when_json).length === 0) {
      return true;
    }

    return Object.entries(field.required_when_json).every(([key, requiredValue]) => {
      return allValues[key] === requiredValue;
    });
  };

  const visibleFields = fields.filter(isFieldVisible);
  const requiredFields = visibleFields.filter(isFieldRequired);
  const completedFields = requiredFields.filter(field => {
    const value = values[field.field_key]?.field_value;
    return value && value.trim() !== '';
  });

  const completionPercentage = requiredFields.length > 0
    ? Math.round((completedFields.length / requiredFields.length) * 100)
    : 100;

  const isComplete = completionPercentage === 100;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-gray-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-gray-400" />
          )}
          <h3 className="text-lg font-semibold text-gray-900">{sectionName}</h3>
          {isComplete ? (
            <CheckCircle2 className="w-5 h-5 text-green-600" />
          ) : showValidation && !isComplete ? (
            <AlertCircle className="w-5 h-5 text-amber-500" />
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-600">
            {completedFields.length} / {requiredFields.length} required fields
          </span>
          <div className="w-32 bg-gray-200 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                isComplete ? 'bg-green-600' : 'bg-blue-600'
              }`}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-6 py-4 space-y-6 border-t border-gray-200 bg-gray-50">
          {visibleFields.map((field) => (
            <SubcontractFormField
              key={field.id}
              definition={field}
              value={values[field.field_key] || { field_value: '', comment: '' }}
              allValues={allValues}
              onChange={onChange}
              disabled={disabled}
              showValidation={showValidation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
