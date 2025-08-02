import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ArrowLeft, 
  BarChart3, 
  TrendingUp, 
  TrendingDown,
  Target, 
  FolderOpen,
  Users,
  DollarSign,
  Calendar,
  Menu,
  Check,
  ChevronDown,
  ArrowUpRight,
  Filter,
  Building2,
  Activity,
  Heart,
  RefreshCw,
  LogOut,
  AlertCircle
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getCurrentQuarter as getCurrentQuarterUtil } from '@/lib/utils';
import { dataCacheService } from '@/services/dataCacheService';

// Use local proxy for development, Netlify function for production
const isLocalhost = window.location.hostname === 'localhost';
const ONEDRIVE_FUNCTION_URL = isLocalhost 
  ? 'http://localhost:3002/api/onedrive'
  : '/.netlify/functions/get_excel_data_from_onedrive_url';
const TEST_FUNCTION_URL = isLocalhost 
  ? 'http://localhost:3002/api/test'
  : '/.netlify/functions/test';
const ONEDRIVE_SAMPLE_URL = 'https://lifemaker-my.sharepoint.com/:x:/r/personal/hamed_ibrahim_lifemakers_org/_layouts/15/Doc.aspx?sourcedoc=%7B084A3748-79EC-41B1-B3EB-8ECED81E5C53%7D&file=Projects%20Dashboard%202025%20-%20Internal%20tracker.xlsx&fromShare=true&action=default&mobileredirect=true';

const Summary: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarterUtil());
  const [selectedProject, setSelectedProject] = useState('all');
  const [selectedChartMetric, setSelectedChartMetric] = useState('Volunteers');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Reactive filtering - recalculate when filters change (like department dashboard)
  const [filteredMetrics, setFilteredMetrics] = useState<any>(null);
  
  useEffect(() => {
    console.log('🔄 Filter effect triggered - data:', !!data, 'quarter:', selectedQuarter, 'project:', selectedProject);
    if (data) {
      const metrics = getFilteredMetrics();
      console.log('🔄 Setting filtered metrics:', metrics);
      setFilteredMetrics(metrics);
    }
  }, [data, selectedQuarter, selectedProject]);

  // Debug filter changes
  useEffect(() => {
    console.log('Filter changed - Quarter:', selectedQuarter, 'Project:', selectedProject);
  }, [selectedQuarter, selectedProject]);
  const navigate = useNavigate();

  const fetchData = async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    
    try {
      const data = await dataCacheService.fetchOneDriveData(forceRefresh);
      setData(data);
    } catch (e: any) {
      console.error('Fetch error:', e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRefreshData = () => {
    setLoading(true);
    setError(null);
    fetchData(true); // Force refresh
  };

  const handleSignOut = () => {
    localStorage.removeItem("user");
    navigate("/");
  };

  // Calculate summary metrics from the data
  const getSummaryMetrics = () => {
    if (!data) return null;

    const overallTargets = data['Overall Targets'] || [];
    const projects = data['Projects'] || [];
    
    // Check if data is valid (not an error object)
    if (!Array.isArray(overallTargets) || !Array.isArray(projects)) {
      console.error('Invalid data format:', { overallTargets, projects });
      return null;
    }
    
    // Calculate totals from Overall Targets (assuming first row is headers)
    const dataRows = overallTargets.slice(1);
    const totals = dataRows.reduce((acc: any, row: any[]) => {
      if (row.length >= 7) {
        acc.volunteers += parseInt(row[1]) || 0;
        acc.opportunities += parseInt(row[2]) || 0;
        acc.training += parseInt(row[3]) || 0;
        acc.expenditures += parseInt(row[4]) || 0;
        acc.beneficiaries += parseInt(row[5]) || 0;
        acc.cases += parseInt(row[6]) || 0;
      }
      return acc;
    }, {
      volunteers: 0,
      opportunities: 0,
      training: 0,
      expenditures: 0,
      beneficiaries: 0,
      cases: 0
    });

    return {
      totalProjects: projects.length - 1, // Subtract header row
      ...totals
    };
  };

  const summaryMetrics = getSummaryMetrics();

  // Transform data based on selected quarter (like department dashboard)
  const getFilteredMetrics = () => {
    console.log('🔄 getFilteredMetrics called with quarter:', selectedQuarter, 'project:', selectedProject);
    
    if (!data) {
      console.log('❌ No data available');
      return null;
    }

    const targetQuartersVsActual = data['Target quarters Vs Actual'];
    if (!targetQuartersVsActual || targetQuartersVsActual.length < 2) {
      console.log('❌ Target quarters Vs Actual sheet not found or too short');
      return null;
    }

    console.log('Target quarters Vs Actual data:', targetQuartersVsActual);

    // Get headers from the second row (index 1) which contains quarter-specific information
    const headers = targetQuartersVsActual[1] || [];
    console.log('Headers (row 1):', headers);

    // Find column indices based on the Excel structure where metric names and quarters are in separate columns
    const findColumnIndex = (metricName: string, quarter: string, type: 'target' | 'actual') => {
      const searchTerm = type === 'target' ? quarter : `Actual${quarter.slice(1)}`;
      
      console.log(`🔍 Looking for: metric="${metricName}", quarter="${quarter}", type="${type}", searchTerm="${searchTerm}"`);
      
      // First, let's see all headers to understand the structure
      console.log('📋 All headers:', headers.map((h, i) => `${i}: "${h}"`));
      console.log('📋 Headers as array:', headers);
      console.log('📋 Number of headers:', headers.length);
      
      // Find the metric section first
      let metricSectionStart = -1;
      for (let i = 0; i < headers.length; i++) {
        const header = String(headers[i]).toLowerCase();
        const metricLower = metricName.toLowerCase();
        
        // Check if this column contains the metric name
        const hasMetric = header.includes(metricLower) || 
                         (metricLower.includes('volunteers opportunities') && header.includes('volunteers') && header.includes('opportunities')) ||
                         (metricLower.includes('volunteers training') && header.includes('volunteers') && header.includes('training')) ||
                         (metricLower.includes('beneficiaries (cases story)') && header.includes('beneficiaries') && (header.includes('case') || header.includes('story')));
        
        if (hasMetric) {
          metricSectionStart = i;
          console.log(`✅ Found metric section starting at column ${i}: "${headers[i]}" for ${metricName}`);
          break;
        }
      }
      
      if (metricSectionStart === -1) {
        console.log(`❌ No metric section found for ${metricName}`);
        return -1;
      }
      
      // Now find the quarter column within the metric section
      // Each metric section has 9 columns: metric name + Q1-Q4 + Actual1-Actual4
      const quarterOffset = {
        'Q1': 1, 'Q2': 3, 'Q3': 5, 'Q4': 7,
        'Actual1': 2, 'Actual2': 4, 'Actual3': 6, 'Actual4': 8
      };
      
      const offset = quarterOffset[searchTerm];
      if (offset !== undefined) {
        const targetColumn = metricSectionStart + offset;
        if (targetColumn < headers.length) {
          console.log(`✅ Found quarter column ${targetColumn}: "${headers[targetColumn]}" for ${metricName} ${quarter} ${type}`);
          return targetColumn;
        }
      }
      
      // If not found in metric section, search for the quarter term in the entire header row
      // BUT ONLY if we didn't find it in the metric section above
      for (let i = 0; i < headers.length; i++) {
        const header = String(headers[i]).toLowerCase();
        const searchLower = searchTerm.toLowerCase();
        
        const hasQuarter = header.includes(searchLower) || 
                          (searchLower === 'actual1' && header.includes('actual') && header.includes('1')) ||
                          (searchLower === 'actual2' && header.includes('actual') && header.includes('2')) ||
                          (searchLower === 'actual3' && header.includes('actual') && header.includes('3')) ||
                          (searchLower === 'actual4' && header.includes('actual') && header.includes('4'));
        
        if (hasQuarter) {
          console.log(`✅ Found quarter column ${i}: "${headers[i]}" for ${metricName} ${quarter} ${type}`);
          return i;
        }
      }
      
      // If not found, let's try a more aggressive search
      console.log(`⚠️ Trying aggressive search for ${metricName} ${quarter} ${type}`);
      for (let i = 0; i < headers.length; i++) {
        const header = String(headers[i]).toLowerCase();
        const metricLower = metricName.toLowerCase();
        const searchLower = searchTerm.toLowerCase();
        if (header.includes(metricLower) || header.includes(searchLower)) {
          console.log(`🔍 Potential match column ${i}: "${headers[i]}" (contains either metric or quarter)`);
        }
      }
      
      // Also show ALL columns that contain any of our key terms
      console.log(`🔍 All columns containing key terms for ${metricName}:`);
      const keyTerms = ['volunteer', 'opportunity', 'training', 'expenditure', 'beneficiary', 'case', 'actual', 'target', 'q1', 'q2', 'q3', 'q4'];
      for (let i = 0; i < headers.length; i++) {
        const header = String(headers[i]).toLowerCase();
        const containsKeyTerm = keyTerms.some(term => header.includes(term));
        if (containsKeyTerm) {
          console.log(`  Column ${i}: "${headers[i]}"`);
        }
      }
      
      console.log(`❌ No column found for ${metricName} ${quarter} ${type}`);
      return -1;
    };

    // Cache to prevent duplicate column lookups
    const columnCache = new Map<string, number>();
    
    const getCachedColumnIndex = (metricName: string, quarter: string, type: 'target' | 'actual') => {
      const cacheKey = `${metricName}-${quarter}-${type}`;
      if (columnCache.has(cacheKey)) {
        return columnCache.get(cacheKey)!;
      }
      const index = findColumnIndex(metricName, quarter, type);
      columnCache.set(cacheKey, index);
      return index;
    };

    // Get column indices for each metric and quarter (like department dashboard)
    const getQuarterIndices = (quarter: string) => {
      return {
        volunteers: {
          target: getCachedColumnIndex('Volunteers', quarter, 'target'),
          actual: getCachedColumnIndex('Volunteers', quarter, 'actual')
        },
        opportunities: {
          target: getCachedColumnIndex('Volunteers Opportunities', quarter, 'target'),
          actual: getCachedColumnIndex('Volunteers Opportunities', quarter, 'actual')
        },
        training: {
          target: getCachedColumnIndex('Volunteers Training', quarter, 'target'),
          actual: getCachedColumnIndex('Volunteers Training', quarter, 'actual')
        },
        // Note: Beneficiaries and Expenditures sections may not exist in this Excel file
        // they will return -1 and be handled gracefully
        beneficiaries: {
          target: getCachedColumnIndex('Beneficiaries', quarter, 'target'),
          actual: getCachedColumnIndex('Beneficiaries', quarter, 'actual')
        },
        cases: {
          target: getCachedColumnIndex('Beneficiaries (Cases Story)', quarter, 'target'),
          actual: getCachedColumnIndex('Beneficiaries (Cases Story)', quarter, 'actual')
        },
        expenditures: {
          target: getCachedColumnIndex('Expenditures', quarter, 'target'),
          actual: getCachedColumnIndex('Expenditures', quarter, 'actual')
        }
      };
    };

    // Filter rows by project (like department dashboard filtering)
    // Start from index 1 to skip header row (row 0)
    const projectRows = targetQuartersVsActual.slice(1).filter(row => {
      const projectName = String(row[0] || '').trim();
      
      // Skip header rows and empty rows
      if (!projectName || 
          projectName.toLowerCase().includes('project name') || 
          projectName.toLowerCase().includes('volunteers') || 
          projectName.toLowerCase().includes('expenditures') || 
          projectName.toLowerCase().includes('beneficiaries')) {
        return false;
      }
      
      // For "all" projects, include all valid project rows
      if (selectedProject === 'all') {
        return true;
      }
      
      // Check if this row matches the selected project
      return projectName.toLowerCase().includes(selectedProject.toLowerCase());
    });

    console.log('Project rows after filtering:', projectRows.map(row => row[0]));
    console.log('Number of project rows found:', projectRows.length);
    
    // Debug: Show first few project rows with their data
    if (projectRows.length > 0) {
      console.log('First project row data:', projectRows[0]);
      console.log('First project row length:', projectRows[0].length);
    } else {
      console.log('⚠️ No project rows found! This might be the issue.');
    }

    // Transform data based on selected quarter (like department dashboard)
    let metrics = {
      volunteers: { actual: 0, target: 0, variance: 0 },
      opportunities: { actual: 0, target: 0, variance: 0 },
      training: { actual: 0, target: 0, variance: 0 },
      expenditures: { actual: 0, target: 0, variance: 0 },
      beneficiaries: { actual: 0, target: 0, variance: 0 },
      cases: { actual: 0, target: 0, variance: 0 }
    };

    // Check if we found any columns for the selected quarter
    const testQuarterIndices = getQuarterIndices(selectedQuarter === 'all' ? 'Q2' : selectedQuarter);
    console.log('🔍 Column indices found for test quarter:', testQuarterIndices);
    
    const hasAnyColumns = Object.values(testQuarterIndices).some(metric => 
      Object.values(metric).some(index => index >= 0)
    );
    
         if (!hasAnyColumns) {
       console.log('❌ No columns found for any metric! This might indicate a column mapping issue.');
       // Don't return mock data - let the function continue with zeros so we can see the real issue
     }

    if (selectedQuarter === 'all') {
      // Sum data from all quarters (like department dashboard cumulative)
      console.log('🔍 DEBUGGING "ALL" QUARTERS LOGIC:');
      
      projectRows.forEach(row => {
        console.log(`Processing row "${row[0]}" for all quarters`);
        
        // Sum across all quarters for this project
        ['Q1', 'Q2', 'Q3', 'Q4'].forEach(quarter => {
          const quarterIndices = getQuarterIndices(quarter);
          console.log(`  Quarter ${quarter} indices:`, quarterIndices);
          
          // Sum all metrics for this quarter (like department dashboard)
          if (quarterIndices.volunteers.actual >= 0) {
            const value = parseFloat(row[quarterIndices.volunteers.actual]) || 0;
            metrics.volunteers.actual += value;
            console.log(`    Volunteers actual (col ${quarterIndices.volunteers.actual}): ${value} -> Total: ${metrics.volunteers.actual}`);
          }
          if (quarterIndices.volunteers.target >= 0) {
            const value = parseFloat(row[quarterIndices.volunteers.target]) || 0;
            metrics.volunteers.target += value;
            console.log(`    Volunteers target (col ${quarterIndices.volunteers.target}): ${value} -> Total: ${metrics.volunteers.target}`);
          }
          if (quarterIndices.opportunities.actual >= 0) {
            const value = parseFloat(row[quarterIndices.opportunities.actual]) || 0;
            metrics.opportunities.actual += value;
            console.log(`    Opportunities actual (col ${quarterIndices.opportunities.actual}): ${value} -> Total: ${metrics.opportunities.actual}`);
          }
          if (quarterIndices.opportunities.target >= 0) {
            const value = parseFloat(row[quarterIndices.opportunities.target]) || 0;
            metrics.opportunities.target += value;
            console.log(`    Opportunities target (col ${quarterIndices.opportunities.target}): ${value} -> Total: ${metrics.opportunities.target}`);
          }
          if (quarterIndices.training.actual >= 0) {
            const value = parseFloat(row[quarterIndices.training.actual]) || 0;
            metrics.training.actual += value;
            console.log(`    Training actual (col ${quarterIndices.training.actual}): ${value} -> Total: ${metrics.training.actual}`);
          }
          if (quarterIndices.training.target >= 0) {
            const value = parseFloat(row[quarterIndices.training.target]) || 0;
            metrics.training.target += value;
            console.log(`    Training target (col ${quarterIndices.training.target}): ${value} -> Total: ${metrics.training.target}`);
          }
          if (quarterIndices.beneficiaries.actual >= 0) {
            const value = parseFloat(row[quarterIndices.beneficiaries.actual]) || 0;
            metrics.beneficiaries.actual += value;
            console.log(`    Beneficiaries actual (col ${quarterIndices.beneficiaries.actual}): ${value} -> Total: ${metrics.beneficiaries.actual}`);
          }
          if (quarterIndices.beneficiaries.target >= 0) {
            const value = parseFloat(row[quarterIndices.beneficiaries.target]) || 0;
            metrics.beneficiaries.target += value;
            console.log(`    Beneficiaries target (col ${quarterIndices.beneficiaries.target}): ${value} -> Total: ${metrics.beneficiaries.target}`);
          }
          if (quarterIndices.cases.actual >= 0) {
            const value = parseFloat(row[quarterIndices.cases.actual]) || 0;
            metrics.cases.actual += value;
            console.log(`    Cases actual (col ${quarterIndices.cases.actual}): ${value} -> Total: ${metrics.cases.actual}`);
          }
          if (quarterIndices.cases.target >= 0) {
            const value = parseFloat(row[quarterIndices.cases.target]) || 0;
            metrics.cases.target += value;
            console.log(`    Cases target (col ${quarterIndices.cases.target}): ${value} -> Total: ${metrics.cases.target}`);
          }
          if (quarterIndices.expenditures.actual >= 0) {
            const value = parseFloat(row[quarterIndices.expenditures.actual]) || 0;
            metrics.expenditures.actual += value;
            console.log(`    Expenditures actual (col ${quarterIndices.expenditures.actual}): ${value} -> Total: ${metrics.expenditures.actual}`);
          }
          if (quarterIndices.expenditures.target >= 0) {
            const value = parseFloat(row[quarterIndices.expenditures.target]) || 0;
            metrics.expenditures.target += value;
            console.log(`    Expenditures target (col ${quarterIndices.expenditures.target}): ${value} -> Total: ${metrics.expenditures.target}`);
          }
        });
      });
    } else {
      // Use data for specific quarter (like department dashboard monthly/quarterly)
      const quarterIndices = getQuarterIndices(selectedQuarter);
      
      projectRows.forEach(row => {
        console.log('Processing row:', row[0], 'with data length:', row.length);
        
        // Extract values using column indices (like department dashboard)
        if (quarterIndices.volunteers.actual >= 0) {
          const value = parseFloat(row[quarterIndices.volunteers.actual]) || 0;
          metrics.volunteers.actual = value;
          console.log(`Volunteers actual (col ${quarterIndices.volunteers.actual}): ${value}`);
        }
        if (quarterIndices.volunteers.target >= 0) {
          const value = parseFloat(row[quarterIndices.volunteers.target]) || 0;
          metrics.volunteers.target = value;
          console.log(`Volunteers target (col ${quarterIndices.volunteers.target}): ${value}`);
        }
        if (quarterIndices.opportunities.actual >= 0) {
          metrics.opportunities.actual = parseFloat(row[quarterIndices.opportunities.actual]) || 0;
        }
        if (quarterIndices.opportunities.target >= 0) {
          metrics.opportunities.target = parseFloat(row[quarterIndices.opportunities.target]) || 0;
        }
        if (quarterIndices.training.actual >= 0) {
          metrics.training.actual = parseFloat(row[quarterIndices.training.actual]) || 0;
        }
        if (quarterIndices.training.target >= 0) {
          metrics.training.target = parseFloat(row[quarterIndices.training.target]) || 0;
        }
        if (quarterIndices.beneficiaries.actual >= 0) {
          metrics.beneficiaries.actual = parseFloat(row[quarterIndices.beneficiaries.actual]) || 0;
        }
        if (quarterIndices.beneficiaries.target >= 0) {
          metrics.beneficiaries.target = parseFloat(row[quarterIndices.beneficiaries.target]) || 0;
        }
        if (quarterIndices.cases.actual >= 0) {
          metrics.cases.actual = parseFloat(row[quarterIndices.cases.actual]) || 0;
        }
        if (quarterIndices.cases.target >= 0) {
          metrics.cases.target = parseFloat(row[quarterIndices.cases.target]) || 0;
        }
        if (quarterIndices.expenditures.actual >= 0) {
          metrics.expenditures.actual = parseFloat(row[quarterIndices.expenditures.actual]) || 0;
        }
        if (quarterIndices.expenditures.target >= 0) {
          metrics.expenditures.target = parseFloat(row[quarterIndices.expenditures.target]) || 0;
        }
        });
      }

    // Calculate achievement rates (like department dashboard)
    Object.keys(metrics).forEach(key => {
      if (metrics[key as keyof typeof metrics]) {
        const metric = metrics[key as keyof typeof metrics] as any;
        if (metric.target > 0) {
          // Calculate achievement rate (actual/target * 100) like department dashboard
          metric.variance = (metric.actual / metric.target) * 100;
        } else if ((metric.target === 0 || metric.target === null || metric.target === undefined || isNaN(metric.target)) && metric.actual > 0) {
          // Special case: target is 0 or blank and actual is more
          metric.variance = 100;
        }
      }
    });

         console.log('✅ Final filtered metrics for quarter', selectedQuarter, 'and project', selectedProject, ':', metrics);
     return metrics;
  };



  // Fallback to mock data if no real data available
  const mockMetrics = {
    volunteers: { actual: 4190, target: 518.5, variance: 807.91 },
    opportunities: { actual: 1431.5, target: 6059.5, variance: 23.62 },
    training: { actual: 12.5, target: 128.5, variance: 9.73 },
    expenditures: { actual: 3457845.5, target: 4000000, variance: 86.45 },
    beneficiaries: { actual: 46457, target: 49701, variance: 93.47 },
    cases: { actual: 0, target: 50, variance: 0 }
  };

  // Use reactive filtered data if available, otherwise fall back to mock data
  const displayMetrics = filteredMetrics || mockMetrics;
  
  // Debug: Log what metrics are being displayed
  console.log('🔍 Current display metrics:', displayMetrics);
  console.log('🔍 Filtered metrics:', filteredMetrics);
  console.log('🔍 Using mock data:', !filteredMetrics);

  // Utility function to format large numbers as "1.25M" format
  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(2).replace(/\.?0+$/, '') + 'M';
    }
    return num.toLocaleString();
  };

  // Status functions matching department dashboard exactly
  const getStatusInfo = (variance: number, actual: number, target: number) => {
    // Special case: if target is 0 or blank but actual is more, show as "Over Target"
    if ((target === 0 || target === null || target === undefined || isNaN(target)) && actual > 0) {
      return { text: "Over Target", variant: "default" as const, className: "bg-green-500 text-white" };
    }
    
    const isPerfect = variance === 100;
    const isOverTarget = variance > 100;
    const isOnTrack = variance >= 75 && variance < 100;
    const isOffTrack = variance >= 50 && variance < 75;
    const isAtRisk = variance < 50;
    
    if (isPerfect) {
      return { text: "Perfect", variant: "default" as const };
    } else if (isOverTarget) {
      return { text: "Over Target", variant: "default" as const, className: "bg-green-500 text-white" };
    } else if (isOnTrack) {
      return { text: "On Track", variant: "secondary" as const };
    } else if (isOffTrack) {
      return { text: "Off Track", variant: "secondary" as const };
    } else {
      return { text: "At Risk", variant: "destructive" as const };
    }
  };

  const getStatusColor = (variance: number) => {
    if (variance >= 75) return 'text-green-600';
    if (variance >= 50) return 'text-blue-600';
    return 'text-red-600';
  };

  const getProgressColor = (variance: number) => {
    if (variance >= 75) return 'bg-green-500';
    if (variance >= 50) return 'bg-blue-500';
    return 'bg-red-500';
  };

  // Health calculation functions (like department dashboard)
  const getHealthColor = (percentage: number) => {
    if (percentage >= 80) return 'text-green-600';
    if (percentage >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getHealthStatus = (percentage: number) => {
    if (percentage >= 80) return 'Excellent';
    if (percentage >= 60) return 'Good';
    if (percentage >= 40) return 'Fair';
    return 'Poor';
  };

  const getBloodColor = (percentage: number) => {
    if (percentage >= 80) return '#22c55e'; // green
    if (percentage >= 60) return '#eab308'; // yellow
    return '#ef4444'; // red
  };

  // Calculate overall health score (average of all 6 metrics)
  const calculateOverallHealth = () => {
    const metrics = [
      displayMetrics.volunteers.variance,
      displayMetrics.opportunities.variance,
      displayMetrics.training.variance,
      displayMetrics.expenditures.variance,
      displayMetrics.beneficiaries.variance,
      displayMetrics.cases.variance
    ];
    
    const validMetrics = metrics.filter(metric => !isNaN(metric) && isFinite(metric));
    if (validMetrics.length === 0) return 0;
    
    // Cap each metric at 100% before averaging
    const cappedMetrics = validMetrics.map(metric => Math.min(100, Math.max(0, metric)));
    const average = cappedMetrics.reduce((sum, metric) => sum + metric, 0) / cappedMetrics.length;
    
    return average;
  };

    // Helper function to get metrics for a specific quarter using the exact same logic as brackets
  const getMetricsForQuarter = (quarter: string) => {
    if (!data) return null;
    
    const targetQuartersVsActual = data['Target quarters Vs Actual'];
    if (!targetQuartersVsActual || targetQuartersVsActual.length < 2) return null;

    // Use the exact same findColumnIndex function from getFilteredMetrics
    const findColumnIndex = (metricName: string, quarter: string, type: 'target' | 'actual') => {
      const headers = targetQuartersVsActual[1] || [];
      const searchTerm = type === 'target' ? quarter : `Actual${quarter.slice(1)}`;
      
      // Find the metric section first
      let metricSectionStart = -1;
      for (let i = 0; i < headers.length; i++) {
        const header = String(headers[i]).toLowerCase();
        const metricLower = metricName.toLowerCase();
        
        const hasMetric = header.includes(metricLower) || 
                         (metricLower.includes('volunteers opportunities') && header.includes('volunteers') && header.includes('opportunities')) ||
                         (metricLower.includes('volunteers training') && header.includes('volunteers') && header.includes('training')) ||
                         (metricLower.includes('beneficiaries (cases story)') && header.includes('beneficiaries') && (header.includes('case') || header.includes('story')));
        
        if (hasMetric) {
          metricSectionStart = i;
          break;
        }
      }
      
      if (metricSectionStart === -1) return -1;
      
      // Find the quarter column within the metric section
      const quarterOffset = {
        'Q1': 1, 'Q2': 3, 'Q3': 5, 'Q4': 7,
        'Actual1': 2, 'Actual2': 4, 'Actual3': 6, 'Actual4': 8
      };
      
      const offset = quarterOffset[searchTerm];
      if (offset !== undefined) {
        const targetColumn = metricSectionStart + offset;
        if (targetColumn < headers.length) {
          return targetColumn;
        }
      }
      
      return -1;
    };

    // Use the exact same getQuarterIndices function from getFilteredMetrics
    const getQuarterIndices = (quarter: string) => {
      return {
        volunteers: {
          target: findColumnIndex('Volunteers', quarter, 'target'),
          actual: findColumnIndex('Volunteers', quarter, 'actual')
        },
        opportunities: {
          target: findColumnIndex('Volunteers Opportunities', quarter, 'target'),
          actual: findColumnIndex('Volunteers Opportunities', quarter, 'actual')
        },
        training: {
          target: findColumnIndex('Volunteers Training', quarter, 'target'),
          actual: findColumnIndex('Volunteers Training', quarter, 'actual')
        },
        beneficiaries: {
          target: findColumnIndex('Beneficiaries', quarter, 'target'),
          actual: findColumnIndex('Beneficiaries', quarter, 'actual')
        },
        cases: {
          target: findColumnIndex('Beneficiaries (Cases Story)', quarter, 'target'),
          actual: findColumnIndex('Beneficiaries (Cases Story)', quarter, 'actual')
        },
        expenditures: {
          target: findColumnIndex('Expenditures', quarter, 'target'),
          actual: findColumnIndex('Expenditures', quarter, 'actual')
        }
      };
    };

    // Use the exact same project filtering logic from getFilteredMetrics
    const projectRows = targetQuartersVsActual.slice(1).filter(row => {
      const projectName = String(row[0] || '').trim();
      
      if (!projectName || 
          projectName.toLowerCase().includes('project name') || 
          projectName.toLowerCase().includes('volunteers') || 
          projectName.toLowerCase().includes('expenditures') || 
          projectName.toLowerCase().includes('beneficiaries')) {
        return false;
      }
      
      if (selectedProject === 'all') {
        return true;
      }
      
      return projectName.toLowerCase().includes(selectedProject.toLowerCase());
    });

    // Use the exact same metrics calculation logic from getFilteredMetrics
    let metrics = {
      volunteers: { actual: 0, target: 0, variance: 0 },
      opportunities: { actual: 0, target: 0, variance: 0 },
      training: { actual: 0, target: 0, variance: 0 },
      expenditures: { actual: 0, target: 0, variance: 0 },
      beneficiaries: { actual: 0, target: 0, variance: 0 },
      cases: { actual: 0, target: 0, variance: 0 }
    };

    const quarterIndices = getQuarterIndices(quarter);
    
    projectRows.forEach(row => {
      if (quarterIndices.volunteers.actual >= 0) {
        metrics.volunteers.actual = parseFloat(row[quarterIndices.volunteers.actual]) || 0;
      }
      if (quarterIndices.volunteers.target >= 0) {
        metrics.volunteers.target = parseFloat(row[quarterIndices.volunteers.target]) || 0;
      }
      if (quarterIndices.opportunities.actual >= 0) {
        metrics.opportunities.actual = parseFloat(row[quarterIndices.opportunities.actual]) || 0;
      }
      if (quarterIndices.opportunities.target >= 0) {
        metrics.opportunities.target = parseFloat(row[quarterIndices.opportunities.target]) || 0;
      }
      if (quarterIndices.training.actual >= 0) {
        metrics.training.actual = parseFloat(row[quarterIndices.training.actual]) || 0;
      }
      if (quarterIndices.training.target >= 0) {
        metrics.training.target = parseFloat(row[quarterIndices.training.target]) || 0;
      }
      if (quarterIndices.beneficiaries.actual >= 0) {
        metrics.beneficiaries.actual = parseFloat(row[quarterIndices.beneficiaries.actual]) || 0;
      }
      if (quarterIndices.beneficiaries.target >= 0) {
        metrics.beneficiaries.target = parseFloat(row[quarterIndices.beneficiaries.target]) || 0;
      }
      if (quarterIndices.cases.actual >= 0) {
        metrics.cases.actual = parseFloat(row[quarterIndices.cases.actual]) || 0;
      }
      if (quarterIndices.cases.target >= 0) {
        metrics.cases.target = parseFloat(row[quarterIndices.cases.target]) || 0;
      }
      if (quarterIndices.expenditures.actual >= 0) {
        metrics.expenditures.actual = parseFloat(row[quarterIndices.expenditures.actual]) || 0;
      }
      if (quarterIndices.expenditures.target >= 0) {
        metrics.expenditures.target = parseFloat(row[quarterIndices.expenditures.target]) || 0;
      }
    });

    return metrics;
  };

  // Get current quarter based on current date
  const getCurrentQuarter = () => {
    const now = new Date();
    const month = now.getMonth() + 1; // getMonth() returns 0-11
    const year = now.getFullYear();
    
    if (month >= 1 && month <= 3) return 'Q1';
    if (month >= 4 && month <= 6) return 'Q2';
    if (month >= 7 && month <= 9) return 'Q3';
    return 'Q4';
  };

  // Get project names from data for dynamic filtering
  const getProjectNames = () => {
    if (!data) {
      console.log('❌ No data available for project names');
      return [];
    }
    
    console.log('📋 Available tabs:', Object.keys(data));
    
    // Try different possible tab names
    const possibleTabNames = [
      'Services Target Q  Vs Actual',
      'Services Target Q Vs Actual',
      'Services Target Q Vs Actual ',
      'Services Target Q  Vs Actual ',
      'Services Target Q Vs Actual',
      'Services Target Q  Vs Actual'
    ];
    
    let targetQuartersVsActual = null;
    let usedTabName = '';
    
    for (const tabName of possibleTabNames) {
      if (data[tabName]) {
        targetQuartersVsActual = data[tabName];
        usedTabName = tabName;
        console.log(`✅ Found tab: "${tabName}"`);
        break;
      }
    }
    
    if (!targetQuartersVsActual) {
      console.log('❌ Could not find Services Target Q Vs Actual tab');
      console.log('Available tabs:', Object.keys(data));
      return [];
    }
    
    if (!Array.isArray(targetQuartersVsActual) || targetQuartersVsActual.length < 2) {
      console.log('❌ Target quarters vs actual data is not in expected format');
      console.log('Data:', targetQuartersVsActual);
      return [];
    }
    
    console.log(`📊 Processing ${targetQuartersVsActual.length} rows from "${usedTabName}"`);
    
    // Skip header row and extract project names from Project column (index 0)
    const projectNames = targetQuartersVsActual.slice(1)
      .map((row: any[]) => row[0]) // Project column
      .filter((name: string) => name && name.trim() !== '')
      .map((name: string) => name.trim())
      .filter((name: string, index: number, arr: string[]) => arr.indexOf(name) === index); // Remove duplicates
    
    console.log('🏷️ Found project names:', projectNames);
    return projectNames;
  };

  // Get quarterly data for line chart using the exact same logic as brackets
  const getQuarterlyData = () => {
    if (!data) return [];
    
    const quarterlyData = [];
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const currentQuarter = getCurrentQuarter();
    
    quarters.forEach(quarter => {
      const metrics = getMetricsForQuarter(quarter);
      
      if (metrics) {
        let quarterValue = 0;
        
        // Get the value for the selected metric
        switch (selectedChartMetric) {
          case 'Volunteers':
            quarterValue = metrics.volunteers.actual;
            break;
          case 'Volunteer Opportunities':
            quarterValue = metrics.opportunities.actual;
            break;
          case 'Volunteers Training':
            quarterValue = metrics.training.actual;
            break;
          case 'Expenditures':
            quarterValue = metrics.expenditures.actual;
            break;
          case 'Beneficiaries':
            quarterValue = metrics.beneficiaries.actual;
            break;
          case 'Cases Story':
            quarterValue = metrics.cases.actual;
            break;
        }
        
        // Get the target value for the selected metric
        let quarterTarget = 0;
        switch (selectedChartMetric) {
          case 'Volunteers':
            quarterTarget = metrics.volunteers.target;
            break;
          case 'Volunteer Opportunities':
            quarterTarget = metrics.opportunities.target;
            break;
          case 'Volunteers Training':
            quarterTarget = metrics.training.target;
            break;
          case 'Expenditures':
            quarterTarget = metrics.expenditures.target;
            break;
          case 'Beneficiaries':
            quarterTarget = metrics.beneficiaries.target;
            break;
          case 'Cases Story':
            quarterTarget = metrics.cases.target;
            break;
        }
        
        // Always include the quarter, even if value is 0
        // But mark future quarters as null to create dashed line effect
        const isFutureQuarter = quarter === 'Q3' && currentQuarter === 'Q2' || 
                               quarter === 'Q4' && (currentQuarter === 'Q2' || currentQuarter === 'Q3') ||
                               quarter === 'Q1' && currentQuarter === 'Q4' ||
                               quarter === 'Q2' && currentQuarter === 'Q1';
        
        quarterlyData.push({
          quarter,
          value: isFutureQuarter ? null : quarterValue,
          target: isFutureQuarter ? null : quarterTarget
        });
      }
    });
    
    return quarterlyData;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Left side: Logo and Title */}
            <div className="flex items-center gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="p-2">
                    <Menu className="w-5 h-5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuItem onClick={() => navigate('/dashboard')}>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Main Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate('/project-details')}>
                    <FolderOpen className="w-4 h-4 mr-2" />
                    Project Details
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <img src="/logo.png" alt="LIFE Makers Egypt" className="h-12 w-auto" />
              <h1 className="text-xl font-semibold text-gray-900">Program Operations Sector</h1>
            </div>

            {/* Right side: Action Buttons */}
            <div className="flex items-center gap-2">
              {loading && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Syncing...
                </div>
              )}
              {error && (
                <div className="flex items-center gap-1 text-xs text-destructive">
                  <AlertCircle className="w-3 h-3" />
                  Connection Error
                </div>
              )}
              <Button variant="outline" size="sm" onClick={handleRefreshData} className="w-auto text-xs">
                <RefreshCw className="w-4 h-4 mr-1" />
                Refresh Data
              </Button>
              <Button variant="outline" size="sm" onClick={handleSignOut} className="w-auto text-xs">
                <LogOut className="w-4 h-4 mr-1" />
                Sign Out
              </Button>
            </div>
          </div>

          {/* Row 2: Filters Card */}
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Filter className="w-4 h-4 text-primary" />
                <h3 className="font-semibold text-sm">Data Filters</h3>
              </div>
              
              <div className="grid grid-cols-4 gap-6">
                {/* Left Column - Quarters (1/4 width) */}
                <div className="col-span-1">
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    <Calendar className="w-4 h-4 inline mr-1" />
                    Select Quarters
                  </label>
                  <div className="flex flex-wrap gap-1">
                    <Badge
                      variant={selectedQuarter === 'all' ? "default" : "outline"}
                      className={`cursor-pointer transition-colors text-xs ${
                        selectedQuarter === 'all' 
                          ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                          : "hover:bg-muted"
                      }`}
                      onClick={() => setSelectedQuarter('all')}
                    >
                      Select all
                    </Badge>
                    {['Q1', 'Q2', 'Q3', 'Q4'].map((quarter) => (
                      <Badge
                        key={quarter}
                        variant={selectedQuarter === quarter ? "default" : "outline"}
                        className={`cursor-pointer transition-colors text-xs ${
                          selectedQuarter === quarter 
                            ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                            : "hover:bg-muted"
                        }`}
                        onClick={() => setSelectedQuarter(quarter)}
                      >
                        {quarter}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Right Column - Projects (3/4 width) */}
                <div className="col-span-3">
                  <label className="text-sm font-medium text-muted-foreground mb-2 block">
                    <Building2 className="w-4 h-4 inline mr-1" />
                    Select Projects
                  </label>
                  <div className="space-y-2">
                    {/* Dynamic project filters - 2 rows max */}
                    <div className="flex flex-wrap gap-1">
                      <Badge
                        variant={selectedProject === 'all' ? "default" : "outline"}
                        className={`cursor-pointer transition-colors text-[10px] px-2 py-1 ${
                          selectedProject === 'all' 
                            ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                            : "hover:bg-muted"
                        }`}
                        onClick={() => setSelectedProject('all')}
                      >
                        Select all
                      </Badge>
                      {getProjectNames().length > 0 ? (
                        getProjectNames().slice(0, Math.ceil(getProjectNames().length / 2)).map((projectName: string) => (
                          <Badge
                            key={projectName}
                            variant={selectedProject === projectName ? "default" : "outline"}
                            className={`cursor-pointer transition-colors text-[10px] px-2 py-1 ${
                              selectedProject === projectName 
                                ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                                : "hover:bg-muted"
                            }`}
                            onClick={() => setSelectedProject(projectName)}
                          >
                            {projectName}
                          </Badge>
                        ))
                      ) : (
                        <div className="text-sm text-muted-foreground">
                          Loading projects...
                        </div>
                      )}
                    </div>
                    {/* Second row of projects */}
                    <div className="flex flex-wrap gap-1">
                      {getProjectNames().length > 0 ? (
                        getProjectNames().slice(Math.ceil(getProjectNames().length / 2)).map((projectName: string) => (
                          <Badge
                            key={projectName}
                            variant={selectedProject === projectName ? "default" : "outline"}
                            className={`cursor-pointer transition-colors text-[10px] px-2 py-1 ${
                              selectedProject === projectName 
                                ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                                : "hover:bg-muted"
                            }`}
                            onClick={() => setSelectedProject(projectName)}
                          >
                            {projectName}
                          </Badge>
                        ))
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </header>

      <div className="flex">
        {/* Main Content */}
        <main className="flex-1 p-6">

          {/* Loading State */}
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <p className="text-gray-600">Loading OneDrive data...</p>
              </div>
            </div>
          )}

          {/* Error State */}
          {error && (
            <Card className="border-red-200 bg-red-50">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-red-600">
                  <div className="w-4 h-4 rounded-full bg-red-600"></div>
                  <div>
                    <h3 className="font-semibold">Error Loading Data</h3>
                    <p className="text-sm text-red-500">{error}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Metrics Grid */}
          {!loading && !error && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Volunteers Actual vs Target */}
              <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">👥</span>
                      <span className="text-muted-foreground">Volunteers</span>
                    </div>
                    <Badge 
                                      variant={getStatusInfo(displayMetrics.volunteers.variance, displayMetrics.volunteers.actual, displayMetrics.volunteers.target).variant}
                className={getStatusInfo(displayMetrics.volunteers.variance, displayMetrics.volunteers.actual, displayMetrics.volunteers.target).className}
              >
                {getStatusInfo(displayMetrics.volunteers.variance, displayMetrics.volunteers.actual, displayMetrics.volunteers.target).text}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {formatNumber(displayMetrics.volunteers.actual)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        / {formatNumber(displayMetrics.volunteers.target)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className="text-xs px-2 py-0.5"
                      >
                        {selectedQuarter === 'Q1' || selectedQuarter === 'all' ? (
                          <>
                            <span className="w-3 h-3 mr-1">-</span>
                            0.0%
                          </>
                        ) : displayMetrics.volunteers.variance >= 100 ? (
                          <>
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {displayMetrics.volunteers.variance.toFixed(1)}%
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-3 h-3 mr-1" />
                            {displayMetrics.volunteers.variance.toFixed(1)}%
                          </>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">vs last period</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{Math.max(0, displayMetrics.volunteers.variance).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-1000 ${getProgressColor(displayMetrics.volunteers.variance)}`}
                        style={{ width: `${Math.min(100, Math.max(0, displayMetrics.volunteers.variance))}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Volunteer Opportunities Actual vs Target */}
              <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎯</span>
                      <span className="text-muted-foreground">Volunteer Opportunities</span>
                    </div>
                    <Badge 
                                      variant={getStatusInfo(displayMetrics.opportunities.variance, displayMetrics.opportunities.actual, displayMetrics.opportunities.target).variant}
                className={getStatusInfo(displayMetrics.opportunities.variance, displayMetrics.opportunities.actual, displayMetrics.opportunities.target).className}
              >
                {getStatusInfo(displayMetrics.opportunities.variance, displayMetrics.opportunities.actual, displayMetrics.opportunities.target).text}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {formatNumber(displayMetrics.opportunities.actual)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        / {formatNumber(displayMetrics.opportunities.target)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className="text-xs px-2 py-0.5"
                      >
                        {selectedQuarter === 'Q1' || selectedQuarter === 'all' ? (
                          <>
                            <span className="w-3 h-3 mr-1">-</span>
                            0.0%
                          </>
                        ) : displayMetrics.opportunities.variance >= 100 ? (
                          <>
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {displayMetrics.opportunities.variance.toFixed(1)}%
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-3 h-3 mr-1" />
                            {displayMetrics.opportunities.variance.toFixed(1)}%
                          </>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">vs last period</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{Math.max(0, displayMetrics.opportunities.variance).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-1000 ${getProgressColor(displayMetrics.opportunities.variance)}`}
                        style={{ width: `${Math.min(100, Math.max(0, displayMetrics.opportunities.variance))}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Volunteers Training Actual vs Target */}
              <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📚</span>
                      <span className="text-muted-foreground">Volunteers Training</span>
                    </div>
                    <Badge 
                                      variant={getStatusInfo(displayMetrics.training.variance, displayMetrics.training.actual, displayMetrics.training.target).variant}
                className={getStatusInfo(displayMetrics.training.variance, displayMetrics.training.actual, displayMetrics.training.target).className}
              >
                {getStatusInfo(displayMetrics.training.variance, displayMetrics.training.actual, displayMetrics.training.target).text}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {formatNumber(displayMetrics.training.actual)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        / {formatNumber(displayMetrics.training.target)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className="text-xs px-2 py-0.5"
                      >
                        {selectedQuarter === 'Q1' || selectedQuarter === 'all' ? (
                          <>
                            <span className="w-3 h-3 mr-1">-</span>
                            0.0%
                          </>
                        ) : displayMetrics.training.variance >= 100 ? (
                          <>
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {displayMetrics.training.variance.toFixed(1)}%
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-3 h-3 mr-1" />
                            {displayMetrics.training.variance.toFixed(1)}%
                          </>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">vs last period</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{Math.max(0, displayMetrics.training.variance).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-1000 ${getProgressColor(displayMetrics.training.variance)}`}
                        style={{ width: `${Math.min(100, Math.max(0, displayMetrics.training.variance))}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Expenditures - Same format as other brackets */}
              <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💰</span>
                      <span className="text-muted-foreground">Expenditures</span>
                    </div>
                    <Badge 
                                      variant={getStatusInfo(displayMetrics.expenditures.variance, displayMetrics.expenditures.actual, displayMetrics.expenditures.target).variant}
                className={getStatusInfo(displayMetrics.expenditures.variance, displayMetrics.expenditures.actual, displayMetrics.expenditures.target).className}
              >
                {getStatusInfo(displayMetrics.expenditures.variance, displayMetrics.expenditures.actual, displayMetrics.expenditures.target).text}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {formatNumber(displayMetrics.expenditures.actual)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        / {formatNumber(displayMetrics.expenditures.target)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className="text-xs px-2 py-0.5"
                      >
                        {selectedQuarter === 'Q1' || selectedQuarter === 'all' ? (
                          <>
                            <span className="w-3 h-3 mr-1">-</span>
                            0.0%
                          </>
                        ) : displayMetrics.expenditures.variance >= 100 ? (
                          <>
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {displayMetrics.expenditures.variance.toFixed(1)}%
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-3 h-3 mr-1" />
                            {displayMetrics.expenditures.variance.toFixed(1)}%
                          </>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">vs last period</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{Math.max(0, displayMetrics.expenditures.variance).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-1000 ${getProgressColor(displayMetrics.expenditures.variance)}`}
                        style={{ width: `${Math.min(100, Math.max(0, displayMetrics.expenditures.variance))}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Beneficiaries Actual vs Target */}
              <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🤝</span>
                      <span className="text-muted-foreground">Beneficiaries</span>
                    </div>
                    <Badge 
                                      variant={getStatusInfo(displayMetrics.beneficiaries.variance, displayMetrics.beneficiaries.actual, displayMetrics.beneficiaries.target).variant}
                className={getStatusInfo(displayMetrics.beneficiaries.variance, displayMetrics.beneficiaries.actual, displayMetrics.beneficiaries.target).className}
              >
                {getStatusInfo(displayMetrics.beneficiaries.variance, displayMetrics.beneficiaries.actual, displayMetrics.beneficiaries.target).text}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {formatNumber(displayMetrics.beneficiaries.actual)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        / {formatNumber(displayMetrics.beneficiaries.target)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className="text-xs px-2 py-0.5"
                      >
                        {selectedQuarter === 'Q1' || selectedQuarter === 'all' ? (
                          <>
                            <span className="w-3 h-3 mr-1">-</span>
                            0.0%
                          </>
                        ) : displayMetrics.beneficiaries.variance >= 100 ? (
                          <>
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {displayMetrics.beneficiaries.variance.toFixed(1)}%
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-3 h-3 mr-1" />
                            {displayMetrics.beneficiaries.variance.toFixed(1)}%
                          </>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">vs last period</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{Math.max(0, displayMetrics.beneficiaries.variance).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-1000 ${getProgressColor(displayMetrics.beneficiaries.variance)}`}
                        style={{ width: `${Math.min(100, Math.max(0, displayMetrics.beneficiaries.variance))}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Cases Story Actual vs Target */}
              <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center justify-between text-sm font-medium">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">📖</span>
                      <span className="text-muted-foreground">Cases Story</span>
                    </div>
                    <Badge 
                      variant={getStatusInfo(displayMetrics.cases.variance, displayMetrics.cases.actual, displayMetrics.cases.target).variant}
                      className={getStatusInfo(displayMetrics.cases.variance, displayMetrics.cases.actual, displayMetrics.cases.target).className}
                    >
                      {getStatusInfo(displayMetrics.cases.variance, displayMetrics.cases.actual, displayMetrics.cases.target).text}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="space-y-2">
                    <div className="flex items-baseline gap-2">
                      <span className="text-2xl font-bold text-foreground">
                        {formatNumber(displayMetrics.cases.actual)}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        / {formatNumber(displayMetrics.cases.target)}
                      </span>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      <Badge 
                        variant="outline" 
                        className="text-xs px-2 py-0.5"
                      >
                        {selectedQuarter === 'Q1' || selectedQuarter === 'all' ? (
                          <>
                            <span className="w-3 h-3 mr-1">-</span>
                            0.0%
                          </>
                        ) : displayMetrics.cases.variance >= 100 ? (
                          <>
                            <TrendingUp className="w-3 h-3 mr-1" />
                            {displayMetrics.cases.variance.toFixed(1)}%
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-3 h-3 mr-1" />
                            {displayMetrics.cases.variance.toFixed(1)}%
                          </>
                        )}
                      </Badge>
                      <span className="text-xs text-muted-foreground">vs last period</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Progress</span>
                      <span>{Math.max(0, displayMetrics.cases.variance).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-1000 ${getProgressColor(displayMetrics.cases.variance)}`}
                        style={{ width: `${Math.min(100, Math.max(0, displayMetrics.cases.variance))}%` }}
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
                         </div>
           )}

           {/* Additional Visualizations */}
           {!loading && !error && (
             <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
               {/* Line Chart - Left Side */}
               <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
                 <CardHeader>
                   <CardTitle className="flex items-center justify-between text-base">
                     <div className="flex items-center gap-2">
                       <BarChart3 className="w-4 h-4 text-primary" />
                       Quarterly Trend
                     </div>
                     <Select value={selectedChartMetric} onValueChange={setSelectedChartMetric}>
                       <SelectTrigger className="w-48">
                         <SelectValue />
                       </SelectTrigger>
                       <SelectContent>
                         <SelectItem value="Volunteers">Volunteers</SelectItem>
                         <SelectItem value="Volunteer Opportunities">Volunteer Opportunities</SelectItem>
                         <SelectItem value="Volunteers Training">Volunteers Training</SelectItem>
                         <SelectItem value="Expenditures">Expenditures</SelectItem>
                         <SelectItem value="Beneficiaries">Beneficiaries</SelectItem>
                         <SelectItem value="Cases Story">Cases Story</SelectItem>
                       </SelectContent>
                     </Select>
                   </CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="h-64">
                     <ResponsiveContainer width="100%" height="100%">
                       <LineChart data={getQuarterlyData()}>
                         <XAxis dataKey="quarter" />
                         <YAxis 
                           tickFormatter={(value) => {
                             if (value >= 1000000) {
                               return (value / 1000000).toFixed(2).replace(/\.?0+$/, '') + 'M';
                             }
                             return value.toLocaleString();
                           }}
                         />
                         <Tooltip 
                           formatter={(value, name, props) => {
                             if (name === 'value') {
                               return [
                                 `Actual: ${formatNumber(Number(value))}`,
                                 'Actual'
                               ];
                             }
                             return [formatNumber(Number(value)), name];
                           }}
                           labelFormatter={(label) => `${label}`}
                           content={({ active, payload, label }) => {
                             if (active && payload && payload.length) {
                               const data = payload[0].payload;
                               return (
                                 <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                   <p className="font-semibold text-gray-900">{label}</p>
                                   <p className="text-blue-600">
                                     Actual: {data.value ? formatNumber(data.value) : '0'}
                                   </p>
                                   <p className="text-green-600">
                                     Target: {data.target ? formatNumber(data.target) : '0'}
                                   </p>
                                 </div>
                               );
                             }
                             return null;
                           }}
                         />
                         <Line 
                           type="monotone" 
                           dataKey="value" 
                           stroke="#3b82f6" 
                           strokeWidth={2}
                           strokeDasharray="5 5"
                           dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                           connectNulls={false}
                         />
                       </LineChart>
                     </ResponsiveContainer>
                   </div>
                 </CardContent>
               </Card>

               {/* Heart Visual - Right Side */}
               <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
                 <CardHeader>
                   <CardTitle className="flex items-center gap-2 text-base">
                     <Activity className="w-4 h-4 text-primary" />
                     Overall Health Score
                   </CardTitle>
                 </CardHeader>
                 <CardContent className="space-y-4">
                   {/* Heart Visual */}
                   <div className="flex flex-col items-center space-y-4">
                     <div className="relative">
                       <svg 
                         width="120" 
                         height="108" 
                         viewBox="0 0 24 24" 
                         className="w-24 h-24"
                       >
                         {/* Heart outline */}
                         <path
                           d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
                           fill="none"
                           stroke={getBloodColor(calculateOverallHealth())}
                           strokeWidth="2"
                           strokeLinecap="round"
                           strokeLinejoin="round"
                         />
                         
                         {/* Heart fill based on percentage */}
                         <defs>
                           <clipPath id="heart-clip-onedrive">
                             <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                           </clipPath>
                           <linearGradient id="fillGradient-onedrive" x1="0%" y1="100%" x2="0%" y2="0%">
                             <stop offset="0%" stopColor={getBloodColor(calculateOverallHealth())} stopOpacity="0.8" />
                             <stop offset={`${100 - calculateOverallHealth()}%`} stopColor={getBloodColor(calculateOverallHealth())} stopOpacity="0.8" />
                             <stop offset={`${100 - calculateOverallHealth()}%`} stopColor="transparent" stopOpacity="0" />
                             <stop offset="100%" stopColor="transparent" stopOpacity="0" />
                           </linearGradient>
                         </defs>
                         
                         <rect
                           x="0"
                           y="0"
                           width="24"
                           height="24"
                           fill="url(#fillGradient-onedrive)"
                           clipPath="url(#heart-clip-onedrive)"
                           className="health-heart"
                         />
                       </svg>
                       
                       {/* Blood flow animation */}
                       <div className="absolute -bottom-4 left-1/2 transform -translate-x-1/2">
                         <div 
                           className="w-2 h-12 health-blood rounded-full opacity-70"
                           style={{ backgroundColor: getBloodColor(calculateOverallHealth()) }}
                         />
                       </div>
                     </div>
                     
                     <div className="text-center space-y-2">
                       <div className={`text-3xl font-bold ${getHealthColor(calculateOverallHealth())}`}>
                         {calculateOverallHealth().toFixed(0)}%
                       </div>
                       <div className="text-sm text-muted-foreground">
                         Overall Health Score
                       </div>
                       <div className={`text-base font-semibold ${getHealthColor(calculateOverallHealth())}`}>
                         {getHealthStatus(calculateOverallHealth())}
                       </div>
                       <div className="text-xs text-muted-foreground max-w-xs">
                         Health Calculation: Based on average Program Operations Sector. Higher scores indicate better alignment with projects.
                       </div>
                     </div>
                   </div>
                 </CardContent>
               </Card>
             </div>
           )}


         </main>
       </div>
     </div>
   );
 };

export default Summary; 