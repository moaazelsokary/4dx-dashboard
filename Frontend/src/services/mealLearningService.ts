import type { MealLearningActivityLink, MealLearningPoint } from '@/types/mealLearning';
import { getAuthHeader } from '@/services/authService';
import {
  downloadBlob,
  fetchAuthenticatedFile,
  getWigApiBaseUrl,
  type FetchedFile,
} from '@/lib/fileAttachment';

const API_BASE_URL = getWigApiBaseUrl();

async function fetchLearningAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const authHeaders = getAuthHeader();
  const sep = endpoint.includes('?') ? '&' : '?';
  const url = `${API_BASE_URL}${endpoint}${sep}_t=${Date.now()}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...options.headers,
      'Cache-Control': 'no-cache',
    },
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    let message = text;
    try {
      const j = JSON.parse(text);
      message = j.error || j.message || text;
    } catch {
      /* raw */
    }
    throw new Error(message || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export type MealLearningPointInput = {
  learning_point: string;
  corrective_action?: string | null;
  status?: string;
  end_date?: string | null;
  department_code?: string;
  department_codes?: string[];
  activity_links?: MealLearningActivityLink[];
  attachment_url?: string | null;
  attachment_file_base64?: string;
  attachment_file_name?: string;
  attachment_mime_type?: string | null;
  clear_attachment?: boolean;
};

export async function getMealLearningPoints(): Promise<MealLearningPoint[]> {
  return fetchLearningAPI<MealLearningPoint[]>('/meal-learning-points');
}

export async function createMealLearningPoint(payload: MealLearningPointInput): Promise<MealLearningPoint> {
  return fetchLearningAPI<MealLearningPoint>('/meal-learning-points', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMealLearningPoint(
  id: number,
  payload: Partial<MealLearningPointInput>
): Promise<MealLearningPoint> {
  return fetchLearningAPI<MealLearningPoint>(`/meal-learning-points/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteMealLearningPoint(id: number): Promise<{ success: boolean }> {
  return fetchLearningAPI<{ success: boolean }>(`/meal-learning-points/${id}`, { method: 'DELETE' });
}

export async function updateMealLearningPointsOrder(
  items: { id: number; sort_order: number }[]
): Promise<{ success: boolean }> {
  return fetchLearningAPI<{ success: boolean }>('/meal-learning-points/update-order', {
    method: 'POST',
    body: JSON.stringify({ items }),
  });
}

export async function fetchMealLearningPointAttachment(id: number): Promise<FetchedFile> {
  return fetchAuthenticatedFile(
    `${API_BASE_URL}/meal-learning-points/${id}/attachment/download`,
    `learning-attachment-${id}`
  );
}

export async function downloadMealLearningPointAttachment(id: number): Promise<void> {
  const file = await fetchMealLearningPointAttachment(id);
  downloadBlob(file.blob, file.filename);
}
