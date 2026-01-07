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
import { Switch } from '@/components/ui/switch';
import { createMenuItem, updateMenuItem, type CMSMenuItem } from '@/services/cmsService';
import { toast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

interface MenuItemFormModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item?: CMSMenuItem | null;
  onSuccess: () => void;
}

export default function MenuItemFormModal({
  open,
  onOpenChange,
  item,
  onSuccess,
}: MenuItemFormModalProps) {
  const [label, setLabel] = useState('');
  const [url, setUrl] = useState('');
  const [icon, setIcon] = useState('');
  const [displayOrder, setDisplayOrder] = useState(0);
  const [isActive, setIsActive] = useState(true);
  const [targetBlank, setTargetBlank] = useState(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    if (item) {
      setLabel(item.label || '');
      setUrl(item.url || '');
      setIcon(item.icon || '');
      setDisplayOrder(item.display_order || 0);
      setIsActive(item.is_active ?? true);
      setTargetBlank(item.target_blank || false);
    } else {
      setLabel('');
      setUrl('');
      setIcon('');
      setDisplayOrder(0);
      setIsActive(true);
      setTargetBlank(false);
    }
  }, [item, open]);

  const createMutation = useMutation({
    mutationFn: (data: Omit<CMSMenuItem, 'id'>) => createMenuItem(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-menu'] });
      toast({
        title: 'Success',
        description: 'Menu item created successfully',
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create menu item',
        variant: 'destructive',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CMSMenuItem> }) =>
      updateMenuItem(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-menu'] });
      toast({
        title: 'Success',
        description: 'Menu item updated successfully',
      });
      onSuccess();
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update menu item',
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!label || !url) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }

    const menuItemData = {
      label,
      url,
      icon: icon || undefined,
      display_order: displayOrder,
      is_active: isActive,
      target_blank: targetBlank,
    };

    if (item?.id) {
      updateMutation.mutate({ id: item.id, data: menuItemData });
    } else {
      createMutation.mutate(menuItemData);
    }
  };

  const isLoading = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {item ? 'Edit Menu Item' : 'Create Menu Item'}
          </DialogTitle>
          <DialogDescription>
            {item
              ? 'Update the menu item settings.'
              : 'Create a new menu item for the navigation.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="label">
                Label <span className="text-destructive">*</span>
              </Label>
              <Input
                id="label"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Menu item label"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="url">
                URL <span className="text-destructive">*</span>
              </Label>
              <Input
                id="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="/page-url"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="icon">Icon (optional)</Label>
              <Input
                id="icon"
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                placeholder="Icon name or class"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="order">Display Order</Label>
              <Input
                id="order"
                type="number"
                value={displayOrder}
                onChange={(e) => setDisplayOrder(parseInt(e.target.value) || 0)}
                min="0"
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="active">Active</Label>
              <p className="text-sm text-muted-foreground">
                Show this item in the menu
              </p>
            </div>
            <Switch
              id="active"
              checked={isActive}
              onCheckedChange={setIsActive}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label htmlFor="target-blank">Open in New Tab</Label>
              <p className="text-sm text-muted-foreground">
                Open link in a new browser tab
              </p>
            </div>
            <Switch
              id="target-blank"
              checked={targetBlank}
              onCheckedChange={setTargetBlank}
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
              {item ? 'Update Menu Item' : 'Create Menu Item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

