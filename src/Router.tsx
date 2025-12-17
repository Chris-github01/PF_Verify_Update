import { useEffect, useState } from 'react';
import App from './App';
import HomePage from './pages/marketing/HomePage';
import HowItWorksPage from './pages/marketing/HowItWorksPage';
import PricingPage from './pages/marketing/PricingPage';
import CustomersPage from './pages/marketing/CustomersPage';
import ResourcesPage from './pages/marketing/ResourcesPage';
import SupportPage from './pages/marketing/SupportPage';
import PrivacyPolicyPage from './pages/marketing/PrivacyPolicyPage';
import TermsOfServicePage from './pages/marketing/TermsOfServicePage';

export default function Router() {
  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // SEO Meta tags update
  useEffect(() => {
    const updateMetaTags = (title: string, description: string) => {
      document.title = title;

      let metaDescription = document.querySelector('meta[name="description"]');
      if (!metaDescription) {
        metaDescription = document.createElement('meta');
        metaDescription.setAttribute('name', 'description');
        document.head.appendChild(metaDescription);
      }
      metaDescription.setAttribute('content', description);
    };

    switch (currentPath) {
      case '/':
      case '/marketing':
      case '/home':
        updateMetaTags(
          'PassiveFire Verify+ | AI-Powered Passive Fire Quote Auditing Platform',
          'Instantly audit every passive fire quote you receive. Find scope gaps, missing systems, and hidden risks in seconds with AI. Trusted by 200+ contractors across NZ & Australia.'
        );
        break;
      case '/how-it-works':
        updateMetaTags(
          'How It Works | PassiveFire Verify+',
          'See how PassiveFire Verify+ audits passive fire quotes in 8 automated steps, from upload to award recommendation in under 30 minutes.'
        );
        break;
      case '/pricing':
        updateMetaTags(
          'Pricing | PassiveFire Verify+',
          'Simple, transparent pricing for passive fire quote auditing. Starter from $999/mo, Professional from $1,999/mo, Enterprise from $3,500/mo. 14-day free trial.'
        );
        break;
      case '/customers':
        updateMetaTags(
          'Customers | PassiveFire Verify+',
          'Trusted by 200+ main contractors and PQS firms across New Zealand and Australia. Read customer success stories and case studies.'
        );
        break;
      case '/resources':
        updateMetaTags(
          'Resources | PassiveFire Verify+',
          'Expert guidance on passive fire quote auditing and compliance. Download free checklists and guides.'
        );
        break;
      case '/support':
        updateMetaTags(
          'Support | PassiveFire Verify+',
          'Get help with PassiveFire Verify+. Contact support, browse FAQs, and access documentation.'
        );
        break;
      case '/privacy-policy':
        updateMetaTags(
          'Privacy Policy | PassiveFire Verify+',
          'PassiveFire Verify+ privacy policy. Learn how we collect, use, and protect your data.'
        );
        break;
      case '/terms-of-service':
        updateMetaTags(
          'Terms of Service | PassiveFire Verify+',
          'PassiveFire Verify+ terms of service. Read our terms and conditions for using the platform.'
        );
        break;
    }
  }, [currentPath]);

  // Marketing routes
  const marketingRoutes: Record<string, React.ComponentType> = {
    '/': HomePage,
    '/marketing': HomePage,
    '/home': HomePage,
    '/how-it-works': HowItWorksPage,
    '/pricing': PricingPage,
    '/customers': CustomersPage,
    '/resources': ResourcesPage,
    '/support': SupportPage,
    '/privacy-policy': PrivacyPolicyPage,
    '/terms-of-service': TermsOfServicePage,
  };

  const MarketingComponent = marketingRoutes[currentPath];

  // If marketing route, show marketing page
  if (MarketingComponent) {
    return <MarketingComponent />;
  }

  // Otherwise, show the main app
  return <App />;
}
