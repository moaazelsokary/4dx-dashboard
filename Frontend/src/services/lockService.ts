// Lock Service - Specialized service for lock checking
import type {
  LockCheckRequest,
  LockCheckResponse,
  BatchLockCheckRequest,
  BatchLockCheckResponse,
} from '@/types/config';
import { checkLockStatus, checkLockStatusBatch } from './configService';

/**
 * Check if a single field is locked
 */
export async function isFieldLocked(
  fieldType: 'target' | 'monthly_target' | 'monthly_actual' | 'all_fields',
  departmentObjectiveId: number,
  month?: string
): Promise<boolean> {
  try {
    const result = await checkLockStatus(fieldType, departmentObjectiveId, month);
    return result.is_locked || false;
  } catch (error) {
    console.error('Error checking lock status:', error);
    return false; // Default to unlocked on error
  }
}

/**
 * Get detailed lock information for a field
 */
export async function getLockInfo(
  fieldType: 'target' | 'monthly_target' | 'monthly_actual' | 'all_fields',
  departmentObjectiveId: number,
  month?: string
): Promise<LockCheckResponse> {
  try {
    return await checkLockStatus(fieldType, departmentObjectiveId, month);
  } catch (error) {
    console.error('Error getting lock info:', error);
    return { is_locked: false };
  }
}

/**
 * Batch check multiple fields at once (performance optimization)
 */
export async function batchCheckLocks(
  checks: LockCheckRequest[]
): Promise<Map<string, LockCheckResponse>> {
  try {
    const result = await checkLockStatusBatch(checks);
    const lockMap = new Map<string, LockCheckResponse>();
    
    result.results.forEach((checkResult) => {
      const key = `${checkResult.field_type}-${checkResult.department_objective_id}${checkResult.month ? `-${checkResult.month}` : ''}`;
      lockMap.set(key, checkResult);
    });
    
    return lockMap;
  } catch (error) {
    console.error('Error batch checking locks:', error);
    // Return empty map with all unlocked on error
    const lockMap = new Map<string, LockCheckResponse>();
    checks.forEach((check) => {
      const key = `${check.field_type}-${check.department_objective_id}${check.month ? `-${check.month}` : ''}`;
      lockMap.set(key, { is_locked: false });
    });
    return lockMap;
  }
}

/**
 * Create a lock check request object
 */
export function createLockCheckRequest(
  fieldType: 'target' | 'monthly_target' | 'monthly_actual' | 'all_fields',
  departmentObjectiveId: number,
  month?: string
): LockCheckRequest {
  return {
    field_type: fieldType,
    department_objective_id: departmentObjectiveId,
    month,
  };
}
