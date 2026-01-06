import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const TermsOfService = () => {
  return (
    <div className="container mx-auto py-8 px-4 max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Terms of Service</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-slate max-w-none">
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
          
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing and using this service, you accept and agree to be bound by the terms
            and provision of this agreement.
          </p>

          <h2>2. Use License</h2>
          <p>
            Permission is granted to temporarily use this service for personal, non-commercial
            transitory viewing only. This is the grant of a license, not a transfer of title.
          </p>

          <h2>3. User Accounts</h2>
          <p>You are responsible for:</p>
          <ul>
            <li>Maintaining the confidentiality of your account credentials</li>
            <li>All activities that occur under your account</li>
            <li>Notifying us immediately of any unauthorized use</li>
          </ul>

          <h2>4. Prohibited Uses</h2>
          <p>You may not:</p>
          <ul>
            <li>Use the service for any unlawful purpose</li>
            <li>Attempt to gain unauthorized access to the system</li>
            <li>Interfere with or disrupt the service</li>
            <li>Transmit any viruses or malicious code</li>
          </ul>

          <h2>5. Intellectual Property</h2>
          <p>
            The service and its original content, features, and functionality are owned by
            Life Makers Foundation and are protected by international copyright, trademark,
            and other intellectual property laws.
          </p>

          <h2>6. Limitation of Liability</h2>
          <p>
            In no event shall Life Makers Foundation be liable for any indirect, incidental,
            special, consequential, or punitive damages resulting from your use of the service.
          </p>

          <h2>7. Contact Information</h2>
          <p>
            For questions about these Terms of Service, please contact us at:
            legal@lifemakers.org
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

export default TermsOfService;

