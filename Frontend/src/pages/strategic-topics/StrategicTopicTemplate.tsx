import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import type { User } from '@/services/authService';

type StrategicTopicTemplateProps = {
  title: string;
};

export default function StrategicTopicTemplate({ title }: StrategicTopicTemplateProps) {
  const [user, setUser] = useState<User | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }
    setUser(JSON.parse(userData) as User);
  }, [navigate]);

  const handleSignOut = () => {
    localStorage.removeItem('user');
    localStorage.removeItem('auth-token');
    navigate('/');
  };

  if (!user) return null;

  return (
    <AppLayout
      user={user}
      headerTitle={title}
      headerSubtitle="Strategic Plan 2026"
      onSignOut={handleSignOut}
    >
      <div className="min-h-[60vh]" />
    </AppLayout>
  );
}
