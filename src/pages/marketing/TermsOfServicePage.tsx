import React from 'react';
import MarketingLayout from './MarketingLayout';

export default function TermsOfServicePage() {
  return (
    <MarketingLayout>
      <div className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Terms of Service</h1>
        <div className="prose prose-invert max-w-none space-y-6 text-slate-300">
          <p><strong>Effective Date:</strong> January 1, 2025</p>
          <h2 className="text-2xl font-bold text-white mt-8">1. Acceptance of Terms</h2>
          <p>By using PassiveFire Verify+, you agree to these Terms of Service.</p>
          <h2 className="text-2xl font-bold text-white mt-8">2. Service Description</h2>
          <p>PassiveFire Verify+ provides AI-powered passive fire quote auditing tools. These tools assist in analysis but do not replace professional judgment or formal compliance certification.</p>
          <h2 className="text-2xl font-bold text-white mt-8">3. Professional Responsibility</h2>
          <p><strong>Important:</strong> Verify+ is an audit intelligence tool. It does not replace professional engineering judgment or provide formal compliance certification. Final responsibility for compliance remains with qualified professionals.</p>
          <h2 className="text-2xl font-bold text-white mt-8">4. Limitation of Liability</h2>
          <p>The Service is provided "AS IS" without warranties. We are not liable for indirect or consequential damages.</p>
          <h2 className="text-2xl font-bold text-white mt-8">5. Contact</h2>
          <p>Email: <a href="mailto:support@verifytrade.co.nz" className="text-[#fd7e14] hover:underline">support@verifytrade.co.nz</a></p>
        </div>
      </div>
    </MarketingLayout>
  );
}
