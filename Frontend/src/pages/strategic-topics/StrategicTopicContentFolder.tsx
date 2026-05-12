import { useCallback, useEffect, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { StrategicTopicCode, StrategicTopicContentItem } from '@/types/wig';
import type { User } from '@/services/authService';
import {
  createStrategicTopicContentItem,
  deleteStrategicTopicContentItem,
  downloadStrategicTopicContentFile,
  getStrategicTopicContentList,
  MAX_STRATEGIC_TOPIC_CONTENT_BYTES,
  updateStrategicTopicContentItem,
} from '@/services/wigService';
import { canManageStrategicTopicContent } from './strategicTopicKpiUtils';
import { toast } from '@/hooks/use-toast';
import { FolderOpen, Loader2, Pencil, Plus, Trash2, Download } from 'lucide-react';

function fmtDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'PPp');
  } catch {
    return String(iso).slice(0, 19);
  }
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      const s = String(r.result || '');
      const idx = s.indexOf(',');
      resolve(idx >= 0 ? s.slice(idx + 1) : s);
    };
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

type Props = {
  strategicTopicCode: StrategicTopicCode;
  user: User | null;
};

export default function StrategicTopicContentFolder({ strategicTopicCode, user }: Props) {
  const [items, setItems] = useState<StrategicTopicContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [replaceRow, setReplaceRow] = useState<StrategicTopicContentItem | null>(null);
  const [saving, setSaving] = useState(false);

  const [displayName, setDisplayName] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const [repDisplayName, setRepDisplayName] = useState('');
  const [repDescription, setRepDescription] = useState('');
  const [repFile, setRepFile] = useState<File | null>(null);

  const canManage = canManageStrategicTopicContent(user, strategicTopicCode);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getStrategicTopicContentList(strategicTopicCode);
      setItems(Array.isArray(list) ? list : []);
    } catch (e) {
      toast({
        title: 'Could not load files',
        description: e instanceof Error ? e.message : 'Run database migration if this is a new feature.',
        variant: 'destructive',
      });
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [strategicTopicCode]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetUploadForm = () => {
    setDisplayName('');
    setDescription('');
    setFile(null);
  };

  const handleUpload = async () => {
    if (!displayName.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (!file) {
      toast({ title: 'Choose a file', variant: 'destructive' });
      return;
    }
    if (file.size > MAX_STRATEGIC_TOPIC_CONTENT_BYTES) {
      toast({
        title: 'File too large',
        description: `Maximum size is ${fmtBytes(MAX_STRATEGIC_TOPIC_CONTENT_BYTES)}.`,
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const b64 = await readFileAsBase64(file);
      await createStrategicTopicContentItem({
        strategic_topic: strategicTopicCode,
        display_name: displayName.trim(),
        description: description.trim() || null,
        original_file_name: file.name,
        mime_type: file.type || null,
        file_base64: b64,
      });
      toast({ title: 'File uploaded' });
      setUploadOpen(false);
      resetUploadForm();
      void load();
    } catch (e) {
      toast({
        title: 'Upload failed',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const openReplace = (row: StrategicTopicContentItem) => {
    setReplaceRow(row);
    setRepDisplayName(row.display_name);
    setRepDescription(row.description || '');
    setRepFile(null);
    setReplaceOpen(true);
  };

  const handleReplace = async () => {
    if (!replaceRow) return;
    if (!repDisplayName.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (repFile && repFile.size > MAX_STRATEGIC_TOPIC_CONTENT_BYTES) {
      toast({
        title: 'File too large',
        description: `Maximum size is ${fmtBytes(MAX_STRATEGIC_TOPIC_CONTENT_BYTES)}.`,
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const payload: Parameters<typeof updateStrategicTopicContentItem>[1] = {
        display_name: repDisplayName.trim(),
        description: repDescription.trim() || null,
      };
      if (repFile) {
        payload.file_base64 = await readFileAsBase64(repFile);
        payload.original_file_name = repFile.name;
        payload.mime_type = repFile.type || null;
      }
      await updateStrategicTopicContentItem(replaceRow.id, payload);
      toast({ title: repFile ? 'File replaced' : 'Saved' });
      setReplaceOpen(false);
      setReplaceRow(null);
      void load();
    } catch (e) {
      toast({
        title: 'Save failed',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (row: StrategicTopicContentItem) => {
    if (!window.confirm(`Delete “${row.display_name}”?`)) return;
    try {
      await deleteStrategicTopicContentItem(row.id);
      toast({ title: 'Deleted' });
      void load();
    } catch (e) {
      toast({
        title: 'Delete failed',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = async (row: StrategicTopicContentItem) => {
    try {
      await downloadStrategicTopicContentFile(row.id);
    } catch (e) {
      toast({
        title: 'Download failed',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderOpen className="h-5 w-5 shrink-0" />
              Content folder
            </CardTitle>
            <CardDescription>
              Upload reference documents for this strategic topic. Replace a file to update it while keeping history fields.
            </CardDescription>
          </div>
          {canManage && (
            <Button type="button" size="sm" className="shrink-0 gap-1.5" onClick={() => setUploadOpen(true)}>
              <Plus className="h-4 w-4" />
              Upload file
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No files yet.{canManage ? ' Click Upload file to add one.' : ''}
            </p>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-left min-w-[140px] w-[140px] whitespace-nowrap">Actions</TableHead>
                    <TableHead className="min-w-[140px]">Name</TableHead>
                    <TableHead className="min-w-[160px]">Description</TableHead>
                    <TableHead className="whitespace-nowrap">File name</TableHead>
                    <TableHead className="w-[120px] min-w-[120px] max-w-[140px]">Created by</TableHead>
                    <TableHead className="min-w-[180px]">Created</TableHead>
                    <TableHead className="w-[120px] min-w-[120px] max-w-[140px]">Last edit by</TableHead>
                    <TableHead className="min-w-[180px]">Last edit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="!align-top min-w-[140px] w-[140px]">
                        <div className="inline-flex h-8 flex-nowrap items-center gap-1 justify-start self-start">
                          {canManage && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                title="Delete"
                                onClick={() => void handleDelete(row)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Replace file / edit"
                                onClick={() => openReplace(row)}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            title="Download"
                            onClick={() => void handleDownload(row)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium align-top">{row.display_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground align-top max-w-[240px]">
                        {row.description?.trim() ? row.description : '—'}
                      </TableCell>
                      <TableCell className="text-sm align-top whitespace-nowrap">{row.original_file_name}</TableCell>
                      <TableCell className="text-sm align-top w-[120px] min-w-[120px] max-w-[140px] break-words">
                        {row.created_by_username || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground align-top whitespace-nowrap">
                        {fmtDt(row.created_at)}
                      </TableCell>
                      <TableCell className="text-sm align-top w-[120px] min-w-[120px] max-w-[140px] break-words">
                        {row.updated_by_username || row.created_by_username || '—'}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground align-top whitespace-nowrap">
                        {fmtDt(row.updated_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!o) resetUploadForm(); setUploadOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload file</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="st-content-name">Display name</Label>
              <Input
                id="st-content-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Name shown in the list"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-content-desc">Description</Label>
              <Textarea
                id="st-content-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="Optional"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-content-file">File</Label>
              <Input
                id="st-content-file"
                type="file"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleUpload()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={replaceOpen} onOpenChange={setReplaceOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Edit / replace file</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="st-rep-name">Display name</Label>
              <Input
                id="st-rep-name"
                value={repDisplayName}
                onChange={(e) => setRepDisplayName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-rep-desc">Description</Label>
              <Textarea
                id="st-rep-desc"
                value={repDescription}
                onChange={(e) => setRepDescription(e.target.value)}
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="st-rep-file">Replace file (optional)</Label>
              <Input
                id="st-rep-file"
                type="file"
                onChange={(e) => setRepFile(e.target.files?.[0] ?? null)}
              />
              <p className="text-[11px] text-muted-foreground">
                Leave empty to update only name and description. Choose a new file to replace the stored file.
              </p>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setReplaceOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={() => void handleReplace()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
