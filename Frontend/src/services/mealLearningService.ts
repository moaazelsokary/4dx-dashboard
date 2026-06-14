import type { MealLearningActivityLink, MealLearningPoint } from '@/types/mealLearning';
import { getAuthHeader } from '@/services/authService';

const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
const isLocalWigProxy =
  hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
const API_BASE_URL = isLocalWigProxy ? '/api/wig' : '/.netlify/functions/wig-api';

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

export async function getMealLearningPoints(): Promise<MealLearningPoint[]> {
  return fetchLearningAPI<MealLearningPoint[]>('/meal-learning-points');
}

export async function createMealLearningPoint(payload: {
  learning_point: string;
  corrective_action?: string | null;
  status?: string;
  end_date?: string | null;
  activity_links?: MealLearningActivityLink[];
}): Promise<MealLearningPoint> {
  return fetchLearningAPI<MealLearningPoint>('/meal-learning-points', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function updateMealLearningPoint(
  id: number,
  payload: {
    learning_point?: string;
    corrective_action?: string | null;
    status?: string;
    end_date?: string | null;
    activity_links?: MealLearningActivityLink[];
  }
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
