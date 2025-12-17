import { ArrowLeft } from 'lucide-react';

interface PrivacyPolicyProps {
  onBack: () => void;
}

export default function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <button
          onClick={onBack}
          className="mb-8 flex items-center gap-2 text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          Back to Home
        </button>

        <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-8 md:p-12 border border-slate-700/50">
          <h1 className="text-4xl font-bold text-white mb-4">Privacy Policy</h1>
          <p className="text-slate-400 mb-8">Last Updated: December 17, 2025</p>

          <div className="space-y-8 text-slate-300">
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">1. Introduction</h2>
              <p className="mb-4">
                VerifyTrade ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy explains how we collect, use, disclose, and safeguard your information when you use our AI-powered quote auditing platform (the "Service").
              </p>
              <p>
                By using VerifyTrade, you agree to the collection and use of information in accordance with this policy. If you do not agree with our policies and practices, please do not use our Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">2. Information We Collect</h2>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">2.1 Personal Information</h3>
              <p className="mb-3">We collect personal information that you voluntarily provide to us when you:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Register for an account (name, email address, phone number, company name, role)</li>
                <li>Subscribe to our services (billing information, payment details)</li>
                <li>Contact us for support (communication records, correspondence)</li>
                <li>Participate in surveys or promotions (responses, feedback)</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">2.2 Business Data</h3>
              <p className="mb-3">When you use our Service, we collect and process:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Quote documents (PDFs, Excel files, images)</li>
                <li>Project information (project names, client references, specifications)</li>
                <li>Pricing data and line items from uploaded quotes</li>
                <li>System configurations and mapping preferences</li>
                <li>Generated reports and analysis results</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">2.3 Technical Data</h3>
              <p className="mb-3">We automatically collect certain information when you use our Service:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Usage data (features accessed, actions performed, time spent)</li>
                <li>Device information (browser type, operating system, device identifiers)</li>
                <li>Log data (IP address, access times, pages viewed, errors)</li>
                <li>Cookies and similar tracking technologies</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">3. How We Use Your Information</h2>
              <p className="mb-3">We use the collected information for the following purposes:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Service Provision:</strong> To provide, maintain, and improve our AI-powered quote auditing services</li>
                <li><strong>AI Processing:</strong> To analyze quotes using artificial intelligence and machine learning algorithms</li>
                <li><strong>Report Generation:</strong> To create audit reports, recommendations, and insights</li>
                <li><strong>Account Management:</strong> To manage your account, authentication, and access control</li>
                <li><strong>Customer Support:</strong> To respond to inquiries, provide technical assistance, and resolve issues</li>
                <li><strong>Service Improvement:</strong> To understand usage patterns and enhance our platform</li>
                <li><strong>Security:</strong> To detect, prevent, and address technical issues, fraud, and abuse</li>
                <li><strong>Legal Compliance:</strong> To comply with applicable laws, regulations, and legal processes</li>
                <li><strong>Communications:</strong> To send service updates, security alerts, and administrative messages</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">4. AI and Machine Learning Processing</h2>
              <p className="mb-4">
                VerifyTrade uses advanced artificial intelligence and machine learning technologies to analyze your quotes. This includes:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Optical Character Recognition (OCR) to extract text from documents</li>
                <li>Natural Language Processing (NLP) to understand and categorize quote items</li>
                <li>Pattern recognition to identify anomalies, scope gaps, and pricing outliers</li>
                <li>Automated comparison against benchmark data and specifications</li>
              </ul>
              <p className="mt-4">
                Your data may be processed by third-party AI service providers (such as OpenAI, AWS Textract) under strict data processing agreements. We do not use your proprietary business data to train general AI models accessible to others.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">5. Data Storage and Security</h2>
              <p className="mb-4">
                We implement industry-standard security measures to protect your information:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Encryption:</strong> All data is encrypted in transit (TLS/SSL) and at rest (AES-256)</li>
                <li><strong>Access Controls:</strong> Role-based access control (RBAC) and multi-factor authentication (MFA)</li>
                <li><strong>Infrastructure:</strong> Data is stored on secure cloud infrastructure (Supabase/AWS) with regular backups</li>
                <li><strong>Monitoring:</strong> 24/7 security monitoring and intrusion detection systems</li>
                <li><strong>Audits:</strong> Regular security assessments and compliance audits</li>
              </ul>
              <p className="mt-4">
                However, no method of transmission over the internet or electronic storage is 100% secure. While we strive to protect your information, we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">6. Data Sharing and Disclosure</h2>
              <p className="mb-4">We do not sell your personal information. We may share your information only in the following circumstances:</p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">6.1 Service Providers</h3>
              <p className="mb-3">
                We may share data with third-party service providers who perform services on our behalf:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Cloud hosting and infrastructure providers (Supabase, AWS)</li>
                <li>AI and machine learning service providers (OpenAI, AWS Textract)</li>
                <li>Payment processors (Stripe)</li>
                <li>Email service providers (for transactional emails)</li>
                <li>Analytics providers (for usage analysis)</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">6.2 Legal Requirements</h3>
              <p>We may disclose your information if required by law, court order, or governmental authority, or to protect our rights, property, or safety.</p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">6.3 Business Transfers</h3>
              <p>In the event of a merger, acquisition, or sale of assets, your information may be transferred as part of that transaction.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">7. Your Rights and Choices</h2>
              <p className="mb-4">Depending on your location, you may have the following rights regarding your personal information:</p>

              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Access:</strong> Request a copy of the personal information we hold about you</li>
                <li><strong>Correction:</strong> Request correction of inaccurate or incomplete information</li>
                <li><strong>Deletion:</strong> Request deletion of your personal information (subject to legal obligations)</li>
                <li><strong>Data Portability:</strong> Request a copy of your data in a structured, machine-readable format</li>
                <li><strong>Objection:</strong> Object to processing of your personal information for certain purposes</li>
                <li><strong>Restriction:</strong> Request restriction of processing in certain circumstances</li>
                <li><strong>Withdrawal of Consent:</strong> Withdraw consent where processing is based on consent</li>
              </ul>

              <p className="mt-4">
                To exercise these rights, please contact us at privacy@verifytrade.co.nz. We will respond to your request within 30 days.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">8. GDPR Compliance (European Users)</h2>
              <p className="mb-4">
                If you are located in the European Economic Area (EEA), United Kingdom, or Switzerland, we comply with the General Data Protection Regulation (GDPR).
              </p>
              <p className="mb-4"><strong>Legal Basis for Processing:</strong></p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Contract Performance:</strong> Processing necessary to provide our services</li>
                <li><strong>Legitimate Interests:</strong> For service improvement, security, and fraud prevention</li>
                <li><strong>Legal Obligation:</strong> To comply with applicable laws and regulations</li>
                <li><strong>Consent:</strong> Where you have provided explicit consent</li>
              </ul>
              <p className="mt-4">
                You have the right to lodge a complaint with your local data protection authority if you believe we have not complied with applicable data protection laws.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">9. International Data Transfers</h2>
              <p className="mb-4">
                Your information may be transferred to and processed in countries other than your country of residence. These countries may have data protection laws that differ from your jurisdiction.
              </p>
              <p>
                When we transfer data internationally, we implement appropriate safeguards, such as Standard Contractual Clauses approved by the European Commission, to ensure your data receives adequate protection.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">10. Data Retention</h2>
              <p className="mb-4">
                We retain your information for as long as necessary to fulfill the purposes outlined in this Privacy Policy, unless a longer retention period is required by law.
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Account Data:</strong> Retained while your account is active and for 90 days after account closure</li>
                <li><strong>Business Data:</strong> Retained while your account is active and for 90 days after deletion request</li>
                <li><strong>Billing Records:</strong> Retained for 7 years to comply with tax and accounting requirements</li>
                <li><strong>Legal Hold:</strong> Data subject to legal claims or investigations retained until resolution</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">11. Cookies and Tracking Technologies</h2>
              <p className="mb-4">
                We use cookies and similar tracking technologies to enhance your experience on our platform:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li><strong>Essential Cookies:</strong> Required for authentication, security, and basic functionality</li>
                <li><strong>Performance Cookies:</strong> Help us understand how users interact with our Service</li>
                <li><strong>Functional Cookies:</strong> Remember your preferences and settings</li>
              </ul>
              <p className="mt-4">
                You can control cookies through your browser settings. However, disabling certain cookies may limit your ability to use some features of our Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">12. Children's Privacy</h2>
              <p>
                Our Service is not intended for individuals under 18 years of age. We do not knowingly collect personal information from children. If you become aware that a child has provided us with personal information, please contact us, and we will take steps to delete such information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">13. Third-Party Links</h2>
              <p>
                Our Service may contain links to third-party websites or services. We are not responsible for the privacy practices of these third parties. We encourage you to review their privacy policies before providing any information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">14. Changes to This Privacy Policy</h2>
              <p className="mb-4">
                We may update this Privacy Policy from time to time. We will notify you of any material changes by:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Posting the updated policy on our website</li>
                <li>Updating the "Last Updated" date at the top of this policy</li>
                <li>Sending you an email notification (for material changes)</li>
              </ul>
              <p className="mt-4">
                Your continued use of our Service after any changes indicates your acceptance of the updated Privacy Policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">15. Contact Us</h2>
              <p className="mb-4">
                If you have questions, concerns, or requests regarding this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <p className="mb-2"><strong>Email:</strong> privacy@verifytrade.co.nz</p>
                <p className="mb-2"><strong>Data Protection Officer:</strong> dpo@verifytrade.co.nz</p>
                <p className="mb-2"><strong>Support:</strong> support@verifytrade.co.nz</p>
                <p className="mt-4 text-sm text-slate-400">
                  We will respond to your inquiry within 30 days of receipt.
                </p>
              </div>
            </section>

            <section className="mt-12 pt-8 border-t border-slate-700">
              <p className="text-sm text-slate-500">
                This Privacy Policy is governed by the laws of New Zealand. By using VerifyTrade, you consent to the terms outlined in this policy.
              </p>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
