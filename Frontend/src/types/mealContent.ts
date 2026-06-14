export type MealContentCategory = 'tools' | 'reports' | 'learning';

export type MealContentItemType = 'folder' | 'file';

export interface MealContentItem {
  id: number;
  category: MealContentCategory;
  parent_id: number | null;
  item_type: MealContentItemType;
  display_name: string;
  description: string | null;
  original_file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
  created_at: string;
  created_by_username: string | null;
  updated_at: string;
  updated_by_username: string | null;
}

export interface MealContentBreadcrumb {
  id: number;
  display_name: string;
}

export interface MealContentFolderOption {
  id: number;
  parent_id: number | null;
  display_name: string;
  path: string;
}
