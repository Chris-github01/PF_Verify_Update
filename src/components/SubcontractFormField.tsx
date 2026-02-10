import { MessageSquare, HelpCircle } from 'lucide-react';
import { useState } from 'react';

export interface FieldDefinition {
  id: string;
  field_key: string;
  field_label: string;
  field_type: 'text' | 'textarea' | 'number' | 'date' | 'dropdown' | 'yes_no';
  is_required: boolean;
  required_when_json: Record<string, string>;
  options: string[];
  help_text: string;
  default_value?: string;
  validation_regex?: string;
}

export interface FieldValue {
  field_value: string;
  comment: string;
}

interface SubcontractFormFieldProps {
  definition: FieldDefinition;
  value: FieldValue;
  allValues: Record<string, string>;
  onChange: (fieldKey: string, fieldValue: string, comment: string) => void;
  disabled?: boolean;
  showValidation?: boolean;
}

export default function SubcontractFormField({
  definition,
  value,
  allValues,
  onChange,
  disabled = false,
  showValidation = false
}: SubcontractFormFieldProps) {
  const [showComment, setShowComment] = useState(!!value.comment);
  const [showHelp, setShowHelp] = useState(false);

  const isConditionallyRequired = (): boolean => {
    if (!definition.required_when_json || Object.keys(definition.required_when_json).length === 0) {
      return false;
    }

    return Object.entries(definition.required_when_json).every(([key, requiredValue]) => {
      return allValues[key] === requiredValue;
    });
  };

  const isFieldRequired = definition.is_required || isConditionallyRequired();
  const isFieldVisible = !definition.required_when_json ||
    Object.keys(definition.required_when_json).length === 0 ||
    isConditionallyRequired();

  if (!isFieldVisible) {
    return null;
  }

  const isEmpty = !value.field_value || value.field_value.trim() === '';
  const hasValidationError = showValidation && isFieldRequired && isEmpty;

  const handleValueChange = (newValue: string) => {
    onChange(definition.field_key, newValue, value.comment);
  };

  const handleCommentChange = (newComment: string) => {
    onChange(definition.field_key, value.field_value, newComment);
  };

  const renderInput = () => {
    const baseClasses = `w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors ${
      hasValidationError ? 'border-red-500' : 'border-gray-300'
    } ${disabled ? 'bg-gray-100 cursor-not-allowed' : 'bg-white'}`;

    switch (definition.field_type) {
      case 'text':
        return (
          <input
            type="text"
            value={value.field_value || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            disabled={disabled}
            className={baseClasses}
            placeholder={definition.default_value || ''}
          />
        );

      case 'textarea':
        return (
          <textarea
            value={value.field_value || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            disabled={disabled}
            rows={4}
            className={baseClasses}
            placeholder={definition.default_value || ''}
          />
        );

      case 'number':
        return (
          <input
            type="number"
            value={value.field_value || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            disabled={disabled}
            step="0.01"
            className={baseClasses}
            placeholder={definition.default_value || ''}
          />
        );

      case 'date':
        return (
          <input
            type="date"
            value={value.field_value || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            disabled={disabled}
            className={baseClasses}
          />
        );

      case 'dropdown':
      case 'yes_no':
        return (
          <select
            value={value.field_value || ''}
            onChange={(e) => handleValueChange(e.target.value)}
            disabled={disabled}
            className={baseClasses}
          >
            <option value="">-- Select --</option>
            {definition.options.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <label className="block text-sm font-medium text-gray-700">
          {definition.field_label}
          {isFieldRequired && <span className="text-red-500 ml-1">*</span>}
        </label>
        <div className="flex gap-1">
          {definition.help_text && (
            <button
              type="button"
              onClick={() => setShowHelp(!showHelp)}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Show help"
            >
              <HelpCircle className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowComment(!showComment)}
            className={`transition-colors ${
              value.comment
                ? 'text-blue-600 hover:text-blue-700'
                : 'text-gray-400 hover:text-gray-600'
            }`}
            title={showComment ? 'Hide comment' : 'Add comment'}
            disabled={disabled}
          >
            <MessageSquare className="w-4 h-4" />
          </button>
        </div>
      </div>

      {showHelp && definition.help_text && (
        <div className="text-sm text-gray-600 bg-blue-50 border border-blue-200 rounded-lg p-3">
          {definition.help_text}
        </div>
      )}

      {renderInput()}

      {hasValidationError && (
        <p className="text-sm text-red-600">
          This field is required
        </p>
      )}

      {showComment && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Comment / Note
          </label>
          <textarea
            value={value.comment || ''}
            onChange={(e) => handleCommentChange(e.target.value)}
            disabled={disabled}
            rows={2}
            className="w-full px-2 py-1 text-sm border border-yellow-300 rounded focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 bg-white"
            placeholder="Add a note or clarification about this field..."
          />
        </div>
      )}
    </div>
  );
}
