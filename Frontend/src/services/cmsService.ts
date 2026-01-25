/**
 * CMS Service
 * Handles all CMS API calls for pages, images, announcements, and menu items
 */

const isLocalhost = window.location.hostname === 'localhost';
const API_BASE_URL = isLocalhost
  ? 'http://localhost:3000/api/cms'
  : '/.netlify/functions/cms-api';

import { getCsrfHeader } from '@/utils/csrf';
import { getAuthHeader } from './authService';
import { handleApiError, isAuthError, shouldRetry, getRetryDelay, handleAuthError } from '@/utils/apiErrorHandler';
import { getUserFriendlyError } from '@/utils/errorMessages';
import { requestQueue } from '@/utils/requestQueue';

const REQUEST_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;

interface CMSPage {
  id?: number;
  slug: string;
  title: string;
  content: string;
  meta_description?: string;
  meta_keywords?: string;
  is_published?: boolean;
  published_at?: string;
  created_at?: string;
  updated_at?: string;
}

interface CMSImage {
  id?: number;
  filename: string;
  url: string;
  alt_text?: string;
  caption?: string;
  uploaded_by?: string;
  created_at?: string;
}

interface CMSAnnouncement {
  id?: number;
  title: string;
  content: string;
  is_active?: boolean;
  start_date?: string;
  end_date?: string;
  priority?: number;
  created_at?: string;
  updated_at?: string;
}

interface CMSMenuItem {
  id?: number;
  label: string;
  url: string;
  icon?: string;
  parent_id?: number;
  display_order?: number;
  is_active?: boolean;
  target_blank?: boolean;
}

async function fetchAPI<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const method = options?.method || 'GET';
  const needsAuth = ['POST', 'PUT', 'DELETE'].includes(method.toUpperCase());
  const csrfHeaders = needsAuth ? getCsrfHeader() : {};
  const authHeaders = needsAuth ? getAuthHeader() : {};

  const url = `${API_BASE_URL}${endpoint}`;

  // Check if offline
  if (!navigator.onLine) {
    // Queue request for when connection is restored
    return new Promise<T>((resolve, reject) => {
      requestQueue.enqueue(
        url,
        {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...csrfHeaders,
            ...authHeaders,
            ...options?.headers,
          },
        },
        async (response) => {
          const data = await response.json();
          resolve(data.success ? data.data : data);
        },
        reject
      );
    });
  }

  // Retry logic
  let lastError: Error | null = null;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          ...csrfHeaders,
          ...authHeaders,
          ...options?.headers,
        },
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        // Handle error using centralized error handler
        const apiError = await handleApiError(new Error(`HTTP ${response.status}`), response);
        
        // Handle authentication errors
        if (apiError.isAuthError) {
          handleAuthError();
          throw new Error(apiError.message);
        }

        // Check if should retry
        if (shouldRetry(apiError, attempt, MAX_RETRIES)) {
          const delay = getRetryDelay(attempt);
          console.log(`[CMS Service] Retrying request (attempt ${attempt + 1}/${MAX_RETRIES}) after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // Get user-friendly error message
        const friendlyError = getUserFriendlyError(apiError);
        const error = new Error(friendlyError.description);
        (error as any).status = response.status;
        (error as any).friendlyError = friendlyError;
        throw error;
      }

      const data = await response.json();
      return data.success ? data.data : data;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Request failed');
      
      // Handle network errors
      if (lastError.name === 'AbortError' || lastError.message.includes('timeout')) {
        const apiError = await handleApiError(lastError);
        if (shouldRetry(apiError, attempt, MAX_RETRIES)) {
          const delay = getRetryDelay(attempt);
          console.log(`[CMS Service] Retrying after timeout (attempt ${attempt + 1}/${MAX_RETRIES}) after ${delay}ms`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }

      // If this is the last attempt, throw the error
      if (attempt === MAX_RETRIES) {
        // If offline, queue the request
        if (!navigator.onLine) {
          return new Promise<T>((resolve, reject) => {
            requestQueue.enqueue(
              url,
              {
                ...options,
                headers: {
                  'Content-Type': 'application/json',
                  ...csrfHeaders,
                  ...authHeaders,
                  ...options?.headers,
                },
              },
              async (response) => {
                const data = await response.json();
                resolve(data.success ? data.data : data);
              },
              reject
            );
          });
        }
        
        const apiError = await handleApiError(lastError);
        const friendlyError = getUserFriendlyError(apiError);
        const finalError = new Error(friendlyError.description);
        (finalError as any).status = apiError.status;
        (finalError as any).friendlyError = friendlyError;
        throw finalError;
      }

      // Check if error is retryable
      const apiError = await handleApiError(lastError);
      if (!shouldRetry(apiError, attempt, MAX_RETRIES)) {
        const friendlyError = getUserFriendlyError(apiError);
        const finalError = new Error(friendlyError.description);
        (finalError as any).status = apiError.status;
        (finalError as any).friendlyError = friendlyError;
        throw finalError;
      }

      // Wait before retrying
      const delay = getRetryDelay(attempt);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError || new Error('Request failed');
}

// Pages
export async function getPages(publishedOnly = false): Promise<CMSPage[]> {
  const endpoint = publishedOnly ? '/pages/published' : '/pages';
  return fetchAPI<CMSPage[]>(endpoint);
}

export async function getPageById(id: number): Promise<CMSPage> {
  return fetchAPI<CMSPage>(`/pages/${id}`);
}

export async function getPageBySlug(slug: string): Promise<CMSPage> {
  return fetchAPI<CMSPage>(`/pages/slug/${slug}`);
}

export async function createPage(page: Omit<CMSPage, 'id' | 'created_at' | 'updated_at'>): Promise<CMSPage> {
  return fetchAPI<CMSPage>('/pages', {
    method: 'POST',
    body: JSON.stringify(page),
  });
}

export async function updatePage(id: number, page: Partial<CMSPage>): Promise<CMSPage> {
  return fetchAPI<CMSPage>(`/pages/${id}`, {
    method: 'PUT',
    body: JSON.stringify(page),
  });
}

export async function deletePage(id: number): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(`/pages/${id}`, {
    method: 'DELETE',
  });
}

// Images
export async function getImages(): Promise<CMSImage[]> {
  return fetchAPI<CMSImage[]>('/images');
}

export async function uploadImage(file: File): Promise<CMSImage> {
  const formData = new FormData();
  formData.append('image', file);
  
  const csrfHeaders = getCsrfHeader();
  const authHeaders = getAuthHeader();

  const response = await fetch(`${API_BASE_URL}/images`, {
    method: 'POST',
    headers: {
      ...csrfHeaders,
      ...authHeaders,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || error.message || 'Image upload failed');
  }

  const data = await response.json();
  return data.success ? data.data : data;
}

export async function deleteImage(id: number): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(`/images/${id}`, {
    method: 'DELETE',
  });
}

// Announcements
export async function getAnnouncements(admin = false): Promise<CMSAnnouncement[]> {
  const endpoint = admin ? '/announcements/admin' : '/announcements';
  return fetchAPI<CMSAnnouncement[]>(endpoint);
}

export async function createAnnouncement(announcement: Omit<CMSAnnouncement, 'id' | 'created_at' | 'updated_at'>): Promise<CMSAnnouncement> {
  return fetchAPI<CMSAnnouncement>('/announcements', {
    method: 'POST',
    body: JSON.stringify(announcement),
  });
}

export async function updateAnnouncement(id: number, announcement: Partial<CMSAnnouncement>): Promise<CMSAnnouncement> {
  return fetchAPI<CMSAnnouncement>(`/announcements/${id}`, {
    method: 'PUT',
    body: JSON.stringify(announcement),
  });
}

export async function deleteAnnouncement(id: number): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(`/announcements/${id}`, {
    method: 'DELETE',
  });
}

// Menu Items
export async function getMenuItems(admin = false): Promise<CMSMenuItem[]> {
  const endpoint = admin ? '/menu/admin' : '/menu';
  return fetchAPI<CMSMenuItem[]>(endpoint);
}

export async function createMenuItem(item: Omit<CMSMenuItem, 'id'>): Promise<CMSMenuItem> {
  return fetchAPI<CMSMenuItem>('/menu', {
    method: 'POST',
    body: JSON.stringify(item),
  });
}

export async function updateMenuItem(id: number, item: Partial<CMSMenuItem>): Promise<CMSMenuItem> {
  return fetchAPI<CMSMenuItem>(`/menu/${id}`, {
    method: 'PUT',
    body: JSON.stringify(item),
  });
}

export async function deleteMenuItem(id: number): Promise<{ success: boolean }> {
  return fetchAPI<{ success: boolean }>(`/menu/${id}`, {
    method: 'DELETE',
  });
}

export type { CMSPage, CMSImage, CMSAnnouncement, CMSMenuItem };

