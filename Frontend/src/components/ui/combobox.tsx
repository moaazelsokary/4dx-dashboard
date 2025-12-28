import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

interface ComboboxProps {
  options: string[]
  value?: string
  onValueChange: (value: string) => void
  placeholder?: string
  allowCustom?: boolean
  className?: string
}

export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select or type...",
  allowCustom = true,
  className,
}: ComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState(value || "")
  const containerRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    setInputValue(value || "")
  }, [value])

  const filteredOptions = React.useMemo(() => {
    if (!inputValue.trim()) return options.slice(0, 15) // Show first 15 when empty
    return options.filter((option) =>
      option.toLowerCase().includes(inputValue.toLowerCase())
    ).slice(0, 30) // Limit to 30 results
  }, [options, inputValue])

  const handleSelect = (selectedValue: string) => {
    setInputValue(selectedValue)
    onValueChange(selectedValue)
    setOpen(false)
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    if (allowCustom) {
      onValueChange(newValue)
    }
    // Always open dropdown when typing or when there are options
    if (options.length > 0) {
      setOpen(true)
    }
  }

  const handleInputFocus = () => {
    // Always open when focused if there are options
    if (options.length > 0) {
      setOpen(true)
    }
  }

  const handleInputBlur = (e: React.FocusEvent) => {
    // Delay closing to allow clicking on options
    setTimeout(() => {
      const activeElement = document.activeElement
      if (containerRef.current && 
          !containerRef.current.contains(activeElement) &&
          !(activeElement && activeElement.closest('[role="listbox"]'))) {
        setOpen(false)
      }
    }, 300)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div className="relative w-full" ref={containerRef}>
      <Popover open={open} onOpenChange={setOpen}>
        <div className="relative">
          <Input
            value={inputValue}
            onChange={handleInputChange}
            onFocus={handleInputFocus}
            onBlur={handleInputBlur}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className={cn("w-full pr-8", className)}
          />
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="absolute right-0 top-0 h-full px-2 py-0 hover:bg-transparent"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setOpen(!open)
              }}
            >
              <ChevronsUpDown className="h-4 w-4 opacity-50" />
            </Button>
          </PopoverTrigger>
        </div>
        <PopoverContent 
          className="w-[var(--radix-popover-trigger-width)] p-0 z-[100] border-2 shadow-lg" 
          align="start"
          side="bottom"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-[300px] overflow-hidden bg-popover">
            {filteredOptions.length > 0 ? (
              <ScrollArea className="h-full max-h-[300px]">
                <div className="p-1">
                  {filteredOptions.map((option) => (
                    <div
                      key={option}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2 text-sm outline-none transition-colors",
                        "hover:bg-primary/10 hover:text-primary-foreground",
                        "focus:bg-primary/10 focus:text-primary-foreground",
                        inputValue === option && "bg-primary/20 text-primary-foreground font-medium"
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleSelect(option)
                      }}
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        handleSelect(option)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4 flex-shrink-0",
                          inputValue === option ? "opacity-100 text-primary" : "opacity-0"
                        )}
                      />
                      <span className="flex-1 truncate text-left">{option}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground px-4">
                {allowCustom && inputValue ? (
                  <>No match found. Type to create new.</>
                ) : (
                  <>No options available.</>
                )}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}

