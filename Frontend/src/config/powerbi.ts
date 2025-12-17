// Power BI Dashboard Configuration
// Embed URLs are read from .env.local file
// Required environment variables (must be prefixed with VITE_ for Vite to expose them):
//   VITE_Volunteers
//   VITE_Humanitarian_Aid
//   VITE_Sawa
//   VITE_FRONTEX

export interface DashboardConfig {
  id: string;
  name: string;
  embedUrl: string;
  title: string;
  // Access control: specify which departments/roles can access this dashboard
  // 'all' means all departments, 'exclude' means all except specified departments
  // 'include' means only specified departments
  accessType: 'all' | 'exclude' | 'include';
  departments?: string[]; // Department codes (hr, security, case, operations, etc.)
  roles?: string[]; // User roles (CEO, department, project)
}

// Read embed URLs from environment variables
// Handles both direct URLs and HTML iframe tags (extracts src attribute)
const getEmbedUrl = (envVarName: keyof ImportMetaEnv): string => {
  const value = import.meta.env[envVarName];
  if (!value || typeof value !== 'string') {
    console.warn(`⚠️ Power BI embed URL not found in environment variable: ${envVarName}`);
    return '';
  }
  
  // Check if the value is an iframe HTML tag
  if (value.trim().startsWith('<iframe')) {
    // Extract src attribute from iframe tag
    const srcMatch = value.match(/src=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      return srcMatch[1];
    }
    console.warn(`⚠️ Could not extract src from iframe in environment variable: ${envVarName}`);
    return '';
  }
  
  // If it's already a URL, return it as-is
  return value.trim();
};

export const POWERBI_CONFIG = {
  dashboards: [
    {
      id: 'volunteers',
      name: 'Volunteers Dashboard',
      embedUrl: getEmbedUrl('VITE_Volunteers'),
      title: 'Volunteers Dashboard',
      accessType: 'exclude' as const,
      departments: ['hr', 'security'] // Available to all departments EXCEPT HR and Security
    },
    {
      id: 'humanitarian_aid',
      name: 'Humanitarian Aid Dashboard',
      embedUrl: getEmbedUrl('VITE_Humanitarian_Aid'),
      title: 'Humanitarian Aid Dashboard',
      accessType: 'include' as const,
      departments: ['case', 'operations'] // Available to Case, Operations, and Projects role
      // Note: Projects role is handled separately in access check
    },
    {
      id: 'sawa',
      name: 'Sawa Dashboard',
      embedUrl: getEmbedUrl('VITE_Sawa'),
      title: 'Sawa Dashboard',
      accessType: 'include' as const,
      departments: ['case', 'operations'] // Available to Case, Operations, and Projects role
      // Note: Projects role is handled separately in access check
    },
    {
      id: 'frontex',
      name: 'FRONTEX Dashboard',
      embedUrl: getEmbedUrl('VITE_FRONTEX'),
      title: 'FRONTEX Dashboard',
      accessType: 'include' as const,
      departments: ['case'] // Available to Case department and CEO only (CEO has access to all dashboards)
    }
  ]
};

// Helper function to get dashboard by ID
export const getDashboardById = (id: string) => {
  return POWERBI_CONFIG.dashboards.find(dashboard => dashboard.id === id);
};

// Helper function to get all dashboard names
export const getAllDashboardNames = () => {
  return POWERBI_CONFIG.dashboards.map(dashboard => dashboard.name);
};

// Access control function - determines if a user can access a dashboard
export const canAccessDashboard = (dashboard: DashboardConfig, userRole: string, userDepartments: string[]): boolean => {
  // CEO has access to all dashboards
  if (userRole === 'CEO') {
    return true;
  }

  // Handle 'all' access type
  if (dashboard.accessType === 'all') {
    return true;
  }

  // Handle 'exclude' access type (available to all except specified departments)
  if (dashboard.accessType === 'exclude' && dashboard.departments) {
    // Check if user's department is in the exclude list
    const hasExcludedDepartment = userDepartments.some(dept => 
      dashboard.departments!.includes(dept.toLowerCase())
    );
    return !hasExcludedDepartment;
  }

  // Handle 'include' access type (only specified departments)
  if (dashboard.accessType === 'include' && dashboard.departments) {
    // Check if user's department is in the include list
    const hasIncludedDepartment = userDepartments.some(dept => 
      dashboard.departments!.includes(dept.toLowerCase())
    );
    
    // Special handling for Humanitarian_Aid and Sawa - also allow project role
    if ((dashboard.id === 'humanitarian_aid' || dashboard.id === 'sawa') && userRole === 'project') {
      return true;
    }
    
    return hasIncludedDepartment;
  }

  return false;
};

// Get dashboards accessible to a specific user
export const getAccessibleDashboards = (userRole: string, userDepartments: string[]): DashboardConfig[] => {
  return POWERBI_CONFIG.dashboards.filter(dashboard => 
    canAccessDashboard(dashboard, userRole, userDepartments)
  );
};

// Check if user has access to any Power BI dashboard
export const hasPowerBIAccess = (userRole: string, userDepartments: string[]): boolean => {
  return getAccessibleDashboards(userRole, userDepartments).length > 0;
};
