/**
 * Save State Management Hook
 * Tracks save operations and unsaved changes
 */

import { useState, useCallback, useRef } from 'react';

export type SaveState = 'idle' | 'saving' | 'success' | 'error';

export interface SaveStateOptions {
  onSuccess?: () => void;
  onError?: (error: Error) => void;
  confirmBeforeClose?: boolean;
}

export interface UseSaveStateReturn {
  saveState: SaveState;
  hasUnsavedChanges: boolean;
  error: Error | null;
  save: (saveFn: () => Promise<void>) => Promise<void>;
  retry: () => Promise<void>;
  markUnsaved: () => void;
  markSaved: () => void;
  reset: () => void;
}

/**
 * Hook to manage save state
 */
export function useSaveState(options: SaveStateOptions = {}): UseSaveStateReturn {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastSaveFnRef = useRef<(() => Promise<void>) | null>(null);

  const save = useCallback(async (saveFn: () => Promise<void>) => {
    if (saveState === 'saving') {
      return; // Prevent concurrent saves
    }

    lastSaveFnRef.current = saveFn;
    setSaveState('saving');
    setError(null);

    try {
      await saveFn();
      setSaveState('success');
      setHasUnsavedChanges(false);
      options.onSuccess?.();
      
      // Reset to idle after a short delay
      setTimeout(() => {
        setSaveState('idle');
      }, 2000);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Save failed');
      setError(error);
      setSaveState('error');
      options.onError?.(error);
    }
  }, [saveState, options]);

  const retry = useCallback(async () => {
    if (lastSaveFnRef.current) {
      await save(lastSaveFnRef.current);
    }
  }, [save]);

  const markUnsaved = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  const markSaved = useCallback(() => {
    setHasUnsavedChanges(false);
    setSaveState('idle');
    setError(null);
  }, []);

  const reset = useCallback(() => {
    setSaveState('idle');
    setHasUnsavedChanges(false);
    setError(null);
    lastSaveFnRef.current = null;
  }, []);

  return {
    saveState,
    hasUnsavedChanges,
    error,
    save,
    retry,
    markUnsaved,
    markSaved,
    reset,
  };
}
