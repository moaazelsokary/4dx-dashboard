import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AppLayout } from '@/components/layout/AppLayout';

const PrivacyPolicy = () => {
  const userData = typeof window !== 'undefined' ? localStorage.getItem('user') : null;
  const user = userData ? JSON.parse(userData) : null;

  return (
    <AppLayout user={user} onSignOut={() => { localStorage.removeItem('user'); window.location.href = '/'; }} headerTitle="Privacy Policy">
      <div className="max-w-4xl">
      <Card>
        <CardHeader>
          <CardTitle className="text-3xl">Privacy Policy</CardTitle>
        </CardHeader>
        <CardContent className="prose prose-slate max-w-none">
          <p className="text-muted-foreground">Last updated: {new Date().toLocaleDateString()}</p>
          
          <h2>1. Information We Collect</h2>
          <p>
            We collect information that you provide directly to us, including:
          </p>
          <ul>
            <li>Account information (username, password)</li>
            <li>Usage data and analytics</li>
            <li>Cookies and similar tracking technologies</li>
          </ul>

          <h2>2. How We Use Your Information</h2>
          <p>We use the information we collect to:</p>
          <ul>
            <li>Provide and maintain our services</li>
            <li>Authenticate users and manage accounts</li>
            <li>Improve our services and user experience</li>
            <li>Send important notifications</li>
          </ul>

          <h2>3. Data Security</h2>
          <p>
            We implement appropriate security measures to protect your personal information,
            including encryption, secure authentication, and access controls.
          </p>

          <h2>4. Cookies</h2>
          <p>
            We use cookies to maintain your session and improve your experience.
            You can control cookie preferences through your browser settings.
          </p>

          <h2>5. Your Rights</h2>
          <p>You have the right to:</p>
          <ul>
            <li>Access your personal data</li>
            <li>Request correction of inaccurate data</li>
            <li>Request deletion of your data</li>
            <li>Object to processing of your data</li>
          </ul>

          <h2>6. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy, please contact us at:
            privacy@lifemakers.org
          </p>
        </CardContent>
      </Card>
      </div>
    </AppLayout>
  );
};

export default PrivacyPolicy;

