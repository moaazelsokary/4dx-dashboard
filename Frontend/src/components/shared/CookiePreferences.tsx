import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';

interface CookiePreferencesProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CookiePreferences {
  necessary: boolean;
  analytics: boolean;
  functional: boolean;
  marketing: boolean;
}

const COOKIE_PREFERENCES_KEY = 'cookie-preferences';

export default function CookiePreferences({ open, onOpenChange }: CookiePreferencesProps) {
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true, // Always required
    analytics: false,
    functional: false,
    marketing: false,
  });

  useEffect(() => {
    // Load saved preferences
    const saved = localStorage.getItem(COOKIE_PREFERENCES_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setPreferences({
          necessary: true, // Always true
          analytics: parsed.analytics || false,
          functional: parsed.functional || false,
          marketing: parsed.marketing || false,
        });
      } catch {
        // Use defaults if parsing fails
      }
    }
  }, []);

  const handleSave = () => {
    // Save preferences to localStorage
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify({
      analytics: preferences.analytics,
      functional: preferences.functional,
      marketing: preferences.marketing,
    }));
    
    // Apply preferences (in a real app, you would configure cookie libraries here)
    applyCookiePreferences(preferences);
    
    onOpenChange(false);
  };

  const handleAcceptAll = () => {
    const allAccepted: CookiePreferences = {
      necessary: true,
      analytics: true,
      functional: true,
      marketing: true,
    };
    setPreferences(allAccepted);
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify({
      analytics: true,
      functional: true,
      marketing: true,
    }));
    applyCookiePreferences(allAccepted);
    onOpenChange(false);
  };

  const handleRejectAll = () => {
    const allRejected: CookiePreferences = {
      necessary: true,
      analytics: false,
      functional: false,
      marketing: false,
    };
    setPreferences(allRejected);
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify({
      analytics: false,
      functional: false,
      marketing: false,
    }));
    applyCookiePreferences(allRejected);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Cookie Preferences</DialogTitle>
          <DialogDescription>
            Manage your cookie preferences. You can enable or disable different types of cookies below.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Necessary Cookies */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="necessary" className="text-base font-medium">
                Necessary Cookies
              </Label>
              <p className="text-sm text-muted-foreground">
                These cookies are essential for the website to function properly. They cannot be disabled.
              </p>
            </div>
            <Switch
              id="necessary"
              checked={preferences.necessary}
              disabled
              className="opacity-50"
            />
          </div>

          <Separator />

          {/* Analytics Cookies */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="analytics" className="text-base font-medium">
                Analytics Cookies
              </Label>
              <p className="text-sm text-muted-foreground">
                These cookies help us understand how visitors interact with our website by collecting and reporting information anonymously.
              </p>
            </div>
            <Switch
              id="analytics"
              checked={preferences.analytics}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, analytics: checked })
              }
            />
          </div>

          <Separator />

          {/* Functional Cookies */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="functional" className="text-base font-medium">
                Functional Cookies
              </Label>
              <p className="text-sm text-muted-foreground">
                These cookies enable enhanced functionality and personalization, such as remembering your preferences.
              </p>
            </div>
            <Switch
              id="functional"
              checked={preferences.functional}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, functional: checked })
              }
            />
          </div>

          <Separator />

          {/* Marketing Cookies */}
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="marketing" className="text-base font-medium">
                Marketing Cookies
              </Label>
              <p className="text-sm text-muted-foreground">
                These cookies are used to deliver advertisements and track campaign effectiveness.
              </p>
            </div>
            <Switch
              id="marketing"
              checked={preferences.marketing}
              onCheckedChange={(checked) =>
                setPreferences({ ...preferences, marketing: checked })
              }
            />
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-end pt-4">
          <Button variant="outline" onClick={handleRejectAll}>
            Reject All
          </Button>
          <Button variant="outline" onClick={handleAcceptAll}>
            Accept All
          </Button>
          <Button onClick={handleSave}>
            Save Preferences
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Apply cookie preferences to the application
 * In a real implementation, this would configure cookie libraries like react-cookie-consent
 */
function applyCookiePreferences(preferences: CookiePreferences) {
  // Store preferences for use by cookie libraries
  // This is a placeholder - implement based on your cookie library
  console.log('Applying cookie preferences:', preferences);
  
  // Example: Configure analytics based on preferences
  if (preferences.analytics) {
    // Enable analytics tracking
  } else {
    // Disable analytics tracking
  }
  
  // Example: Configure functional cookies
  if (preferences.functional) {
    // Enable functional features
  } else {
    // Disable functional features
  }
  
  // Example: Configure marketing cookies
  if (preferences.marketing) {
    // Enable marketing tracking
  } else {
    // Disable marketing tracking
  }
}

