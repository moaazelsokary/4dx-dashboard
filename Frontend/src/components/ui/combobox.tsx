import * as React from "react"
import { Check, ChevronsUpDown } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
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
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    setInputValue(value || "")
  }, [value])

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
    if (!open && newValue) {
      setOpen(true)
    }
  }

  const handleInputFocus = () => {
    if (inputValue && filteredOptions.length > 0) {
      setOpen(true)
    }
  }

  const handleInputBlur = (e: React.FocusEvent) => {
    // Delay closing to allow clicking on options
    setTimeout(() => {
      if (!inputRef.current?.contains(document.activeElement)) {
        setOpen(false)
      }
    }, 200)
  }

  const filteredOptions = React.useMemo(() => {
    if (!inputValue) return options.slice(0, 10) // Show first 10 when empty
    return options.filter((option) =>
      option.toLowerCase().includes(inputValue.toLowerCase())
    ).slice(0, 20) // Limit to 20 results
  }, [options, inputValue])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="relative" ref={inputRef}>
        <Input
          value={inputValue}
          onChange={handleInputChange}
          onFocus={handleInputFocus}
          onBlur={handleInputBlur}
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
        <PopoverContent 
          className="w-[var(--radix-popover-trigger-width)] p-0" 
          align="start"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <Command shouldFilter={false}>
            <CommandList>
              <CommandEmpty>
                {allowCustom && inputValue ? (
                  <div className="py-2 text-sm text-muted-foreground px-2">
                    No match found. Type to create new.
                  </div>
                ) : (
                  "No options available."
                )}
              </CommandEmpty>
              {filteredOptions.length > 0 && (
                <CommandGroup>
                  {filteredOptions.map((option) => (
                    <CommandItem
                      key={option}
                      value={option}
                      onSelect={() => handleSelect(option)}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          inputValue === option ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {option}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </div>
    </Popover>
  )
}

