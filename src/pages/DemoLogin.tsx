import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Loader2, CheckCircle2, AlertCircle, ExternalLink } from 'lucide-react';

export default function DemoLogin() {
  const [status, setStatus] = useState<'validating' | 'success' | 'error' | 'expired'>('validating');
  const [message, setMessage] = useState('Validating your demo access...');
  const [organisationId, setOrganisationId] = useState<string | null>(null);

  useEffect(() => {
    validateAndLogin();
  }, []);

  const validateAndLogin = async () => {
    try {
      const params = new URLSearchParams(window.location.search);
      const token = params.get('token');

      if (!token) {
        setStatus('error');
        setMessage('No access token provided. Please use the link from your email.');
        return;
      }

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/validate_demo_token`;
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ token }),
      });

      if (!response.ok) {
        throw new Error('Failed to validate token');
      }

      const data = await response.json();

      if (!data.valid) {
        setStatus('expired');
        setMessage('This demo access link has expired. Please request a new demo.');
        return;
      }

      const { data: { session }, error: signInError } = await supabase.auth.signInWithPassword({
        email: data.email,
        password: data.temp_password || data.email,
      });

      if (signInError) {
        console.error('Sign in error:', signInError);
        setStatus('error');
        setMessage('Failed to sign in. Please contact support.');
        return;
      }

      setOrganisationId(data.organisation_id);
      setStatus('success');
      setMessage('Demo access verified! Redirecting to your dashboard...');

      localStorage.setItem('currentOrganisationId', data.organisation_id);
      localStorage.setItem('isDemoAccount', 'true');

      setTimeout(() => {
        window.location.href = '/';
      }, 2000);

    } catch (error) {
      console.error('Demo login error:', error);
      setStatus('error');
      setMessage('An error occurred while validating your demo access. Please try again or contact support.');
    }
  };

  const handleRequestNewDemo = () => {
    window.location.href = '/pricing';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-8">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-orange-100 mb-4">
            {status === 'validating' && <Loader2 className="w-8 h-8 text-orange-600 animate-spin" />}
            {status === 'success' && <CheckCircle2 className="w-8 h-8 text-green-600" />}
            {(status === 'error' || status === 'expired') && <AlertCircle className="w-8 h-8 text-red-600" />}
          </div>

          <h1 className="text-2xl font-bold text-slate-900 mb-2">
            {status === 'validating' && 'Validating Demo Access'}
            {status === 'success' && 'Welcome to Verify+!'}
            {status === 'error' && 'Access Error'}
            {status === 'expired' && 'Link Expired'}
          </h1>

          <p className="text-slate-600 mb-6">{message}</p>

          {status === 'success' && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
              <p className="text-sm text-green-800">
                You will be automatically redirected to your demo dashboard in a moment.
              </p>
            </div>
          )}

          {status === 'expired' && (
            <button
              onClick={handleRequestNewDemo}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              Request New Demo
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          {status === 'error' && (
            <div className="space-y-3">
              <button
                onClick={() => window.location.reload()}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-3 px-4 rounded-lg transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={handleRequestNewDemo}
                className="w-full bg-slate-200 hover:bg-slate-300 text-slate-900 font-medium py-3 px-4 rounded-lg transition-colors"
              >
                Request New Demo
              </button>
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-slate-200">
            <p className="text-xs text-slate-500">
              Need help? Contact us at{' '}
              <a href="mailto:support@passivefireverify.com" className="text-orange-600 hover:text-orange-700">
                support@passivefireverify.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
