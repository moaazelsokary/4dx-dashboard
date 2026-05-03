import { useEffect, useMemo, useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { getKPIsWithRASCI } from '@/services/wigService';
import { Loader2, Search, X, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MainPlanObjective } from '@/types/wig';

interface KPISelectorProps {
  value?: string | string[]; // Can be single string, array, or delimited string
  onValueChange: (value: string | string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  multiple?: boolean; // Enable multi-select
  /** Strategic KPIs: list comes from main plan; single-select only. */
  kpiSource?: 'rasci' | 'mainplan';
  mainPlanObjectives?: MainPlanObjective[];
  selectedMainPlanObjectiveId?: number | null;
  onMainPlanObjectiveChange?: (objective: MainPlanObjective | null) => void;
}

const KPI_DELIMITER = '||'; // Delimiter for storing multiple KPIs

export default function KPISelector({ 
  value, 
  onValueChange, 
  placeholder = 'Select KPI', 
  disabled = false,
  multiple = true,
  kpiSource = 'rasci',
  mainPlanObjectives = [],
  selectedMainPlanObjectiveId = null,
  onMainPlanObjectiveChange,
}: KPISelectorProps) {
  const isMainPlan = kpiSource === 'mainplan';
  const [rasciKpis, setRasciKpis] = useState<string[]>([]);
  const [loading, setLoading] = useState(!isMainPlan);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const mainPlanRows = useMemo(() => {
    return [...(mainPlanObjectives || [])].sort((a, b) => {
      const p = a.pillar.localeCompare(b.pillar, undefined, { sensitivity: 'base' });
      if (p !== 0) return p;
      return a.kpi.localeCompare(b.kpi, undefined, { sensitivity: 'base' });
    });
  }, [mainPlanObjectives]);

  // Parse value to array of KPIs
  const parseValue = (val: string | string[] | undefined): string[] => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    if (typeof val === 'string') {
      // Check if it's a delimited string
      if (val.includes(KPI_DELIMITER)) {
        return val.split(KPI_DELIMITER).filter(k => k.trim());
      }
      return [val];
    }
    return [];
  };

  const selectedKPIs = parseValue(value);

  useEffect(() => {
    if (isMainPlan) {
      setLoading(false);
      setError(null);
      return;
    }
    const fetchKPIs = async () => {
      try {
        setLoading(true);
        const kpiList = await getKPIsWithRASCI();
        setRasciKpis(kpiList);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load KPIs');
        console.error('Error fetching KPIs:', err);
      } finally {
        setLoading(false);
      }
    };

    void fetchKPIs();
  }, [isMainPlan]);

  // Filter KPIs based on search term
  const filteredRasciKpis = rasciKpis.filter((kpi) =>
    kpi.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredMainPlanRows = mainPlanRows.filter((m) => {
    const q = searchTerm.toLowerCase();
    return (
      m.kpi.toLowerCase().includes(q) ||
      m.objective.toLowerCase().includes(q) ||
      m.pillar.toLowerCase().includes(q) ||
      m.target.toLowerCase().includes(q)
    );
  });

  const handleToggleKPI = (kpi: string) => {
    if (multiple) {
      const newSelected = selectedKPIs.includes(kpi)
        ? selectedKPIs.filter((k) => k !== kpi)
        : [...selectedKPIs, kpi];
      onValueChange(newSelected);
    } else {
      onValueChange(selectedKPIs.includes(kpi) ? '' : kpi);
      setOpen(false);
    }
  };

  const handleToggleMainPlanRow = (m: MainPlanObjective) => {
    if (selectedMainPlanObjectiveId === m.id) {
      onValueChange([]);
      onMainPlanObjectiveChange?.(null);
      setOpen(false);
      return;
    }
    onValueChange([m.kpi]);
    onMainPlanObjectiveChange?.(m);
    setOpen(false);
  };

  const handleRemoveKPI = (kpi: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isMainPlan) {
      onValueChange([]);
      onMainPlanObjectiveChange?.(null);
      return;
    }
    if (multiple) {
      const newSelected = selectedKPIs.filter((k) => k !== kpi);
      onValueChange(newSelected);
    } else {
      onValueChange('');
    }
  };

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

  const displayText = selectedKPIs.length === 0 
    ? placeholder 
    : selectedKPIs.length === 1 
      ? selectedKPIs[0]
      : `${selectedKPIs.length} KPIs selected`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={
            disabled ||
            (isMainPlan ? mainPlanRows.length === 0 : rasciKpis.length === 0)
          }
          aria-label={selectedKPIs.length === 0 ? placeholder : `Selected ${selectedKPIs.length} KPI${selectedKPIs.length > 1 ? 's' : ''}`}
          title={selectedKPIs.length === 0 ? placeholder : selectedKPIs.join(', ')}
        >
          <span className={cn("truncate", selectedKPIs.length === 0 && "text-muted-foreground")}>
            {displayText}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-3rem,22rem)] md:!w-[600px] md:!max-w-[600px] max-h-[min(420px,85vh)] p-0 flex flex-col overflow-hidden" align="start">
        <div className="p-3 space-y-2 flex-shrink-0 border-b">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search KPIs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="h-8"
            />
          </div>
        </div>
        <div
          className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 max-h-[min(280px,50vh)] min-h-[80px] overscroll-contain"
          data-dropdown-scroll
        >
          <div className="space-y-1 p-2">
            {isMainPlan ? (
              filteredMainPlanRows.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  No main plan objectives loaded
                </div>
              ) : (
                filteredMainPlanRows.map((m) => {
                  const isSelected = selectedMainPlanObjectiveId === m.id;
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        'flex items-start gap-2 p-2 rounded-md cursor-pointer border border-transparent',
                        isSelected ? 'bg-primary/10 border-primary/30' : 'hover:bg-accent'
                      )}
                      onClick={() => handleToggleMainPlanRow(m)}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleToggleMainPlanRow(m)}
                        className="mt-0.5"
                      />
                      <div className="text-sm flex-1 min-w-0">
                        <div className="font-medium break-words">{m.kpi}</div>
                        <div className="text-muted-foreground text-xs mt-0.5 break-words">
                          {m.pillar} · {m.objective}
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            ) : filteredRasciKpis.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-4">
                No KPIs found
              </div>
            ) : (
              filteredRasciKpis.map((kpi) => {
                const isSelected = selectedKPIs.includes(kpi);
                return (
                  <div
                    key={kpi}
                    className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                    onClick={() => handleToggleKPI(kpi)}
                  >
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => handleToggleKPI(kpi)}
                    />
                    <span className="text-sm flex-1">{kpi}</span>
                  </div>
                );
              })
            )}
          </div>
        </div>
        <div className="p-2 border-t flex-shrink-0 bg-background">
          {selectedKPIs.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-2 max-h-20 overflow-y-auto">
              {selectedKPIs.map((kpi) => (
                <Badge key={kpi} variant="secondary" className="text-xs">
                  {kpi}
                  <button
                    type="button"
                    className="ml-1 rounded-full hover:bg-destructive/20"
                    onClick={(e) => handleRemoveKPI(kpi, e)}
                    aria-label={`Remove ${kpi}`}
                    title={`Remove ${kpi}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
          )}
          <Button
            type="button"
            className="w-full"
            onClick={() => setOpen(false)}
          >
            {selectedKPIs.length > 0 ? `Save Selection (${selectedKPIs.length})` : 'Close'}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

