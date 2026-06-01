import { getAuthHeader } from './authService';
import type { MealValidateMode, MealValidationResult } from '@/types/mealValidation';

const API_BASE = '/.netlify/functions/meal-validate-api';

async function readJson<T>(res: Response): Promise<T> {
  const body = (await res.json()) as T & { error?: string; detail?: string };
  if (!res.ok) {
    const msg =
      (body as { error?: string }).error ||
      (body as { detail?: string }).detail ||
      `HTTP ${res.status}`;
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
  return body as T;
}

export async function validateMealUpload(
  file: File,
  options?: { validateMode?: MealValidateMode }
): Promise<MealValidationResult> {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('validate_mode', options?.validateMode ?? 'both');

  const res = await fetch(`${API_BASE}/validate`, {
    method: 'POST',
    headers: { ...getAuthHeader() },
    body: form,
  });

  return readJson<MealValidationResult>(res);
}
