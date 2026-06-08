import { useState, useEffect } from 'react';
import { Filter, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { ConditionFilterState } from '@/lib/tableFilterState';

export const TEXT_OPERATORS = [
  { value: 'contains', label: 'Contains' },
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does not equal' },
  { value: 'starts_with', label: 'Starts with' },
  { value: 'ends_with', label: 'Ends with' },
  { value: 'is_empty', label: 'Is empty' },
] as const;

export const NUMBER_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'not_equals', label: 'Does not equal' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'greater_than_or_equal', label: 'Greater than or equal' },
  { value: 'less_than', label: 'Less than' },
  { value: 'less_than_or_equal', label: 'Less than or equal' },
  { value: 'between', label: 'Between' },
  { value: 'is_empty', label: 'Is empty' },
] as const;

export const DATE_OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'before', label: 'Before' },
  { value: 'after', label: 'After' },
  { value: 'between', label: 'Between' },
  { value: 'is_empty', label: 'Is empty' },
] as const;

export type ColumnType = 'text' | 'number' | 'date';

function getOperatorsForType(columnType: ColumnType): readonly { value: string; label: string }[] {
  switch (columnType) {
    case 'number':
      return NUMBER_OPERATORS;
    case 'date':
      return DATE_OPERATORS;
    default:
      return TEXT_OPERATORS;
  }
}

function needsTwoValues(operator: string): boolean {
  return operator === 'between';
}

export interface ColumnFilterProps {
  columnKey: string;
  columnLabel: string;
  filterId: string;
  columnType: ColumnType;
  /** List mode */
  uniqueValues: string[];
  selectedValues: string[];
  onListChange: (selected: string[]) => void;
  getLabel?: (value: string) => string;
  /** Condition mode */
  condition?: ConditionFilterState;
  onConditionChange?: (condition: ConditionFilterState) => void;
  /** Single-open behavior */
  openFilterId: string | null;
  onOpenFilterChange: (id: string | null) => void;
  /** Optional: hide condition mode (list only) */
  listOnly?: boolean;
  /** @deprecated Layout uses flex; kept for API compat — ignored. */
  scrollMaxHeight?: string;
}

export function ColumnFilter({
  columnKey,
  columnLabel,
  filterId,
  columnType,
  uniqueValues,
  selectedValues,
  onListChange,
  getLabel,
  condition,
  onConditionChange,
  openFilterId,
  onOpenFilterChange,
  listOnly = false,
  scrollMaxHeight = '',
}: ColumnFilterProps) {
  const open = openFilterId === filterId;
  const [tempSelections, setTempSelections] = useState<string[]>(selectedValues);
  const [searchTerm, setSearchTerm] = useState('');
  const [mode, setMode] = useState<'list' | 'condition'>(
    condition?.mode === 'condition' ? 'condition' : 'list'
  );
  const [tempCondition, setTempCondition] = useState<ConditionFilterState>(
    condition ?? { mode: 'condition', operator: 'contains', value: '' }
  );

  const hasListFilter = selectedValues.length > 0;
  const hasConditionFilter =
    mode === 'condition' &&
    condition?.mode === 'condition' &&
    (condition.operator === 'is_empty' || (condition.value ?? '').trim() !== '' || (condition.value2 ?? '').trim() !== '');
  const hasFilter = hasListFilter || hasConditionFilter;

  useEffect(() => {
    if (open) {
      setTempSelections(selectedValues);
      setSearchTerm('');
      setMode(condition?.mode === 'condition' ? 'condition' : 'list');
      setTempCondition(
        condition ?? { mode: 'condition', operator: columnType === 'text' ? 'contains' : columnType === 'number' ? 'equals' : 'equals', value: '' }
      );
    }
  }, [open, selectedValues, condition, columnType]);

  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      onOpenFilterChange(filterId);
    } else {
      onOpenFilterChange(null);
    }
  };

  const filteredValues = uniqueValues.filter((value) => {
    const label = getLabel ? getLabel(value) : value;
    return label.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const handleToggle = (value: string) => {
    if (tempSelections.includes(value)) {
      setTempSelections(tempSelections.filter((v) => v !== value));
    } else {
      setTempSelections([...tempSelections, value]);
    }
  };

  const handleSelectAll = () => {
    if (tempSelections.length === filteredValues.length) {
      setTempSelections(tempSelections.filter((v) => !filteredValues.includes(v)));
    } else {
      const next = new Set(tempSelections);
      filteredValues.forEach((v) => next.add(v));
      setTempSelections(Array.from(next));
    }
  };

  const handleApplyList = () => {
    onListChange(tempSelections);
    handleOpenChange(false);
    setSearchTerm('');
  };

  const handleClearList = () => {
    setTempSelections([]);
    onListChange([]);
    handleOpenChange(false);
    setSearchTerm('');
  };

  const handleApplyCondition = () => {
    if (onConditionChange) {
      onConditionChange(tempCondition);
      handleOpenChange(false);
    }
  };

  const handleClearCondition = () => {
    if (onConditionChange) {
      onConditionChange({ mode: 'condition', operator: 'contains', value: '' });
      setTempCondition({ mode: 'condition', operator: 'contains', value: '' });
      handleOpenChange(false);
    }
  };

  const handleClearAll = () => {
    setTempSelections([]);
    onListChange([]);
    if (onConditionChange) {
      onConditionChange({ mode: 'condition', operator: 'contains', value: '' });
      setTempCondition({ mode: 'condition', operator: 'contains', value: '' });
    }
    handleOpenChange(false);
    setSearchTerm('');
  };

  const allFilteredSelected =
    filteredValues.length > 0 && filteredValues.every((v) => tempSelections.includes(v));
  const operators = getOperatorsForType(columnType);
  const inputType = columnType === 'date' ? 'date' : columnType === 'number' ? 'number' : 'text';

  const listFooter = (
    <div className="relative z-10 flex shrink-0 items-center justify-between gap-1.5 border-t bg-popover px-1.5 py-1.5 shadow-[0_-6px_12px_-4px_hsl(var(--background)/0.85)]">
      <div className="text-[10px] text-muted-foreground tabular-nums">
        {tempSelections.length} of {uniqueValues.length} selected
      </div>
      <div className="flex shrink-0 gap-1">
        <Button
          variant="outline"
          size="sm"
          className="h-6 px-2 text-[11px]"
          onClick={() => {
            setTempSelections(selectedValues);
            setSearchTerm('');
            handleOpenChange(false);
          }}
        >
          Cancel
        </Button>
        <Button size="sm" className="h-6 px-2 text-[11px]" onClick={handleApplyList}>
          Apply
        </Button>
      </div>
    </div>
  );

  const listValueRows =
    filteredValues.length === 0 ? (
      <div className="text-xs text-muted-foreground py-2 px-1">
        {searchTerm ? 'No values match your search' : 'No values available'}
      </div>
    ) : (
      filteredValues.map((value) => {
        const label = getLabel ? getLabel(value) : value;
        const isChecked = tempSelections.includes(value);
        return (
          <div key={value} className="flex w-max min-w-full items-center gap-1.5 py-0.5">
            <Checkbox
              id={`filter-${columnKey}-${value}`}
              checked={isChecked}
              onCheckedChange={() => handleToggle(value)}
              className="shrink-0"
            />
            <label
              htmlFor={`filter-${columnKey}-${value}`}
              className="cursor-pointer whitespace-nowrap pr-2 text-xs"
              title={label}
            >
              {label}
            </label>
          </div>
        );
      })
    );

  const listSearchAndSelect = (
    <>
      <div className="shrink-0 px-1.5 pb-0.5">
        <div className="relative">
          <Search className="absolute left-1.5 top-1 h-2.5 w-2.5 text-muted-foreground" />
          <Input
            placeholder="Search..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="h-6 pl-6 text-[11px]"
          />
        </div>
      </div>
      {filteredValues.length > 0 && (
        <div className="shrink-0 px-1.5 pb-0.5">
          <Button
            variant="ghost"
            size="sm"
            className="h-5 w-full text-[11px] justify-start"
            onClick={handleSelectAll}
          >
            {allFilteredSelected ? 'Deselect All' : 'Select All'}
          </Button>
        </div>
      )}
    </>
  );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-2 sm:min-h-0 sm:min-w-0 sm:h-auto sm:px-1.5 sm:py-1 ${hasFilter ? 'text-primary' : ''}`}
          aria-label={`Filter ${columnLabel}`}
          title={`Filter ${columnLabel}`}
        >
          <Filter className="h-3.5 w-3.5 sm:h-3 sm:w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="flex h-[min(336px,49vh)] max-h-[min(336px,49vh)] w-[min(100vw-2rem,15.4rem)] max-w-[calc(100vw-2rem)] flex-col overflow-hidden p-0 md:!w-[378px] md:!max-w-[378px]"
        align="start"
        side="bottom"
        sideOffset={2}
        collisionPadding={12}
      >
        <div className="flex shrink-0 items-center justify-between px-1.5 py-1">
          <span className="text-[11px] font-semibold">Filter by {columnLabel}</span>
          {hasFilter && (
            <Button variant="ghost" size="sm" className="h-5 px-1.5 text-xs" onClick={handleClearAll}>
              Clear
            </Button>
          )}
        </div>
        <Separator className="shrink-0" />

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {listOnly ? (
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              {listSearchAndSelect}
              <div
                className="scrollbar-filter-dropdown min-h-0 flex-1 overflow-auto overscroll-contain px-1.5 py-0.5"
                data-dropdown-scroll
              >
                <div className="w-max min-w-full space-y-0.5">{listValueRows}</div>
              </div>
              {listFooter}
            </div>
          ) : (
            <Tabs
              value={mode}
              onValueChange={(v) => setMode(v as 'list' | 'condition')}
              className="flex h-full min-h-0 flex-col overflow-hidden"
            >
              <TabsList className="mx-1.5 mt-1 grid h-6 w-[calc(100%-0.75rem)] shrink-0 grid-cols-2">
                <TabsTrigger value="list" className="py-0 text-[11px]">
                  List
                </TabsTrigger>
                <TabsTrigger value="condition" className="py-0 text-[11px]">
                  Condition
                </TabsTrigger>
              </TabsList>
              <TabsContent
                value="list"
                className="mt-0 flex h-0 min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
              >
                {listSearchAndSelect}
                <div
                  className="scrollbar-filter-dropdown min-h-0 flex-1 overflow-auto overscroll-contain px-1.5 py-0.5"
                  data-dropdown-scroll
                >
                  <div className="w-max min-w-full space-y-0.5">{listValueRows}</div>
                </div>
                {listFooter}
              </TabsContent>
              <TabsContent
                value="condition"
                className="mt-0 flex h-0 min-h-0 flex-1 flex-col overflow-hidden data-[state=inactive]:hidden"
              >
                {onConditionChange && (
                  <>
                    <div className="scrollbar-filter-dropdown min-h-0 flex-1 overflow-auto overscroll-contain px-1.5 py-1.5 space-y-1.5">
                    <div>
                      <label className="text-[11px] text-muted-foreground block mb-0.5">Operator</label>
                      <Select
                        value={tempCondition.operator}
                        onValueChange={(v) => setTempCondition((prev) => ({ ...prev, operator: v }))}
                      >
                        <SelectTrigger className="h-6 text-[11px] px-2 [&>svg]:h-3 [&>svg]:w-3">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent
                          position="popper"
                          sideOffset={2}
                          className="z-[110] max-h-[10.5rem] min-w-0 w-[var(--radix-select-trigger-width)] p-0.5 text-[11px] shadow-md"
                        >
                          {operators.map((op) => (
                            <SelectItem
                              key={op.value}
                              value={op.value}
                              className="min-h-0 h-6 py-0 pl-6 pr-1.5 text-[11px] [&_svg]:h-3 [&_svg]:w-3"
                            >
                              {op.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {tempCondition.operator !== 'is_empty' && (
                      <div className="space-y-1.5">
                        <div>
                          <label className="text-[11px] text-muted-foreground block mb-0.5">Value</label>
                          <Input
                            type={inputType}
                            className="h-7 text-xs"
                            value={tempCondition.value ?? ''}
                            onChange={(e) =>
                              setTempCondition((prev) => ({ ...prev, value: e.target.value }))
                            }
                            placeholder={columnType === 'date' ? 'YYYY-MM-DD' : 'Value'}
                          />
                        </div>
                        {needsTwoValues(tempCondition.operator) && (
                          <div>
                            <label className="text-[11px] text-muted-foreground block mb-0.5">And</label>
                            <Input
                              type={inputType}
                              className="h-7 text-xs"
                              value={tempCondition.value2 ?? ''}
                              onChange={(e) =>
                                setTempCondition((prev) => ({ ...prev, value2: e.target.value }))
                              }
                              placeholder={columnType === 'date' ? 'YYYY-MM-DD' : 'Value'}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="relative z-10 flex shrink-0 justify-end gap-1 border-t bg-popover px-1.5 py-1.5 shadow-[0_-6px_12px_-4px_hsl(var(--background)/0.85)]">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => {
                        setTempCondition(
                          condition ?? { mode: 'condition', operator: 'contains', value: '' }
                        );
                        handleOpenChange(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px]"
                      onClick={handleClearCondition}
                    >
                      Clear
                    </Button>
                    <Button size="sm" className="h-6 px-2 text-[11px]" onClick={handleApplyCondition}>
                      Apply
                    </Button>
                  </div>
                </>
              )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
