import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';

const COOKIE_CONSENT_KEY = 'cookie-consent';

const CookieConsent = () => {
  const [showConsent, setShowConsent] = useState(false);

  useEffect(() => {
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      setShowConsent(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setShowConsent(false);
  };

  const handleDecline = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'declined');
    setShowConsent(false);
  };

  if (!showConsent) {
    return null;
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-card border-t border-border shadow-lg"
      role="region"
      aria-labelledby="cookie-consent-title"
    >
      <Card className="max-w-4xl mx-auto border-border shadow-sm">
        <CardContent className="p-4 sm:p-5">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 md:gap-6">
            <div className="flex-1 min-w-0">
              <h3 id="cookie-consent-title" className="font-semibold text-foreground mb-2">
                Cookie Consent
              </h3>
              <p className="text-sm text-muted-foreground">
                We use cookies to enhance your experience, analyze site usage, and assist in our
                marketing efforts. By clicking "Accept", you consent to our use of cookies.{' '}
                <Link
                  to="/privacy-policy"
                  className="underline underline-offset-2 text-primary hover:text-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-sm"
                >
                  Learn more
                </Link>
              </p>
            </div>
            <div className="flex flex-wrap gap-2 shrink-0 w-full md:w-auto justify-stretch md:justify-end">
              <Button variant="outline" size="sm" className="min-h-10 flex-1 md:flex-initial" onClick={handleDecline}>
                Decline
              </Button>
              <Button size="sm" className="min-h-10 flex-1 md:flex-initial" onClick={handleAccept}>
                Accept
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default CookieConsent;

