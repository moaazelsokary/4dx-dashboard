import * as React from "react"

import { cn } from "@/lib/utils"

const Table = React.forwardRef<
  HTMLTableElement,
  React.HTMLAttributes<HTMLTableElement>
>(({ className, ...props }, ref) => (
  <div className="relative w-full overflow-auto">
    <table
      ref={ref}
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn("[&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody
    ref={ref}
    className={cn("[&_tr:last-child]:border-0", className)}
    {...props}
  />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tfoot
    ref={ref}
    className={cn(
      "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
      className
    )}
    {...props}
  />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef<
  HTMLTableRowElement,
  React.HTMLAttributes<HTMLTableRowElement>
>(({ className, ...props }, ref) => (
  <tr
    ref={ref}
    className={cn(
      "border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",
      className
    )}
    {...props}
  />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, children, ...props }, ref) => {
  // Detect direction from header content
  // If content starts with Arabic, entire header is RTL
  // If content starts with English, entire header is LTR
  let dir: 'rtl' | 'ltr' | undefined = undefined;
  const textContent = typeof children === 'string' ? children : '';
  
  if (textContent) {
    // Find first strong character (Arabic or English)
    for (let i = 0; i < textContent.length; i++) {
      const char = textContent[i];
      if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(char)) {
        dir = 'rtl';
        break;
      } else if (/[a-zA-Z]/.test(char)) {
        dir = 'ltr';
        break;
      }
    }
    
    // If no strong character found but contains Arabic, use RTL
    if (!dir && /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(textContent)) {
      dir = 'rtl';
    }
  }
  
  return (
    <th
      ref={ref}
      className={cn(
        "h-12 px-4 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0",
        className
      )}
      dir={dir}
      style={{
        textAlign: dir === 'rtl' ? 'right' : (dir === 'ltr' ? 'left' : 'start'),
        unicodeBidi: dir ? 'plaintext' : undefined,
        ...props.style,
      }}
      {...props}
    >
      {children}
    </th>
  );
})
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, children, ...props }, ref) => {
  // Detect direction from cell content
  // If content starts with Arabic, entire cell is RTL
  // If content starts with English, entire cell is LTR
  let dir: 'rtl' | 'ltr' | undefined = undefined;
  const textContent = typeof children === 'string' ? children : '';
  
  if (textContent) {
    // Find first strong character (Arabic or English)
    for (let i = 0; i < textContent.length; i++) {
      const char = textContent[i];
      if (/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(char)) {
        dir = 'rtl';
        break;
      } else if (/[a-zA-Z]/.test(char)) {
        dir = 'ltr';
        break;
      }
    }
    
    // If no strong character found but contains Arabic, use RTL
    if (!dir && /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(textContent)) {
      dir = 'rtl';
    }
  }
  
  return (
    <td
      ref={ref}
      className={cn("p-4 align-middle [&:has([role=checkbox])]:pr-0", className)}
      dir={dir}
      style={{
        textAlign: dir === 'rtl' ? 'right' : (dir === 'ltr' ? 'left' : 'start'),
        unicodeBidi: dir ? 'plaintext' : undefined,
        ...props.style,
      }}
      {...props}
    >
      {children}
    </td>
  );
})
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef<
  HTMLTableCaptionElement,
  React.HTMLAttributes<HTMLTableCaptionElement>
>(({ className, ...props }, ref) => (
  <caption
    ref={ref}
    className={cn("mt-4 text-sm text-muted-foreground", className)}
    {...props}
  />
))
TableCaption.displayName = "TableCaption"

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
