export interface VideoMetadata {
  id: string;
  folder_name: string;
  full_path: string;
  file_name: string;
  file_size: number;
  creation_date: number;
  modified_date: number;
  duration?: number;
  width?: number;
  height?: number;
  fps?: number;
  codec?: string;
  thumbnail_path?: string;
  blobUrl?: string; // Add preloaded blob URL
  isPreloaded?: boolean; // Track preload status
}
