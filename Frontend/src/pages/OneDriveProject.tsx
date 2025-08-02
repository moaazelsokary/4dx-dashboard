import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { 
  ChevronLeft, 
  Filter, 
  Calendar, 
  Building2, 
  TrendingUp, 
  TrendingDown,
  BarChart3,
  MapPin,
  AlertCircle,
  FolderOpen,
  RefreshCw,
  LogOut,
  Menu,
  ArrowRight
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { getCurrentQuarter as getCurrentQuarterUtil } from '@/lib/utils';
import { dataCacheService } from '@/services/dataCacheService';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';

// Set Mapbox access token from environment variable or fallback
mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoibW9hem1haG1vdWQiLCJhIjoiY2x3czBvN2RsMDJudjJycXh5YmRjc2VzayJ9.ZslAr64T-7dusrhrUnw3RQ';

// Use local proxy for development, Netlify function for production
const isLocalhost = window.location.hostname === 'localhost';
const ONEDRIVE_FUNCTION_URL = isLocalhost 
  ? 'http://localhost:3002/api/onedrive'
  : '/.netlify/functions/get_excel_data_from_onedrive_url';
const TEST_FUNCTION_URL = isLocalhost 
  ? 'http://localhost:3002/api/test'
  : '/.netlify/functions/test';
const ONEDRIVE_SAMPLE_URL = 'https://lifemaker-my.sharepoint.com/:x:/r/personal/hamed_ibrahim_lifemakers_org/_layouts/15/Doc.aspx?sourcedoc=%7B084A3748-79EC-41B1-B3EB-8ECED81E5C53%7D&file=Projects%20Dashboard%202025%20-%20Internal%20tracker.xlsx&fromShare=true&action=default&mobileredirect=true';

const ProjectDetails: React.FC = () => {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarterUtil());
  const [selectedProject, setSelectedProject] = useState('Basic needs');
  const [selectedChartMetric, setSelectedChartMetric] = useState('Volunteers');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  
  // Reactive filtering - recalculate when filters change (like department dashboard)
  const [filteredMetrics, setFilteredMetrics] = useState<any>(null);
  
  // Process Services data from "Services Target Q Vs Actual" tab
  const processServicesData = useCallback((servicesData: any) => {
    // Check if the data is an error object from Netlify function
    if (servicesData && typeof servicesData === 'object' && servicesData.error) {
      console.log('❌ Services Target Q Vs Actual tab has an error:', servicesData.error);
      return [];
    }
    
    if (!Array.isArray(servicesData) || servicesData.length < 2) {
      console.log('❌ Services data is not in expected format');
      console.log('Data:', servicesData);
      return [];
    }

    console.log('📊 Processing Services Target Q Vs Actual data:', servicesData.slice(0, 3));

    // Find the column indices based on the known structure
    const headers = servicesData[1] || [];
    console.log('🔍 Available headers:', headers);
    
    // Column mapping based on the structure you provided:
    // Project, Main Services, Target 2025, Target Q1, Actual Q1, Target Q2, Actual Q2, Target Q3, Actual Q3, Target Q4, Actual Q4
    const columnIndices = {
      project: 0,           // Project column
      mainServices: 1,      // Main Services column
      target2025: 2,        // Target 2025 column
      targetQ1: 3,          // Target Q1 column
      actualQ1: 4,          // Actual Q1 column
      targetQ2: 5,          // Target Q2 column
      actualQ2: 6,          // Actual Q2 column
      targetQ3: 7,          // Target Q3 column
      actualQ3: 8,          // Actual Q3 column
      targetQ4: 9,          // Target Q4 column
      actualQ4: 10          // Actual Q4 column
    };

    console.log('🔍 Column indices:', columnIndices);

    // Get the correct quarter indices based on selected quarter
    const getQuarterData = (quarter: string) => {
      switch (quarter) {
        case 'Q1':
          return { target: columnIndices.targetQ1, actual: columnIndices.actualQ1 };
        case 'Q2':
          return { target: columnIndices.targetQ2, actual: columnIndices.actualQ2 };
        case 'Q3':
          return { target: columnIndices.targetQ3, actual: columnIndices.actualQ3 };
        case 'Q4':
          return { target: columnIndices.targetQ4, actual: columnIndices.actualQ4 };
        default:
          return { target: columnIndices.targetQ1, actual: columnIndices.actualQ1 };
      }
    };

    const quarterData = getQuarterData(selectedQuarter);
    console.log('🔍 Quarter data for', selectedQuarter, ':', quarterData);

    // Filter service rows (skip header row)
    const serviceRows = servicesData.slice(1).filter(row => {
      const projectName = String(row[columnIndices.project] || '').trim();
      const serviceName = String(row[columnIndices.mainServices] || '').trim();
      
      // Only include rows that have both project and service names
      if (!projectName || !serviceName || 
          projectName.toLowerCase().includes('project') || 
          serviceName.toLowerCase().includes('main services')) {
        return false;
      }
      
      // Filter by selected project - use exact match or starts with
      if (selectedProject !== '') {
        const projectLower = projectName.toLowerCase();
        const selectedLower = selectedProject.toLowerCase();
        return projectLower === selectedLower || projectLower.startsWith(selectedLower);
      }
      
      return true;
    });

    console.log('🔍 Filtered service rows:', serviceRows.length);
    console.log('🔍 Services found for project', selectedProject, ':', serviceRows.map(row => ({
      project: row[columnIndices.project],
      service: row[columnIndices.mainServices]
    })));
    console.log('🔍 All available projects in services data:', [...new Set(servicesData.slice(1).map(row => row[columnIndices.project]).filter(Boolean))]);

    // Process each service row into metrics
    return serviceRows.map(row => {
      const serviceName = String(row[columnIndices.mainServices] || '').trim();
      const target = parseFloat(String(row[quarterData.target] || '0').replace(/,/g, '')) || 0;
      const actual = parseFloat(String(row[quarterData.actual] || '0').replace(/,/g, '')) || 0;
      const variance = actual - target;

      return {
        serviceName,
        metrics: {
          volunteers: { actual, target, variance },
          opportunities: { actual, target, variance },
          training: { actual, target, variance },
          expenditures: { actual, target, variance },
          beneficiaries: { actual, target, variance },
          cases: { actual, target, variance }
        }
      };
    });
  }, [selectedQuarter, selectedProject]);

  // Process Projects data from "Projects" tab
  const processProjectsData = useCallback((projectsData: any) => {
    // Check if the data is an error object from Netlify function
    if (projectsData && typeof projectsData === 'object' && projectsData.error) {
      console.log('❌ Projects tab has an error:', projectsData.error);
      return [];
    }
    
    if (!Array.isArray(projectsData) || projectsData.length < 2) {
      console.log('❌ Projects data is not in expected format');
      console.log('Data:', projectsData);
      return [];
    }

    console.log('📊 Processing Projects data:', projectsData.slice(0, 3));

    // Find the column indices based on the known structure
    const headers = projectsData[1] || [];
    console.log('🔍 Available headers:', headers);
    
    // Column mapping based on the structure you provided:
    // Project_ID, Project_Name, Source_of_Fund, Duration (Months), Fund (EGP), Geolocation (Governorates)
    const columnIndices = {
      projectId: 0,         // Project_ID column
      projectName: 1,       // Project_Name column
      sourceOfFund: 2,      // Source_of_Fund column
      durationMonths: 3,    // Duration (Months) column
      fundEGP: 4,           // Fund (EGP) column
      geolocation: 5        // Geolocation (Governorates) column
    };

    console.log('🔍 Column indices:', columnIndices);

    // Filter project rows (skip header row)
    const projectRows = projectsData.slice(1).filter(row => {
      const projectName = String(row[columnIndices.projectName] || '').trim();
      
      // Only include rows that have project names
      if (!projectName || projectName.toLowerCase().includes('project')) {
        return false;
      }
      
      return true;
    });

    console.log('🔍 Filtered project rows:', projectRows.length);

    // Process each project row
    return projectRows.map(row => {
      const projectName = String(row[columnIndices.projectName] || '').trim();
      const projectId = String(row[columnIndices.projectId] || '').trim();
      const sourceOfFund = String(row[columnIndices.sourceOfFund] || '').trim();
      const durationMonths = parseFloat(String(row[columnIndices.durationMonths] || '0').replace(/,/g, '')) || 0;
      const fundEGP = parseFloat(String(row[columnIndices.fundEGP] || '0').replace(/,/g, '')) || 0;
      const geolocation = String(row[columnIndices.geolocation] || '').trim();

      return {
        projectId,
        projectName,
        sourceOfFund,
        durationMonths,
        fundEGP,
        geolocation
      };
    });
  }, []);

  // Memoized filter function to prevent unnecessary recalculations
  const getFilteredMetrics = useCallback(() => {
    if (!data) return null;
    
    console.log('🔄 getFilteredMetrics called with quarter:', selectedQuarter, 'project:', selectedProject);
    console.log('🔍 Available tabs in data:', Object.keys(data));
    
    // Check if required tabs exist
    const hasProjectsTab = 'Projects' in data;
    const hasServicesTab = 'Services Target Q  Vs Actual' in data;
    console.log('🔍 Looking for Projects tab:', hasProjectsTab);
    console.log('🔍 Looking for Services Target Q  Vs Actual tab:', hasServicesTab);
    
    if (!hasProjectsTab || !hasServicesTab) {
      console.error('❌ Required tabs not found in data');
      return null;
    }
    
    // Process projects data
    const projectsData = data['Projects'];
    const servicesData = data['Services Target Q  Vs Actual'];
    console.log('Projects data:', projectsData.length);
    console.log('Services data:', servicesData.length);
    
    // Process services data for the selected project and quarter
    const processedServices = processServicesData(servicesData);
    
    // Process projects data
    const processedProjects = processProjectsData(projectsData);
    
    return {
      services: processedServices,
      projects: processedProjects
    };
  }, [data, selectedQuarter, selectedProject, processServicesData, processProjectsData]);
  
  // Memoized filtered metrics to prevent unnecessary re-renders
  const memoizedFilteredMetrics = useMemo(() => {
    console.log('🔄 Filter effect triggered - data:', !!data, 'quarter:', selectedQuarter, 'project:', selectedProject);
    if (data) {
      const metrics = getFilteredMetrics();
      console.log('🔄 Setting filtered metrics:', metrics);
      return metrics;
    }
    return null;
  }, [data, selectedQuarter, selectedProject, getFilteredMetrics]);
  
  // Update filtered metrics when memoized value changes
  useEffect(() => {
    setFilteredMetrics(memoizedFilteredMetrics);
  }, [memoizedFilteredMetrics]);

  // Memoized filter handlers to prevent unnecessary re-renders
  const handleQuarterChange = useCallback((quarter: string) => {
    setSelectedQuarter(quarter);
  }, []);

  const handleProjectChange = useCallback((project: string) => {
    setSelectedProject(project);
  }, []);

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
      console.log('✅ Worksheets set:', Object.keys(data));
      console.log('📋 Available tabs:', Object.keys(data));
    } catch (e: any) {
      console.error('❌ Error fetching OneDrive data:', e);
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

  // Get summary metrics from both "Projects" and "Target quarters Vs Actual" tabs
  const getSummaryMetrics = () => {
    if (!data) return null;
    
    const projectsData = data['Projects'];
    const servicesData = data['Target quarters Vs Actual'];
    
    if (!projectsData || !servicesData) {
      console.log('❌ Required tabs not found');
      console.log('❌ Available tabs:', Object.keys(data));
      return null;
    }
    
    console.log('✅ Found both Projects and Target quarters Vs Actual tabs');
    return { projectsData, servicesData };
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
    const isOnTrack = variance >= 80 && variance < 100;
    const isOffTrack = variance >= 60 && variance < 80;
    const isAtRisk = variance < 60;

    if (isPerfect) {
      return { text: "Perfect", variant: "default" as const, className: "bg-green-500 text-white" };
    } else if (isOverTarget) {
      return { text: "Over Target", variant: "default" as const, className: "bg-green-500 text-white" };
    } else if (isOnTrack) {
      return { text: "On Track", variant: "default" as const, className: "bg-blue-500 text-white" };
    } else if (isOffTrack) {
      return { text: "Off Track", variant: "default" as const, className: "bg-yellow-500 text-white" };
    } else {
      return { text: "At Risk", variant: "default" as const, className: "bg-red-500 text-white" };
    }
  };

  const getStatusColor = (variance: number) => {
    if (variance >= 100) return "text-green-600";
    if (variance >= 80) return "text-blue-600";
    if (variance >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getProgressColor = (variance: number) => {
    if (variance >= 100) return "bg-green-500";
    if (variance >= 80) return "bg-blue-500";
    if (variance >= 60) return "bg-yellow-500";
    return "bg-red-500";
  };

  const getHealthColor = (percentage: number) => {
    if (percentage >= 80) return "text-green-600";
    if (percentage >= 60) return "text-yellow-600";
    return "text-red-600";
  };

  const getHealthStatus = (percentage: number) => {
    if (percentage >= 80) return "Excellent";
    if (percentage >= 60) return "Good";
    return "Needs Attention";
  };

  const getBloodColor = (percentage: number) => {
    if (percentage >= 80) return "#22c55e"; // green
    if (percentage >= 60) return "#eab308"; // yellow
    return "#ef4444"; // red
  };

  const calculateOverallHealth = () => {
    if (!displayMetrics) return 0;
    
    const metrics = Object.values(displayMetrics);
    const validMetrics = metrics.filter((metric: any) => 
      metric.actual !== undefined && metric.actual !== null && !isNaN(metric.actual)
    );
    
    if (validMetrics.length === 0) return 0;
    
    // Calculate average of averages, but cap individual metrics at 100%
    const cappedVariances = validMetrics.map((metric: any) => {
      const variance = metric.variance || 0;
      return Math.min(variance, 100); // Cap at 100%
    });
    
    const average = cappedVariances.reduce((sum: number, variance: number) => sum + variance, 0) / cappedVariances.length;
    return Math.round(average * 100) / 100; // Round to 2 decimal places
  };

  // Get project names from the Projects tab
  const getProjectNames = () => {
    if (!data) {
      console.log('❌ No data available for project names');
      return [];
    }
    
    console.log('📋 Available tabs:', Object.keys(data));
    
    // Try different possible tab names
    const possibleTabNames = [
      'Projects',
      'Project',
      'Projects ',
      'Project '
    ];
    
    let projectsData = null;
    let usedTabName = '';
    
    for (const tabName of possibleTabNames) {
      if (data[tabName]) {
        projectsData = data[tabName];
        usedTabName = tabName;
        console.log(`✅ Found tab: "${tabName}"`);
        break;
      }
    }
    
    if (!projectsData) {
      console.log('❌ Could not find Projects tab');
      console.log('Available tabs:', Object.keys(data));
      return [];
    }
    
    // Check if the data is an error object from Netlify function
    if (projectsData && typeof projectsData === 'object' && projectsData.error) {
      console.log('❌ Projects tab has an error:', projectsData.error);
      return [];
    }
    
    if (!Array.isArray(projectsData) || projectsData.length < 2) {
      console.log('❌ Projects data is not in expected format');
      console.log('Data:', projectsData);
      return [];
    }
    
    console.log(`📊 Processing ${projectsData.length} rows from "${usedTabName}"`);
    
    // Skip header row and extract project names from Project_Name column (index 1)
    const projectNames = projectsData.slice(1)
      .map((row: any[]) => row[1]) // Project_Name column
      .filter((name: string) => name && name.trim() !== '')
      .map((name: string) => name.trim());
    
    console.log('🏷️ Found project names:', projectNames);
    return projectNames;
  };

  const projectNames = getProjectNames();

  // Get selected project data for navigator
  const getSelectedProjectData = () => {
    if (!selectedProject || !filteredMetrics?.projects) return null;
    
    const project = filteredMetrics.projects.find((p: any) => 
      p.projectName.toLowerCase() === selectedProject.toLowerCase()
    );
    
    if (!project) return null;
    
    // Count active governorates (split by comma and count)
    const governorates = project.geolocation.split(',').map((g: string) => g.trim()).filter((g: string) => g.length > 0);
    const activeGovernorates = governorates.length;
    
    return {
      projectName: project.projectName,
      durationMonths: project.durationMonths,
      sourceOfFund: project.sourceOfFund,
      fundEGP: project.fundEGP,
      activeGovernorates
    };
  };

  const selectedProjectData = getSelectedProjectData();

  // Calculate metrics for the selected project based on services data
  const getProjectMetrics = () => {
    if (!filteredMetrics?.services || filteredMetrics.services.length === 0) {
      return {
        volunteers: { actual: 0, target: 0, variance: 0 },
        opportunities: { actual: 0, target: 0, variance: 0 },
        training: { actual: 0, target: 0, variance: 0 },
        expenditures: { actual: 0, target: 0, variance: 0 },
        beneficiaries: { actual: 0, target: 0, variance: 0 },
        cases: { actual: 0, target: 0, variance: 0 }
      };
    }

    // Use the first service entry for the selected project
    const projectService = filteredMetrics.services[0];
    if (!projectService) return null;

    console.log('🔍 Project service data:', projectService);
    
    return {
      volunteers: projectService.metrics.volunteers,
      opportunities: projectService.metrics.opportunities,
      training: projectService.metrics.training,
      expenditures: projectService.metrics.expenditures,
      beneficiaries: projectService.metrics.beneficiaries,
      cases: projectService.metrics.cases
    };
  };

  // Get quarterly data for the selected project
  const getQuarterlyData = () => {
    if (!filteredMetrics?.services || filteredMetrics.services.length === 0) {
      return [];
    }

    const projectService = filteredMetrics.services[0];
    if (!projectService) return [];

    // For now, we'll use the same metrics for all quarters since we're only processing one quarter at a time
    // In a full implementation, you'd want to process all quarters
    const metrics = projectService.metrics;
    
    return [
      {
        quarter: 'Q1',
        value: metrics.volunteers.actual,
        target: metrics.volunteers.target
      },
      {
        quarter: 'Q2',
        value: metrics.volunteers.actual,
        target: metrics.volunteers.target
      },
      {
        quarter: 'Q3',
        value: metrics.volunteers.actual,
        target: metrics.volunteers.target
      },
      {
        quarter: 'Q4',
        value: metrics.volunteers.actual,
        target: metrics.volunteers.target
      }
    ];
  };

  // Calculate overall health for the selected project
  const calculateProjectHealth = () => {
    const metrics = getProjectMetrics();
    if (!metrics) return 0;

    const metricValues = [
      metrics.volunteers.variance,
      metrics.opportunities.variance,
      metrics.training.variance,
      metrics.expenditures.variance,
      metrics.beneficiaries.variance,
      metrics.cases.variance
    ];

    const validMetrics = metricValues.filter(metric => !isNaN(metric) && isFinite(metric));
    if (validMetrics.length === 0) return 0;

    // Cap each metric at 100% before averaging
    const cappedMetrics = validMetrics.map(metric => Math.min(100, Math.max(0, metric)));
    const average = cappedMetrics.reduce((sum, metric) => sum + metric, 0) / cappedMetrics.length;

    return average;
  };

  // Mapbox Map Component
  const EgyptMap: React.FC = () => {
    const mapContainer = useRef<HTMLDivElement>(null);
    const map = useRef<mapboxgl.Map | null>(null);
    const dataRef = useRef(data); // Store data in ref to avoid re-renders
    const [lng] = useState(31.2357); // Cairo longitude
    const [lat] = useState(30.0444); // Cairo latitude
    const [zoom] = useState(6);

    // Update data ref when data changes
    useEffect(() => {
      dataRef.current = data;
    }, [data]);

    useEffect(() => {
      if (map.current) return; // initialize map only once
      if (!mapContainer.current) return;

      map.current = new mapboxgl.Map({
        container: mapContainer.current,
        style: 'mapbox://styles/mapbox/streets-v12', // Changed to streets theme for better visibility
        center: [lng, lat],
        zoom: zoom
      });

      // Add navigation controls
      map.current.addControl(new mapboxgl.NavigationControl(), 'top-right');

      // Add scale bar
      map.current.addControl(new mapboxgl.ScaleControl({
        maxWidth: 80,
        unit: 'metric'
      }), 'bottom-left');

      // Add fullscreen control
      map.current.addControl(new mapboxgl.FullscreenControl(), 'top-right');

      return () => {
        if (map.current) {
          map.current.remove();
        }
      };
    }, [lng, lat, zoom]);

    // Update markers when selectedProject changes (ignore quarter filter)
    useEffect(() => {
      if (!map.current) return;

      // Wait for map to load
      map.current.on('load', () => {
        updateGovernorateMarkers();
      });

      // If map is already loaded, update markers immediately
      if (map.current.isStyleLoaded()) {
        updateGovernorateMarkers();
      }
    }, [selectedProject]); // Only depend on selectedProject, not data or filteredMetrics

        const updateGovernorateMarkers = () => {
      if (!map.current) return;

      // Remove existing governorate layers and sources
      if (map.current.getLayer('governorate-points-highlight')) {
        map.current.removeLayer('governorate-points-highlight');
      }
      if (map.current.getLayer('governorate-points-shadow')) {
        map.current.removeLayer('governorate-points-shadow');
      }
      if (map.current.getLayer('governorate-points')) {
        map.current.removeLayer('governorate-points');
      }
      if (map.current.getSource('governorate-points')) {
        map.current.removeSource('governorate-points');
      }

      // Get governorates for the selected project (ignore quarter filter)
      let governorates: string[] = [];
      
      if (selectedProject && dataRef.current?.Projects) {
        // Check if the data is an error object from Netlify function
        if (dataRef.current.Projects && typeof dataRef.current.Projects === 'object' && dataRef.current.Projects.error) {
          console.log('❌ Map: Projects tab has an error:', dataRef.current.Projects.error);
          return;
        }
        
        // Check if Projects data is an array
        if (!Array.isArray(dataRef.current.Projects)) {
          console.log('❌ Map: Projects data is not an array:', dataRef.current.Projects);
          return;
        }
        
        // Find the selected project in the raw projects data - use exact match or starts with
        const projectsData = dataRef.current.Projects;
        const selectedProjectData = projectsData.find((project: any) => {
          const projectName = String(project[1] || '').trim(); // Project name is in column 1
          const projectLower = projectName.toLowerCase();
          const selectedLower = selectedProject.toLowerCase();
          return projectLower === selectedLower || projectLower.startsWith(selectedLower);
        });
        
        console.log('🔍 Map: Found project data:', selectedProjectData);
        console.log('🔍 Map: Project geolocation field:', selectedProjectData?.[5]); // Geolocation is in column 5
        
        if (selectedProjectData?.[5]) {
          governorates = String(selectedProjectData[5]).split(',').map(g => g.trim());
          console.log('🔍 Map: Parsed governorates:', governorates);
        }
      }

      console.log('🔍 Map: Selected project:', selectedProject);
      console.log('🔍 Map: Governorates for project:', governorates);
      // Only log if Projects data is an array
      if (Array.isArray(dataRef.current?.Projects)) {
        console.log('🔍 Map: Available projects:', dataRef.current?.Projects?.slice(2).map((p: any) => ({ 
          name: p[1], 
          geolocation: p[5],
          match: String(p[1] || '').toLowerCase().includes(selectedProject.toLowerCase())
        })));
        console.log('🔍 Map: All governorates in data:', [...new Set(dataRef.current?.Projects?.slice(2).flatMap((p: any) => 
          String(p[5] || '').split(',').map(g => g.trim()).filter(Boolean)
        ) || [])]);
      }
      
      // Egypt governorate coordinates - Updated with more accurate locations
      const governorateCoordinates: { [key: string]: [number, number] } = {
        'Alexandria': [29.9187, 31.2001],        // Alexandria city
        'Aswan': [32.8994, 24.0908],             // Aswan city
        'Asyut': [31.1859, 27.1783],             // Asyut city
        'Red Sea': [33.8167, 25.6833],           // Hurghada area
        'Beheira': [30.4667, 30.9333],           // Damanhur area
        'Beni Suef': [31.0994, 29.0661],         // Beni Suef city
        'Cairo': [31.2357, 30.0444],             // Cairo city
        'Dakahlia': [31.3807, 31.0335],          // Mansoura area
        'Damietta': [31.8133, 31.4165],          // Damietta city
        'Faiyum': [30.8441, 29.3084],            // Faiyum city
        'Gharbia': [31.0335, 30.8753],           // Tanta area
        'Giza': [31.2089, 30.0131],              // Giza city
        'Ismailia': [32.2723, 30.6043],          // Ismailia city
        'South Sinai': [34.3333, 28.2333],       // Sharm El Sheikh area
        'Qalyubia': [31.2067, 30.1769],          // Banha area
        'Kafr el-Sheikh': [30.9394, 31.1117],    // Kafr el-Sheikh city
        'Qena': [32.7267, 26.1644],              // Qena city
        'Luxor': [32.6396, 25.6872],             // Luxor city
        'Minya': [30.7503, 28.1099],             // Minya city
        'Monufia': [30.9306, 30.4659],           // Shibin El Kom area
        'Matrouh': [27.2373, 31.3525],           // Marsa Matrouh area
        'Port Said': [32.3, 31.2667],            // Port Said city
        'Sohag': [31.6948, 26.5569],             // Sohag city
        'Sharqia': [31.5020, 30.5877],           // Zagazig area
        'North Sinai': [33.8, 31.0],             // El Arish area
        'Suez': [32.5263, 29.9737],              // Suez city
        'New Valley': [28.5, 25.5]               // Kharga Oasis area
      };

      // Create GeoJSON data for governorates
      const features = governorates
        .map(governorate => {
          const coordinates = governorateCoordinates[governorate];
          if (coordinates) {
            console.log('🔍 Map: Adding point for governorate:', governorate, 'at coordinates:', coordinates);
            return {
              type: 'Feature' as const,
              geometry: {
                type: 'Point' as const,
                coordinates: coordinates
              },
              properties: {
                governorate: governorate,
                project: selectedProject
              }
            };
          }
          return null;
        })
        .filter(Boolean);

      if (features.length > 0) {
        // Add the source
        map.current.addSource('governorate-points', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: features
          }
        });

        // Add the main 3D circle layer
        map.current.addLayer({
          id: 'governorate-points',
          type: 'circle',
          source: 'governorate-points',
          paint: {
            'circle-radius': 6,
            'circle-color': '#ef4444',
            'circle-stroke-color': '#dc2626',
            'circle-stroke-width': 2,
            'circle-opacity': 0.95,
            'circle-translate': [0, 0],
            'circle-translate-anchor': 'map'
          }
        });

        // Add shadow layer for 3D effect
        map.current.addLayer({
          id: 'governorate-points-shadow',
          type: 'circle',
          source: 'governorate-points',
          paint: {
            'circle-radius': 6,
            'circle-color': 'rgba(0, 0, 0, 0.3)',
            'circle-stroke-color': 'rgba(0, 0, 0, 0.2)',
            'circle-stroke-width': 1,
            'circle-opacity': 0.6,
            'circle-translate': [1, 1],
            'circle-translate-anchor': 'map'
          }
        });

        // Add highlight layer for 3D shine effect
        map.current.addLayer({
          id: 'governorate-points-highlight',
          type: 'circle',
          source: 'governorate-points',
          paint: {
            'circle-radius': 2,
            'circle-color': 'rgba(255, 255, 255, 0.7)',
            'circle-stroke-color': 'rgba(255, 255, 255, 0.5)',
            'circle-stroke-width': 1,
            'circle-opacity': 0.8,
            'circle-translate': [-1, -1],
            'circle-translate-anchor': 'map'
          }
        });

        // Add hover effects for 3D scaling
        map.current.on('mouseenter', 'governorate-points', () => {
          map.current!.getCanvas().style.cursor = 'pointer';
          
          // Scale up the main points on hover
          map.current!.setPaintProperty('governorate-points', 'circle-radius', 8);
          map.current!.setPaintProperty('governorate-points-shadow', 'circle-radius', 8);
          map.current!.setPaintProperty('governorate-points-highlight', 'circle-radius', 3);
        });

        map.current.on('mouseleave', 'governorate-points', () => {
          map.current!.getCanvas().style.cursor = '';
          
          // Scale back to normal size
          map.current!.setPaintProperty('governorate-points', 'circle-radius', 6);
          map.current!.setPaintProperty('governorate-points-shadow', 'circle-radius', 6);
          map.current!.setPaintProperty('governorate-points-highlight', 'circle-radius', 2);
        });

        // Add click popup
        map.current.on('click', 'governorate-points', (e) => {
          if (e.features && e.features[0]) {
            const governorate = e.features[0].properties?.governorate;
            const project = e.features[0].properties?.project;
            
            new mapboxgl.Popup()
              .setLngLat(e.lngLat)
              .setHTML(`
                <div class="p-2">
                  <h3 class="font-bold text-gray-900">${governorate}</h3>
                  <p class="text-sm text-gray-600">${project} Project</p>
                </div>
              `)
              .addTo(map.current!);
          }
        });
      }
    };

    return (
      <div className="w-full h-96 rounded-lg overflow-hidden border border-gray-200 shadow-lg">
        <div ref={mapContainer} className="w-full h-full" />
      </div>
    );
  };

  const projectMetrics = getProjectMetrics();
  const quarterlyData = getQuarterlyData();
  const projectHealth = calculateProjectHealth();

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
                  <DropdownMenuItem onClick={() => navigate('/summary')}>
                    <BarChart3 className="w-4 h-4 mr-2" />
                    Summary Overview
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <img src="/logo.png" alt="LIFE Makers Egypt" className="h-12 w-auto" />
              <h1 className="text-xl font-semibold text-gray-900">Project Details</h1>
            </div>

            {/* Right side: Action Buttons - Desktop Only */}
            <div className="hidden sm:flex sm:items-center gap-2">
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
        </div>
      </header>

      <div className="container mx-auto px-4 py-4 space-y-4 pb-20 sm:pb-4">
        {/* Mobile Buttons - Before Filters */}
        <div className="flex gap-3 sm:hidden">
          <Button variant="outline" size="sm" onClick={handleRefreshData} className="flex-1 text-xs">
            <RefreshCw className="w-4 h-4 mr-1" />
            Refresh Data
          </Button>
          <Button variant="outline" size="sm" onClick={handleSignOut} className="flex-1 text-xs">
            <LogOut className="w-4 h-4 mr-1" />
            Sign Out
          </Button>
        </div>

        {/* Combined Filters */}
        <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
          <CardContent className="p-6">
            <div className="grid grid-cols-1 gap-6">
              {/* Filters - Full width */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Filter className="w-4 h-4 text-primary" />
                  <h3 className="font-semibold text-sm">Data Filters</h3>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                  {/* Quarters Filter - Left Column (1/4 width) */}
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

                  {/* Projects Filter - Right Column (3/4 width) */}
                  <div className="col-span-1 sm:col-span-3">
                    <label className="text-sm font-medium text-muted-foreground mb-2 block">
                      <Building2 className="w-4 h-4 inline mr-1" />
                      Select Projects
                    </label>
                    
                    {/* Mobile: Dropdown */}
                    <div className="sm:hidden">
                      <Select value={selectedProject} onValueChange={setSelectedProject}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                        <SelectContent>
                          {getProjectNames().map((projectName: string) => (
                            <SelectItem key={projectName} value={projectName}>
                              {projectName}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Desktop: Badge Grid */}
                    <div className="hidden sm:block">
                      <div className="space-y-2">
                        {/* First row of projects */}
                        <div className="flex flex-wrap gap-1">
                          {projectNames.length > 0 ? (
                            projectNames.slice(0, Math.ceil(projectNames.length / 2)).map((projectName: string) => (
                              <Badge
                                key={projectName}
                                variant={selectedProject === projectName ? "default" : "outline"}
                                className={`cursor-pointer transition-colors text-[10px] px-2 py-1 ${
                                  selectedProject === projectName 
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                                    : "hover:bg-muted"
                                }`}
                                onClick={() => handleProjectChange(projectName)}
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
                          {projectNames.length > 0 ? (
                            projectNames.slice(Math.ceil(projectNames.length / 2)).map((projectName: string) => (
                              <Badge
                                key={projectName}
                                variant={selectedProject === projectName ? "default" : "outline"}
                                className={`cursor-pointer transition-colors text-[10px] px-2 py-1 ${
                                  selectedProject === projectName 
                                    ? "bg-primary text-primary-foreground hover:bg-primary/90" 
                                    : "hover:bg-muted"
                                }`}
                                onClick={() => handleProjectChange(projectName)}
                              >
                                {projectName}
                              </Badge>
                            ))
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-600">Loading project data...</p>
            </div>
          </div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="w-5 h-5" />
                <p className="font-medium">Error loading data</p>
              </div>
              <p className="text-red-500 text-sm mt-2">{error}</p>
            </CardContent>
          </Card>
        )}

        {!loading && !error && (
          <div className="space-y-6">
                         {/* Project Navigator */}
             {selectedProjectData && (
               <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
                 <CardHeader>
                   <CardTitle className="text-lg font-bold text-gray-900">Project Overview</CardTitle>
                 </CardHeader>
                 <CardContent>
                   <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                     {/* Project Name */}
                     <Card className="backdrop-blur-md bg-white/20 border border-white/30 shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                       <CardHeader className="pb-3">
                         <CardTitle className="flex items-center justify-between text-sm font-medium">
                           <div className="flex items-center gap-2">
                             <span className="text-lg">📋</span>
                             <span className="text-muted-foreground">Project Name</span>
                           </div>
                         </CardTitle>
                       </CardHeader>
                       <CardContent className="space-y-3">
                         <div className="space-y-2">
                           <div className="flex items-baseline gap-2">
                             <span className="text-lg font-bold text-foreground">
                               {selectedProjectData.projectName}
                             </span>
                           </div>
                         </div>
                       </CardContent>
                     </Card>
                     
                     {/* Duration */}
                     <Card className="backdrop-blur-md bg-white/20 border border-white/30 shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                       <CardHeader className="pb-3">
                         <CardTitle className="flex items-center justify-between text-sm font-medium">
                           <div className="flex items-center gap-2">
                             <span className="text-lg">⏱️</span>
                             <span className="text-muted-foreground">Duration</span>
                           </div>
                         </CardTitle>
                       </CardHeader>
                       <CardContent className="space-y-3">
                         <div className="space-y-2">
                           <div className="flex items-baseline gap-2">
                             <span className="text-lg font-bold text-foreground">
                               {selectedProjectData.durationMonths}
                             </span>
                             <span className="text-sm text-muted-foreground">
                               Months
                             </span>
                           </div>
                         </div>
                       </CardContent>
                     </Card>
                     
                     {/* Source of Fund */}
                     <Card className="backdrop-blur-md bg-white/20 border border-white/30 shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                       <CardHeader className="pb-3">
                         <CardTitle className="flex items-center justify-between text-sm font-medium">
                           <div className="flex items-center gap-2">
                             <span className="text-lg">🏦</span>
                             <span className="text-muted-foreground">Source of Fund</span>
                           </div>
                         </CardTitle>
                       </CardHeader>
                       <CardContent className="space-y-3">
                         <div className="space-y-2">
                           <div className="flex items-baseline gap-2">
                             <span className="text-sm font-bold text-foreground truncate">
                               {selectedProjectData.sourceOfFund}
                             </span>
                           </div>
                         </div>
                       </CardContent>
                     </Card>
                     
                     {/* Fund Amount */}
                     <Card className="backdrop-blur-md bg-white/20 border border-white/30 shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                       <CardHeader className="pb-3">
                         <CardTitle className="flex items-center justify-between text-sm font-medium">
                           <div className="flex items-center gap-2">
                             <span className="text-lg">💰</span>
                             <span className="text-muted-foreground">Fund Amount</span>
                           </div>
                         </CardTitle>
                       </CardHeader>
                       <CardContent className="space-y-3">
                         <div className="space-y-2">
                           <div className="flex items-baseline gap-2">
                             <span className="text-lg font-bold text-foreground">
                               {formatNumber(selectedProjectData.fundEGP)}
                             </span>
                             <span className="text-sm text-muted-foreground">
                               EGP
                             </span>
                           </div>
                         </div>
                       </CardContent>
                     </Card>
                     
                     {/* Active Governorates */}
                     <Card className="backdrop-blur-md bg-white/20 border border-white/30 shadow-xl transition-all duration-300 hover:shadow-2xl hover:-translate-y-1">
                       <CardHeader className="pb-3">
                         <CardTitle className="flex items-center justify-between text-sm font-medium">
                           <div className="flex items-center gap-2">
                             <span className="text-lg">🗺️</span>
                             <span className="text-muted-foreground">Active Governorates</span>
                           </div>
                         </CardTitle>
                       </CardHeader>
                       <CardContent className="space-y-3">
                         <div className="space-y-2">
                           <div className="flex items-baseline gap-2">
                             <span className="text-lg font-bold text-foreground">
                               {selectedProjectData.activeGovernorates}
                             </span>
                             <span className="text-sm text-muted-foreground">
                               Governorates
                             </span>
                           </div>
                         </div>
                       </CardContent>
                     </Card>
                   </div>
                 </CardContent>
               </Card>
             )}

             {/* Project Services Table and Visuals */}
             {selectedProjectData && filteredMetrics?.services && (
               <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Left Side - Services Table */}
                 <Card className="backdrop-blur-md bg-white/20 border border-white/30 shadow-xl">
                   <CardHeader>
                     <CardTitle className="flex items-center gap-2 text-base">
                       <BarChart3 className="w-4 h-4 text-primary" />
                       Main Services Performance
                     </CardTitle>
                   </CardHeader>
                   <CardContent>
                     <div className="overflow-y-auto max-h-96">
                       <table className="w-full">
                         <thead>
                           <tr className="border-b border-white/20">
                             <th className="text-left py-3 px-4 font-medium text-sm text-muted-foreground">Service Name</th>
                             <th className="text-right py-3 px-4 font-medium text-sm text-muted-foreground">Target</th>
                             <th className="text-right py-3 px-4 font-medium text-sm text-muted-foreground">Actual</th>
                             <th className="text-right py-3 px-4 font-medium text-sm text-muted-foreground">Percentage</th>
                           </tr>
                         </thead>
                         <tbody>
                           {filteredMetrics.services.map((service: any, index: number) => (
                             <tr key={index} className="border-b border-white/10 hover:bg-white/5 transition-colors">
                               <td className="py-3 px-4 font-medium text-sm">
                                 {service.serviceName}
                               </td>
                               <td className="py-3 px-4 text-right text-sm">
                                 {formatNumber(service.metrics.volunteers.target)}
                               </td>
                               <td className="py-3 px-4 text-right text-sm">
                                 {formatNumber(service.metrics.volunteers.actual)}
                               </td>
                               <td className="py-3 px-4 text-right">
                                 {(() => {
                                   const target = service.metrics.volunteers.target;
                                   const actual = service.metrics.volunteers.actual;
                                   
                                   // Handle special cases
                                   if (target === 0 && actual === 0) {
                                     return (
                                       <Badge variant="outline" className="text-xs px-2 py-0.5 text-gray-500 border-gray-500">
                                         Not Yet
                                       </Badge>
                                     );
                                   }
                                   
                                   if (target === 0 && actual > 0) {
                                     return (
                                       <Badge variant="outline" className="text-xs px-2 py-0.5 text-green-600 border-green-600">
                                         <TrendingUp className="w-3 h-3 mr-1" />
                                         100%
                                       </Badge>
                                     );
                                   }
                                   
                                   // Normal calculation
                                   const percentage = (actual / target * 100);
                                   const isGood = percentage >= 100;
                                   const colorClass = percentage >= 100 
                                     ? "text-green-600 border-green-600" 
                                     : percentage >= 80 
                                     ? "text-blue-600 border-blue-600" 
                                     : percentage >= 60 
                                     ? "text-yellow-600 border-yellow-600" 
                                     : "text-red-600 border-red-600";
                                   
                                   return (
                                     <Badge variant="outline" className={`text-xs px-2 py-0.5 ${colorClass}`}>
                                       {isGood ? (
                                         <>
                                           <TrendingUp className="w-3 h-3 mr-1" />
                                           {percentage.toFixed(1)}%
                                         </>
                                       ) : (
                                         <>
                                           <TrendingDown className="w-3 h-3 mr-1" />
                                           {percentage.toFixed(1)}%
                                         </>
                                       )}
                                     </Badge>
                                   );
                                 })()}
                               </td>
                             </tr>
                           ))}
                         </tbody>
                       </table>
                     </div>
                   </CardContent>
                 </Card>

                 {/* Right Side - Egypt Map with Governorates */}
                 <Card className="border-2 border-primary/20 bg-gradient-to-br from-primary/5 to-accent/5">
                   <CardHeader>
                     <CardTitle className="flex items-center gap-2 text-base">
                       <MapPin className="w-4 h-4 text-primary" />
                       Project Coverage - {selectedProject}
                     </CardTitle>
                   </CardHeader>
                   <CardContent>
                     {/* Egypt Map Visualization */}
                     <div className="flex justify-center">
                       <EgyptMap />
                     </div>
                   </CardContent>
                 </Card>
               </div>
             )}

            {/* No Project Selected Message */}
            {!selectedProjectData && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FolderOpen className="w-5 h-5" />
                    Select a Project
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-600">
                    Please select a project from the filters above to view its details and performance metrics.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectDetails; 