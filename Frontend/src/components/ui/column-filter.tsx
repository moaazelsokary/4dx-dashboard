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
  /** Scroll area max height */
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
  scrollMaxHeight = 'max-h-[calc(100vh-20rem)]',
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

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-auto px-1.5 py-1 ${hasFilter ? 'text-primary' : ''}`}
          aria-label={`Filter ${columnLabel}`}
          title={`Filter ${columnLabel}`}
        >
          <Filter className="h-3 w-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-96 max-w-[min(360px,90vw)] max-h-[min(320px,70vh)] overflow-hidden flex flex-col p-0 rounded border bg-popover shadow-lg"
        align="start"
        side="bottom"
        sideOffset={2}
        collisionPadding={12}
      >
        <div className="flex flex-col min-h-0 overflow-hidden p-1.5 space-y-0.5 flex-1">
          <div className="flex items-center justify-between px-1.5 py-0.5 flex-shrink-0">
            <span className="text-xs font-semibold">Filter by {columnLabel}</span>
            {hasFilter && (
              <Button
                variant="ghost"
                size="sm"
                className="h-5 px-1.5 text-xs"
                onClick={handleClearAll}
              >
                Clear
              </Button>
            )}
          </div>
          <Separator className="my-0.5" />

          {listOnly ? (
            <>
              <div className="px-1.5 pb-0.5 flex-shrink-0">
                <div className="relative">
                  <Search className="absolute left-1.5 top-1.5 h-3 w-3 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-7 pl-7 text-xs"
                  />
                </div>
              </div>
              {filteredValues.length > 0 && (
                <div className="px-1.5 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-full text-xs justify-start"
                    onClick={handleSelectAll}
                  >
                    {allFilteredSelected ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
              )}
              <Separator className="my-0.5" />
              <div
                className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 max-h-[min(180px,40vh)] min-h-[56px] overscroll-contain"
                data-dropdown-scroll
              >
                <div className="p-1.5 space-y-0.5">
                  {filteredValues.length === 0 ? (
                    <div className="text-xs text-muted-foreground py-1.5">
                      {searchTerm ? 'No values match your search' : 'No values available'}
                    </div>
                  ) : (
                    filteredValues.map((value) => {
                      const label = getLabel ? getLabel(value) : value;
                      const isChecked = tempSelections.includes(value);
                      return (
                        <div key={value} className="flex items-center space-x-1.5 py-0.5">
                          <Checkbox
                            id={`filter-${columnKey}-${value}`}
                            checked={isChecked}
                            onCheckedChange={() => handleToggle(value)}
                          />
                          <label
                            htmlFor={`filter-${columnKey}-${value}`}
                            className="text-xs cursor-pointer flex-1 truncate"
                            title={label}
                          >
                            {label}
                          </label>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              <Separator className="my-0.5" />
              <div className="flex items-center justify-between px-1.5 py-1.5 flex-shrink-0">
                <div className="text-[11px] text-muted-foreground">
                  {tempSelections.length} of {uniqueValues.length} selected
                </div>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => {
                      setTempSelections(selectedValues);
                      setSearchTerm('');
                      handleOpenChange(false);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button size="sm" className="h-6 px-2 text-xs" onClick={handleApplyList}>
                    Apply
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <Tabs
              value={mode}
              onValueChange={(v) => setMode(v as 'list' | 'condition')}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 h-7">
                <TabsTrigger value="list" className="text-xs">
                  List
                </TabsTrigger>
                <TabsTrigger value="condition" className="text-xs">
                  Condition
                </TabsTrigger>
              </TabsList>
              <TabsContent value="list" className="mt-1.5 space-y-0.5 flex flex-col min-h-0 flex-1">
                <div className="px-1.5 pb-0.5 flex-shrink-0">
                  <div className="relative">
                    <Search className="absolute left-1.5 top-1.5 h-3 w-3 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-7 pl-7 text-xs"
                    />
                  </div>
                </div>
                {filteredValues.length > 0 && (
                  <div className="px-1.5 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-full text-xs justify-start"
                      onClick={handleSelectAll}
                    >
                      {allFilteredSelected ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                )}
                <Separator className="my-0.5" />
                <div
                  className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 max-h-[min(180px,40vh)] min-h-[56px] overscroll-contain"
                  data-dropdown-scroll
                >
                  <div className="p-1.5 space-y-0.5">
                    {filteredValues.length === 0 ? (
                      <div className="text-xs text-muted-foreground py-1.5">
                        {searchTerm ? 'No values match your search' : 'No values available'}
                      </div>
                    ) : (
                      filteredValues.map((value) => {
                        const label = getLabel ? getLabel(value) : value;
                        const isChecked = tempSelections.includes(value);
                        return (
                          <div key={value} className="flex items-center space-x-1.5 py-0.5">
                            <Checkbox
                              id={`filter-${columnKey}-${value}`}
                              checked={isChecked}
                              onCheckedChange={() => handleToggle(value)}
                            />
                            <label
                              htmlFor={`filter-${columnKey}-${value}`}
                              className="text-xs cursor-pointer flex-1 truncate"
                              title={label}
                            >
                              {label}
                            </label>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
                <Separator className="my-0.5" />
                <div className="flex items-center justify-between px-1.5 py-1.5 flex-shrink-0">
                  <div className="text-[11px] text-muted-foreground">
                    {tempSelections.length} of {uniqueValues.length} selected
                  </div>
                  <div className="flex gap-1.5">
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-6 px-2 text-xs"
                      onClick={() => {
                        setTempSelections(selectedValues);
                        setSearchTerm('');
                        handleOpenChange(false);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button size="sm" className="h-6 px-2 text-xs" onClick={handleApplyList}>
                      Apply
                    </Button>
                  </div>
                </div>
              </TabsContent>
              <TabsContent value="condition" className="mt-1.5 space-y-1.5">
                {onConditionChange && (
                  <>
                    <div className="px-1.5">
                      <label className="text-[11px] text-muted-foreground block mb-0.5">Operator</label>
                      <Select
                        value={tempCondition.operator}
                        onValueChange={(v) =>
                          setTempCondition((prev) => ({ ...prev, operator: v }))
                        }
                      >
                        <SelectTrigger className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {operators.map((op) => (
                            <SelectItem key={op.value} value={op.value} className="text-xs">
                              {op.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {tempCondition.operator !== 'is_empty' && (
                      <div className="px-1.5 space-y-1.5">
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
                            <label className="text-[11px] text-muted-foreground block mb-0.5">
                              And
                            </label>
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
                    <Separator className="my-0.5" />
                    <div className="flex justify-end gap-1.5 px-1.5 pb-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={() => {
                          setTempCondition(
                            condition ?? {
                              mode: 'condition',
                              operator: 'contains',
                              value: '',
                            }
                          );
                          handleOpenChange(false);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={handleClearCondition}
                      >
                        Clear
                      </Button>
                      <Button size="sm" className="h-6 px-2 text-xs" onClick={handleApplyCondition}>
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
