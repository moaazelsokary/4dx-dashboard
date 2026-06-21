import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import type { FilePreviewKind } from '@/lib/fileAttachment';
import { parseExcelBlob, type ExcelPreviewData } from '@/lib/excelPreview';
import { clearWordPreviewContainer, renderWordBlob } from '@/lib/wordPreview';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filename: string;
  blob: Blob | null;
  mimeType?: string | null;
  previewKind: FilePreviewKind;
};

function ExcelSheetTabs({
  sheets,
  activeIndex,
  onSelect,
}: {
  sheets: ExcelPreviewData['sheets'];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  if (sheets.length <= 1) return null;
  return (
    <div className="flex shrink-0 overflow-x-auto border-t border-border/60 bg-background/95 p-1.5 gap-0.5">
      {sheets.map((sheet, index) => (
        <button
          key={sheet.name}
          type="button"
          className={`shrink-0 rounded-sm border px-3 py-1.5 text-xs transition-colors ${
            index === activeIndex
              ? 'border-primary/40 bg-primary text-primary-foreground'
              : 'border-transparent bg-muted/50 text-muted-foreground hover:bg-muted'
          }`}
          onClick={() => onSelect(index)}
        >
          {sheet.name}
        </button>
      ))}
    </div>
  );
}

export default function FilePreviewDialog({
  open,
  onOpenChange,
  filename,
  blob,
  mimeType,
  previewKind,
}: Props) {
  const [textContent, setTextContent] = useState<string | null>(null);
  const [excelData, setExcelData] = useState<ExcelPreviewData | null>(null);
  const [excelError, setExcelError] = useState<string | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [activeSheetIndex, setActiveSheetIndex] = useState(0);
  const [wordError, setWordError] = useState<string | null>(null);
  const [wordLoading, setWordLoading] = useState(false);
  const wordBodyRef = useRef<HTMLDivElement>(null);
  const wordStyleRef = useRef<HTMLDivElement>(null);
  const objectUrl = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [blob]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  useEffect(() => {
    if (!open || previewKind !== 'text' || !blob) {
      setTextContent(null);
      return;
    }
    let cancelled = false;
    blob
      .text()
      .then((text) => {
        if (!cancelled) setTextContent(text);
      })
      .catch(() => {
        if (!cancelled) setTextContent('Could not read file contents.');
      });
    return () => {
      cancelled = true;
    };
  }, [open, previewKind, blob]);

  useEffect(() => {
    if (!open || previewKind !== 'spreadsheet' || !blob) {
      setExcelData(null);
      setExcelError(null);
      setExcelLoading(false);
      setActiveSheetIndex(0);
      return;
    }
    let cancelled = false;
    setExcelLoading(true);
    setExcelError(null);
    parseExcelBlob(blob)
      .then((data) => {
        if (!cancelled) {
          setExcelData(data);
          setActiveSheetIndex(0);
        }
      })
      .catch(() => {
        if (!cancelled) setExcelError('Could not read this Excel file.');
      })
      .finally(() => {
        if (!cancelled) setExcelLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, previewKind, blob]);

  useEffect(() => {
    const body = wordBodyRef.current;
    const styleHost = wordStyleRef.current;
    if (!open || previewKind !== 'document' || !blob || !body) {
      if (body) clearWordPreviewContainer(body, styleHost);
      setWordError(null);
      setWordLoading(false);
      return;
    }

    let cancelled = false;
    setWordLoading(true);
    setWordError(null);
    clearWordPreviewContainer(body, styleHost);

    renderWordBlob(body, blob, filename, styleHost)
      .catch((e) => {
        if (!cancelled) {
          setWordError(e instanceof Error ? e.message : 'Could not read this Word file.');
          clearWordPreviewContainer(body, styleHost);
        }
      })
      .finally(() => {
        if (!cancelled) setWordLoading(false);
      });

    return () => {
      cancelled = true;
      clearWordPreviewContainer(body, styleHost);
    };
  }, [open, previewKind, blob, filename]);

  const activeSheet = excelData?.sheets[activeSheetIndex];

  const isLargePreview =
    previewKind === 'pdf' || previewKind === 'spreadsheet' || previewKind === 'document';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={
          isLargePreview
            ? '!w-[min(98vw,88rem)] !max-w-[min(98vw,88rem)] h-[min(92vh,960px)] max-h-[92vh] overflow-hidden flex flex-col gap-3 p-4 sm:p-5'
            : '!max-w-[min(95vw,56rem)] max-h-[90vh] overflow-hidden flex flex-col'
        }
      >
        <DialogHeader className="shrink-0">
          <DialogTitle className="text-sm truncate pr-6">{filename}</DialogTitle>
        </DialogHeader>
        <div
          className={
            isLargePreview
              ? 'flex-1 min-h-0 overflow-hidden rounded-md border border-border/70 bg-muted/20 flex flex-col'
              : 'min-h-[12rem] flex-1 overflow-hidden rounded-md border border-border/70 bg-muted/20 flex flex-col'
          }
        >
          {!blob ? (
            <div className="flex flex-1 items-center justify-center py-16 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Loading preview…
            </div>
          ) : previewKind === 'image' && objectUrl ? (
            <div className="flex-1 overflow-auto">
              <img
                src={objectUrl}
                alt={filename}
                className="mx-auto max-h-[70vh] w-auto max-w-full object-contain p-2"
              />
            </div>
          ) : previewKind === 'pdf' && objectUrl ? (
            <div className="flex flex-1 min-h-0 overflow-hidden bg-white">
              <iframe
                src={objectUrl}
                title={filename}
                className="h-full w-full min-h-0 flex-1 border-0 bg-white"
              />
            </div>
          ) : previewKind === 'text' ? (
            textContent == null ? (
              <div className="flex flex-1 items-center justify-center py-16 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading text…
              </div>
            ) : (
              <pre className="flex-1 overflow-auto p-3 text-xs whitespace-pre-wrap break-words font-mono">{textContent}</pre>
            )
          ) : previewKind === 'spreadsheet' ? (
            excelLoading ? (
              <div className="flex flex-1 items-center justify-center py-16 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Loading spreadsheet…
              </div>
            ) : excelError ? (
              <div className="flex flex-1 items-center justify-center py-16 px-4 text-sm text-muted-foreground text-center">
                {excelError}
              </div>
            ) : !activeSheet || activeSheet.rows.length === 0 ? (
              <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
                This workbook has no data to preview.
              </div>
            ) : (
              <>
                {activeSheet.truncated ? (
                  <p className="shrink-0 text-[11px] text-muted-foreground px-2 py-1.5 border-b border-border/40 bg-amber-500/5">
                    Showing the first rows/columns only. Download the file for the full workbook.
                  </p>
                ) : null}
                <div className="flex-1 min-h-0 overflow-auto">
                  <table className="w-max min-w-full border-collapse text-xs">
                    <tbody>
                      {activeSheet.rows.map((row, rowIndex) => (
                        <tr
                          key={rowIndex}
                          className={rowIndex === 0 ? 'bg-muted/60 font-medium' : 'odd:bg-background even:bg-muted/20'}
                        >
                          {row.map((cell, colIndex) => (
                            <td
                              key={colIndex}
                              className="border border-border/50 px-2 py-1 align-top whitespace-pre-wrap max-w-[16rem]"
                            >
                              {cell || '\u00a0'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {excelData ? (
                  <ExcelSheetTabs
                    sheets={excelData.sheets}
                    activeIndex={activeSheetIndex}
                    onSelect={setActiveSheetIndex}
                  />
                ) : null}
              </>
            )
          ) : previewKind === 'document' ? (
            <div className="relative flex flex-1 min-h-0 flex-col overflow-hidden bg-white">
              <div ref={wordStyleRef} className="hidden" aria-hidden="true" />
              {wordLoading ? (
                <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Rendering document…
                </div>
              ) : null}
              {wordError ? (
                <div className="flex flex-1 items-center justify-center py-16 px-4 text-sm text-muted-foreground text-center">
                  {wordError}
                </div>
              ) : (
                <div ref={wordBodyRef} className="docx-preview-host flex-1 min-h-0 overflow-auto" />
              )}
            </div>
          ) : previewKind === 'office' ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 px-4 text-center text-sm text-muted-foreground">
              <p>PowerPoint files open in a new browser tab when possible.</p>
              <p className="text-xs">MIME: {mimeType || 'unknown'}</p>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center py-16 text-sm text-muted-foreground">
              Preview is not available for this file type.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
