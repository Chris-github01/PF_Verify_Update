/**
 * Gotenberg Health Check Utility
 * Use this to verify Gotenberg service availability
 */

import { supabase } from '../supabase';

export interface GotenbergHealthResult {
  available: boolean;
  message: string;
  responseTime?: number;
  error?: string;
}

/**
 * Check if Gotenberg service is available and healthy
 * This is a simple connectivity test via the edge function
 */
export async function checkGotenbergHealth(): Promise<GotenbergHealthResult> {
  const startTime = Date.now();

  try {
    const { data: { session } } = await supabase.auth.getSession();
    const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate_pdf_gotenberg`;

    // Send a minimal test request
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session?.access_token || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        htmlContent: '<html><body><h1>Health Check</h1></body></html>',
        filename: 'health_check',
        reportType: 'Health Check'
      }),
    });

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      return {
        available: true,
        message: 'Gotenberg service is healthy and responding',
        responseTime
      };
    } else {
      const errorData = await response.json().catch(() => ({ message: 'Unknown error' }));

      // Check if it's a configuration error (service exists but not configured)
      if (errorData.message?.includes('GOTENBERG_URL')) {
        return {
          available: false,
          message: 'Gotenberg service not configured',
          error: 'GOTENBERG_URL environment variable not set',
          responseTime
        };
      }

      return {
        available: false,
        message: 'Gotenberg service returned an error',
        error: errorData.message || `HTTP ${response.status}`,
        responseTime
      };
    }
  } catch (error) {
    const responseTime = Date.now() - startTime;

    return {
      available: false,
      message: 'Failed to reach Gotenberg service',
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime
    };
  }
}

/**
 * Get a human-readable status message for display
 */
export function getHealthStatusDisplay(health: GotenbergHealthResult): {
  status: 'healthy' | 'warning' | 'error';
  color: string;
  icon: string;
  title: string;
  description: string;
} {
  if (health.available) {
    return {
      status: 'healthy',
      color: 'green',
      icon: '✓',
      title: 'PDF Service Online',
      description: `Responding in ${health.responseTime}ms`
    };
  }

  if (health.error?.includes('GOTENBERG_URL')) {
    return {
      status: 'warning',
      color: 'yellow',
      icon: '⚠',
      title: 'PDF Service Not Configured',
      description: 'Contact administrator to configure Gotenberg URL'
    };
  }

  return {
    status: 'error',
    color: 'red',
    icon: '✗',
    title: 'PDF Service Unavailable',
    description: health.error || 'Service not responding'
  };
}
