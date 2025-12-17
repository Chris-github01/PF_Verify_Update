import { ArrowLeft } from 'lucide-react';

interface TermsOfServiceProps {
  onBack: () => void;
}

export default function TermsOfService({ onBack }: TermsOfServiceProps) {
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
          <h1 className="text-4xl font-bold text-white mb-4">Terms of Service</h1>
          <p className="text-slate-400 mb-8">Last Updated: December 17, 2025</p>

          <div className="space-y-8 text-slate-300">
            <section>
              <h2 className="text-2xl font-bold text-white mb-4">1. Agreement to Terms</h2>
              <p className="mb-4">
                These Terms of Service ("Terms") constitute a legally binding agreement between you ("User," "you," or "your") and VerifyTrade ("Company," "we," "us," or "our") governing your access to and use of the VerifyTrade platform, including our website, applications, and services (collectively, the "Service").
              </p>
              <p className="mb-4">
                By accessing or using our Service, you agree to be bound by these Terms. If you do not agree to these Terms, you must not access or use the Service.
              </p>
              <p>
                We reserve the right to modify these Terms at any time. Your continued use of the Service after changes are posted constitutes your acceptance of the modified Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">2. Description of Service</h2>
              <p className="mb-4">
                VerifyTrade is an AI-powered quote auditing platform designed for the construction and fire safety industries. Our Service provides:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Automated extraction and analysis of quote documents (PDFs, Excel files)</li>
                <li>AI-powered scope gap detection and compliance checking</li>
                <li>Price benchmarking and variance analysis</li>
                <li>System mapping and specification matching</li>
                <li>Automated report generation and award recommendations</li>
                <li>Quote revision tracking and change detection</li>
                <li>Contract management and variation tracking tools</li>
              </ul>
              <p className="mt-4">
                We reserve the right to modify, suspend, or discontinue any aspect of the Service at any time, with or without notice, without liability to you.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">3. Account Registration and Security</h2>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">3.1 Account Creation</h3>
              <p className="mb-4">To use our Service, you must:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Be at least 18 years of age</li>
                <li>Provide accurate, current, and complete registration information</li>
                <li>Maintain and promptly update your account information</li>
                <li>Have the legal authority to bind your organization to these Terms</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">3.2 Account Security</h3>
              <p className="mb-4">You are responsible for:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Maintaining the confidentiality of your account credentials</li>
                <li>All activities that occur under your account</li>
                <li>Notifying us immediately of any unauthorized access or security breach</li>
                <li>Ensuring your password meets our security requirements</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">3.3 Account Termination</h3>
              <p>
                We reserve the right to suspend or terminate your account at any time for violation of these Terms, fraudulent activity, or any other reason at our sole discretion.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">4. Acceptable Use Policy</h2>
              <p className="mb-4">You agree NOT to use the Service to:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Violate any applicable laws, regulations, or third-party rights</li>
                <li>Upload malicious code, viruses, or harmful software</li>
                <li>Attempt to gain unauthorized access to our systems or other users' data</li>
                <li>Interfere with or disrupt the Service or servers</li>
                <li>Use automated systems (bots, scrapers) without our written permission</li>
                <li>Reverse engineer, decompile, or disassemble any part of the Service</li>
                <li>Remove or alter any proprietary notices or labels</li>
                <li>Use the Service to compete with us or develop competing products</li>
                <li>Share your account access with unauthorized third parties</li>
                <li>Upload content that infringes intellectual property rights</li>
                <li>Transmit spam, chain letters, or unsolicited communications</li>
                <li>Engage in any fraudulent, abusive, or illegal activity</li>
              </ul>
              <p className="mt-4">
                Violation of this Acceptable Use Policy may result in immediate termination of your account and legal action.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">5. Subscription and Payment Terms</h2>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">5.1 Subscription Plans</h3>
              <p className="mb-4">
                We offer various subscription tiers with different features and pricing. Current pricing and plan details are available on our website. We reserve the right to modify our pricing and plans at any time.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">5.2 Free Trials</h3>
              <p className="mb-4">
                We may offer free trial periods for certain subscription plans. At the end of the trial period, your subscription will automatically convert to a paid subscription unless you cancel before the trial ends.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">5.3 Payment Terms</h3>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Subscriptions are billed in advance on a monthly or annual basis</li>
                <li>All fees are non-refundable except as required by law</li>
                <li>You authorize us to charge your payment method for all fees incurred</li>
                <li>You are responsible for all applicable taxes</li>
                <li>Payment processing is handled by third-party providers (Stripe)</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">5.4 Auto-Renewal</h3>
              <p className="mb-4">
                Your subscription will automatically renew at the end of each billing period unless you cancel before the renewal date. We will charge your payment method on file for the renewal.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">5.5 Cancellation</h3>
              <p>
                You may cancel your subscription at any time through your account settings. Cancellation will take effect at the end of your current billing period. You will retain access to the Service until that date.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">5.6 Late Payment</h3>
              <p>
                If payment fails, we reserve the right to suspend or terminate your access to the Service. You remain responsible for all outstanding fees.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">6. Intellectual Property Rights</h2>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">6.1 Our Intellectual Property</h3>
              <p className="mb-4">
                The Service, including all content, features, functionality, software, code, designs, graphics, and trademarks, is owned by VerifyTrade and is protected by international copyright, trademark, and other intellectual property laws.
              </p>
              <p>
                We grant you a limited, non-exclusive, non-transferable, revocable license to access and use the Service for your internal business purposes in accordance with these Terms.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">6.2 Your Content</h3>
              <p className="mb-4">
                You retain all ownership rights to the content you upload to the Service ("Your Content"), including quotes, documents, project data, and specifications.
              </p>
              <p className="mb-4">
                By uploading Your Content, you grant us a worldwide, royalty-free license to use, process, store, and analyze Your Content solely for the purpose of providing the Service to you. This license terminates when you delete Your Content or close your account.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">6.3 Feedback</h3>
              <p>
                If you provide feedback, suggestions, or ideas about the Service, you grant us an unrestricted, perpetual license to use such feedback for any purpose without compensation or attribution to you.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">7. AI and Data Processing</h2>
              <p className="mb-4">
                Our Service uses artificial intelligence and machine learning to analyze your quotes and generate insights. You acknowledge and agree that:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>AI systems may occasionally produce errors or inaccuracies</li>
                <li>All AI-generated results should be reviewed by qualified professionals</li>
                <li>We do not guarantee the accuracy, completeness, or reliability of AI outputs</li>
                <li>You are solely responsible for decisions made based on our Service</li>
                <li>Your data may be processed by third-party AI providers under strict confidentiality</li>
                <li>We do not use your proprietary data to train models accessible to other users</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">8. Disclaimers of Warranties</h2>
              <p className="mb-4 font-semibold text-white">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED.
              </p>
              <p className="mb-4">WE SPECIFICALLY DISCLAIM ALL WARRANTIES, INCLUDING BUT NOT LIMITED TO:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT</li>
                <li>WARRANTIES THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE, OR ERROR-FREE</li>
                <li>WARRANTIES REGARDING THE ACCURACY, RELIABILITY, OR COMPLETENESS OF RESULTS</li>
                <li>WARRANTIES THAT DEFECTS WILL BE CORRECTED</li>
                <li>WARRANTIES REGARDING THIRD-PARTY SERVICES OR CONTENT</li>
              </ul>
              <p className="mt-4">
                No advice or information obtained from us or through the Service creates any warranty not expressly stated in these Terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">9. Limitation of Liability</h2>
              <p className="mb-4 font-semibold text-white">
                TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL VERIFYTRADE, ITS OFFICERS, DIRECTORS, EMPLOYEES, OR AGENTS BE LIABLE FOR ANY:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES</li>
                <li>LOSS OF PROFITS, REVENUE, DATA, OR USE</li>
                <li>BUSINESS INTERRUPTION OR LOSS OF BUSINESS OPPORTUNITIES</li>
                <li>DAMAGES ARISING FROM YOUR USE OR INABILITY TO USE THE SERVICE</li>
                <li>DAMAGES ARISING FROM ERRORS, OMISSIONS, OR INACCURACIES IN THE SERVICE</li>
                <li>DAMAGES ARISING FROM UNAUTHORIZED ACCESS TO YOUR DATA</li>
              </ul>
              <p className="mt-4">
                OUR TOTAL LIABILITY TO YOU FOR ALL CLAIMS ARISING FROM OR RELATED TO THE SERVICE SHALL NOT EXCEED THE AMOUNT YOU PAID US IN THE 12 MONTHS PRECEDING THE CLAIM, OR $100, WHICHEVER IS GREATER.
              </p>
              <p className="mt-4 text-sm">
                Some jurisdictions do not allow certain warranty disclaimers or limitations of liability, so the above limitations may not apply to you to the extent prohibited by law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">10. Indemnification</h2>
              <p className="mb-4">
                You agree to indemnify, defend, and hold harmless VerifyTrade, its officers, directors, employees, agents, and affiliates from and against any claims, liabilities, damages, losses, costs, or expenses (including reasonable attorneys' fees) arising from or related to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Your use or misuse of the Service</li>
                <li>Your violation of these Terms</li>
                <li>Your violation of any third-party rights</li>
                <li>Your Content or any content you upload</li>
                <li>Your negligence or willful misconduct</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">11. Professional Advice Disclaimer</h2>
              <p className="mb-4 bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
                <strong className="text-yellow-400">IMPORTANT:</strong> VerifyTrade is a software tool designed to assist with quote analysis and auditing. It does NOT provide professional advice (legal, financial, engineering, or otherwise).
              </p>
              <p className="mb-4">
                Our Service does not replace the need for qualified professionals. You should always:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Consult with qualified engineers, quantity surveyors, and legal advisors</li>
                <li>Verify all AI-generated results and recommendations</li>
                <li>Conduct your own due diligence before making business decisions</li>
                <li>Ensure compliance with all applicable building codes and regulations</li>
              </ul>
              <p className="mt-4">
                You are solely responsible for all decisions made using our Service. We accept no liability for losses arising from reliance on AI-generated results without proper professional review.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">12. Data Protection and Privacy</h2>
              <p className="mb-4">
                Your use of the Service is also governed by our Privacy Policy, which is incorporated into these Terms by reference. Please review our Privacy Policy to understand how we collect, use, and protect your information.
              </p>
              <p>
                You represent and warrant that you have obtained all necessary rights, consents, and permissions to upload and process any personal data or confidential information through the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">13. Confidentiality</h2>
              <p className="mb-4">
                We agree to maintain the confidentiality of Your Content and not disclose it to third parties except:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>As necessary to provide the Service (e.g., AI processing providers)</li>
                <li>With your explicit consent</li>
                <li>As required by law or legal process</li>
                <li>To protect our rights, property, or safety</li>
              </ul>
              <p className="mt-4">
                You agree to keep confidential any non-public information about our Service, including proprietary features, algorithms, and business information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">14. Third-Party Services and Links</h2>
              <p className="mb-4">
                Our Service may integrate with or contain links to third-party services, websites, or content. We do not control, endorse, or assume responsibility for any third-party services.
              </p>
              <p>
                Your use of third-party services is governed by their respective terms and privacy policies. We are not liable for any damages or losses arising from your use of third-party services.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">15. Service Level and Availability</h2>
              <p className="mb-4">
                While we strive to maintain high availability, we do not guarantee that the Service will be available 100% of the time. The Service may be unavailable due to:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Scheduled maintenance (we will provide advance notice when possible)</li>
                <li>Emergency maintenance or security updates</li>
                <li>Third-party service outages</li>
                <li>Force majeure events (natural disasters, strikes, etc.)</li>
                <li>Factors beyond our reasonable control</li>
              </ul>
              <p className="mt-4">
                We reserve the right to temporarily suspend the Service for maintenance, security, or other operational reasons without liability.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">16. Export Controls and Sanctions</h2>
              <p className="mb-4">
                The Service may be subject to export control laws and regulations. You agree to comply with all applicable export and import laws and regulations. You represent that you are not:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Located in a country subject to a U.S. Government embargo</li>
                <li>Listed on any U.S. Government list of prohibited or restricted parties</li>
                <li>Subject to sanctions or restrictions that would prohibit use of the Service</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">17. Dispute Resolution and Arbitration</h2>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">17.1 Informal Resolution</h3>
              <p className="mb-4">
                Before filing a formal claim, you agree to contact us at legal@verifytrade.com to attempt to resolve the dispute informally. We will try to resolve the dispute within 60 days.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">17.2 Arbitration Agreement</h3>
              <p className="mb-4">
                If informal resolution fails, any dispute arising from or relating to these Terms or the Service shall be resolved through binding arbitration in accordance with the arbitration rules of New Zealand, rather than in court.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">17.3 Class Action Waiver</h3>
              <p>
                You agree that any arbitration or legal proceeding shall be conducted on an individual basis only, and not as a class action, consolidated action, or representative action.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">18. Governing Law and Jurisdiction</h2>
              <p className="mb-4">
                These Terms shall be governed by and construed in accordance with the laws of New Zealand, without regard to its conflict of law principles.
              </p>
              <p>
                To the extent arbitration does not apply, you agree to submit to the exclusive jurisdiction of the courts located in New Zealand for resolution of any disputes.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">19. Termination</h2>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">19.1 Termination by You</h3>
              <p className="mb-4">
                You may terminate your account at any time by canceling your subscription through your account settings or contacting support. Termination will take effect at the end of your current billing period.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">19.2 Termination by Us</h3>
              <p className="mb-4">We may suspend or terminate your account immediately if:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>You breach these Terms</li>
                <li>Your account is inactive for an extended period</li>
                <li>We are required to do so by law</li>
                <li>We discontinue the Service</li>
                <li>You engage in fraudulent or illegal activity</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">19.3 Effect of Termination</h3>
              <p className="mb-4">Upon termination:</p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Your right to access the Service immediately ceases</li>
                <li>We may delete Your Content after 90 days</li>
                <li>You remain liable for all outstanding fees</li>
                <li>Provisions intended to survive termination will remain in effect</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">20. Changes to Terms</h2>
              <p className="mb-4">
                We reserve the right to modify these Terms at any time. We will notify you of material changes by:
              </p>
              <ul className="list-disc list-inside space-y-2 ml-4">
                <li>Posting updated Terms on our website</li>
                <li>Updating the "Last Updated" date</li>
                <li>Sending email notification (for material changes)</li>
              </ul>
              <p className="mt-4">
                Your continued use of the Service after changes take effect constitutes acceptance of the modified Terms. If you do not agree to the changes, you must stop using the Service and cancel your account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">21. General Provisions</h2>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">21.1 Entire Agreement</h3>
              <p>
                These Terms, together with our Privacy Policy, constitute the entire agreement between you and VerifyTrade regarding the Service and supersede all prior agreements.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">21.2 Severability</h3>
              <p>
                If any provision of these Terms is found to be unenforceable, the remaining provisions will remain in full force and effect.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">21.3 Waiver</h3>
              <p>
                Our failure to enforce any provision of these Terms does not constitute a waiver of that provision or our right to enforce it in the future.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">21.4 Assignment</h3>
              <p>
                You may not assign or transfer these Terms or your account without our prior written consent. We may assign these Terms without restriction.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">21.5 Force Majeure</h3>
              <p>
                We are not liable for any failure to perform our obligations due to causes beyond our reasonable control, including natural disasters, war, terrorism, pandemics, or government actions.
              </p>

              <h3 className="text-xl font-semibold text-white mt-6 mb-3">21.6 Survival</h3>
              <p>
                Provisions that by their nature should survive termination (including payment obligations, intellectual property rights, disclaimers, limitations of liability, and dispute resolution) will remain in effect after termination.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-white mb-4">22. Contact Information</h2>
              <p className="mb-4">
                For questions, concerns, or notices regarding these Terms, please contact us:
              </p>
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <p className="mb-2"><strong>General Inquiries:</strong> legal@verifytrade.com</p>
                <p className="mb-2"><strong>Support:</strong> support@verifytrade.com</p>
                <p className="mb-2"><strong>Billing:</strong> billing@verifytrade.com</p>
                <p className="mt-4 text-sm text-slate-400">
                  We will respond to your inquiry within 5 business days.
                </p>
              </div>
            </section>

            <section className="mt-12 pt-8 border-t border-slate-700">
              <div className="bg-slate-900/50 p-6 rounded-lg border border-slate-700">
                <p className="font-semibold text-white mb-3">Acknowledgment</p>
                <p className="text-sm text-slate-400">
                  BY USING VERIFYTRADE, YOU ACKNOWLEDGE THAT YOU HAVE READ THESE TERMS OF SERVICE, UNDERSTAND THEM, AND AGREE TO BE BOUND BY THEM. IF YOU DO NOT AGREE TO THESE TERMS, YOU MUST NOT USE THE SERVICE.
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
