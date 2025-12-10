import { supabase } from './supabase';

export interface DemoLimitStatus {
  isDemo: boolean;
  quotesProcessed: number;
  quoteLimit: number;
  canUpload: boolean;
  remaining: number;
}

export async function checkDemoLimit(organisationId: string): Promise<DemoLimitStatus> {
  try {
    const { data: org, error: orgError } = await supabase
      .from('organisations')
      .select('is_demo, demo_account_id')
      .eq('id', organisationId)
      .maybeSingle();

    if (orgError) {
      console.error('Error checking organisation:', orgError);
      return {
        isDemo: false,
        quotesProcessed: 0,
        quoteLimit: Infinity,
        canUpload: true,
        remaining: Infinity,
      };
    }

    if (!org?.is_demo || !org?.demo_account_id) {
      return {
        isDemo: false,
        quotesProcessed: 0,
        quoteLimit: Infinity,
        canUpload: true,
        remaining: Infinity,
      };
    }

    const { data: demoAccount, error: demoError } = await supabase
      .from('demo_accounts')
      .select('quotes_processed, quote_limit, status')
      .eq('id', org.demo_account_id)
      .maybeSingle();

    if (demoError || !demoAccount) {
      console.error('Error fetching demo account:', demoError);
      return {
        isDemo: true,
        quotesProcessed: 0,
        quoteLimit: 2,
        canUpload: false,
        remaining: 0,
      };
    }

    const quotesProcessed = demoAccount.quotes_processed || 0;
    const quoteLimit = demoAccount.quote_limit || 2;
    const canUpload = quotesProcessed < quoteLimit && demoAccount.status === 'active';
    const remaining = Math.max(0, quoteLimit - quotesProcessed);

    return {
      isDemo: true,
      quotesProcessed,
      quoteLimit,
      canUpload,
      remaining,
    };
  } catch (error) {
    console.error('Demo limit check error:', error);
    return {
      isDemo: false,
      quotesProcessed: 0,
      quoteLimit: Infinity,
      canUpload: true,
      remaining: Infinity,
    };
  }
}

export async function incrementDemoUsage(organisationId: string): Promise<boolean> {
  try {
    const { data: org } = await supabase
      .from('organisations')
      .select('demo_account_id')
      .eq('id', organisationId)
      .eq('is_demo', true)
      .maybeSingle();

    if (!org?.demo_account_id) {
      return true;
    }

    const { error } = await supabase.rpc('increment_demo_usage', {
      p_organisation_id: organisationId
    });

    if (error) {
      console.error('Error incrementing demo usage:', error);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Demo increment error:', error);
    return false;
  }
}

export function getDemoLimitMessage(status: DemoLimitStatus): string {
  if (!status.isDemo) {
    return '';
  }

  if (!status.canUpload) {
    return `Demo limit reached – You have processed ${status.quotesProcessed} of ${status.quoteLimit} quotes. Upgrade to Pro for unlimited access.`;
  }

  return `Demo account: ${status.remaining} quote${status.remaining === 1 ? '' : 's'} remaining`;
}
