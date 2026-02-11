import { CheckCircle2, Circle, ChevronRight } from 'lucide-react';
import { FieldDefinition, FieldValue } from './SubcontractFormField';

interface ChecklistSection {
  name: string;
  totalFields: number;
  filledFields: number;
}

interface SubcontractChecklistProps {
  sections: string[];
  fieldsBySection: Record<string, FieldDefinition[]>;
  values: Record<string, FieldValue>;
  allValues: Record<string, string>;
  onNavigateToSection: (sectionName: string) => void;
}

export default function SubcontractChecklist({
  sections,
  fieldsBySection,
  values,
  allValues,
  onNavigateToSection
}: SubcontractChecklistProps) {
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
    const filledFields = visibleFields.filter(field => {
      const value = values[field.field_key]?.field_value;
      return value && value.trim() !== '';
    });

    return {
      name: sectionName,
      totalFields: visibleFields.length,
      filledFields: filledFields.length
    };
  });

  const totalFields = checklistData.reduce((sum, section) => sum + section.totalFields, 0);
  const totalFilled = checklistData.reduce((sum, section) => sum + section.filledFields, 0);
  const overallPercentage = totalFields > 0 ? Math.round((totalFilled / totalFields) * 100) : 100;
  const isFullyComplete = overallPercentage === 100;

  return (
    <div className="bg-slate-800/50 border border-slate-700 rounded-lg shadow-lg">
      <div className="px-6 py-4 border-b border-slate-700 bg-gradient-to-r from-blue-900/20 to-slate-800/50">
        <h3 className="text-lg font-semibold text-white mb-2">Practical Checklist</h3>
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="w-full bg-slate-700 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all ${
                  isFullyComplete ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${overallPercentage}%` }}
              />
            </div>
          </div>
          <div className="text-sm font-medium">
            <span className={isFullyComplete ? 'text-green-400' : 'text-blue-400'}>
              {totalFilled} / {totalFields}
            </span>
            <span className="text-slate-400 ml-1">({overallPercentage}%)</span>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2 max-h-96 overflow-y-auto scrollbar-thin">
        {checklistData.map((section) => {
          const isComplete = section.filledFields === section.totalFields;
          const percentage = section.totalFields > 0
            ? Math.round((section.filledFields / section.totalFields) * 100)
            : 100;

          return (
            <button
              key={section.name}
              onClick={() => onNavigateToSection(section.name)}
              className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-slate-700/50 transition-colors text-left group"
            >
              {isComplete ? (
                <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
              ) : (
                <Circle className="w-5 h-5 text-slate-500 flex-shrink-0" />
              )}

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium text-white truncate">
                    {section.name}
                  </span>
                  <span className="text-xs text-slate-400 ml-2 flex-shrink-0">
                    {section.filledFields} / {section.totalFields}
                  </span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all ${
                      isComplete ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${percentage}%` }}
                  />
                </div>
              </div>

              <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-slate-300 flex-shrink-0" />
            </button>
          );
        })}
      </div>

      {isFullyComplete && (
        <div className="px-6 py-4 border-t border-slate-700 bg-green-900/20">
          <div className="flex items-center gap-2 text-green-300">
            <CheckCircle2 className="w-5 h-5" />
            <span className="text-sm font-medium">
              All fields completed. Ready to finalize.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
