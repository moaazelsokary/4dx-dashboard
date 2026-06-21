import type {
  MealContentBreadcrumb,
  MealContentCategory,
  MealContentFolderOption,
  MealContentItem,
} from '@/types/mealContent';
import { getAuthHeader } from '@/services/authService';
import { downloadBlob, fetchAuthenticatedFile, getWigApiBaseUrl, type FetchedFile } from '@/lib/fileAttachment';

const API_BASE_URL = getWigApiBaseUrl();

export const MAX_MEAL_CONTENT_BYTES = 24 * 1024 * 1024;

async function fetchMealAPI<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
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
      /* use raw */
    }
    throw new Error(message || `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export async function getMealContentList(
  category: MealContentCategory,
  parentId: number | null
): Promise<MealContentItem[]> {
  const qs = new URLSearchParams({ category });
  if (parentId != null) qs.set('parent_id', String(parentId));
  return fetchMealAPI<MealContentItem[]>(`/meal-content?${qs.toString()}`);
}

export async function getMealContentBreadcrumb(
  category: MealContentCategory,
  folderId: number
): Promise<MealContentBreadcrumb[]> {
  const qs = new URLSearchParams({ category, folder_id: String(folderId) });
  return fetchMealAPI<MealContentBreadcrumb[]>(`/meal-content/breadcrumb?${qs.toString()}`);
}

export async function getMealContentFolders(
  category: MealContentCategory
): Promise<MealContentFolderOption[]> {
  const qs = new URLSearchParams({ category });
  return fetchMealAPI<MealContentFolderOption[]>(`/meal-content/folders?${qs.toString()}`);
}

export async function createMealFolder(payload: {
  category: MealContentCategory;
  parent_id?: number | null;
  display_name: string;
  description?: string | null;
}): Promise<MealContentItem> {
  return fetchMealAPI<MealContentItem>('/meal-content', {
    method: 'POST',
    body: JSON.stringify({ ...payload, item_type: 'folder' }),
  });
}

export async function createMealFile(payload: {
  category: MealContentCategory;
  parent_id?: number | null;
  display_name: string;
  description?: string | null;
  original_file_name: string;
  mime_type?: string | null;
  file_base64: string;
}): Promise<MealContentItem> {
  return fetchMealAPI<MealContentItem>('/meal-content', {
    method: 'POST',
    body: JSON.stringify({ ...payload, item_type: 'file' }),
  });
}

export async function moveMealContentItem(id: number, parentId: number | null): Promise<MealContentItem> {
  return fetchMealAPI<MealContentItem>(`/meal-content/${id}`, {
    method: 'PUT',
    body: JSON.stringify({
      move: true,
      parent_id: parentId === null ? 'root' : parentId,
    }),
  });
}

export async function updateMealContentItem(
  id: number,
  payload: {
    display_name?: string;
    description?: string | null;
    parent_id?: number | null;
    file_base64?: string;
    original_file_name?: string;
    mime_type?: string | null;
  }
): Promise<MealContentItem> {
  return fetchMealAPI<MealContentItem>(`/meal-content/${id}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

export async function deleteMealContentItem(id: number): Promise<{ success: boolean }> {
  return fetchMealAPI<{ success: boolean }>(`/meal-content/${id}`, { method: 'DELETE' });
}

export async function fetchMealContentFile(id: number): Promise<FetchedFile> {
  return fetchAuthenticatedFile(`${API_BASE_URL}/meal-content/${id}/download`, `file-${id}`);
}

export async function downloadMealContentFile(id: number): Promise<void> {
  const file = await fetchMealContentFile(id);
  downloadBlob(file.blob, file.filename);
}
