import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText, File } from 'lucide-react';
import { exportToExcel, exportToCSV, exportToPDF, formatDataForExport } from '@/utils/exportUtils';
import { toast } from '@/hooks/use-toast';

interface ExportButtonProps {
  data: Record<string, unknown>[];
  filename?: string;
  title?: string;
  disabled?: boolean;
  /** Render as submenu item for use inside another dropdown (e.g. header user menu) */
  asSubmenu?: boolean;
  /** Render as icon-only button (like Refresh/Sign Out in header) */
  asIcon?: boolean;
}

const ExportButton = ({ data, filename = 'export', title = 'Export', disabled = false, asSubmenu = false, asIcon = false }: ExportButtonProps) => {
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async (format: 'excel' | 'csv' | 'pdf') => {
    if (data.length === 0) {
      toast({
        title: 'No data',
        description: 'There is no data to export',
        variant: 'destructive',
      });
      return;
    }

    setIsExporting(true);
    try {
      const formattedData = formatDataForExport(data);
      
      switch (format) {
        case 'excel':
          await exportToExcel(formattedData, filename);
          break;
        case 'csv':
          exportToCSV(formattedData, filename);
          break;
        case 'pdf':
          await exportToPDF(formattedData, filename, title);
          break;
      }

      toast({
        title: 'Export successful',
        description: `Data exported as ${format.toUpperCase()}`,
      });
    } catch (error) {
      toast({
        title: 'Export failed',
        description: error instanceof Error ? error.message : 'Failed to export data',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const exportMenuContent = (
    <>
      <DropdownMenuItem onClick={() => handleExport('excel')} disabled={isExporting}>
        <FileSpreadsheet className="h-4 w-4 mr-2" />
        Export as Excel
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleExport('csv')} disabled={isExporting}>
        <FileText className="h-4 w-4 mr-2" />
        Export as CSV
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleExport('pdf')} disabled={isExporting}>
        <File className="h-4 w-4 mr-2" />
        Export as PDF
      </DropdownMenuItem>
    </>
  );

  if (asSubmenu) {
    return (
      <DropdownMenuSub>
        <DropdownMenuSubTrigger disabled={disabled || isExporting || data.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? 'Exporting...' : 'Export'}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent>{exportMenuContent}</DropdownMenuSubContent>
      </DropdownMenuSub>
    );
  }

  if (asIcon) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={disabled || isExporting || data.length === 0}
            className="inline-flex items-center justify-center shrink-0 h-11 w-11 sm:h-auto sm:w-auto p-0 sm:p-1 rounded-full bg-card border border-border shadow-sm transition-all duration-200 hover:bg-primary/10 hover:border-primary/30 hover:shadow-md disabled:opacity-50 disabled:hover:bg-card disabled:hover:border-border disabled:hover:shadow-sm"
            aria-label="Export"
            title="Export"
          >
            <Download className="h-4 w-4 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">{exportMenuContent}</DropdownMenuContent>
      </DropdownMenu>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || isExporting || data.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {exportMenuContent}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportButton;

