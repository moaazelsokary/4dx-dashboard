import { getAuthHeader } from '@/services/authService';

export type FetchedFile = {
  blob: Blob;
  filename: string;
  mimeType: string | null;
};

export type FilePreviewKind = 'image' | 'pdf' | 'text' | 'spreadsheet' | 'document' | 'office' | null;

export function getWigApiBaseUrl(): string {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const isLocalWigProxy =
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
  return isLocalWigProxy ? '/api/wig' : '/.netlify/functions/wig-api';
}

export function parseFilenameFromContentDisposition(
  contentDisposition: string | null,
  fallback: string
): string {
  if (!contentDisposition) return fallback;
  const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;\s]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      /* keep fallback */
    }
  }
  const plainMatch = contentDisposition.match(/filename="([^"]+)"/i);
  if (plainMatch?.[1]) return plainMatch[1];
  const unquotedMatch = contentDisposition.match(/filename=([^;\s]+)/i);
  if (unquotedMatch?.[1]) return unquotedMatch[1].replace(/^"|"$/g, '');
  return fallback;
}

export async function fetchAuthenticatedFile(url: string, fallbackFilename: string): Promise<FetchedFile> {
  const authHeaders = getAuthHeader();
  const response = await fetch(`${url}${url.includes('?') ? '&' : '?'}_t=${Date.now()}`, {
    method: 'GET',
    headers: { ...authHeaders, 'Cache-Control': 'no-cache' },
    cache: 'no-store',
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || `Request failed (${response.status})`);
  }
  const filename = parseFilenameFromContentDisposition(
    response.headers.get('Content-Disposition'),
    fallbackFilename
  );
  const blob = await response.blob();
  const mimeType = blob.type || response.headers.get('Content-Type') || null;
  return { blob, filename, mimeType };
}

export function downloadBlob(blob: Blob, filename: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(href);
}

function extensionFromName(filename?: string | null): string {
  if (!filename) return '';
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

export function getFilePreviewKind(mimeType?: string | null, filename?: string | null): FilePreviewKind {
  const mime = (mimeType || '').toLowerCase();
  const ext = extensionFromName(filename);

  if (mime.startsWith('image/') || ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext)) {
    return 'image';
  }
  if (mime === 'application/pdf' || ext === 'pdf') return 'pdf';
  if (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    ['txt', 'json', 'md', 'log'].includes(ext)
  ) {
    return 'text';
  }
  if (mime === 'text/csv' || ext === 'csv') return 'text';
  if (
    mime.includes('excel') ||
    mime.includes('spreadsheet') ||
    mime === 'application/vnd.ms-excel' ||
    ext === 'xls' ||
    ext === 'xlsx'
  ) {
    return 'spreadsheet';
  }
  if (
    mime.includes('word') ||
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'doc' ||
    ext === 'docx'
  ) {
    return 'document';
  }
  if (
    mime.includes('powerpoint') ||
    mime.includes('presentation') ||
    ['ppt', 'pptx'].includes(ext)
  ) {
    return 'office';
  }
  return null;
}

export function canPreviewFile(mimeType?: string | null, filename?: string | null): boolean {
  return getFilePreviewKind(mimeType, filename) != null;
}

export function canPreviewExternalUrl(url: string): boolean {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return /\.(png|jpe?g|gif|webp|bmp|svg|pdf|txt|csv)$/i.test(pathname);
  } catch {
    return false;
  }
}

export function openBlobInNewTab(blob: Blob): void {
  const href = URL.createObjectURL(blob);
  const win = window.open(href, '_blank', 'noopener,noreferrer');
  if (!win) {
    URL.revokeObjectURL(href);
    throw new Error('Pop-up blocked. Allow pop-ups to preview this file.');
  }
  window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
}
