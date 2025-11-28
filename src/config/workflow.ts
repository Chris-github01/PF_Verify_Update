export interface WorkflowStep {
  id: string;
  name: string;
  route: string;
  description?: string;
}

export const PROJECT_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'import',
    name: 'Import Quotes',
    route: 'quotes',
    description: 'Import quotes from suppliers'
  },
  {
    id: 'review',
    name: 'Review & Clean',
    route: 'review-clean',
    description: 'Review and clean imported data'
  },
  {
    id: 'matrix',
    name: 'Scope Matrix',
    route: 'scope-matrix',
    description: 'Build and analyze scope matrix'
  },
  {
    id: 'intelligence',
    name: 'Quote Intelligence',
    route: 'quote-intelligence',
    description: 'AI-powered quote analysis'
  },
  {
    id: 'reports',
    name: 'Reports',
    route: 'reports',
    description: 'Generate award and analysis reports'
  },
];

export const TOTAL_WORKFLOW_STEPS = PROJECT_WORKFLOW_STEPS.length;
