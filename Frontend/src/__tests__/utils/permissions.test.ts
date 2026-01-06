import { describe, it, expect } from 'vitest';
import { hasPermission, getUserPermissions, canAccessRoute } from '@/utils/permissions';

describe('permissions', () => {
  describe('hasPermission', () => {
    it('should return true for Admin with any permission', () => {
      expect(hasPermission('Admin', 'users', 'create')).toBe(true);
      expect(hasPermission('Admin', 'users', 'delete')).toBe(true);
      expect(hasPermission('Admin', 'any-resource', 'read')).toBe(true);
    });

    it('should return true for Editor with create permission on cms', () => {
      expect(hasPermission('Editor', 'cms', 'create')).toBe(true);
      expect(hasPermission('Editor', 'cms', 'read')).toBe(true);
      expect(hasPermission('Editor', 'cms', 'update')).toBe(true);
    });

    it('should return false for Editor with delete permission on cms', () => {
      expect(hasPermission('Editor', 'cms', 'delete')).toBe(false);
    });

    it('should return true for Viewer with read permission', () => {
      expect(hasPermission('Viewer', 'cms', 'read')).toBe(true);
    });

    it('should return false for Viewer with write permissions', () => {
      expect(hasPermission('Viewer', 'cms', 'create')).toBe(false);
      expect(hasPermission('Viewer', 'cms', 'update')).toBe(false);
      expect(hasPermission('Viewer', 'cms', 'delete')).toBe(false);
    });
  });

  describe('getUserPermissions', () => {
    it('should return correct permissions for Admin', () => {
      const permissions = getUserPermissions('Admin');
      
      expect(permissions.canCreate('users')).toBe(true);
      expect(permissions.canRead('users')).toBe(true);
      expect(permissions.canUpdate('users')).toBe(true);
      expect(permissions.canDelete('users')).toBe(true);
    });

    it('should return correct permissions for Editor', () => {
      const permissions = getUserPermissions('Editor');
      
      expect(permissions.canCreate('cms')).toBe(true);
      expect(permissions.canRead('cms')).toBe(true);
      expect(permissions.canUpdate('cms')).toBe(true);
      expect(permissions.canDelete('cms')).toBe(false);
    });
  });

  describe('canAccessRoute', () => {
    it('should allow Admin to access admin routes', () => {
      expect(canAccessRoute('Admin', '/admin')).toBe(true);
      expect(canAccessRoute('Admin', '/cms')).toBe(true);
    });

    it('should allow CEO to access main-plan', () => {
      expect(canAccessRoute('CEO', '/main-plan')).toBe(true);
    });

    it('should not allow Viewer to access admin routes', () => {
      expect(canAccessRoute('Viewer', '/admin')).toBe(false);
    });
  });
});

