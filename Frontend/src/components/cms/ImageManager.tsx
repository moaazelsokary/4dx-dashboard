import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { getImages, uploadImage, deleteImage, type CMSImage } from '@/services/cmsService';
import { toast } from '@/hooks/use-toast';
import { Upload, Trash2, Loader2 } from 'lucide-react';
import OptimizedImage from '@/components/ui/OptimizedImage';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

export default function ImageManager() {
  const [uploading, setUploading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [imageToDelete, setImageToDelete] = useState<CMSImage | null>(null);
  const queryClient = useQueryClient();

  const { data: images = [], isLoading } = useQuery({
    queryKey: ['cms-images'],
    queryFn: () => getImages(),
    refetchInterval: 30000, // Refetch every 30 seconds for real-time updates
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadImage(file),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-images'] });
      toast({
        title: 'Success',
        description: 'Image uploaded successfully',
      });
      setUploading(false);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to upload image',
        variant: 'destructive',
      });
      setUploading(false);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteImage(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cms-images'] });
      toast({
        title: 'Success',
        description: 'Image deleted successfully',
      });
      setDeleteDialogOpen(false);
      setImageToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete image',
        variant: 'destructive',
      });
    },
  });

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast({
        title: 'Invalid file',
        description: 'Please select an image file',
        variant: 'destructive',
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: 'File too large',
        description: 'Image must be less than 5MB',
        variant: 'destructive',
      });
      return;
    }

    setUploading(true);
    uploadMutation.mutate(file);
    e.target.value = ''; // Reset input
  };

  const handleDelete = (image: CMSImage) => {
    setImageToDelete(image);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (imageToDelete?.id) {
      deleteMutation.mutate(imageToDelete.id);
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-muted-foreground">Loading images...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Image Manager</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Label htmlFor="image-upload" className="cursor-pointer">
              <Button as="span" variant="outline" disabled={uploading}>
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload Image
                  </>
                )}
              </Button>
            </Label>
            <Input
              id="image-upload"
              type="file"
              accept="image/*"
              onChange={handleFileSelect}
              className="hidden"
              disabled={uploading}
            />
            <p className="text-sm text-muted-foreground">
              Max file size: 5MB. Supported formats: JPG, PNG, GIF, WebP
            </p>
          </div>

          {images.length === 0 ? (
            <div className="text-center text-muted-foreground py-8 border rounded-md">
              No images uploaded yet. Upload your first image to get started.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {images.map((image) => (
                <div
                  key={image.id}
                  className="relative group border rounded-md overflow-hidden"
                >
                  <OptimizedImage
                    src={image.url}
                    alt={image.alt_text || image.filename}
                    className="w-full h-32 object-cover"
                    sizes="(max-width: 768px) 50vw, 25vw"
                  />
                  <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Button
                      variant="destructive"
                      size="sm"
                      onClick={() => handleDelete(image)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <div className="p-2">
                    <p className="text-xs font-medium truncate">{image.filename}</p>
                    {image.alt_text && (
                      <p className="text-xs text-muted-foreground truncate">
                        {image.alt_text}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Image</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{imageToDelete?.filename}"? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

