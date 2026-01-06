/**
 * Export utility functions
 * Supports Excel, CSV, and PDF export formats
 */

// Excel export using xlsx library
export const exportToExcel = async (data: any[], filename: string = 'export'): Promise<void> => {
  try {
    // Dynamic import to avoid loading in bundle if not needed
    const XLSX = await import('xlsx');
    
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  } catch (error) {
    console.error('Excel export error:', error);
    throw new Error('Failed to export to Excel');
  }
};

// CSV export
export const exportToCSV = (data: any[], filename: string = 'export'): void => {
  if (data.length === 0) {
    throw new Error('No data to export');
  }

  // Get headers from first object
  const headers = Object.keys(data[0]);
  
  // Create CSV content
  const csvContent = [
    headers.join(','), // Header row
    ...data.map(row => 
      headers.map(header => {
        const value = row[header];
        // Escape commas and quotes
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      }).join(',')
    )
  ].join('\n');

  // Create blob and download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  URL.revokeObjectURL(url);
};

// PDF export using jsPDF
export const exportToPDF = async (
  data: any[],
  filename: string = 'export',
  title: string = 'Export'
): Promise<void> => {
  try {
    // Dynamic import
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF();
    
    // Add title
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    
    // Add data as table
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      const rows = data.map(row => headers.map(header => row[header] || ''));
      
      // Simple table rendering (for complex tables, consider using autoTable plugin)
      let y = 25;
      const lineHeight = 7;
      const pageHeight = doc.internal.pageSize.height;
      
      // Headers
      doc.setFontSize(12);
      doc.setFont(undefined, 'bold');
      headers.forEach((header, i) => {
        doc.text(header, 14 + (i * 40), y);
      });
      
      y += lineHeight;
      doc.setFont(undefined, 'normal');
      doc.setFontSize(10);
      
      // Data rows
      rows.forEach((row, rowIndex) => {
        if (y > pageHeight - 20) {
          doc.addPage();
          y = 15;
        }
        
        row.forEach((cell, i) => {
          const cellValue = String(cell || '').substring(0, 15); // Truncate long values
          doc.text(cellValue, 14 + (i * 40), y);
        });
        
        y += lineHeight;
      });
    }
    
    doc.save(`${filename}.pdf`);
  } catch (error) {
    console.error('PDF export error:', error);
    throw new Error('Failed to export to PDF');
  }
};

/**
 * Format data for export (flatten nested objects)
 */
export const formatDataForExport = (data: any[]): any[] => {
  return data.map(item => {
    const flattened: any = {};
    
    Object.keys(item).forEach(key => {
      const value = item[key];
      
      if (value === null || value === undefined) {
        flattened[key] = '';
      } else if (typeof value === 'object' && !Array.isArray(value)) {
        // Flatten nested objects
        Object.keys(value).forEach(nestedKey => {
          flattened[`${key}_${nestedKey}`] = value[nestedKey];
        });
      } else if (Array.isArray(value)) {
        // Convert arrays to comma-separated strings
        flattened[key] = value.join(', ');
      } else {
        flattened[key] = value;
      }
    });
    
    return flattened;
  });
};

