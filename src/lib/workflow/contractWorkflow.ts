import { supabase } from '../supabase';

export interface WorkflowStepProgress {
  step_id: string;
  completed: boolean;
  completed_at: string | null;
  completion_percentage: number;
  metadata: Record<string, any>;
}

export const WORKFLOW_STEPS = [
  {
    id: 'summary',
    label: 'Contract Summary',
    description: 'Set up basic contract details including parties, amounts, and key terms',
    stepNumber: 1
  },
  {
    id: 'scope',
    label: 'Scope & Systems',
    description: 'Define work packages and systems included in the contract',
    stepNumber: 2
  },
  {
    id: 'inclusions',
    label: 'Inclusions & Exclusions',
    description: 'Clarify scope boundaries and what is/is not included',
    stepNumber: 3
  },
  {
    id: 'allowances',
    label: 'Allowances',
    description: 'Add provisional sums, prime costs, and contingencies',
    stepNumber: 4
  },
  {
    id: 'onboarding',
    label: 'Subcontractor Onboarding',
    description: 'Manage LOI, compliance documents, and pre-let appendix',
    stepNumber: 5
  },
  {
    id: 'handover',
    label: 'Site Handover',
    description: 'Generate handover documentation and site packs',
    stepNumber: 6
  }
] as const;

export type WorkflowStepId = typeof WORKFLOW_STEPS[number]['id'];

export async function getWorkflowProgress(projectId: string): Promise<WorkflowStepProgress[]> {
  const { data, error } = await supabase.rpc('get_workflow_progress', {
    p_project_id: projectId
  });

  if (error) {
    console.error('Error fetching workflow progress:', error);
    return [];
  }

  return data || [];
}

export async function updateWorkflowStep(
  projectId: string,
  stepId: WorkflowStepId,
  completed: boolean,
  completionPercentage: number = 0,
  metadata: Record<string, any> = {}
): Promise<void> {
  const { error } = await supabase.rpc('update_workflow_step', {
    p_project_id: projectId,
    p_step_id: stepId,
    p_completed: completed,
    p_completion_percentage: completionPercentage,
    p_metadata: metadata
  });

  if (error) {
    console.error('Error updating workflow step:', error);
    throw error;
  }
}

export async function calculateStepCompletion(
  projectId: string,
  stepId: WorkflowStepId
): Promise<{ completed: boolean; percentage: number; metadata: Record<string, any> }> {
  switch (stepId) {
    case 'summary':
      return await checkSummaryCompletion(projectId);
    case 'scope':
      return await checkScopeCompletion(projectId);
    case 'inclusions':
      return await checkInclusionsCompletion(projectId);
    case 'allowances':
      return await checkAllowancesCompletion(projectId);
    case 'onboarding':
      return await checkOnboardingCompletion(projectId);
    case 'handover':
      return await checkHandoverCompletion(projectId);
    default:
      return { completed: false, percentage: 0, metadata: {} };
  }
}

async function checkSummaryCompletion(projectId: string) {
  const { data: project } = await supabase
    .from('projects')
    .select('name, client, contract_value, project_manager_name, project_manager_email')
    .eq('id', projectId)
    .single();

  const { data: awardReport } = await supabase
    .from('award_reports')
    .select('supplier_name, total_amount')
    .eq('project_id', projectId)
    .eq('status', 'approved')
    .maybeSingle();

  const requiredFields = [
    project?.name,
    project?.client,
    awardReport?.supplier_name,
    awardReport?.total_amount
  ];

  const filledFields = requiredFields.filter(Boolean).length;
  const percentage = Math.round((filledFields / requiredFields.length) * 100);

  return {
    completed: percentage === 100,
    percentage,
    metadata: {
      hasProject: !!project?.name,
      hasClient: !!project?.client,
      hasSupplier: !!awardReport?.supplier_name,
      hasAmount: !!awardReport?.total_amount
    }
  };
}

async function checkScopeCompletion(projectId: string) {
  const { data: quoteItems } = await supabase
    .from('quote_items')
    .select('id, service_type')
    .eq('project_id', projectId);

  const totalItems = quoteItems?.length || 0;
  const itemsWithServiceType = quoteItems?.filter(item => item.service_type).length || 0;

  const percentage = totalItems > 0 ? Math.round((itemsWithServiceType / totalItems) * 100) : 0;

  return {
    completed: totalItems > 0 && percentage >= 80,
    percentage,
    metadata: {
      totalItems,
      itemsWithServiceType,
      serviceTypes: [...new Set(quoteItems?.map(item => item.service_type).filter(Boolean))]
    }
  };
}

async function checkInclusionsCompletion(projectId: string) {
  const { data: inclusions } = await supabase
    .from('contract_inclusions_exclusions')
    .select('id')
    .eq('project_id', projectId);

  const hasInclusions = (inclusions?.length || 0) > 0;
  const percentage = hasInclusions ? 100 : 0;

  return {
    completed: hasInclusions,
    percentage,
    metadata: {
      totalCount: inclusions?.length || 0
    }
  };
}

async function checkAllowancesCompletion(projectId: string) {
  const { data: allowances } = await supabase
    .from('contract_allowances')
    .select('id, description, total')
    .eq('project_id', projectId);

  const totalAllowances = allowances?.length || 0;
  const completeAllowances = allowances?.filter(a => a.description && a.total).length || 0;

  const percentage = totalAllowances > 0 ? Math.round((completeAllowances / totalAllowances) * 100) : 0;

  return {
    completed: totalAllowances > 0 && percentage === 100,
    percentage: totalAllowances === 0 ? 100 : percentage,
    metadata: {
      totalAllowances,
      completeAllowances
    }
  };
}

async function checkOnboardingCompletion(projectId: string) {
  const { data: onboarding } = await supabase
    .from('subcontractor_onboarding')
    .select('status')
    .eq('project_id', projectId)
    .maybeSingle();

  const hasOnboarding = !!onboarding;
  const isComplete = onboarding?.status === 'completed';

  return {
    completed: isComplete,
    percentage: hasOnboarding ? (isComplete ? 100 : 50) : 0,
    metadata: {
      status: onboarding?.status || 'not_started'
    }
  };
}

async function checkHandoverCompletion(projectId: string) {
  const { data: project } = await supabase
    .from('projects')
    .select('handover_pack_generated_at')
    .eq('id', projectId)
    .single();

  const hasHandover = !!project?.handover_pack_generated_at;

  return {
    completed: hasHandover,
    percentage: hasHandover ? 100 : 0,
    metadata: {
      generatedAt: project?.handover_pack_generated_at
    }
  };
}

export async function autoUpdateWorkflowProgress(projectId: string): Promise<void> {
  for (const step of WORKFLOW_STEPS) {
    const completion = await calculateStepCompletion(projectId, step.id);
    await updateWorkflowStep(
      projectId,
      step.id,
      completion.completed,
      completion.percentage,
      completion.metadata
    );
  }
}

export function getCompletedSteps(progress: WorkflowStepProgress[]): string[] {
  return progress.filter(p => p.completed).map(p => p.step_id);
}

export function getNextStep(currentStep: WorkflowStepId, progress: WorkflowStepProgress[]): WorkflowStepId | null {
  const currentIndex = WORKFLOW_STEPS.findIndex(s => s.id === currentStep);
  if (currentIndex === -1 || currentIndex === WORKFLOW_STEPS.length - 1) {
    return null;
  }
  return WORKFLOW_STEPS[currentIndex + 1].id;
}

export function getPreviousStep(currentStep: WorkflowStepId): WorkflowStepId | null {
  const currentIndex = WORKFLOW_STEPS.findIndex(s => s.id === currentStep);
  if (currentIndex <= 0) {
    return null;
  }
  return WORKFLOW_STEPS[currentIndex - 1].id;
}
