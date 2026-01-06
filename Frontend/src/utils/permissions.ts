/**
 * Permission utilities
 * Handles role-based access control (RBAC)
 */

export type Role = 'Admin' | 'Editor' | 'Viewer' | 'CEO' | 'department' | 'project';

export type Permission = 'create' | 'read' | 'update' | 'delete';

export interface UserPermissions {
  role: Role;
  canCreate: (resource: string) => boolean;
  canRead: (resource: string) => boolean;
  canUpdate: (resource: string) => boolean;
  canDelete: (resource: string) => boolean;
}

// Permission matrix
const PERMISSIONS: Record<Role, Record<string, Permission[]>> = {
  Admin: {
    '*': ['create', 'read', 'update', 'delete'],
    users: ['create', 'read', 'update', 'delete'],
    cms: ['create', 'read', 'update', 'delete'],
    system: ['create', 'read', 'update', 'delete'],
  },
  CEO: {
    '*': ['create', 'read', 'update', 'delete'],
    users: ['read'],
    cms: ['create', 'read', 'update', 'delete'],
    system: ['read'],
  },
  Editor: {
    cms: ['create', 'read', 'update'],
    cms_pages: ['create', 'read', 'update'],
    cms_announcements: ['create', 'read', 'update'],
  },
  Viewer: {
    cms: ['read'],
    cms_pages: ['read'],
    cms_announcements: ['read'],
  },
  department: {
    objectives: ['read', 'update'],
    own_objectives: ['create', 'read', 'update'],
  },
  project: {
    projects: ['read'],
    own_projects: ['read', 'update'],
  },
};

/**
 * Check if user has permission
 */
export const hasPermission = (
  role: Role,
  resource: string,
  permission: Permission
): boolean => {
  const rolePermissions = PERMISSIONS[role] || {};
  
  // Check wildcard permission
  if (rolePermissions['*']?.includes(permission)) {
    return true;
  }
  
  // Check specific resource permission
  return rolePermissions[resource]?.includes(permission) || false;
};

/**
 * Get user permissions object
 */
export const getUserPermissions = (role: Role): UserPermissions => {
  return {
    role,
    canCreate: (resource: string) => hasPermission(role, resource, 'create'),
    canRead: (resource: string) => hasPermission(role, resource, 'read'),
    canUpdate: (resource: string) => hasPermission(role, resource, 'update'),
    canDelete: (resource: string) => hasPermission(role, resource, 'delete'),
  };
};

/**
 * Check if user can access a route
 */
export const canAccessRoute = (role: Role, route: string): boolean => {
  const routePermissions: Record<string, Role[]> = {
    '/admin': ['Admin', 'CEO'],
    '/cms': ['Admin', 'CEO', 'Editor'],
    '/main-plan': ['CEO', 'Admin'],
    '/department-objectives': ['CEO', 'Admin', 'department'],
    '/summary': ['CEO', 'Admin', 'project'],
  };

  const allowedRoles = routePermissions[route] || ['*'];
  return allowedRoles.includes('*') || allowedRoles.includes(role);
};

