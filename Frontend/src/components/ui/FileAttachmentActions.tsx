import { useCallback, useEffect, useState } from 'react';
import { Download, ExternalLink, Eye, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import FilePreviewDialog from '@/components/ui/FilePreviewDialog';
import { toast } from '@/hooks/use-toast';
import {
  canPreviewFile,
  downloadBlob,
  getFilePreviewKind,
  openBlobInNewTab,
  type FetchedFile,
} from '@/lib/fileAttachment';

type Props = {
  label: string;
  fileName?: string | null;
  mimeType?: string | null;
  externalUrl?: string | null;
  fetchFile?: () => Promise<FetchedFile>;
  /** Change when the underlying file changes (e.g. id + updated_at) to avoid stale preview cache. */
  cacheKey?: string;
  /** inline = name + icon buttons; menu = choose dialog (legacy). */
  layout?: 'inline' | 'menu';
  showLabel?: boolean;
  /** When true, file name wraps within the column instead of truncating. */
  wrapLabel?: boolean;
  className?: string;
};

export default function FileAttachmentActions({
  label,
  fileName,
  mimeType,
  externalUrl,
  fetchFile,
  cacheKey,
  layout = 'inline',
  showLabel = true,
  wrapLabel = false,
  className,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [previewFile, setPreviewFile] = useState<FetchedFile | null>(null);

  const effectiveName = fileName?.trim() || label;
  const previewKind = getFilePreviewKind(mimeType, effectiveName);
  const canPreviewStored = canPreviewFile(mimeType, effectiveName);
  const isExternalUrl = Boolean(externalUrl?.trim());

  useEffect(() => {
    setPreviewFile(null);
    setPreviewOpen(false);
  }, [cacheKey, effectiveName, mimeType, externalUrl]);

  const loadFile = useCallback(async (): Promise<FetchedFile | null> => {
    if (!fetchFile) return null;
    return fetchFile();
  }, [fetchFile]);

  const handleDownload = async () => {
    setMenuOpen(false);
    setLoadingDownload(true);
    try {
      if (isExternalUrl) {
        const a = document.createElement('a');
        a.href = externalUrl!.trim();
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        a.download = effectiveName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return;
      }
      const file = await loadFile();
      if (!file) throw new Error('No file available');
      downloadBlob(file.blob, file.filename);
    } catch (e) {
      toast({
        title: 'Download failed',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setLoadingDownload(false);
    }
  };

  const handlePreview = async () => {
    setMenuOpen(false);
    if (isExternalUrl) {
      window.open(externalUrl!.trim(), '_blank', 'noopener,noreferrer');
      return;
    }

    setPreviewOpen(true);
    setPreviewFile(null);
    setLoadingPreview(true);
    try {
      const file = await loadFile();
      if (!file) throw new Error('No file available');
      const kind = getFilePreviewKind(file.mimeType, file.filename);
      if (kind === 'office') {
        setPreviewOpen(false);
        openBlobInNewTab(file.blob);
        return;
      }
      if (!canPreviewFile(file.mimeType, file.filename)) {
        setPreviewOpen(false);
        toast({
          title: 'Preview not available',
          description: 'Use Download for this file type.',
        });
        return;
      }
      setPreviewFile(file);
    } catch (e) {
      setPreviewOpen(false);
      toast({
        title: 'Preview failed',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleOpenLink = () => {
    if (!externalUrl?.trim()) return;
    setMenuOpen(false);
    window.open(externalUrl.trim(), '_blank', 'noopener,noreferrer');
  };

  const showPreviewButton = Boolean(fetchFile ? canPreviewStored : isExternalUrl);
  const showOpenLink = isExternalUrl;

  const iconBtnClass = 'h-7 w-7 shrink-0 p-0';

  const inlineActions = (
    <div
      className={`min-w-0 max-w-full ${
        wrapLabel ? 'flex items-start gap-1 w-full' : 'inline-flex items-center gap-0.5'
      } ${className ?? ''}`}
    >
      {showLabel ? (
        <span
          className={
            wrapLabel
              ? 'text-xs flex-1 min-w-0 whitespace-pre-wrap break-words leading-snug'
              : 'text-xs truncate min-w-0 mr-0.5'
          }
          title={wrapLabel ? undefined : effectiveName}
        >
          {label}
        </span>
      ) : null}
      <div className={`flex shrink-0 items-center gap-0.5 ${wrapLabel ? 'pt-0.5' : ''}`}>
      {showPreviewButton ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={iconBtnClass}
          title="Preview"
          disabled={loadingPreview}
          onClick={() => void handlePreview()}
        >
          {loadingPreview ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Eye className="h-3.5 w-3.5" />}
        </Button>
      ) : null}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={iconBtnClass}
        title="Download"
        disabled={loadingDownload}
        onClick={() => void handleDownload()}
      >
        {loadingDownload ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
      </Button>
      {showOpenLink ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={iconBtnClass}
          title="Open link"
          onClick={handleOpenLink}
        >
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      ) : null}
      </div>
    </div>
  );

  if (layout === 'inline') {
    return (
      <>
        {inlineActions}
        <FilePreviewDialog
          open={previewOpen}
          onOpenChange={(open) => {
            setPreviewOpen(open);
            if (!open) setPreviewFile(null);
          }}
          filename={previewFile?.filename || effectiveName}
          blob={previewFile?.blob ?? null}
          mimeType={previewFile?.mimeType ?? mimeType}
          previewKind={previewFile ? getFilePreviewKind(previewFile.mimeType, previewFile.filename) : previewKind}
        />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        className={`text-xs text-primary hover:underline break-all text-left ${className ?? ''}`}
        onClick={() => setMenuOpen(true)}
      >
        {label}
      </button>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm truncate">{effectiveName}</DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">Choose how to open this attachment.</p>
          <DialogFooter className="flex-col sm:flex-col gap-2">
            {showPreviewButton ? (
              <Button type="button" className="w-full" onClick={() => void handlePreview()} disabled={loadingPreview}>
                {loadingPreview ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Eye className="h-4 w-4 mr-2" />}
                Preview
              </Button>
            ) : null}
            <Button type="button" variant="secondary" className="w-full" onClick={() => void handleDownload()} disabled={loadingDownload}>
              Download
            </Button>
            {showOpenLink ? (
              <Button type="button" variant="outline" className="w-full" onClick={handleOpenLink}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Open link
              </Button>
            ) : null}
            <Button type="button" variant="ghost" className="w-full" onClick={() => setMenuOpen(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FilePreviewDialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreviewFile(null);
        }}
        filename={previewFile?.filename || effectiveName}
        blob={previewFile?.blob ?? null}
        mimeType={previewFile?.mimeType ?? mimeType}
        previewKind={previewFile ? getFilePreviewKind(previewFile.mimeType, previewFile.filename) : previewKind}
      />
    </>
  );
}
