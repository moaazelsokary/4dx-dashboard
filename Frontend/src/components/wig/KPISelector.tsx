import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getKPIsWithRASCI } from '@/services/wigService';
import { Loader2 } from 'lucide-react';

interface KPISelectorProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function KPISelector({ value, onValueChange, placeholder = 'Select KPI', disabled = false }: KPISelectorProps) {
  const [kpis, setKpis] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchKPIs = async () => {
      try {
        setLoading(true);
        const kpiList = await getKPIsWithRASCI();
        setKpis(kpiList);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load KPIs');
        console.error('Error fetching KPIs:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchKPIs();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span className="text-sm text-muted-foreground">Loading KPIs...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-sm text-destructive">
        Error loading KPIs: {error}
      </div>
    );
  }

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled || kpis.length === 0}>
      <SelectTrigger>
        <SelectValue placeholder={kpis.length === 0 ? 'No KPIs available' : placeholder} />
      </SelectTrigger>
      <SelectContent>
        {kpis.map((kpi) => (
          <SelectItem key={kpi} value={kpi}>
            {kpi}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

