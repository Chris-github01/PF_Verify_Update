import React from 'react';
import MarketingLayout from './MarketingLayout';

export default function PrivacyPolicyPage() {
  return (
    <MarketingLayout>
      <div className="py-20 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="text-4xl font-bold mb-8">Privacy Policy</h1>
        <div className="prose prose-invert max-w-none space-y-6 text-slate-300">
          <p><strong>Effective Date:</strong> January 1, 2025</p>
          <h2 className="text-2xl font-bold text-white mt-8">1. Introduction</h2>
          <p>PassiveFire Verify+ is committed to protecting your privacy. This policy explains how we collect, use, and safeguard your information.</p>
          <h2 className="text-2xl font-bold text-white mt-8">2. Information We Collect</h2>
          <p>We collect account information, quote documents, usage data, and payment information you provide.</p>
          <h2 className="text-2xl font-bold text-white mt-8">3. Data Security</h2>
          <p>All data is encrypted with AES-256. We use enterprise-grade Supabase infrastructure hosted in Australia/NZ regions. We never use your data to train AI models.</p>
          <h2 className="text-2xl font-bold text-white mt-8">4. Contact</h2>
          <p>Email: <a href="mailto:support@verifytrade.co.nz" className="text-[#fd7e14] hover:underline">support@verifytrade.co.nz</a></p>
        </div>
      </div>
    </MarketingLayout>
  );
}
