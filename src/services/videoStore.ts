import Database from '@tauri-apps/plugin-sql';
import { VideoMetadata } from '../types/video';

export interface VideoStoreEntry {
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
  indexed_at: number;
  blobUrl?: string;
  isPreloaded?: boolean;
}

export class VideoStore {
  private static instance: VideoStore;
  private db: Database | null = null;

  static getInstance(): VideoStore {
    if (!VideoStore.instance) {
      VideoStore.instance = new VideoStore();
    }
    return VideoStore.instance;
  }

  async initialize(): Promise<void> {
  //  console.log('Initializing video store');
    
    if (!this.db) {
      try {
        const { appDataDir } = await import('@tauri-apps/api/path');
        const { mkdir, exists } = await import('@tauri-apps/plugin-fs');
        
        const appDir = await appDataDir();
        const dbDir = `${appDir}/shadowcrawler`;
        const dbPath = `${dbDir}/videos.db`;
        
        // Normalize path for Windows (replace forward slashes with backslashes)
        const normalizedDbPath = dbPath.replace(/\//g, '\\');
        
        console.log('Database path:', normalizedDbPath);
        
        // Create directory if it doesn't exist
        if (!(await exists(dbDir))) {
          await mkdir(dbDir, { recursive: true });
          console.log('Created directory:', dbDir);
        }
        
        this.db = await Database.load(`sqlite:${normalizedDbPath}`);
        console.log('Database loaded successfully:', this.db);
        
        await this.createTables();
      } catch (error) {
        console.error('Failed to initialize database:', error);
        throw error;
      }
    }
  }

  private async createTables(): Promise<void> {
    console.log('Creating tables');
    console.log(this.db);
    if (!this.db) return;

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS videos (
        id TEXT PRIMARY KEY,
        folder_name TEXT NOT NULL,
        full_path TEXT UNIQUE NOT NULL,
        file_name TEXT NOT NULL,
        file_size INTEGER NOT NULL,
        creation_date INTEGER NOT NULL,
        modified_date INTEGER NOT NULL,
        duration REAL,
        width INTEGER,
        height INTEGER,
        fps REAL,
        codec TEXT,
        thumbnail_path TEXT,
        indexed_at INTEGER NOT NULL,
        blobUrl TEXT,
        isPreloaded INTEGER DEFAULT 0
      )
    `);

    // Create indexes for better performance
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_videos_creation_date ON videos(creation_date DESC)');
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_videos_folder_name ON videos(folder_name)');
    await this.db.execute('CREATE INDEX IF NOT EXISTS idx_videos_modified_date ON videos(modified_date DESC)');
  }

  async addVideo(video: VideoStoreEntry): Promise<void> {
    await this.initialize();
    if (!this.db) return;

    await this.db.execute(`
      INSERT OR REPLACE INTO videos 
      (id, folder_name, full_path, file_name, file_size, creation_date, modified_date, 
       duration, width, height, fps, codec, thumbnail_path, indexed_at, blobUrl, isPreloaded)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      video.id, video.folder_name, video.full_path, video.file_name, video.file_size,
      video.creation_date, video.modified_date, video.duration, video.width, video.height,
      video.fps, video.codec, video.thumbnail_path, video.indexed_at, video.blobUrl || null,
      video.isPreloaded ? 1 : 0
    ]);
  }

  async updateVideo(id: string, updates: Partial<VideoStoreEntry>): Promise<void> {
    await this.initialize();
    if (!this.db) return;

    const setClause = Object.keys(updates)
      .filter(key => key !== 'id')
      .map(key => `${key} = ?`)
      .join(', ');

    const values = Object.values(updates).filter((_, index) => Object.keys(updates)[index] !== 'id');
    values.push(id);

    await this.db.execute(`UPDATE videos SET ${setClause} WHERE id = ?`, values);
  }

  async getVideo(id: string): Promise<VideoStoreEntry | null> {
    await this.initialize();
    if (!this.db) return null;

    const result = await this.db.select(
      'SELECT * FROM videos WHERE id = ?', [id]
    ) as VideoStoreEntry[];

    return result.length > 0 ? this.mapRowToEntry(result[0]) : null;
  }

  async deleteVideo(id: string): Promise<void> {
    await this.initialize();
    if (!this.db) return;

    await this.db.execute('DELETE FROM videos WHERE id = ?', [id]);
  }

  async clearVideos(): Promise<void> {
    await this.initialize();
    if (!this.db) return;

    await this.db.execute('DELETE FROM videos');
  }

  async getVideosByFolder(folderName: string): Promise<VideoStoreEntry[]> {
    await this.initialize();
    if (!this.db) return [];

    const result = await this.db.select(
      'SELECT * FROM videos WHERE folder_name = ? ORDER BY creation_date DESC', [folderName]
    ) as VideoStoreEntry[];

    return result.map((row: any) => this.mapRowToEntry(row));
  }

  async getFolders(): Promise<string[]> {
    await this.initialize();
    if (!this.db) return [];

    const result = await this.db.select(
      'SELECT DISTINCT folder_name FROM videos ORDER BY folder_name'
    ) as { folder_name: string }[];

    return result.map((row: any) => row.folder_name);
  }

  async searchVideos(query: string): Promise<VideoStoreEntry[]> {
    await this.initialize();
    if (!this.db) return [];

    const searchTerm = `%${query.toLowerCase()}%`;
    const result = await this.db.select(
      `SELECT * FROM videos 
       WHERE LOWER(file_name) LIKE ? 
       OR LOWER(folder_name) LIKE ? 
       OR LOWER(codec) LIKE ? 
       ORDER BY creation_date DESC`,
      [searchTerm, searchTerm, searchTerm]
    ) as VideoStoreEntry[];

    return result.map((row: any) => this.mapRowToEntry(row));
  }

  async getVideosSorted(sortBy: string = 'creation_date_desc'): Promise<VideoStoreEntry[]> {
    await this.initialize();
    if (!this.db) return [];

    let orderBy = 'creation_date DESC';
    switch (sortBy) {
      case 'creation_date_desc':
        orderBy = 'creation_date DESC';
        break;
      case 'creation_date_asc':
        orderBy = 'creation_date ASC';
        break;
      case 'modified_date_desc':
        orderBy = 'modified_date DESC';
        break;
      case 'modified_date_asc':
        orderBy = 'modified_date ASC';
        break;
      case 'name_asc':
        orderBy = 'file_name ASC';
        break;
      case 'name_desc':
        orderBy = 'file_name DESC';
        break;
      case 'size_desc':
        orderBy = 'file_size DESC';
        break;
      case 'size_asc':
        orderBy = 'file_size ASC';
        break;
    }

    const result = await this.db.select(
      `SELECT * FROM videos ORDER BY ${orderBy}`
    ) as VideoStoreEntry[];

    return result.map((row: any) => this.mapRowToEntry(row));
  }

  async getVideosPaginated(
    sortBy: string = 'creation_date_desc',
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ videos: VideoStoreEntry[]; totalCount: number; hasMore: boolean }> {
    await this.initialize();
    if (!this.db) return { videos: [], totalCount: 0, hasMore: false };

    let orderBy = 'creation_date DESC';
    switch (sortBy) {
      case 'creation_date_desc':
        orderBy = 'creation_date DESC';
        break;
      case 'creation_date_asc':
        orderBy = 'creation_date ASC';
        break;
      case 'modified_date_desc':
        orderBy = 'modified_date DESC';
        break;
      case 'modified_date_asc':
        orderBy = 'modified_date ASC';
        break;
      case 'name_asc':
        orderBy = 'file_name ASC';
        break;
      case 'name_desc':
        orderBy = 'file_name DESC';
        break;
      case 'size_desc':
        orderBy = 'file_size DESC';
        break;
      case 'size_asc':
        orderBy = 'file_size ASC';
        break;
    }

    const offset = (page - 1) * pageSize;
    
    // Get total count
    const countResult = await this.db.select('SELECT COUNT(*) as count FROM videos') as { count: number }[];
    const totalCount = countResult[0]?.count || 0;
    
    // Get paginated results
    const result = await this.db.select(
      `SELECT * FROM videos ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [pageSize, offset]
    ) as VideoStoreEntry[];

    const videos = result.map((row: any) => this.mapRowToEntry(row));
    const hasMore = offset + videos.length < totalCount;

    return { videos, totalCount, hasMore };
  }

  async getVideosByFolderPaginated(
    folderName: string,
    sortBy: string = 'creation_date_desc',
    page: number = 1,
    pageSize: number = 20
  ): Promise<{ videos: VideoStoreEntry[]; totalCount: number; hasMore: boolean }> {
    await this.initialize();
    if (!this.db) return { videos: [], totalCount: 0, hasMore: false };

    let orderBy = 'creation_date DESC';
    switch (sortBy) {
      case 'creation_date_desc':
        orderBy = 'creation_date DESC';
        break;
      case 'creation_date_asc':
        orderBy = 'creation_date ASC';
        break;
      case 'modified_date_desc':
        orderBy = 'modified_date DESC';
        break;
      case 'modified_date_asc':
        orderBy = 'modified_date ASC';
        break;
      case 'name_asc':
        orderBy = 'file_name ASC';
        break;
      case 'name_desc':
        orderBy = 'file_name DESC';
        break;
      case 'size_desc':
        orderBy = 'file_size DESC';
        break;
      case 'size_asc':
        orderBy = 'file_size ASC';
        break;
    }

    const offset = (page - 1) * pageSize;
    
    // Get total count for this folder
    const countResult = await this.db.select(
      'SELECT COUNT(*) as count FROM videos WHERE folder_name = ?',
      [folderName]
    ) as { count: number }[];
    const totalCount = countResult[0]?.count || 0;
    
    // Get paginated results for this folder
    const result = await this.db.select(
      `SELECT * FROM videos WHERE folder_name = ? ORDER BY ${orderBy} LIMIT ? OFFSET ?`,
      [folderName, pageSize, offset]
    ) as VideoStoreEntry[];

    const videos = result.map((row: any) => this.mapRowToEntry(row));
    const hasMore = offset + videos.length < totalCount;

    return { videos, totalCount, hasMore };
  }

  private mapRowToEntry(row: any): VideoStoreEntry {
    return {
      id: row.id,
      folder_name: row.folder_name,
      full_path: row.full_path,
      file_name: row.file_name,
      file_size: row.file_size,
      creation_date: row.creation_date,
      modified_date: row.modified_date,
      duration: row.duration,
      width: row.width,
      height: row.height,
      fps: row.fps,
      codec: row.codec,
      thumbnail_path: row.thumbnail_path,
      indexed_at: row.indexed_at,
      blobUrl: row.blobUrl,
      isPreloaded: row.isPreloaded === 1
    };
  }

  // Convert VideoStoreEntry to VideoMetadata for compatibility
  toVideoMetadata(entry: VideoStoreEntry): VideoMetadata {
    return {
      id: entry.id,
      folder_name: entry.folder_name,
      full_path: entry.full_path,
      file_name: entry.file_name,
      file_size: entry.file_size,
      creation_date: (entry.creation_date * 1000).toString(), // Convert to milliseconds
      modified_date: (entry.modified_date * 1000).toString(), // Convert to milliseconds
      duration: entry.duration,
      width: entry.width,
      height: entry.height,
      fps: entry.fps,
      codec: entry.codec,
      thumbnail_path: entry.thumbnail_path,
      blobUrl: entry.blobUrl,
      isPreloaded: entry.isPreloaded
    };
  }

  // Convert VideoMetadata to VideoStoreEntry
  fromVideoMetadata(metadata: VideoMetadata): VideoStoreEntry {
    return {
      id: metadata.id,
      folder_name: metadata.folder_name,
      full_path: metadata.full_path,
      file_name: metadata.file_name,
      file_size: metadata.file_size,
      creation_date: Math.floor(parseInt(metadata.creation_date) / 1000), // Convert from milliseconds
      modified_date: Math.floor(parseInt(metadata.modified_date) / 1000), // Convert from milliseconds
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
      codec: metadata.codec,
      thumbnail_path: metadata.thumbnail_path,
      blobUrl: metadata.blobUrl,
      isPreloaded: metadata.isPreloaded,
      indexed_at: Math.floor(Date.now() / 1000)
    };
  }

  async getVideoByPath(fullPath: string): Promise<VideoStoreEntry | null> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }
    
    try {
      const result = await this.db.select<VideoStoreEntry[]>(
        'SELECT * FROM videos WHERE full_path = ?',
        [fullPath]
      );
      
      return result.length > 0 ? result[0] : null;
    } catch (error) {
      console.error('Failed to get video by path:', error);
      return null;
    }
  }
}

export const videoStore = VideoStore.getInstance();
