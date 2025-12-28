import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, ChevronDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SelectorProps {
  options: string[];
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowCustom?: boolean;
  className?: string;
}

export function Selector({
  options,
  value,
  onValueChange,
  placeholder = 'Select...',
  disabled = false,
  allowCustom = true,
  className,
}: SelectorProps) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Filter options based on search term
  const filteredOptions = options.filter(option =>
    option.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue);
    setOpen(false);
    setSearchTerm('');
  };

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && allowCustom && searchTerm.trim()) {
      // Allow creating custom value on Enter
      handleSelect(searchTerm.trim());
    }
  };

  const displayText = value || placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
          disabled={disabled}
          aria-label={value || placeholder}
          title={value || placeholder}
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {displayText}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[400px] p-0" align="start">
        <div className="p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              onKeyDown={handleInputKeyDown}
              className="h-8"
              autoFocus
            />
          </div>
          <ScrollArea className="h-[300px]">
            <div className="space-y-1 p-2">
              {filteredOptions.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-4">
                  {allowCustom && searchTerm ? (
                    <div
                      className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                      onClick={() => handleSelect(searchTerm.trim())}
                    >
                      <Plus className="h-4 w-4 text-primary" />
                      <span className="text-sm flex-1 text-primary font-medium">
                        Add "{searchTerm.trim()}"
                      </span>
                    </div>
                  ) : (
                    <>No options found</>
                  )}
                </div>
              ) : (
                <>
                  {filteredOptions.map((option) => {
                    const isSelected = value === option;
                    return (
                      <div
                        key={option}
                        className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                        onClick={() => handleSelect(option)}
                      >
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => handleSelect(option)}
                        />
                        <span className="text-sm flex-1">{option}</span>
                      </div>
                    );
                  })}
                  {allowCustom && searchTerm.trim() && !filteredOptions.includes(searchTerm.trim()) && (
                    <div
                      className="flex items-center space-x-2 p-2 rounded-md hover:bg-accent cursor-pointer border-t mt-1 pt-2"
                      onClick={() => handleSelect(searchTerm.trim())}
                    >
                      <Plus className="h-4 w-4 text-primary" />
                      <span className="text-sm flex-1 text-primary font-medium">
                        Add "{searchTerm.trim()}"
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </div>
      </PopoverContent>
    </Popover>
  );
}

