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
    id: 'select',
    name: 'Quote Select',
    route: 'quote-select',
    description: 'Select quotes for processing'
  },
  {
    id: 'review',
    name: 'Review & Clean',
    route: 'review-clean',
    description: 'Review and clean imported data'
  },
  {
    id: 'intelligence',
    name: 'Quote Intelligence',
    route: 'quote-intelligence',
    description: 'AI-powered quote analysis'
  },
  {
    id: 'matrix',
    name: 'Scope Matrix',
    route: 'scope-matrix',
    description: 'Build and analyze scope matrix'
  },
  {
    id: 'equalisation',
    name: 'Equalisation Analysis',
    route: 'equalisation',
    description: 'Normalize quotes for fair comparison'
  },
  {
    id: 'quantity-intelligence',
    name: 'Quantity Intelligence',
    route: 'quantity-intelligence',
    description: 'Analyse supplier quantity deviations and variance'
  },
  {
    id: 'boq-builder',
    name: 'BOQ Builder',
    route: 'boq-builder',
    description: 'Build normalised BOQ and detect scope gaps'
  },
  {
    id: 'reports',
    name: 'Award Reports',
    route: 'reports',
    description: 'Generate award and analysis reports'
  },
];

export const TOTAL_WORKFLOW_STEPS = PROJECT_WORKFLOW_STEPS.length;
