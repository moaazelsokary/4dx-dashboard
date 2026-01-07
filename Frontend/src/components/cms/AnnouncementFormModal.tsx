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
import { createAnnouncement, updateAnnouncement, type CMSAnnouncement } from '@/services/cmsService';
import { toast } from '@/hooks/use-toast';
import ContentEditor from './ContentEditor';
import { Loader2 } from 'lucide-react';

interface AnnouncementFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  announcement?: CMSAnnouncement | null;
  onSuccess: () => void;
}

export default function AnnouncementFormModal({
  open,
  onOpenChange,
  announcement,
  onSuccess,
}: AnnouncementFormModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [priority, setPriority] = useState(0);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const queryClient = useQueryClient();

  useEffect(() => {
    if (announcement) {
      setTitle(announcement.title || '');
      setContent(announcement.content || '');
      setIsActive(announcement.is_active ?? true);
      setPriority(announcement.priority || 0);
      setStartDate(announcement.start_date ? announcement.start_date.split('T')[0] : '');
      setEndDate(announcement.end_date ? announcement.end_date.split('T')[0] : '');
    } else {
      setTitle('');
      setContent('');
      setIsActive(true);
      setPriority(0);
      setStartDate('');
      setEndDate('');
    }
  }, [announcement, open]);

  const createMutation = useMutation({
    mutationFn: (data: Omit<CMSAnnouncement, 'id' | 'created_at' | 'updated_at'>) =>
      createAnnouncement(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-announcements'] });
      toast({
        title: 'Success',
        description: 'Announcement created successfully',
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create announcement',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CMSAnnouncement> }) =>
      updateAnnouncement(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-announcements'] });
      toast({
        title: 'Success',
        description: 'Announcement updated successfully',
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update announcement',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!title || !content) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    const announcementData = {
      title,
      content,
      is_active: isActive,
      priority,
      start_date: startDate || undefined,
      end_date: endDate || undefined,
    };

    if (announcement?.id) {
      updateMutation.mutate({ id: announcement.id, data: announcementData });
    } else {
      createMutation.mutate(announcementData);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {announcement ? 'Edit Announcement' : 'Create Announcement'}
          </DialogTitle>
          <DialogDescription>
            {announcement
              ? 'Update the announcement content and settings.'
              : 'Create a new announcement to display to users.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="announcement-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input
              id="announcement-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement title"
              required
            />
          </div>

          <ContentEditor
            content={content}
            onChange={setContent}
          />

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Input
                id="priority"
                type="number"
                value={priority}
                onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                min="0"
                max="10"
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="active">Active</Label>
                <p className="text-sm text-muted-foreground">
                  Show this announcement to users
                </p>
              </div>
              <Switch
                id="active"
                checked={isActive}
                onCheckedChange={setIsActive}
              />
            </div>
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
              {announcement ? 'Update Announcement' : 'Create Announcement'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

