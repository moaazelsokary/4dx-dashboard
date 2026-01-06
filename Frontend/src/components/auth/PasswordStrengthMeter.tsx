import { useState, useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { CheckCircle2, XCircle } from 'lucide-react';

interface PasswordStrengthMeterProps {
  password: string;
  onStrengthChange?: (strength: number) => void;
}

interface StrengthCriteria {
  label: string;
  test: (password: string) => boolean;
}

const criteria: StrengthCriteria[] = [
  { label: 'At least 8 characters', test: (pwd) => pwd.length >= 8 },
  { label: 'Contains uppercase letter', test: (pwd) => /[A-Z]/.test(pwd) },
  { label: 'Contains lowercase letter', test: (pwd) => /[a-z]/.test(pwd) },
  { label: 'Contains number', test: (pwd) => /[0-9]/.test(pwd) },
  { label: 'Contains special character', test: (pwd) => /[!@#$%^&*(),.?":{}|<>]/.test(pwd) },
];

const PasswordStrengthMeter = ({ password, onStrengthChange }: PasswordStrengthMeterProps) => {
  const [strength, setStrength] = useState(0);
  const [meetsCriteria, setMeetsCriteria] = useState<boolean[]>([]);

  useEffect(() => {
    if (!password) {
      setStrength(0);
      setMeetsCriteria([]);
      onStrengthChange?.(0);
      return;
    }

    const results = criteria.map(c => c.test(password));
    setMeetsCriteria(results);
    
    const passedCount = results.filter(Boolean).length;
    const strengthValue = (passedCount / criteria.length) * 100;
    setStrength(strengthValue);
    onStrengthChange?.(strengthValue);
  }, [password, onStrengthChange]);

  const getStrengthColor = () => {
    if (strength < 40) return 'bg-red-500';
    if (strength < 70) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const getStrengthLabel = () => {
    if (strength < 40) return 'Weak';
    if (strength < 70) return 'Medium';
    return 'Strong';
  };

  if (!password) {
    return null;
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Password strength:</span>
        <span className={`font-medium ${strength < 40 ? 'text-red-500' : strength < 70 ? 'text-yellow-500' : 'text-green-500'}`}>
          {getStrengthLabel()}
        </span>
      </div>
      <Progress value={strength} className="h-2" />
      <div className="space-y-1 text-xs">
        {criteria.map((criterion, index) => (
          <div key={index} className="flex items-center gap-2">
            {meetsCriteria[index] ? (
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            ) : (
              <XCircle className="h-3 w-3 text-muted-foreground" />
            )}
            <span className={meetsCriteria[index] ? 'text-green-500' : 'text-muted-foreground'}>
              {criterion.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default PasswordStrengthMeter;

