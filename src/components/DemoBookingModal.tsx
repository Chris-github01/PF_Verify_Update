import { useState } from 'react';
import { X, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface DemoBookingModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface FormData {
  name: string;
  email: string;
  phone: string;
  company: string;
  role: string;
  message: string;
}

export default function DemoBookingModal({ isOpen, onClose }: DemoBookingModalProps) {
  const [formData, setFormData] = useState<FormData>({
    name: '',
    email: '',
    phone: '',
    company: '',
    role: 'Main Contractor',
    message: '',
  });

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }));
  };

  const validateForm = (): string | null => {
    if (!formData.name.trim()) return 'Name is required';
    if (!formData.email.trim()) return 'Email is required';
    if (!formData.company.trim()) return 'Company is required';

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) return 'Please enter a valid email address';

    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const validationError = validateForm();
    if (validationError) {
      setStatus('error');
      setMessage(validationError);
      return;
    }

    setLoading(true);
    setStatus('idle');
    setMessage('');

    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/register_demo_account`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create demo account');
      }

      const emailHtml = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <style>
              body { font-family: Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 0; }
              .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }
              .header { background: #ea580c; padding: 28px 32px; }
              .header h1 { color: #ffffff; margin: 0; font-size: 22px; font-weight: 700; }
              .header p { color: #fed7aa; margin: 6px 0 0; font-size: 14px; }
              .body { padding: 32px; }
              .field { margin-bottom: 20px; }
              .label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #6b7280; margin-bottom: 4px; }
              .value { font-size: 16px; color: #111827; font-weight: 500; }
              .divider { border: none; border-top: 1px solid #e5e7eb; margin: 24px 0; }
              .footer { padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>New Demo Request</h1>
                <p>A prospect has requested a live demo of VerifyTrade.</p>
              </div>
              <div class="body">
                <div class="field">
                  <div class="label">Full Name</div>
                  <div class="value">${formData.name}</div>
                </div>
                <div class="field">
                  <div class="label">Email</div>
                  <div class="value">${formData.email}</div>
                </div>
                <div class="field">
                  <div class="label">Phone</div>
                  <div class="value">${formData.phone || '—'}</div>
                </div>
                <div class="field">
                  <div class="label">Company</div>
                  <div class="value">${formData.company}</div>
                </div>
                <div class="field">
                  <div class="label">Role</div>
                  <div class="value">${formData.role}</div>
                </div>
                ${formData.message ? `
                <hr class="divider" />
                <div class="field">
                  <div class="label">Message</div>
                  <div class="value">${formData.message.replace(/\n/g, '<br />')}</div>
                </div>` : ''}
              </div>
              <div class="footer">
                Submitted via VerifyTrade &mdash; Book a Demo form
              </div>
            </div>
          </body>
        </html>
      `.trim();

      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

      await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          to: 'demo@verifytrade.co.nz',
          cc: 'admin@verifytrade.co.nz',
          reply_to: formData.email,
          subject: 'New Demo Request - VerifyTrade',
          html: emailHtml,
        }),
      });

      setStatus('success');
      setMessage('Demo account created! Check your email for access details.');

      setTimeout(() => {
        onClose();
        setFormData({
          name: '',
          email: '',
          phone: '',
          company: '',
          role: 'Main Contractor',
          message: '',
        });
        setStatus('idle');
        setMessage('');
      }, 3000);

    } catch (error: any) {
      console.error('Demo registration error:', error);
      setStatus('error');
      setMessage(error.message || 'An error occurred. Please try again or contact support.');
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    if (!loading) {
      onClose();
      setFormData({
        name: '',
        email: '',
        phone: '',
        company: '',
        role: 'Main Contractor',
        message: '',
      });
      setStatus('idle');
      setMessage('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm overflow-y-auto">
      <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-md w-full border border-slate-700 overflow-hidden my-8 max-h-[calc(100vh-4rem)]">
        <div className="relative bg-gradient-to-r from-orange-600 to-orange-500 p-6">
          <button
            onClick={handleCancel}
            disabled={loading}
            className="absolute top-4 right-4 text-white hover:bg-white hover:bg-opacity-20 rounded-full p-2 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>

          <h2 className="text-2xl font-bold text-white">Book a Live Demo</h2>
          <p className="text-orange-100 mt-2 text-sm">
            See exactly how VerifyTrade audits quotes, catches scope gaps, and generates award recommendations in a 20-minute walkthrough.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[calc(100vh-16rem)]">
          {status !== 'idle' && (
            <div className={`flex items-start gap-3 p-4 rounded-lg ${
              status === 'success'
                ? 'bg-green-500 bg-opacity-10 border border-green-500'
                : 'bg-red-500 bg-opacity-10 border border-red-500'
            }`}>
              {status === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
              )}
              <p className={`text-sm ${status === 'success' ? 'text-green-200' : 'text-red-200'}`}>
                {message}
              </p>
            </div>
          )}

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-slate-300 mb-2">
              Full Name *
            </label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleChange}
              placeholder="Enter your full name"
              required
              disabled={loading || status === 'success'}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-300 mb-2">
              Email Address *
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="your.email@company.com"
              required
              disabled={loading || status === 'success'}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-slate-300 mb-2">
              Phone Number
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="Enter your phone number"
              disabled={loading || status === 'success'}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="company" className="block text-sm font-medium text-slate-300 mb-2">
              Company Name *
            </label>
            <input
              type="text"
              id="company"
              name="company"
              value={formData.company}
              onChange={handleChange}
              placeholder="Enter your company name"
              required
              disabled={loading || status === 'success'}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          <div>
            <label htmlFor="role" className="block text-sm font-medium text-slate-300 mb-2">
              Role
            </label>
            <select
              id="role"
              name="role"
              value={formData.role}
              onChange={handleChange}
              disabled={loading || status === 'success'}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value="Main Contractor">Main Contractor</option>
              <option value="Project Manager">Project Manager</option>
              <option value="Quantity Surveyor">Quantity Surveyor</option>
              <option value="Estimator">Estimator</option>
              <option value="Fire Engineer">Fire Engineer</option>
              <option value="Consultant">Consultant</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label htmlFor="message" className="block text-sm font-medium text-slate-300 mb-2">
              Message (Optional)
            </label>
            <textarea
              id="message"
              name="message"
              value={formData.message}
              onChange={handleChange}
              placeholder="Tell us about your project or any specific requirements for the demo"
              rows={3}
              disabled={loading || status === 'success'}
              className="w-full px-4 py-3 bg-slate-800 border border-slate-600 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed resize-none"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              disabled={loading || status === 'success'}
              className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || status === 'success'}
              className="flex-1 px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Creating...
                </>
              ) : status === 'success' ? (
                <>
                  <CheckCircle2 className="w-5 h-5" />
                  Sent!
                </>
              ) : (
                'Request Demo'
              )}
            </button>
          </div>

          <p className="text-xs text-slate-500 text-center pt-2">
            By submitting, you agree to receive emails about your demo account. Your data is handled securely in compliance with GDPR.
          </p>
        </form>
      </div>
    </div>
  );
}
