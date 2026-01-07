import { useState, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { createPage, updatePage, type CMSPage } from '@/services/cmsService';
import { toast } from '@/hooks/use-toast';
import ContentEditor from './ContentEditor';
import { Loader2 } from 'lucide-react';

interface PageFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  page?: CMSPage | null;
  onSuccess: () => void;
}

export default function PageFormModal({
  open,
  onOpenChange,
  page,
  onSuccess,
}: PageFormModalProps) {
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [content, setContent] = useState('');
  const [metaDescription, setMetaDescription] = useState('');
  const [metaKeywords, setMetaKeywords] = useState('');
  const [isPublished, setIsPublished] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (page) {
      setTitle(page.title || '');
      setSlug(page.slug || '');
      setContent(page.content || '');
      setMetaDescription(page.meta_description || '');
      setMetaKeywords(page.meta_keywords || '');
      setIsPublished(page.is_published || false);
    } else {
      setTitle('');
      setSlug('');
      setContent('');
      setMetaDescription('');
      setMetaKeywords('');
      setIsPublished(false);
    }
  }, [page, open]);

  // Auto-generate slug from title
  useEffect(() => {
    if (!page && title) {
      const generatedSlug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setSlug(generatedSlug);
    }
  }, [title, page]);

  const createMutation = useMutation({
    mutationFn: (data: Omit<CMSPage, 'id' | 'created_at' | 'updated_at'>) =>
      createPage(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-pages'] });
      toast({
        title: 'Success',
        description: 'Page created successfully',
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create page',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CMSPage> }) =>
      updatePage(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-pages'] });
      toast({
        title: 'Success',
        description: 'Page updated successfully',
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update page',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !slug || !content) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    const pageData = {
      title,
      slug,
      content,
      meta_description: metaDescription || undefined,
      meta_keywords: metaKeywords || undefined,
      is_published: isPublished,
    };

    if (page?.id) {
      updateMutation.mutate({ id: page.id, data: pageData });
    } else {
      createMutation.mutate(pageData);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{page ? 'Edit Page' : 'Create Page'}</DialogTitle>
          <DialogDescription>
            {page
              ? 'Update the page content and settings.'
              : 'Create a new page for your website.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Title <span className="text-destructive">*</span>
              </Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Page title"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">
                Slug <span className="text-destructive">*</span>
              </Label>
              <Input
                id="slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="page-slug"
                required
              />
            </div>
          </div>

          <ContentEditor
            content={content}
            onChange={setContent}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="meta-description">Meta Description</Label>
              <Textarea
                id="meta-description"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="SEO meta description"
                rows={3}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="meta-keywords">Meta Keywords</Label>
              <Textarea
                id="meta-keywords"
                value={metaKeywords}
                onChange={(e) => setMetaKeywords(e.target.value)}
                placeholder="SEO keywords (comma-separated)"
                rows={3}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="published">Published</Label>
              <p className="text-sm text-muted-foreground">
                Make this page visible to visitors
              </p>
            </div>
            <Switch
              id="published"
              checked={isPublished}
              onCheckedChange={setIsPublished}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {page ? 'Update Page' : 'Create Page'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

