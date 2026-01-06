import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileSpreadsheet, FileText, File } from 'lucide-react';
import { exportToExcel, exportToCSV, exportToPDF, formatDataForExport } from '@/utils/exportUtils';
import { toast } from '@/hooks/use-toast';

interface ExportButtonProps {
  data: any[];
  filename?: string;
  title?: string;
  disabled?: boolean;
}

const ExportButton = ({ data, filename = 'export', title = 'Export', disabled = false }: ExportButtonProps) => {
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

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || isExporting || data.length === 0}>
          <Download className="h-4 w-4 mr-2" />
          {isExporting ? 'Exporting...' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
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
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportButton;

