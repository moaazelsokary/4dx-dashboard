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

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders,
      ...authHeaders,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || error.message || `HTTP error! status: ${response.status}`);
  }

  const data = await response.json();
  return data.success ? data.data : data;
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

