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
    // Open dropdown when typing
    if (newValue && !open) {
      setOpen(true)
    }
  }

  const handleInputFocus = () => {
    if (filteredOptions.length > 0) {
      setOpen(true)
    }
  }

  const handleInputBlur = (e: React.FocusEvent) => {
    // Delay closing to allow clicking on options
    setTimeout(() => {
      if (containerRef.current && !containerRef.current.contains(document.activeElement)) {
        setOpen(false)
      }
    }, 200)
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
          className="w-[var(--radix-popover-trigger-width)] p-0 z-50" 
          align="start"
          side="bottom"
          sideOffset={4}
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="max-h-[300px] overflow-hidden">
            {filteredOptions.length > 0 ? (
              <ScrollArea className="h-full">
                <div className="p-1">
                  {filteredOptions.map((option) => (
                    <div
                      key={option}
                      className={cn(
                        "relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground",
                        inputValue === option && "bg-accent text-accent-foreground"
                      )}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        handleSelect(option)
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          inputValue === option ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <span className="flex-1 truncate">{option}</span>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : (
              <div className="py-6 text-center text-sm text-muted-foreground">
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

