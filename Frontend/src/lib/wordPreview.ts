import { renderAsync } from 'docx-preview';

const MAX_WORD_PREVIEW_BYTES = 12 * 1024 * 1024;
const RENDER_TIMEOUT_MS = 45_000;

async function yieldToBrowser(): Promise<void> {
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

export function clearWordPreviewContainer(body: HTMLElement, styleHost?: HTMLElement | null): void {
  body.replaceChildren();
  if (styleHost) styleHost.replaceChildren();
}

export async function renderWordBlob(
  bodyContainer: HTMLElement,
  blob: Blob,
  filename: string,
  styleContainer?: HTMLElement | null
): Promise<void> {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'doc') {
    throw new Error('Legacy .doc files cannot be previewed in the browser. Download the file or save as .docx.');
  }
  if (blob.size > MAX_WORD_PREVIEW_BYTES) {
    throw new Error(
      `This file is too large to preview (${(blob.size / (1024 * 1024)).toFixed(1)} MB). Please download it instead.`
    );
  }

  clearWordPreviewContainer(bodyContainer, styleContainer);
  await yieldToBrowser();

  const renderPromise = renderAsync(blob, bodyContainer, styleContainer ?? undefined, {
    className: 'docx-preview',
    inWrapper: true,
    hideWrapperOnPrint: false,
    ignoreWidth: false,
    ignoreHeight: false,
    ignoreFonts: true,
    breakPages: true,
    ignoreLastRenderedPageBreak: true,
    trimXmlDeclaration: true,
    useBase64URL: true,
    renderHeaders: true,
    renderFooters: true,
    renderFootnotes: true,
    renderEndnotes: true,
    renderChanges: false,
    renderComments: false,
    renderAltChunks: true,
    experimental: false,
    debug: false,
  });

  await Promise.race([
    renderPromise,
    new Promise<never>((_, reject) => {
      window.setTimeout(
        () => reject(new Error('Preview timed out. Try downloading the file instead.')),
        RENDER_TIMEOUT_MS
      );
    }),
  ]);
}

export function isWordFile(mimeType?: string | null, filename?: string | null): boolean {
  const mime = (mimeType || '').toLowerCase();
  const ext = (filename || '').split('.').pop()?.toLowerCase() ?? '';
  return (
    mime.includes('word') ||
    mime === 'application/msword' ||
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    ext === 'doc' ||
    ext === 'docx'
  );
}
