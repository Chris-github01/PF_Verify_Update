import { ChevronDown, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useState } from 'react';
import SubcontractFormField, { FieldDefinition, FieldValue } from './SubcontractFormField';

interface SubcontractFormSectionProps {
  sectionName: string;
  fields: FieldDefinition[];
  values: Record<string, FieldValue>;
  allValues: Record<string, string>;
  onChange: (fieldKey: string, fieldValue: string, comment: string) => void;
  disabled?: boolean;
  defaultExpanded?: boolean;
}

export default function SubcontractFormSection({
  sectionName,
  fields,
  values,
  allValues,
  onChange,
  disabled = false,
  defaultExpanded = false
}: SubcontractFormSectionProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  const isFieldVisible = (field: FieldDefinition): boolean => {
    if (!field.required_when_json || Object.keys(field.required_when_json).length === 0) {
      return true;
    }

    return Object.entries(field.required_when_json).every(([key, requiredValue]) => {
      return allValues[key] === requiredValue;
    });
  };

  const visibleFields = fields.filter(isFieldVisible);
  const filledFields = visibleFields.filter(field => {
    const value = values[field.field_key]?.field_value;
    return value && value.trim() !== '';
  });

  const completionPercentage = visibleFields.length > 0
    ? Math.round((filledFields.length / visibleFields.length) * 100)
    : 100;

  const isComplete = completionPercentage === 100;

  return (
    <div className="border border-slate-700 rounded-lg overflow-hidden bg-slate-800/50 shadow-lg">
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-700/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          {isExpanded ? (
            <ChevronDown className="w-5 h-5 text-slate-400" />
          ) : (
            <ChevronRight className="w-5 h-5 text-slate-400" />
          )}
          <h3 className="text-lg font-semibold text-white">{sectionName}</h3>
          {isComplete && (
            <CheckCircle2 className="w-5 h-5 text-green-500" />
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-300">
            {filledFields.length} / {visibleFields.length} fields
          </span>
          <div className="w-32 bg-slate-700 rounded-full h-2">
            <div
              className={`h-2 rounded-full transition-all ${
                isComplete ? 'bg-green-500' : 'bg-blue-500'
              }`}
              style={{ width: `${completionPercentage}%` }}
            />
          </div>
        </div>
      </button>

      {isExpanded && (
        <div className="px-6 py-4 space-y-6 border-t border-slate-700 bg-slate-900/50">
          {visibleFields.map((field) => (
            <SubcontractFormField
              key={field.id}
              definition={field}
              value={values[field.field_key] || { field_value: '', comment: '' }}
              allValues={allValues}
              onChange={onChange}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}
