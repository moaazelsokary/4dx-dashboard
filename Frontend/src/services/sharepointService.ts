// SharePoint Service for Excel Data Integration
import { DepartmentData, ExcelRow } from '../types/dashboard';

// Export LagMetric type
export interface LagMetric {
  id: string;
  name: string;
  value: number;
  target: number;
  trend: number;
  isLessBetter: boolean; // New flag for "عدد يقل" metrics
  lagNumber?: number; // Sequential LAG number for visual display
  leads: {
    id: string;
    name: string;
    value: number;
    target: number;
    trend: number;
    isLessBetter: boolean; // New flag for "عدد يقل" metrics
    lagNumber?: number; // Sequential LAG number for visual display
    leadNumber?: number; // Sequential LEAD number for visual display
    rawData: string[];
  }[];
  rawData: string[];
}

// Configuration from environment variables
const CLIENT_ID = import.meta.env.VITE_SHAREPOINT_CLIENT_ID;
const CLIENT_SECRET = import.meta.env.VITE_SHAREPOINT_CLIENT_SECRET;
const TENANT_ID = import.meta.env.VITE_SHAREPOINT_TENANT_ID;
const SITE_NAME = import.meta.env.VITE_SHAREPOINT_SITE_NAME;
const API_BASE_URL =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3001/api/sharepoint/v1.0'
    : '/.netlify/functions/sharepoint-proxy?apiPath=/v1.0'; // Use Netlify Function in production
const PROXY_URL =
  window.location.hostname === 'localhost'
    ? 'http://localhost:3001'
    : '/.netlify/functions/sharepoint-proxy'; // Use Netlify Function in production

// Debug: Log environment variables on service load
console.log('[SharePoint] Environment variables loaded:');
console.log('- CLIENT_ID:', CLIENT_ID ? '✓ Set' : '✗ Missing');
console.log('- CLIENT_SECRET:', CLIENT_SECRET ? '✓ Set' : '✗ Missing');
console.log('- TENANT_ID:', TENANT_ID ? '✓ Set' : '✗ Missing');
console.log('- SITE_NAME:', SITE_NAME ? '✓ Set' : '✗ Missing');
console.log('- API_BASE_URL:', API_BASE_URL ? '✓ Set' : '✗ Missing');
console.log('- PROXY_URL:', PROXY_URL ? '✓ Set' : '✗ Missing');

// Department file mappings - using the exact file ID from the working PowerShell script
const DEPARTMENT_FILES: Record<string, { fileId: string; tabName: string }> = {
  hr: { fileId: '015WRP26KMA22PKQDXRZDIBQTMLPSUWDHM', tabName: '2025Plan' },
  communication: { fileId: '015WRP26M6JGYOCUT2ZREKQP35DMVNJQMW', tabName: 'خطة 2025' },
  dfr: { fileId: '015WRP26O42CGK6PWAWFA344FHV3AYWGM5', tabName: 'خطة 2025' },
  it: { fileId: '015WRP26OSI2OIZTPIQJHKO5OR3CODU4JJ', tabName: '2025Plan' },
  operations: { fileId: '015WRP26POW3EIOK4XE5E3PU6W5LYQ2RMK', tabName: 'خطة 2025' },
  case: { fileId: '015WRP26OEFFH4OUJMBVCZTDYS3BS4QN4L', tabName: 'خطة 2025' },
  bdm: { fileId: '015WRP26O62QG2JRID5FFYJSPGX5SROGWO', tabName: 'خطة 2025' },
  security: { fileId: '015WRP26O6IPWEPSSJZZDZZA4CSWTVDXWJ', tabName: 'خطة 2025' },
  admin: { fileId: '015WRP26MHUUUOESOO3RDY3VJVVDJLOKS5', tabName: 'خطة 2025' },
  procurement: { fileId: '015WRP26I3VOGN55BL5VHL4O3IRNFCAVE4', tabName: 'خطة 2025' },
  offices: { fileId: '015WRP26NCJ7WE4D6CNBHYJHIN7ZNCJ6OK', tabName: 'خطة 2025' },
  ceo: { fileId: '015WRP26P5LLCBDPHI7ZDLURJON3SHG6XF', tabName: 'CEO Plan' }
};

// Parse department files from environment variable as fallback
function parseDepartmentFiles(): Record<string, { fileId: string; tabName: string }> {
  const envFiles = import.meta.env.VITE_DEPARTMENT_FILES;
  if (!envFiles) return DEPARTMENT_FILES;

  const files: Record<string, { fileId: string; tabName: string }> = {};
  const pairs = envFiles.split(',');
  
  pairs.forEach(pair => {
    const [dept, fileId, tabName] = pair.trim().split(':');
    if (dept && fileId && tabName) {
      files[dept.toLowerCase()] = { fileId, tabName };
    }
  });
  
  return files;
}

// Get access token using client credentials flow
async function getAccessToken(): Promise<string> {
  console.log('[SharePoint] Requesting access token...');
  
  const tokenUrl = `${PROXY_URL}/api/oauth/${TENANT_ID}/oauth2/v2.0/token`;
  const body = new URLSearchParams({
    client_id: CLIENT_ID!,
    scope: 'https://graph.microsoft.com/.default',
    client_secret: CLIENT_SECRET!,
    grant_type: 'client_credentials'
  });

  try {
    console.log('[SharePoint] Token URL:', tokenUrl);
    console.log('[SharePoint] Request body:', body.toString());
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: body.toString(),
      mode: 'cors' // Explicitly set CORS mode
    });

    console.log('[SharePoint] Token response status:', response.status);
    console.log('[SharePoint] Token response headers:', Object.fromEntries(response.headers.entries()));

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SharePoint] Token request failed:', response.status, errorText);
      
      // Check if it's the specific Azure AD error about client type
      if (errorText.includes('AADSTS9002326')) {
        throw new Error('Azure AD Configuration Error: Your app is configured as "Web app" but needs to be "Single-page application" or use a different authentication method. Please contact your Azure administrator.');
      }
      
      throw new Error(`Failed to get access token: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('[SharePoint] Successfully obtained access token');
    return data.access_token;
  } catch (error) {
    console.error('[SharePoint] Error getting access token:', error);
    
    // Check if it's a CORS error
    if (error instanceof TypeError && error.message.includes('fetch')) {
      console.error('[SharePoint] CORS error detected. This is likely due to browser security restrictions.');
      throw new Error('CORS Error: Cannot access Microsoft APIs directly from browser. A proxy server is required.');
    }
    
    throw error;
  }
}

// Get SharePoint site ID (using proxy)
async function getSiteId(): Promise<string> {
  console.log('[SharePoint] Getting site ID...');
  
  const siteUrl = `${API_BASE_URL}/sites/lifemaker.sharepoint.com:/sites/${SITE_NAME}`;
  
  try {
    const response = await fetch(siteUrl, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SharePoint] Site request failed:', response.status, errorText);
      throw new Error(`Failed to get site ID: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    console.log('[SharePoint] Successfully found Site ID:', data.id);
    return data.id;
  } catch (error) {
    console.error('[SharePoint] Error getting site ID:', error);
    throw error;
  }
}

// Get Excel data from SharePoint (using proxy)
async function getExcelData(siteId: string, fileId: string, tabName: string): Promise<ExcelRow[]> {
  console.log(`[SharePoint] Retrieving data from Excel file: ${fileId}, tab: ${tabName}`);
  
  // URL encode the tab name for Arabic characters
  const encodedTabName = encodeURIComponent(tabName);
  
  // Use the exact same range as the working PowerShell script
  const rangeAddress = 'E3:AN200';
  
  const excelUrl = `${API_BASE_URL}/sites/${siteId}/drive/items/${fileId}/workbook/worksheets('${encodedTabName}')/range(address='${rangeAddress}')`;
  
  try {
    const response = await fetch(excelUrl, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SharePoint] Excel data request failed:', response.status, errorText);
      throw new Error(`Failed to get Excel data: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.values || !Array.isArray(data.values)) {
      console.warn('[SharePoint] No data found in the specified range');
      return [];
    }

    // Filter out rows where the first 6 columns are all empty
    const filteredRows = data.values.filter((row: any[]) => {
      return row.slice(0, 6).some(cell => cell !== undefined && cell !== null && cell.toString().trim() !== '');
    });

    console.log(`[SharePoint] Successfully retrieved ${filteredRows.length} rows of data`);
    console.log('[SharePoint] Raw Excel data structure:', filteredRows.slice(0, 3)); // Show first 3 rows for debugging
    
    // Convert the raw data to ExcelRow format
    return filteredRows.map((row: any[], index: number) => ({
      id: index + 1,
      data: row.map((cell: any) => cell?.toString() || '')
    }));
  } catch (error) {
    console.error('[SharePoint] Error getting Excel data:', error);
    throw error;
  }
}

// Helper function to get current month's data
const getCurrentMonthData = (rowData: string[]): { target: number; achieved: number } => {
  // Monthly data starts from column 12 (index 12)
  // Structure: Target1, Achieved1, Target2, Achieved2, Target3, Achieved3, etc.
  const monthlyData = rowData.slice(12);
  
  // Find the last non-empty target/achievement pair
  let currentTarget = 0;
  let currentAchieved = 0;
  
  for (let i = 0; i < monthlyData.length - 1; i += 2) {
    const target = parseFloat(monthlyData[i]) || 0;
    const achieved = parseFloat(monthlyData[i + 1]) || 0;
    
    if (target > 0) { // If there's a target, this is a valid month
      currentTarget = target;
      currentAchieved = achieved;
    }
  }
  
  return { target: currentTarget, achieved: currentAchieved };
};

function normalizeArabic(str) {
  return (str || '').replace(/\s+/g, '').toLowerCase();
}

// Helper function to get filtered monthly data based on selected months
const getFilteredMonthlyData = (rowData: string[], selectedPeriod?: string, selectedMonths?: string[], selectedQuarters?: string[], startMonth?: string, endMonth?: string, tamyeez?: string): { target: number; achieved: number } => {
  const monthlyData = rowData.slice(12);
  // Check if this is a percentage type metric or "عدد يقل" metric
  const isPercentage = tamyeez?.trim() === 'نسبة';
  const isLessBetter = tamyeez?.trim() === 'عدد يقل';
  const shouldUseAverage = isPercentage || isLessBetter; // Both use average for multiple months
  
  // If no filtering is applied, return current month data
  if (!selectedPeriod || !selectedMonths?.length) {
    return getCurrentMonthData(rowData);
  }

  let totalTarget = 0;
  let totalAchieved = 0;
  let monthCount = 0;
  let achievedArr: number[] = [];
  let targetArr: number[] = [];

  if (selectedPeriod === "monthly" && selectedMonths?.length) {
    selectedMonths.forEach(monthStr => {
      const monthIndex = parseInt(monthStr.split('-')[1]) - 1;
      const targetIndex = monthIndex * 2;
      const achievedIndex = monthIndex * 2 + 1;
      if (targetIndex < monthlyData.length && achievedIndex < monthlyData.length) {
        const target = parseFloat(monthlyData[targetIndex]) || 0;
        const achieved = parseFloat(monthlyData[achievedIndex]) || 0;
        if (target > 0) {
          totalTarget += target;
          totalAchieved += achieved;
          monthCount++;
          achievedArr.push(achieved);
          targetArr.push(target);
        }
      }
    });
    if (shouldUseAverage && monthCount > 0) {
      console.log('[SharePoint] Using average for نسبة/عدد يقل:', { achievedArr, targetArr });
      return {
        target: targetArr.reduce((a, b) => a + b, 0) / monthCount,
        achieved: achievedArr.reduce((a, b) => a + b, 0) / monthCount
      };
    }
  } else if (selectedPeriod === "quarterly" && selectedQuarters?.length) {
    selectedQuarters.forEach(quarter => {
      let startMonth = 0;
      let endMonth = 0;
      switch (quarter) {
        case 'Q1': startMonth = 0; endMonth = 2; break;
        case 'Q2': startMonth = 3; endMonth = 5; break;
        case 'Q3': startMonth = 6; endMonth = 8; break;
        case 'Q4': startMonth = 9; endMonth = 11; break;
      }
      for (let i = startMonth; i <= endMonth; i++) {
        const targetIndex = i * 2;
        const achievedIndex = i * 2 + 1;
        if (targetIndex < monthlyData.length && achievedIndex < monthlyData.length) {
          const target = parseFloat(monthlyData[targetIndex]) || 0;
          const achieved = parseFloat(monthlyData[achievedIndex]) || 0;
          if (target > 0) {
            totalTarget += target;
            totalAchieved += achieved;
            monthCount++;
            achievedArr.push(achieved);
            targetArr.push(target);
          }
        }
      }
    });
    if (shouldUseAverage && monthCount > 0) {
      console.log('[SharePoint] Using average for نسبة/عدد يقل:', { achievedArr, targetArr });
      return {
        target: targetArr.reduce((a, b) => a + b, 0) / monthCount,
        achieved: achievedArr.reduce((a, b) => a + b, 0) / monthCount
      };
    }
  } else if (selectedPeriod === "cumulative" && startMonth && endMonth) {
    const startIndex = parseInt(startMonth.split('-')[1]) - 1;
    const endIndex = parseInt(endMonth.split('-')[1]) - 1;
    for (let i = startIndex; i <= endIndex; i++) {
      const targetIndex = i * 2;
      const achievedIndex = i * 2 + 1;
      if (targetIndex < monthlyData.length && achievedIndex < monthlyData.length) {
        const target = parseFloat(monthlyData[targetIndex]) || 0;
        const achieved = parseFloat(monthlyData[achievedIndex]) || 0;
        if (target > 0) {
          totalTarget += target;
          totalAchieved += achieved;
          monthCount++;
          achievedArr.push(achieved);
          targetArr.push(target);
        }
      }
    }
    if (shouldUseAverage && monthCount > 0) {
      console.log('[SharePoint] Using average for نسبة/عدد يقل:', { achievedArr, targetArr });
      return {
        target: targetArr.reduce((a, b) => a + b, 0) / monthCount,
        achieved: achievedArr.reduce((a, b) => a + b, 0) / monthCount
      };
    }
  }

  if (monthCount === 0) {
      return getCurrentMonthData(rowData);
  }

  return { target: totalTarget, achieved: totalAchieved };
};

// Helper function to calculate trend from monthly data
const calculateTrendFromMonthlyData = (rowData: string[], selectedPeriod?: string, selectedMonths?: string[], selectedQuarters?: string[], startMonth?: string, endMonth?: string, tamyeez?: string): number => {
  // Monthly data starts from column 12 (index 12)
  const monthlyData = rowData.slice(12);
  
  // Check if this is "عدد يقل" (less is better)
  const isLessBetter = tamyeez?.trim() === 'عدد يقل';
  
  // Get current period data
  const currentPeriod = getFilteredMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, tamyeez);
  
  // Calculate previous period data based on current selection
  let previousPeriod = { target: 0, achieved: 0 };
  
  if (selectedPeriod === "monthly" && selectedMonths?.length) {
    // For monthly, compare with the previous month
    const currentMonth = parseInt(selectedMonths[0].split('-')[1]); // Get first selected month
    const previousMonth = currentMonth - 1;
    
    if (previousMonth >= 1) { // Ensure we don't go below January
      const previousMonthStr = `2025-${previousMonth.toString().padStart(2, '0')}`;
      previousPeriod = getFilteredMonthlyData(rowData, "monthly", [previousMonthStr]);
    }
  } else if (selectedPeriod === "quarterly" && selectedQuarters?.length) {
    // For quarterly, compare with the previous quarter
    const currentQuarter = selectedQuarters[0];
    let previousQuarter = '';
    
    switch (currentQuarter) {
      case 'Q2': previousQuarter = 'Q1'; break;
      case 'Q3': previousQuarter = 'Q2'; break;
      case 'Q4': previousQuarter = 'Q3'; break;
      default: previousQuarter = ''; // Q1 has no previous quarter
    }
    
    if (previousQuarter) {
      // Calculate previous quarter data directly to avoid recursive calls
      let prevStartMonth = 0;
      let prevEndMonth = 0;
      
      switch (previousQuarter) {
        case 'Q1': prevStartMonth = 0; prevEndMonth = 2; break;
        case 'Q2': prevStartMonth = 3; prevEndMonth = 5; break;
        case 'Q3': prevStartMonth = 6; prevEndMonth = 8; break;
        case 'Q4': prevStartMonth = 9; prevEndMonth = 11; break;
      }
      
      let prevTarget = 0;
      let prevAchieved = 0;
      
      for (let i = prevStartMonth; i <= prevEndMonth; i++) {
        const targetIndex = i * 2;
        const achievedIndex = i * 2 + 1;
        
        if (targetIndex < monthlyData.length && achievedIndex < monthlyData.length) {
          const target = parseFloat(monthlyData[targetIndex]) || 0;
          const achieved = parseFloat(monthlyData[achievedIndex]) || 0;
          
          if (target > 0) {
            prevTarget += target;
            prevAchieved += achieved;
          }
        }
      }
      
      previousPeriod = { target: prevTarget, achieved: prevAchieved };
      console.log(`[SharePoint] Quarterly trend: Previous period data calculated for ${previousQuarter}`);
    } else {
      console.log(`[SharePoint] Quarterly trend: No previous quarter available for ${currentQuarter}`);
    }
  } else if (selectedPeriod === "cumulative" && startMonth && endMonth) {
    // For cumulative, compare with the previous period of same length
    const startIndex = parseInt(startMonth.split('-')[1]) - 1;
    const endIndex = parseInt(endMonth.split('-')[1]) - 1;
    const periodLength = endIndex - startIndex + 1;
    
    const previousStartIndex = Math.max(0, startIndex - periodLength);
    const previousEndIndex = startIndex - 1;
    
    if (previousEndIndex >= previousStartIndex) {
      const previousStartMonth = `2025-${(previousStartIndex + 1).toString().padStart(2, '0')}`;
      const previousEndMonth = `2025-${(previousEndIndex + 1).toString().padStart(2, '0')}`;
      previousPeriod = getFilteredMonthlyData(rowData, "cumulative", undefined, undefined, previousStartMonth, previousEndMonth);
    }
  }
  
  // Calculate achievement rates based on whether "less is better"
  const currentRate = currentPeriod.target > 0 ? 
    isLessBetter ? 
      (currentPeriod.achieved === 0 ? 0 : (currentPeriod.target / currentPeriod.achieved) * 100) : // For "عدد يقل"
      (currentPeriod.achieved / currentPeriod.target) * 100 : // For normal metrics
    0;
  
  const previousRate = previousPeriod.target > 0 ? 
    isLessBetter ? 
      (previousPeriod.achieved === 0 ? 0 : (previousPeriod.target / previousPeriod.achieved) * 100) : // For "عدد يقل"
      (previousPeriod.achieved / previousPeriod.target) * 100 : // For normal metrics
    0;
  
  console.log(`[SharePoint] Trend calculation:`);
  console.log(`[SharePoint] Current period: Target=${currentPeriod.target}, Achieved=${currentPeriod.achieved}, Rate=${currentRate.toFixed(2)}%`);
  console.log(`[SharePoint] Previous period: Target=${previousPeriod.target}, Achieved=${previousPeriod.achieved}, Rate=${previousRate.toFixed(2)}%`);
  
  // Handle "Not Yet" cases
  if (currentPeriod.target === 0 && currentPeriod.achieved === 0) {
    console.log(`[SharePoint] Current period has "Not Yet" status - no trend calculation possible`);
    return 0; // No trend for "Not Yet" periods
  }
  
  if (previousPeriod.target === 0 && previousPeriod.achieved === 0) {
    console.log(`[SharePoint] Previous period has "Not Yet" status - no trend calculation possible`);
    return 0; // No trend when previous period is "Not Yet"
  }
  
  if (previousRate === 0) return 0;
  
  const trend = currentRate - previousRate;
  const roundedTrend = Math.round(trend * 100) / 100; // Round to 2 decimal places
  
  console.log(`[SharePoint] Trend: ${roundedTrend}%`);
  return roundedTrend;
};

// Helper function to get total achieved vs total target
const getTotalData = (rowData: string[]): { totalTarget: number; totalAchieved: number } => {
  const totalTarget = parseFloat(rowData[4]) || 0;
  const totalAchieved = parseFloat(rowData[5]) || 0;
  return { totalTarget, totalAchieved };
};

// Helper to normalize value/target for Not Yet and Over Target cases
function normalizeValueTarget(value: number, target: number): { value: number, target: number } {
  if ((target === 0 || isNaN(target)) && (value === 0 || isNaN(value))) {
    // Not in this period: 0/0
    return { value: 0, target: 0 };
  } else if ((target === 0 || isNaN(target)) && value > 0) {
    // Over Target: achieved > 0, planned 0
    return { value: value, target: 0 };
  }
  return { value, target };
}

// Transform Excel data to LagMetric format
function transformExcelToLagMetrics(
  excelData: ExcelRow[],
  selectedPeriod?: string,
  selectedMonths?: string[],
  selectedQuarters?: string[],
  startMonth?: string,
  endMonth?: string
): LagMetric[] {
  console.log('[SharePoint] Transforming Excel data to LagMetrics...');
  if (excelData.length === 0) return [];

  // Force the index of التمييز to 4 for all rows
  let indicatorColIdx = 2; // default fallback
  let typeColIdx = 4; // FORCE التمييز to index 4
  const headerRow = excelData[0]?.data || [];
  for (let idx = 0; idx < headerRow.length; idx++) {
    const normalizedHeader = normalizeArabic(headerRow[idx]);
    if (normalizedHeader === normalizeArabic('المؤشرات')) {
      indicatorColIdx = idx;
    }
    // We ignore dynamic detection for التمييز, always use 4
  }
  console.log('[SharePoint] المؤشرات column index:', indicatorColIdx);
  console.log('[SharePoint] التمييز column index (FORCED):', typeColIdx, 'header value:', headerRow[typeColIdx]);

  const lagMetrics: LagMetric[] = [];
  let i = 0;
  let lagCounter = 1; // Counter for numbering LAGs
  while (i < excelData.length) {
    const row = excelData[i];
    const rowData = row.data;
    const type = rowData[0]?.trim().toUpperCase();
    const name = rowData[1]?.trim();
    let tamyeez = rowData[typeColIdx];
    // Check if this is "عدد يقل" (less is better)
    const isLessBetter = tamyeez?.trim() === 'عدد يقل';
    if (name) {
      console.log(`[SharePoint] Row ${i} name: ${name}, التمييز:`, tamyeez, 'isLessBetter:', isLessBetter);
    }
    // --- LAG GROUPING ---
    if (type === 'LAG' && name) {
      // Check for indicators: must be at least ONE blank تصنيف الهدف row
      let j = i + 1;
      let indicatorRows: { row: ExcelRow; idx: number }[] = [];
      while (j < excelData.length) {
        const nextType = excelData[j].data[0]?.trim().toUpperCase();
        if (nextType === '' || nextType === undefined) {
          indicatorRows.push({ row: excelData[j], idx: j });
          j++;
        } else {
          break;
        }
      }
      if (indicatorRows.length >= 1) {
        // --- LAG with indicators ---
        // The LAG's own row is also an indicator (first one)
        const allIndicators = [{ row, idx: i }, ...indicatorRows];
        // Create indicator cards (use المؤشرات for name)
        const indicatorCards: LagMetric[] = allIndicators.map((indicator, idx) => {
          const rowData = indicator.row.data;
          const indicatorName = rowData[indicatorColIdx]?.trim() || `Indicator ${idx + 1}`;
          const indicatorTamyeez = rowData[typeColIdx]?.trim();
          const indicatorIsLessBetter = indicatorTamyeez === 'عدد يقل';
          const currentMonth = getFilteredMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, indicatorTamyeez);
          const totalData = getTotalData(rowData);
          const trend = calculateTrendFromMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, indicatorTamyeez);
          const norm = normalizeValueTarget(currentMonth.achieved, currentMonth.target);
          const value = norm.value;
          const target = norm.target;
          return {
            id: `lag_${indicator.idx}_indicator`,
            name: indicatorName,
            value,
            target,
            trend,
            isLessBetter: indicatorIsLessBetter,
            leads: [], // Will be filled below
            rawData: rowData
          };
        });
        // Create average card (use LAG name)
        const sumValue = indicatorCards.reduce((sum, l) => sum + l.value, 0);
        const sumTarget = indicatorCards.reduce((sum, l) => sum + l.target, 0);
        const avgTrend = indicatorCards.reduce((sum, l) => sum + l.trend, 0) / indicatorCards.length;
        const avgCard: LagMetric = {
          id: `lag_${i}_average`,
          name: `${name} (Average)`,
          value: sumValue,
          target: sumTarget,
          trend: avgTrend,
          isLessBetter: isLessBetter,
          lagNumber: lagCounter,
          leads: [], // Will be filled below
          rawData: rowData
        };
        // --- LEAD GROUPING for this LAG ---
        let leadStart = j;
        let leadCounter = 1; // Counter for numbering LEADs under this LAG
        while (leadStart < excelData.length) {
          const leadType = excelData[leadStart].data[0]?.trim().toUpperCase();
          const leadName = excelData[leadStart].data[1]?.trim();
          const leadTamyeez = excelData[leadStart].data[typeColIdx]?.trim();
          if (leadType === 'LEAD' && leadName) {
            // Check for LEAD indicators (must be at least 1)
            let k = leadStart + 1;
            let leadIndicatorRows: { row: ExcelRow; idx: number }[] = [];
            while (k < excelData.length) {
              const nextType = excelData[k].data[0]?.trim().toUpperCase();
              if (nextType === '' || nextType === undefined) {
                leadIndicatorRows.push({ row: excelData[k], idx: k });
                k++;
              } else {
                break;
              }
            }
            if (leadIndicatorRows.length >= 1) {
              // LEAD with indicators: the LEAD's own row is also an indicator
              const allLeadIndicators = [{ row: excelData[leadStart], idx: leadStart }, ...leadIndicatorRows];
              const leadIndicatorCards = allLeadIndicators.map((indicator, idx2) => {
                const rowData = indicator.row.data;
                const indicatorName = rowData[indicatorColIdx]?.trim() || `Indicator ${idx2 + 1}`;
                const indicatorTamyeez = rowData[typeColIdx]?.trim();
                const indicatorIsLessBetter = indicatorTamyeez === 'عدد يقل';
                const currentMonth = getFilteredMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, indicatorTamyeez);
                const totalData = getTotalData(rowData);
                const trend = calculateTrendFromMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, indicatorTamyeez);
                const norm = normalizeValueTarget(currentMonth.achieved, currentMonth.target);
                const value = norm.value;
                const target = norm.target;
                return {
                  id: `lead_${indicator.idx}_indicator`,
                  name: indicatorName,
                  value,
                  target,
                  trend,
                  isLessBetter: indicatorIsLessBetter,
                  rawData: rowData
                };
              });
              // Create average card for LEAD
              const sumLeadValue = leadIndicatorCards.reduce((sum, l) => sum + l.value, 0);
              const sumLeadTarget = leadIndicatorCards.reduce((sum, l) => sum + l.target, 0);
              const avgLeadTrend = leadIndicatorCards.reduce((sum, l) => sum + l.trend, 0) / leadIndicatorCards.length;
              const avgLeadCard = {
                id: `lead_${leadStart}_average`,
                name: `${leadName} (Average)`,
                value: sumLeadValue,
                target: sumLeadTarget,
                trend: avgLeadTrend,
                isLessBetter: isLessBetter,
                leadNumber: leadCounter,
                rawData: rowData
              };
              avgCard.leads.push(avgLeadCard, ...leadIndicatorCards);
              leadCounter++;
              leadStart = k;
            } else {
              // Normal LEAD (no indicators)
              const rowData = excelData[leadStart].data;
              const currentMonth = getFilteredMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, leadTamyeez);
              const totalData = getTotalData(rowData);
              const trend = calculateTrendFromMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, leadTamyeez);
              const norm = normalizeValueTarget(currentMonth.achieved, currentMonth.target);
              const value = norm.value;
              const target = norm.target;
              avgCard.leads.push({
                id: `lead_${leadStart}`,
                name: leadName,
                value,
                target,
                trend,
                isLessBetter: isLessBetter,
                leadNumber: leadCounter,
                rawData: rowData
              });
              leadCounter++;
              leadStart = k;
            }
          } else if (leadType === 'LAG' && leadName) {
            break; // Next LAG group
          } else {
            leadStart++;
          }
        }
        // Add all LAG cards (average + indicators) to the result as a group
        lagMetrics.push(avgCard, ...indicatorCards);
        lagCounter++; // Increment counter for next LAG
        i = leadStart;
      } else {
        // --- Normal LAG (no indicators) ---
        const currentMonth = getFilteredMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, tamyeez);
        const totalData = getTotalData(rowData);
        const trend = calculateTrendFromMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, tamyeez);
        const norm = normalizeValueTarget(currentMonth.achieved, currentMonth.target);
        const value = norm.value;
        const target = norm.target;
        // LEADs for this LAG
        let leads: any[] = [];
        let leadStart = j;
        let leadCounter = 1; // Counter for numbering LEADs under this LAG
        while (leadStart < excelData.length) {
          const leadType = excelData[leadStart].data[0]?.trim().toUpperCase();
          const leadName = excelData[leadStart].data[1]?.trim();
          const leadTamyeez = excelData[leadStart].data[typeColIdx]?.trim();
          if (leadType === 'LEAD' && leadName) {
            // Check for LEAD indicators (must be at least 1)
            let k = leadStart + 1;
            let leadIndicatorRows: { row: ExcelRow; idx: number }[] = [];
            while (k < excelData.length) {
              const nextType = excelData[k].data[0]?.trim().toUpperCase();
              if (nextType === '' || nextType === undefined) {
                leadIndicatorRows.push({ row: excelData[k], idx: k });
                k++;
              } else {
                break;
              }
            }
            if (leadIndicatorRows.length >= 1) {
              // LEAD with indicators: the LEAD's own row is also an indicator
              const allLeadIndicators = [{ row: excelData[leadStart], idx: leadStart }, ...leadIndicatorRows];
              const leadIndicatorCards = allLeadIndicators.map((indicator, idx2) => {
                const rowData = indicator.row.data;
                const indicatorName = rowData[indicatorColIdx]?.trim() || `Indicator ${idx2 + 1}`;
                const indicatorTamyeez = rowData[typeColIdx]?.trim();
                const indicatorIsLessBetter = indicatorTamyeez === 'عدد يقل';
                const currentMonth = getFilteredMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, indicatorTamyeez);
                const totalData = getTotalData(rowData);
                const trend = calculateTrendFromMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, indicatorTamyeez);
                const norm = normalizeValueTarget(currentMonth.achieved, currentMonth.target);
                const value = norm.value;
                const target = norm.target;
                return {
                  id: `lead_${indicator.idx}_indicator`,
                  name: indicatorName,
                  value,
                  target,
                  trend,
                  isLessBetter: indicatorIsLessBetter,
                  rawData: rowData
                };
              });
              // Create average card for LEAD
              const sumLeadValue = leadIndicatorCards.reduce((sum, l) => sum + l.value, 0);
              const sumLeadTarget = leadIndicatorCards.reduce((sum, l) => sum + l.target, 0);
              const avgLeadTrend = leadIndicatorCards.reduce((sum, l) => sum + l.trend, 0) / leadIndicatorCards.length;
              const avgLeadCard = {
                id: `lead_${leadStart}_average`,
                name: `${leadName} (Average)`,
                value: sumLeadValue,
                target: sumLeadTarget,
                trend: avgLeadTrend,
                isLessBetter: isLessBetter,
                leadNumber: leadCounter,
                rawData: rowData
              };
              leads.push(avgLeadCard, ...leadIndicatorCards);
              leadCounter++;
              leadStart = k;
            } else {
              // Normal LEAD (no indicators)
              const rowData = excelData[leadStart].data;
              const currentMonth = getFilteredMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, leadTamyeez);
              const totalData = getTotalData(rowData);
              const trend = calculateTrendFromMonthlyData(rowData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth, leadTamyeez);
              const norm = normalizeValueTarget(currentMonth.achieved, currentMonth.target);
              const value = norm.value;
              const target = norm.target;
              leads.push({
                id: `lead_${leadStart}`,
                name: leadName,
                value,
                target,
                trend,
                isLessBetter: isLessBetter,
                leadNumber: leadCounter,
                rawData: rowData
              });
              leadCounter++;
              leadStart = k;
            }
          } else if (leadType === 'LAG' && leadName) {
            break; // Next LAG group
          } else {
            leadStart++;
          }
        }
        lagMetrics.push({
          id: `lag_${i}`,
          name: name,
          value,
          target,
          trend,
          isLessBetter: isLessBetter,
          lagNumber: lagCounter,
          leads,
          rawData: rowData
        });
        lagCounter++; // Increment counter for next LAG
        i = leadStart;
      }
    } else {
      i++;
    }
  }
  return lagMetrics;
}

// Main function to get department data
export async function getDepartmentData(
  department: string, 
  selectedPeriod?: string,
  selectedMonths?: string[],
  selectedQuarters?: string[],
  startMonth?: string,
  endMonth?: string
): Promise<LagMetric[]> {
  console.log(`[SharePoint] Getting data for department: ${department}`);
  console.log(`[SharePoint] Filter params:`, { selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth });
  
  // Debug: Log all available departments
  const allDepartments = Object.keys(DEPARTMENT_FILES);
  console.log('[SharePoint] Available departments:', allDepartments);
  
  const deptKey = department.toLowerCase();
  const departmentConfig = DEPARTMENT_FILES[deptKey];
  
  if (!departmentConfig) {
    console.error(`[SharePoint] Department ${department} not found in configuration`);
    console.error('[SharePoint] Available departments:', allDepartments);
    throw new Error(`Department ${department} not found in configuration`);
  }

  console.log(`[SharePoint] Found department config:`, departmentConfig);

  try {
    // Get site ID using proxy (authentication handled server-side)
    const siteId = await getSiteId();
    const excelData = await getExcelData(siteId, departmentConfig.fileId, departmentConfig.tabName);
    
    // Transform Excel data to LagMetrics with filtering
    const lagMetrics = transformExcelToLagMetrics(excelData, selectedPeriod, selectedMonths, selectedQuarters, startMonth, endMonth);
    
    console.log(`[SharePoint] Returning ${lagMetrics.length} LagMetrics for ${department}`);
    return lagMetrics;
  } catch (error) {
    console.error(`[SharePoint] Error getting data for department ${department}:`, error);
    throw error;
  }
}

// Test connection function
export async function testSharePointConnection(): Promise<{ success: boolean; message: string; details?: any }> {
  console.log('[SharePoint] Testing connection...');
  
  try {
    // Log environment variables for debugging
    console.log('[SharePoint] Environment variables:');
    console.log('- CLIENT_ID:', CLIENT_ID ? 'Set' : 'Not set');
    console.log('- CLIENT_SECRET:', CLIENT_SECRET ? 'Set' : 'Not set');
    console.log('- TENANT_ID:', TENANT_ID ? 'Set' : 'Not set');
    console.log('- SITE_NAME:', SITE_NAME ? 'Set' : 'Not set');
    console.log('- API_BASE_URL:', API_BASE_URL ? 'Set' : 'Not set');
    console.log('- PROXY_URL:', PROXY_URL ? 'Set' : 'Not set');
    
    // Log department files
    console.log('[SharePoint] Department files configuration:');
    Object.entries(DEPARTMENT_FILES).forEach(([dept, config]) => {
      console.log(`- ${dept}: ${config.fileId} (${config.tabName})`);
    });

    // Test with HR department (using the working file ID)
    const hrConfig = DEPARTMENT_FILES.hr;
    if (hrConfig) {
      const siteId = await getSiteId();
      const excelData = await getExcelData(siteId, hrConfig.fileId, hrConfig.tabName);
      
      return {
        success: true,
        message: `Connection successful! Retrieved ${excelData.length} rows from HR department.`,
        details: {
          siteId,
          fileId: hrConfig.fileId,
          tabName: hrConfig.tabName,
          dataRows: excelData.length
        }
      };
    } else {
      throw new Error('HR department configuration not found');
    }
  } catch (error) {
    console.error('[SharePoint] Connection test failed:', error);
    return {
      success: false,
      message: `Connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: error
    };
  }
}

// Export a function to get the list of department keys
export function getDepartmentFiles() {
  return Object.keys(DEPARTMENT_FILES).map(department => ({ department }));
} 