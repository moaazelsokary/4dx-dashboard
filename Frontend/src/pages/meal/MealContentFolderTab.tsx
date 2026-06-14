import { useCallback, useEffect, useMemo, useState } from 'react';
import { format, parseISO } from 'date-fns';
import { useSearchParams } from 'react-router-dom';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { User } from '@/services/authService';
import type { MealContentBreadcrumb, MealContentCategory, MealContentItem } from '@/types/mealContent';
import { canManageMealContent } from '@/config/mealAccess';
import {
  createMealFile,
  createMealFolder,
  deleteMealContentItem,
  downloadMealContentFile,
  getMealContentBreadcrumb,
  getMealContentList,
  MAX_MEAL_CONTENT_BYTES,
  updateMealContentItem,
} from '@/services/mealContentService';
import { toast } from '@/hooks/use-toast';
import {
  ArrowLeft,
  ChevronRight,
  Download,
  ExternalLink,
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  Home,
  Loader2,
  FolderInput,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';

function fmtDt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'PPp');
  } catch {
    return String(iso).slice(0, 19);
  }
}

function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—';
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

function getDescendantFolderIdsFromList(folders: MealContentItem[], rootId: number): Set<number> {
  const byParent = new Map<number | null, number[]>();
  for (const f of folders) {
    const pid = f.parent_id;
    if (!byParent.has(pid)) byParent.set(pid, []);
    byParent.get(pid)!.push(f.id);
  }
  const out = new Set<number>();
  const stack = [rootId];
  while (stack.length) {
    const id = stack.pop()!;
    for (const child of byParent.get(id) || []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

async function loadAllFoldersForCategory(category: MealContentCategory): Promise<MealContentItem[]> {
  const all: MealContentItem[] = [];
  async function walk(parentId: number | null) {
    const items = await getMealContentList(category, parentId);
    const folders = items.filter((i) => i.item_type === 'folder');
    all.push(...folders);
    await Promise.all(folders.map((f) => walk(f.id)));
  }
  await walk(null);
  return all;
}

type Props = {
  category: MealContentCategory;
  title: string;
  description: string;
  user: User | null;
};

export default function MealContentFolderTab({ category, title, description, user }: Props) {
  const [searchParams, setSearchParams] = useSearchParams();
  const folderParam = searchParams.get('folder');
  const currentFolderId = useMemo(() => {
    if (!folderParam) return null;
    const n = parseInt(folderParam, 10);
    return Number.isFinite(n) && n > 0 ? n : null;
  }, [folderParam]);

  const [items, setItems] = useState<MealContentItem[]>([]);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: number; display_name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [folderOpen, setFolderOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<MealContentItem | null>(null);

  const [folderName, setFolderName] = useState('');
  const [folderDesc, setFolderDesc] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [fileDescription, setFileDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editFile, setEditFile] = useState<File | null>(null);

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveRow, setMoveRow] = useState<MealContentItem | null>(null);
  const [browseFolderId, setBrowseFolderId] = useState<number | null>(null);
  const [browseFolders, setBrowseFolders] = useState<MealContentItem[]>([]);
  const [browseCrumbs, setBrowseCrumbs] = useState<MealContentBreadcrumb[]>([]);
  const [allFolders, setAllFolders] = useState<MealContentItem[]>([]);
  const [loadingBrowse, setLoadingBrowse] = useState(false);

  const canManage = canManageMealContent(user);

  const setFolderInUrl = useCallback(
    (folderId: number | null) => {
      const next = new URLSearchParams(searchParams);
      next.set('tab', category === 'tools' ? 'tools' : category === 'reports' ? 'reports' : 'learning');
      if (folderId == null) next.delete('folder');
      else next.set('folder', String(folderId));
      setSearchParams(next, { replace: true });
    },
    [category, searchParams, setSearchParams]
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await getMealContentList(category, currentFolderId);
      setItems(Array.isArray(list) ? list : []);
      if (currentFolderId != null) {
        const crumbs = await getMealContentBreadcrumb(category, currentFolderId);
        setBreadcrumbs(Array.isArray(crumbs) ? crumbs : []);
      } else {
        setBreadcrumbs([]);
      }
    } catch (e) {
      toast({
        title: 'Could not load content',
        description: e instanceof Error ? e.message : 'Run database migration if this is a new feature.',
        variant: 'destructive',
      });
      setItems([]);
      setBreadcrumbs([]);
    } finally {
      setLoading(false);
    }
  }, [category, currentFolderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const currentPathLabel = useMemo(() => {
    if (breadcrumbs.length === 0) return 'Root';
    return breadcrumbs.map((c) => c.display_name).join(' / ');
  }, [breadcrumbs]);

  const parentFolderId = useMemo(() => {
    if (breadcrumbs.length === 0) return null;
    return breadcrumbs.length >= 2 ? breadcrumbs[breadcrumbs.length - 2].id : null;
  }, [breadcrumbs]);

  const openFolder = (row: MealContentItem) => {
    if (row.item_type !== 'folder') return;
    setFolderInUrl(row.id);
  };

  const handleCreateFolder = async () => {
    if (!folderName.trim()) {
      toast({ title: 'Folder name required', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const created = await createMealFolder({
        category,
        parent_id: currentFolderId,
        display_name: folderName.trim(),
        description: folderDesc.trim() || null,
      });
      toast({ title: 'Folder created', description: 'Opening folder…' });
      setFolderOpen(false);
      setFolderName('');
      setFolderDesc('');
      setFolderInUrl(created.id);
    } catch (e) {
      toast({
        title: 'Could not create folder',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
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
    if (file.size > MAX_MEAL_CONTENT_BYTES) {
      toast({
        title: 'File too large',
        description: `Maximum size is ${fmtBytes(MAX_MEAL_CONTENT_BYTES)}.`,
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const b64 = await readFileAsBase64(file);
      await createMealFile({
        category,
        parent_id: currentFolderId,
        display_name: displayName.trim(),
        description: fileDescription.trim() || null,
        original_file_name: file.name,
        mime_type: file.type || null,
        file_base64: b64,
      });
      toast({ title: 'File uploaded' });
      setUploadOpen(false);
      setDisplayName('');
      setFileDescription('');
      setFile(null);
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

  const openEdit = (row: MealContentItem) => {
    setEditRow(row);
    setEditName(row.display_name);
    setEditDesc(row.description || '');
    setEditFile(null);
    setEditOpen(true);
  };

  const handleEdit = async () => {
    if (!editRow) return;
    if (!editName.trim()) {
      toast({ title: 'Name required', variant: 'destructive' });
      return;
    }
    if (editFile && editFile.size > MAX_MEAL_CONTENT_BYTES) {
      toast({
        title: 'File too large',
        description: `Maximum size is ${fmtBytes(MAX_MEAL_CONTENT_BYTES)}.`,
        variant: 'destructive',
      });
      return;
    }
    setSaving(true);
    try {
      const payload: Parameters<typeof updateMealContentItem>[1] = {
        display_name: editName.trim(),
        description: editDesc.trim() || null,
      };
      if (editRow.item_type === 'file' && editFile) {
        payload.file_base64 = await readFileAsBase64(editFile);
        payload.original_file_name = editFile.name;
        payload.mime_type = editFile.type || null;
      }
      await updateMealContentItem(editRow.id, payload);
      toast({ title: 'Saved' });
      setEditOpen(false);
      setEditRow(null);
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

  const handleDelete = async (row: MealContentItem) => {
    const label = row.item_type === 'folder' ? 'folder' : 'file';
    if (!window.confirm(`Delete ${label} “${row.display_name}”?`)) return;
    try {
      await deleteMealContentItem(row.id);
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

  const handleDownload = async (row: MealContentItem) => {
    try {
      await downloadMealContentFile(row.id);
    } catch (e) {
      toast({
        title: 'Download failed',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    }
  };

  const openMove = async (row: MealContentItem) => {
    setMoveRow(row);
    setBrowseFolderId(null);
    setBrowseCrumbs([]);
    setMoveOpen(true);
    setLoadingBrowse(true);
    try {
      const [list, folders] = await Promise.all([
        getMealContentList(category, null),
        loadAllFoldersForCategory(category),
      ]);
      const excluded = new Set<number>([row.id]);
      if (row.item_type === 'folder') {
        for (const id of getDescendantFolderIdsFromList(folders, row.id)) {
          excluded.add(id);
        }
      }
      setBrowseFolders(list.filter((i) => i.item_type === 'folder' && !excluded.has(i.id)));
      setAllFolders(folders);
    } catch (e) {
      toast({
        title: 'Could not load folders',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
      setBrowseFolders([]);
      setAllFolders([]);
    } finally {
      setLoadingBrowse(false);
    }
  };

  const browseIntoFolder = async (folder: MealContentItem) => {
    if (!moveRow || folder.item_type !== 'folder') return;
    setLoadingBrowse(true);
    try {
      const [list, crumbs] = await Promise.all([
        getMealContentList(category, folder.id),
        getMealContentBreadcrumb(category, folder.id),
      ]);
      setBrowseFolderId(folder.id);
      setBrowseCrumbs(crumbs);
      const excluded = new Set<number>([moveRow.id]);
      if (moveRow.item_type === 'folder') {
        for (const id of getDescendantFolderIdsFromList(allFolders, moveRow.id)) {
          excluded.add(id);
        }
      }
      setBrowseFolders(list.filter((i) => i.item_type === 'folder' && !excluded.has(i.id)));
    } catch (e) {
      toast({
        title: 'Could not open folder',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setLoadingBrowse(false);
    }
  };

  const browseToRoot = async () => {
    if (!moveRow) return;
    setLoadingBrowse(true);
    try {
      const list = await getMealContentList(category, null);
      setBrowseFolderId(null);
      setBrowseCrumbs([]);
      const excluded = new Set<number>([moveRow.id]);
      if (moveRow.item_type === 'folder') {
        for (const id of getDescendantFolderIdsFromList(allFolders, moveRow.id)) {
          excluded.add(id);
        }
      }
      setBrowseFolders(list.filter((i) => i.item_type === 'folder' && !excluded.has(i.id)));
    } catch (e) {
      toast({
        title: 'Could not load folders',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setLoadingBrowse(false);
    }
  };

  const browseToCrumb = async (folderId: number) => {
    const folder = allFolders.find((f) => f.id === folderId);
    if (folder) await browseIntoFolder(folder);
  };

  const browseUp = async () => {
    if (browseCrumbs.length <= 1) {
      await browseToRoot();
      return;
    }
    const parentId = browseCrumbs[browseCrumbs.length - 2].id;
    await browseToCrumb(parentId);
  };

  const browsePathLabel = useMemo(() => {
    if (browseCrumbs.length === 0) return 'Root';
    return browseCrumbs.map((c) => c.display_name).join(' / ');
  }, [browseCrumbs]);

  const invalidMoveTarget = useMemo(() => {
    if (!moveRow) return true;
    const dest = browseFolderId;
    const current = moveRow.parent_id ?? null;
    if (current === dest) return true;
    if (moveRow.item_type === 'folder') {
      if (dest === moveRow.id) return true;
      const descendants = getDescendantFolderIdsFromList(allFolders, moveRow.id);
      if (dest != null && descendants.has(dest)) return true;
    }
    return false;
  }, [allFolders, browseFolderId, moveRow]);

  const handleMove = async () => {
    if (!moveRow || invalidMoveTarget) return;
    const newParentId = browseFolderId;
    setSaving(true);
    try {
      await updateMealContentItem(moveRow.id, { parent_id: newParentId });
      toast({
        title: 'Moved',
        description: `${moveRow.display_name} was moved to ${browsePathLabel}.`,
      });
      setMoveOpen(false);
      setMoveRow(null);
      void load();
    } catch (e) {
      toast({
        title: 'Move failed',
        description: e instanceof Error ? e.message : 'Request failed',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const folders = items.filter((i) => i.item_type === 'folder');
  const files = items.filter((i) => i.item_type === 'file');

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1 min-w-0">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FolderOpen className="h-5 w-5 shrink-0" />
              {title}
            </CardTitle>
            <CardDescription>
              {description} Click a folder to open it, upload files inside, or remove items with the trash icon.
            </CardDescription>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {currentFolderId != null && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1 text-xs"
                  onClick={() => setFolderInUrl(parentFolderId)}
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Button>
              )}
              <span className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-2 py-1">
                Location: <span className="font-medium text-foreground">{currentPathLabel}</span>
              </span>
            </div>
            <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <button
                type="button"
                className="inline-flex items-center gap-1 hover:text-foreground transition-colors"
                onClick={() => setFolderInUrl(null)}
              >
                <Home className="h-3.5 w-3.5" />
                Root
              </button>
              {breadcrumbs.map((crumb) => (
                <span key={crumb.id} className="inline-flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  <button
                    type="button"
                    className="hover:text-foreground transition-colors truncate max-w-[12rem]"
                    onClick={() => setFolderInUrl(crumb.id)}
                    title={crumb.display_name}
                  >
                    {crumb.display_name}
                  </button>
                </span>
              ))}
            </nav>
          </div>
          {canManage && (
            <div className="flex flex-wrap gap-2 shrink-0">
              <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={() => setFolderOpen(true)}>
                <FolderPlus className="h-4 w-4" />
                New folder
              </Button>
              <Button type="button" size="sm" className="gap-1.5" onClick={() => setUploadOpen(true)}>
                <Plus className="h-4 w-4" />
                Upload file
              </Button>
            </div>
          )}
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center gap-2 text-muted-foreground text-sm py-8 justify-center">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : items.length === 0 ? (
            <div className="text-sm text-muted-foreground py-10 text-center space-y-2">
              <p>This folder is empty.</p>
              {canManage ? (
                <p>
                  Use <strong>Upload file</strong> to add documents here
                  {currentFolderId != null ? '' : ', or create a folder first'}.
                </p>
              ) : null}
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[52px]" />
                    <TableHead className="min-w-[160px]">Name</TableHead>
                    <TableHead className="min-w-[140px]">Description</TableHead>
                    <TableHead className="min-w-[100px]">Type</TableHead>
                    <TableHead className="min-w-[120px]">Details</TableHead>
                    <TableHead className="min-w-[140px]">Updated</TableHead>
                    <TableHead className="text-left min-w-[120px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {folders.map((row) => (
                    <TableRow
                      key={row.id}
                      className="cursor-pointer hover:bg-muted/40"
                      onClick={() => openFolder(row)}
                      onDoubleClick={() => openFolder(row)}
                    >
                      <TableCell>
                        <Folder className="h-4 w-4 text-amber-600" />
                      </TableCell>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          className="text-left text-primary hover:underline inline-flex items-center gap-1"
                          onClick={(e) => {
                            e.stopPropagation();
                            openFolder(row);
                          }}
                        >
                          {row.display_name}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                        {row.description?.trim() || '—'}
                      </TableCell>
                      <TableCell>Folder</TableCell>
                      <TableCell className="text-sm text-muted-foreground">—</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDt(row.updated_at)}</TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => openFolder(row)}
                          >
                            Open
                          </Button>
                          {canManage && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Move to another folder"
                                onClick={() => void openMove(row)}
                              >
                                <FolderInput className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Rename" onClick={() => openEdit(row)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Remove folder" onClick={() => void handleDelete(row)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {files.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell>
                        <File className="h-4 w-4 text-primary" />
                      </TableCell>
                      <TableCell className="font-medium">{row.display_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px]">
                        {row.description?.trim() || '—'}
                      </TableCell>
                      <TableCell>File</TableCell>
                      <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                        {row.original_file_name || '—'}
                        {row.file_size_bytes != null ? ` · ${fmtBytes(row.file_size_bytes)}` : ''}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{fmtDt(row.updated_at)}</TableCell>
                      <TableCell>
                        <div className="inline-flex items-center gap-1">
                          <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Download" onClick={() => void handleDownload(row)}>
                            <Download className="h-4 w-4" />
                          </Button>
                          {canManage && (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                title="Move to another folder"
                                onClick={() => void openMove(row)}
                              >
                                <FolderInput className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={() => openEdit(row)}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Remove file" onClick={() => void handleDelete(row)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New folder</DialogTitle>
            <DialogDescription>Create a new folder in the current location.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="meal-folder-name">Folder name</Label>
              <Input id="meal-folder-name" value={folderName} onChange={(e) => setFolderName(e.target.value)} placeholder="e.g. Templates" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meal-folder-desc">Description</Label>
              <Textarea id="meal-folder-desc" value={folderDesc} onChange={(e) => setFolderDesc(e.target.value)} rows={2} placeholder="Optional" />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setFolderOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => void handleCreateFolder()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={uploadOpen} onOpenChange={(o) => { if (!o) { setDisplayName(''); setFileDescription(''); setFile(null); } setUploadOpen(o); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Upload file</DialogTitle>
            <DialogDescription>
              Uploading to: <span className="font-medium text-foreground">{currentPathLabel}</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="meal-file-name">Display name</Label>
              <Input id="meal-file-name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Name shown in the list" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meal-file-desc">Description</Label>
              <Textarea id="meal-file-desc" value={fileDescription} onChange={(e) => setFileDescription(e.target.value)} rows={2} placeholder="Optional" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meal-file-input">File</Label>
              <Input
                id="meal-file-input"
                type="file"
                onChange={(e) => {
                  const picked = e.target.files?.[0] ?? null;
                  setFile(picked);
                  if (picked && !displayName.trim()) {
                    setDisplayName(picked.name.replace(/\.[^.]+$/, '') || picked.name);
                  }
                }}
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setUploadOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => void handleUpload()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Upload'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editRow?.item_type === 'folder' ? 'Edit folder' : 'Edit file'}</DialogTitle>
            <DialogDescription>Update the name, description, or replace the file.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label htmlFor="meal-edit-name">Name</Label>
              <Input id="meal-edit-name" value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meal-edit-desc">Description</Label>
              <Textarea id="meal-edit-desc" value={editDesc} onChange={(e) => setEditDesc(e.target.value)} rows={2} />
            </div>
            {editRow?.item_type === 'file' && (
              <div className="space-y-2">
                <Label htmlFor="meal-edit-file">Replace file (optional)</Label>
                <Input id="meal-edit-file" type="file" onChange={(e) => setEditFile(e.target.files?.[0] ?? null)} />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => void handleEdit()} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={moveOpen} onOpenChange={setMoveOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Move to folder</DialogTitle>
            <DialogDescription>
              Browse folders and choose where to move{' '}
              <span className="font-medium text-foreground">{moveRow?.display_name}</span>.
              Open a folder to see subfolders, then click Move here.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="flex flex-wrap items-center gap-2">
              {browseFolderId != null && (
                <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => void browseUp()}>
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back
                </Button>
              )}
              <span className="text-xs text-muted-foreground rounded-md border bg-muted/40 px-2 py-1">
                Destination: <span className="font-medium text-foreground">{browsePathLabel}</span>
              </span>
            </div>
            <nav className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
              <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => void browseToRoot()}>
                <Home className="h-3.5 w-3.5" />
                Root
              </button>
              {browseCrumbs.map((crumb) => (
                <span key={crumb.id} className="inline-flex items-center gap-1">
                  <ChevronRight className="h-3.5 w-3.5" />
                  <button
                    type="button"
                    className="hover:text-foreground truncate max-w-[10rem]"
                    title={crumb.display_name}
                    onClick={() => void browseToCrumb(crumb.id)}
                  >
                    {crumb.display_name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="border rounded-md min-h-[10rem] max-h-[14rem] overflow-y-auto">
              {loadingBrowse ? (
                <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading folders…
                </div>
              ) : browseFolders.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-10 px-4">
                  No subfolders here. You can move the item to this location.
                </p>
              ) : (
                <ul className="divide-y">
                  {browseFolders.map((folder) => (
                    <li key={folder.id}>
                      <button
                        type="button"
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/50 transition-colors"
                        onClick={() => void browseIntoFolder(folder)}
                      >
                        <Folder className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="font-medium text-sm flex-1 truncate">{folder.display_name}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0 flex-col sm:flex-row sm:items-center">
            <Button
              type="button"
              className="sm:mr-auto"
              onClick={() => void handleMove()}
              disabled={saving || loadingBrowse || invalidMoveTarget}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : `Move here (${browsePathLabel})`}
            </Button>
            <Button type="button" variant="outline" onClick={() => setMoveOpen(false)}>Cancel</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
