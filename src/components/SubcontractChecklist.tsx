import { CheckCircle2, Circle, AlertCircle, ChevronRight } from 'lucide-react';
import { FieldDefinition, FieldValue } from './SubcontractFormField';

interface ChecklistSection {
  name: string;
  requiredFields: number;
  completedFields: number;
  hasErrors: boolean;
}

interface SubcontractChecklistProps {
  sections: string[];
  fieldsBySection: Record<string, FieldDefinition[]>;
  values: Record<string, FieldValue>;
  allValues: Record<string, string>;
  onNavigateToSection: (sectionName: string) => void;
  showValidation?: boolean;
}

export default function SubcontractChecklist({
  sections,
  fieldsBySection,
  values,
  allValues,
  onNavigateToSection,
  showValidation = false
}: SubcontractChecklistProps) {
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

  const checklistData: ChecklistSection[] = sections.map(sectionName => {
    const fields = fieldsBySection[sectionName] || [];
    const visibleFields = fields.filter(isFieldVisible);
    const requiredFields = visibleFields.filter(isFieldRequired);
    const completedFields = requiredFields.filter(field => {
      const value = values[field.field_key]?.field_value;
      return value && value.trim() !== '';
    });

    const hasErrors = showValidation && completedFields.length < requiredFields.length;

    return {
      name: sectionName,
      requiredFields: requiredFields.length,
      completedFields: completedFields.length,
      hasErrors
    };
  });

  const totalRequired = checklistData.reduce((sum, section) => sum + section.requiredFields, 0);
  const totalCompleted = checklistData.reduce((sum, section) => sum + section.completedFields, 0);
  const overallPercentage = totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 100;
  const isFullyComplete = overallPercentage === 100;

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
      <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-blue-50 to-white">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Practical Checklist</h3>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="w-full bg-gray-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  isFullyComplete ? 'bg-green-600' : 'bg-blue-600'
                }`}
                style={{ width: `${overallPercentage}%` }}
              />
            </div>
          </div>
          <div className="text-sm font-medium">
            <span className={isFullyComplete ? 'text-green-600' : 'text-blue-600'}>
              {totalCompleted} / {totalRequired}
            </span>
            <span className="text-gray-500 ml-1">({overallPercentage}%)</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2 max-h-96 overflow-y-auto">
        {checklistData.map((section) => {
          const isComplete = section.completedFields === section.requiredFields;
          const percentage = section.requiredFields > 0
            ? Math.round((section.completedFields / section.requiredFields) * 100)
            : 100;

          return (
            <button
              key={section.name}
              onClick={() => onNavigateToSection(section.name)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 transition-colors text-left group"
            >
              {isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
              ) : section.hasErrors ? (
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-gray-300 flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {section.name}
                  </span>
                  <span className="text-xs text-gray-500 ml-2 flex-shrink-0">
                    {section.completedFields} / {section.requiredFields}
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      isComplete ? 'bg-green-600' : 'bg-blue-600'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
            </button>
          );
        })}
      </div>

      {isFullyComplete && (
        <div className="px-6 py-4 border-t border-gray-200 bg-green-50">
          <div className="flex items-center gap-2 text-green-800">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">
              All required fields completed. Ready to finalize.
            </span>
          </div>
        </div>
      )}

      {!isFullyComplete && showValidation && (
        <div className="px-6 py-4 border-t border-gray-200 bg-amber-50">
          <div className="flex items-center gap-2 text-amber-800">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm font-medium">
              {totalRequired - totalCompleted} required field{totalRequired - totalCompleted !== 1 ? 's' : ''} remaining
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
