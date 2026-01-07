import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, FileText, Image, Bell, Menu } from 'lucide-react';
import PageList from '@/components/cms/PageList';
import ImageManager from '@/components/cms/ImageManager';
import AnnouncementManager from '@/components/cms/AnnouncementManager';
import MenuManager from '@/components/cms/MenuManager';
import PageFormModal from '@/components/cms/PageFormModal';
import AnnouncementFormModal from '@/components/cms/AnnouncementFormModal';
import MenuItemFormModal from '@/components/cms/MenuItemFormModal';
import type { CMSPage, CMSAnnouncement, CMSMenuItem } from '@/services/cmsService';
import NavigationBar from '@/components/shared/NavigationBar';
import { useRealtimeCMS } from '@/hooks/useRealtimeCMS';

export default function CMSDashboard() {
  const [user, setUser] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('pages');
  const [pageModalOpen, setPageModalOpen] = useState(false);
  const [announcementModalOpen, setAnnouncementModalOpen] = useState(false);
  const [menuItemModalOpen, setMenuItemModalOpen] = useState(false);
  const [editingPage, setEditingPage] = useState<CMSPage | null>(null);
  const [editingAnnouncement, setEditingAnnouncement] = useState<CMSAnnouncement | null>(null);
  const [editingMenuItem, setEditingMenuItem] = useState<CMSMenuItem | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      navigate('/');
      return;
    }

    const userObj = JSON.parse(userData);
    // Only Admin, Editor, and CEO can access CMS
    if (!['Admin', 'Editor', 'CEO'].includes(userObj.role)) {
      navigate('/access-denied');
      return;
    }

    setUser(userObj);
  }, [navigate]);

  // Enable real-time updates (poll every 30 seconds)
  useRealtimeCMS(true, 30000);

  const handleAddPage = () => {
    setEditingPage(null);
    setPageModalOpen(true);
  };

  const handleEditPage = (page: CMSPage) => {
    setEditingPage(page);
    setPageModalOpen(true);
  };

  const handleAddAnnouncement = () => {
    setEditingAnnouncement(null);
    setAnnouncementModalOpen(true);
  };

  const handleEditAnnouncement = (announcement: CMSAnnouncement) => {
    setEditingAnnouncement(announcement);
    setAnnouncementModalOpen(true);
  };

  const handleAddMenuItem = () => {
    setEditingMenuItem(null);
    setMenuItemModalOpen(true);
  };

  const handleEditMenuItem = (item: CMSMenuItem) => {
    setEditingMenuItem(item);
    setMenuItemModalOpen(true);
  };

  if (!user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-primary/5 to-accent/5">
      <header className="border-b bg-card/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-2">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => navigate(-1)}
                  className="h-7 px-2 text-xs"
                >
                  <ArrowLeft className="w-3 h-3 mr-1" />
                  Back
                </Button>
                <div>
                  <h1 className="text-sm font-bold text-foreground">CMS Admin</h1>
                  <p className="text-xs text-muted-foreground">
                    Manage content, images, announcements, and menu items
                  </p>
                </div>
              </div>
            </div>

            <NavigationBar 
              user={user} 
              activeTab="" 
              onTabChange={() => {}}
            />
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-4 mb-6">
            <TabsTrigger value="pages">
              <FileText className="w-4 h-4 mr-2" />
              Pages
            </TabsTrigger>
            <TabsTrigger value="images">
              <Image className="w-4 h-4 mr-2" />
              Images
            </TabsTrigger>
            <TabsTrigger value="announcements">
              <Bell className="w-4 h-4 mr-2" />
              Announcements
            </TabsTrigger>
            <TabsTrigger value="menu">
              <Menu className="w-4 h-4 mr-2" />
              Menu
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pages" className="mt-0">
            <PageList onAdd={handleAddPage} onEdit={handleEditPage} />
          </TabsContent>

          <TabsContent value="images" className="mt-0">
            <ImageManager />
          </TabsContent>

          <TabsContent value="announcements" className="mt-0">
            <AnnouncementManager 
              onAdd={handleAddAnnouncement} 
              onEdit={handleEditAnnouncement} 
            />
          </TabsContent>

          <TabsContent value="menu" className="mt-0">
            <MenuManager 
              onAdd={handleAddMenuItem} 
              onEdit={handleEditMenuItem} 
            />
          </TabsContent>
        </Tabs>
      </div>

      <PageFormModal
        open={pageModalOpen}
        onOpenChange={setPageModalOpen}
        page={editingPage}
        onSuccess={() => {
          setPageModalOpen(false);
          setEditingPage(null);
        }}
      />

      <AnnouncementFormModal
        open={announcementModalOpen}
        onOpenChange={setAnnouncementModalOpen}
        announcement={editingAnnouncement}
        onSuccess={() => {
          setAnnouncementModalOpen(false);
          setEditingAnnouncement(null);
        }}
      />

      <MenuItemFormModal
        open={menuItemModalOpen}
        onOpenChange={setMenuItemModalOpen}
        item={editingMenuItem}
        onSuccess={() => {
          setMenuItemModalOpen(false);
          setEditingMenuItem(null);
        }}
      />
    </div>
  );
}

