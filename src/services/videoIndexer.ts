import { readDir, readFile, writeFile, exists, mkdir, FileInfo } from '@tauri-apps/plugin-fs';
import { Command } from '@tauri-apps/plugin-shell';
import { join, extname, basename, dirname } from '@tauri-apps/api/path';
import { videoStore } from './videoStore';

export interface StorageStats {
  totalFiles: number;
  totalSize: number;
  videoFiles: number;
  videoSize: number;
  lastUpdated: number;
  directoryPath: string;
}

export interface StorageProgress {
  currentPath: string;
  filesProcessed: number;
  totalSize: number;
  isComplete: boolean;
}

export interface VideoIndexEntry {
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
}

export interface IndexingProgress {
  indexedCount: number;
  currentFile?: string;
  isComplete: boolean;
}

export class VideoIndexer {
  private static instance: VideoIndexer;
  private videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv', '.m4v', '.mpg', '.mpeg', '.3gp', '.ogv'];
  private progressCallback?: (progress: IndexingProgress) => void;
  private storageProgressCallback?: (progress: StorageProgress) => void;
  
  // Files to skip completely
  private filesToSkip = new Set([
    '.DS_Store',
    'Thumbs.db',
    'desktop.ini',
    '.Spotlight-V100',
    '.Trashes',
    '.fseventsd',
    '.TemporaryItems',
    '.VolumeIcon.icns',
    '.apdisk',
    '.localized',
    '.metadata_never_index',
    '.parentlock',
    '.symlinks',
    '.VolumeIcon.ico',
    'ehthumbs.db',
    'ehthumbs_vista.db',
    'Folder.jpg',
    'Folder.gif',
    'Folder.png',
    'desktop.ini',
    'Thumbs.db:encryptable'
  ]);

  static getInstance(): VideoIndexer {
    if (!VideoIndexer.instance) {
      VideoIndexer.instance = new VideoIndexer();
    }
    return VideoIndexer.instance;
  }

  setProgressCallback(callback: (progress: IndexingProgress) => void) {
    this.progressCallback = callback;
  }

  setStorageProgressCallback(callback: (progress: StorageProgress) => void) {
    this.storageProgressCallback = callback;
  }

  private emitProgress(indexedCount: number, currentFile?: string, isComplete = false) {
    if (this.progressCallback) {
      this.progressCallback({
        indexedCount,
        currentFile,
        isComplete
      });
    }
  }

  private emitStorageProgress(currentPath: string, filesProcessed: number, totalSize: number, isComplete = false) {
    if (this.storageProgressCallback) {
      this.storageProgressCallback({
        currentPath,
        filesProcessed,
        totalSize,
        isComplete
      });
    }
  }

  async indexDirectory(directoryPath: string): Promise<number> {
    // Initialize database instead of JSON file
    await videoStore.initialize();
    
    let indexedCount = 0;
    
    console.log('Starting to index directory:', directoryPath);
    
    try {
      const entries = await readDir(directoryPath);
      console.log('Found entries:', entries.length);
      
      for (const entry of entries) {
        console.log('Processing entry:', entry.name, 'isFile:', entry.isFile);
        
        if (entry.isFile) {
          const isVideo = await this.isVideoFile(entry.name);
          console.log('Is video file:', isVideo, 'for:', entry.name);
          
          if (isVideo) {
            const fullPath = await join(directoryPath, entry.name);
            console.log('Processing video file:', fullPath);
            
            // Check if already indexed in database
            const existingEntry = await videoStore.getVideoByPath(fullPath);
            if (existingEntry) {
              const stats = await this.getFileStats(fullPath);
              if (stats.mtime === existingEntry.modified_date) {
                continue; // Skip if not modified
              }
            }
            
            try {
              console.log('Extracting metadata for:', fullPath);
              const videoData = await this.extractVideoMetadata(fullPath);
              if (videoData) {
                console.log('Successfully extracted metadata:', videoData);
                
                // Get actual file stats for creation/modification dates
                const stats = await this.getFileStats(fullPath);
                
                const indexEntry: VideoIndexEntry = {
                  id: this.generateId(entry.name, await dirname(fullPath)),
                  folder_name: await basename(await dirname(fullPath)),
                  full_path: fullPath,
                  file_name: entry.name,
                  file_size: 0,
                  creation_date: stats.ctime,  // Use actual creation time
                  modified_date: stats.mtime,  // Use actual modification time
                  duration: videoData.duration,
                  width: videoData.width,
                  height: videoData.height,
                  fps: videoData.fps,
                  codec: videoData.codec,
                  thumbnail_path: videoData.thumbnail_path,
                  indexed_at: Math.floor(Date.now() / 1000)
                };
                
                // Save directly to database
                await videoStore.addVideo(indexEntry);
                indexedCount++;
                console.log('Successfully indexed file:', entry.name);
              } else {
                console.log('Failed to extract metadata for:', fullPath);
              }
            } catch (error) {
              console.error(`Failed to process ${fullPath}:`, error);
            }
          } else {
            console.log('Skipping non-video file:', entry.name);
          }
        } else {
          // It's a directory - recursively index it
          console.log('Found subdirectory:', entry.name, '- indexing recursively');
          try {
            const subDirPath = await join(directoryPath, entry.name);
            const subDirCount = await this.indexDirectory(subDirPath);
            indexedCount += subDirCount;
            console.log(`Indexed ${subDirCount} videos from subdirectory:`, entry.name);
          } catch (error) {
            console.error(`Failed to index subdirectory ${entry.name}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Failed to index directory:', error);
      throw error;
    }
    
    console.log('Indexing complete. Indexed', indexedCount, 'files');
    return indexedCount;
  }

  async indexDirectoryWithThreading(directoryPath: string, maxConcurrent = 4): Promise<number> {
    await videoStore.initialize();
    
    console.log(`🚀 Starting threaded indexing with ${maxConcurrent} concurrent workers`);
    
    try {
      const entries = await readDir(directoryPath);
      const directories = entries.filter(entry => !entry.isFile);
      const files = entries.filter(entry => entry.isFile);
      
      let totalIndexedCount = 0;
      
      // Process files in root directory first (if any)
      if (files.length > 0) {
        console.log(`�� Processing ${files.length} files in root directory`);
        const rootFilesCount = await this.processFilesInDirectory(directoryPath, files, "ROOT");
        totalIndexedCount += rootFilesCount;
        console.log(`✅ Root directory complete: ${rootFilesCount} videos indexed`);
      }
      
      // Emit progress after root files
      this.emitProgress(totalIndexedCount);
      
      // Distribute directories across threads - each thread gets multiple folders
      if (directories.length > 0) {
        console.log(`📦 Distributing ${directories.length} folders across ${maxConcurrent} threads`);
        
        // Create thread groups - each thread gets a subset of folders
        const threadGroups = this.createThreadGroups(directories, maxConcurrent);
        
        const threadPromises = threadGroups.map(async (folderGroup, threadIndex) => {
          const threadId = `Thread-${threadIndex + 1}`;
          let threadTotalCount = 0;
          
          try {
            console.log(`🧵 ${threadId}: Starting with ${folderGroup.length} folders`);
            
            // Each thread processes its assigned folders sequentially
            for (let folderIndex = 0; folderIndex < folderGroup.length; folderIndex++) {
              const folder = folderGroup[folderIndex];
              const subDirPath = await join(directoryPath, folder.name);
              
              console.log(`🧵 ${threadId}: Processing folder ${folderIndex + 1}/${folderGroup.length} - "${folder.name}"`);
              
              const folderCount = await this.indexDirectoryRecursive(subDirPath, threadId);
              threadTotalCount += folderCount;
              
              console.log(`✅ ${threadId}: Completed "${folder.name}" - ${folderCount} videos indexed (Thread total: ${threadTotalCount})`);
              
              // Emit progress after each folder
              this.emitProgress(totalIndexedCount + threadTotalCount);
            }
            
            console.log(`🎉 ${threadId}: All folders complete - ${threadTotalCount} videos indexed`);
            return threadTotalCount;
          } catch (error) {
            console.error(`❌ ${threadId}: Failed:`, error);
            return 0;
          }
        });
        
        const threadCounts = await Promise.all(threadPromises);
        totalIndexedCount += threadCounts.reduce((sum, count) => sum + count, 0);
        
        console.log(`✅ All threads complete: ${totalIndexedCount} videos indexed`);
      }
      
      // Emit final progress
      this.emitProgress(totalIndexedCount, undefined, true);
      console.log(`�� Threading complete! Total videos indexed: ${totalIndexedCount}`);
      
      return totalIndexedCount;
    } catch (error) {
      console.error('❌ Failed to index directory with threading:', error);
      throw error;
    }
  }



  private createThreadGroups<T>(items: T[], threadCount: number): T[][] {
    const groups: T[][] = Array.from({ length: threadCount }, () => []);
    
    // Simple round-robin distribution
    items.forEach((item, index) => {
      const threadIndex = index % threadCount;
      groups[threadIndex].push(item);
    });
    
    // Log distribution
    groups.forEach((group, index) => {
      if (group.length > 0) {
        console.log(`�� Thread-${index + 1} assigned ${group.length} folders`);
      }
    });
    
    return groups;
  }

  // Alternative: Load-balanced distribution (if you want to implement it later)


  private async processFilesInDirectory(
    directoryPath: string, 
    files: any[],
    threadId: string = "MAIN"
  ): Promise<number> {
    let indexedCount = 0;
    let processedCount = 0;
    
    console.log(`🧵 ${threadId}: Processing ${files.length} files`);
    
    for (const file of files) {
      processedCount++;
      
      if (await this.isVideoFile(file.name)) {
        const fullPath = await join(directoryPath, file.name);
        
        // Check if already indexed
        const existingEntry = await videoStore.getVideoByPath(fullPath);
        if (existingEntry) {
          const stats = await this.getFileStats(fullPath);
          if (stats.mtime === existingEntry.modified_date) {
            continue; // Skip if not modified
          }
        }
        
        try {
          const videoData = await this.extractVideoMetadata(fullPath);
          if (videoData) {
            // Get actual file stats for creation/modification dates
            const stats = await this.getFileStats(fullPath);
            
            const indexEntry: VideoIndexEntry = {
              id: this.generateId(file.name, await dirname(fullPath)),
              folder_name: await basename(await dirname(fullPath)),
              full_path: fullPath,
              file_name: file.name,
              file_size: stats.size,
              creation_date: stats.ctime,
              modified_date: stats.mtime,
              duration: videoData.duration,
              width: videoData.width,
              height: videoData.height,
              fps: videoData.fps,
              codec: videoData.codec,
              thumbnail_path: videoData.thumbnail_path,
              indexed_at: Math.floor(Date.now() / 1000)
            };
            
            await videoStore.addVideo(indexEntry);
            indexedCount++;
            
            // Emit progress after successful indexing
            this.emitProgress(indexedCount, file.name);
            
            // Log progress every 10 files
            if (indexedCount % 10 === 0) {
              console.log(`🧵 ${threadId}: ${indexedCount} videos indexed (${processedCount}/${files.length} files processed)`);
            }
          }
        } catch (error) {
          console.error(`❌ ${threadId}: Failed to process ${file.name}:`, error);
        }
      }
      
      // Log file processing progress every 50 files
      if (processedCount % 50 === 0) {
        console.log(`🧵 ${threadId}: Processed ${processedCount}/${files.length} files`);
      }
    }
    
    console.log(`✅ ${threadId}: Directory complete - ${indexedCount} videos indexed from ${processedCount} files`);
    return indexedCount;
  }

  private async indexDirectoryRecursive(directoryPath: string, threadId: string = "RECURSIVE"): Promise<number> {
    let indexedCount = 0;
    
    try {
      const entries = await readDir(directoryPath);
      const files = entries.filter(entry => entry.isFile);
      const subdirs = entries.filter(entry => !entry.isFile);
      
      // Process files in current directory
      if (files.length > 0) {
        const fileCount = await this.processFilesInDirectory(directoryPath, files, threadId);
        indexedCount += fileCount;
      }
      
      // Process subdirectories
      for (const entry of subdirs) {
        const subDirPath = await join(directoryPath, entry.name);
        const subDirCount = await this.indexDirectoryRecursive(subDirPath, threadId);
        indexedCount += subDirCount;
      }
      
    } catch (error) {
      console.error(`❌ ${threadId}: Failed to index directory recursively:`, error);
    }
    
    return indexedCount;
  }

  private async isVideoFile(filename: string): Promise<boolean> {
    // Check if file should be skipped
    if (this.filesToSkip.has(filename)) {
      // console.log('Skipping system file:', filename); // Commented out - too verbose
      return false;
    }
    
    const ext = (await extname(filename)).toLowerCase();
    // console.log('Checking file extension:', ext, 'for file:', filename); // Commented out - too verbose
    
    // If no extension, it's not a video file
    if (!ext) {
      // console.log('No extension found, skipping:', filename); // Commented out - too verbose
      return false;
    }
    
    // Add the dot to match the videoExtensions array
    const extWithDot = `.${ext}`;
    const isVideo = this.videoExtensions.includes(extWithDot);
    // console.log('Extension with dot:', extWithDot, 'Is video file:', isVideo); // Commented out - too verbose
    return isVideo;
  }

  private async getFileStats(filePath: string): Promise<{ mtime: number; ctime: number; size: number }> {
    try {
      // Get file metadata using Tauri's file system API
      const { stat } = await import('@tauri-apps/plugin-fs');
      const fileStats: FileInfo = await stat(filePath);
      
      return {
        mtime: Math.floor((fileStats.mtime?.getTime() || Date.now()) / 1000),
        ctime: Math.floor((fileStats.birthtime?.getTime() || Date.now()) / 1000),
        size: fileStats.size
      };
    } catch (error) {
      console.warn('Failed to get file stats, using fallback:', error);
      
      // Fallback: try to get creation time from video metadata using ffprobe
      try {
        const command = Command.create('ffprobe', [
          '-v', 'quiet',
          '-print_format', 'json',
          '-show_entries', 'format_tags=creation_time',
          filePath
        ]);
        
        const result = await command.execute();
        
        if (result.code === 0) {
          const data = JSON.parse(result.stdout);
          const creationTime = data.format?.tags?.creation_time;
          
          if (creationTime) {
            const creationTimestamp = Math.floor(new Date(creationTime).getTime() / 1000);
            return { 
              mtime: creationTimestamp, 
              ctime: creationTimestamp,
              size: 0
            };
          }
        }
      } catch (ffprobeError) {
        console.warn('Failed to get creation time from ffprobe:', ffprobeError);
      }
      
      // Ultimate fallback
      const now = Math.floor(Date.now() / 1000);
      return { 
        mtime: now, 
        ctime: now,
        size: 0
      };
    }
  }

  private async extractVideoMetadata(filePath: string): Promise<{
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    codec?: string;
    thumbnail_path?: string;
  } | null> {
    try {
      // console.log('Attempting to extract metadata for:', filePath); // Commented out - too verbose
      
      // First, let's test if ffprobe is accessible
      const testCommand = Command.create('ffprobe', ['-version']);
      // console.log('Testing ffprobe availability...'); // Commented out - too verbose
      const testResult = await testCommand.execute();
      // console.log('ffprobe test result:', testResult); // Commented out - too verbose
      
      if (testResult.code !== 0) {
        console.error('❌ ffprobe is not accessible:', testResult.stderr);
        return null;
      }
      
      // Extract video metadata using ffprobe
      const command = Command.create('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        filePath
      ]);
      
      // console.log('Executing ffprobe command for:', filePath); // Commented out - too verbose
      const result = await command.execute();
      // console.log('ffprobe result:', result); // Commented out - too verbose
      
      if (result.code !== 0) {
        console.error('❌ ffprobe failed with code:', result.code);
        console.error('❌ stderr:', result.stderr);
        throw new Error('ffprobe failed');
      }
      
      const data = JSON.parse(result.stdout);
      const videoStream = data.streams?.find((s: any) => s.codec_type === 'video');
      
      if (!videoStream) {
        return null;
      }
      
      const metadata = {
        duration: parseFloat(data.format?.duration) || undefined,
        width: videoStream.width || undefined,
        height: videoStream.height || undefined,
        fps: this.parseFps(videoStream.r_frame_rate),
        codec: videoStream.codec_name || undefined,
        thumbnail_path: await this.generateThumbnail(filePath)
      };
      
      return metadata;
    } catch (error) {
      console.error('❌ Failed to extract video metadata:', error);
      return null;
    }
  }

  private parseFps(fpsStr: string): number | undefined {
    if (!fpsStr || fpsStr === '0/0') return undefined;
    
    const [num, den] = fpsStr.split('/').map(Number);
    if (den && den !== 0) {
      return num / den;
    }
    return undefined;
  }

  private async generateThumbnail(filePath: string): Promise<string | undefined> {
    try {
      // console.log('Generating thumbnail for:', filePath); // Commented out - too verbose
      
      const { appDataDir } = await import('@tauri-apps/api/path');
      const appDir = await appDataDir();
      const thumbnailsDir = await join(appDir, 'shadowcrawler', 'thumbnails');
      
      // console.log('Thumbnails directory:', thumbnailsDir); // Commented out - too verbose
      
      if (!(await exists(thumbnailsDir))) {
        // console.log('Creating thumbnails directory'); // Commented out - too verbose
        await mkdir(thumbnailsDir, { recursive: true });
      }
      
      const fileExtension = await extname(filePath);
      // console.log('File extension:', fileExtension); // Commented out - too verbose
      
      // Handle files without extensions safely
      let baseFileName: string;
      try {
        if (fileExtension) {
          baseFileName = await basename(filePath, fileExtension);
        } else {
          // For files without extensions, use the full filename
          baseFileName = await basename(filePath);
        }
      } catch (error) {
        console.error('❌ Error getting basename for:', filePath, error);
        // Fallback: use a hash of the file path
        baseFileName = `file_${filePath.split('\\').join('_').split('/').join('_')}`;
      }
      
      // console.log('Base file name:', baseFileName); // Commented out - too verbose
      
      const thumbnailName = `${baseFileName}.jpg`;
      const thumbnailPath = await join(thumbnailsDir, thumbnailName);
      
      // console.log('Thumbnail path:', thumbnailPath); // Commented out - too verbose
      
      // Generate thumbnail using ffmpeg
      const command = Command.create('ffmpeg', [
        '-i', filePath,
        '-ss', '10', // Seek to 10 seconds
        '-vframes', '1',
        '-s', '320x180',
        '-y', // Overwrite
        thumbnailPath
      ]);
      
      // console.log('Running ffmpeg command for thumbnail generation'); // Commented out - too verbose
      const result = await command.execute();
      
      if (result.code === 0) {
        // console.log('Thumbnail generated successfully:', thumbnailPath); // Commented out - too verbose
        return thumbnailPath;
      } else {
        console.error('❌ ffmpeg failed with code:', result.code, 'stderr:', result.stderr);
      }
    } catch (error) {
      console.error('❌ Failed to generate thumbnail:', error);
    }
    
    return undefined;
  }

  private generateId(fileName: string, folderPath: string): string {
    return `${basename(folderPath)}_${fileName}`.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  async getVideos(sortBy: string = 'creation_date_desc'): Promise<VideoIndexEntry[]> {
    const videos = await videoStore.getVideosSorted(sortBy);
    return videos;
  }

  async getVideosByFolder(folderName: string): Promise<VideoIndexEntry[]> {
    const videos = await videoStore.getVideosByFolder(folderName);
    return videos;
  }

  async getFolders(): Promise<string[]> {
    return await videoStore.getFolders();
  }

  async clearIndex(): Promise<void> {
    await videoStore.clearVideos();
  }

  async analyzeStorage(directoryPath: string): Promise<StorageStats> {
    console.log(`📊 Starting storage analysis for: ${directoryPath}`);
    
    const stats: StorageStats = {
      totalFiles: 0,
      totalSize: 0,
      videoFiles: 0,
      videoSize: 0,
      lastUpdated: Date.now(),
      directoryPath
    };

    try {
      await this.analyzeDirectoryRecursive(directoryPath, stats);
      
      // Cache the results
      await this.cacheStorageStats(directoryPath, stats);
      
      console.log(`✅ Storage analysis complete:`);
      console.log(`   📁 Total files: ${stats.totalFiles.toLocaleString()}`);
      console.log(`   💾 Total size: ${this.formatBytes(stats.totalSize)}`);
      console.log(`   🎥 Video files: ${stats.videoFiles.toLocaleString()}`);
      console.log(`   🎬 Video size: ${this.formatBytes(stats.videoSize)}`);
      
      this.emitStorageProgress(directoryPath, stats.totalFiles, stats.totalSize, true);
      
      return stats;
    } catch (error) {
      console.error('❌ Storage analysis failed:', error);
      throw error;
    }
  }

  private async analyzeDirectoryRecursive(directoryPath: string, stats: StorageStats): Promise<void> {
    try {
      const entries = await readDir(directoryPath);
      let filesProcessed = 0;
      
      for (const entry of entries) {
        if (entry.isFile) {
          const fullPath = await join(directoryPath, entry.name);
          
          // Skip system files
          if (this.filesToSkip.has(entry.name)) {
            continue;
          }
          
          try {
            // Get file size using ffprobe or fallback method
            const fileSize = await this.getFileSize(fullPath);
            stats.totalFiles++;
            stats.totalSize += fileSize;
            
            // Check if it's a video file
            if (await this.isVideoFile(entry.name)) {
              stats.videoFiles++;
              stats.videoSize += fileSize;
            }
            
            filesProcessed++;
            
            // Emit progress every 100 files
            if (filesProcessed % 100 === 0) {
              this.emitStorageProgress(fullPath, filesProcessed, stats.totalSize);
            }
            
          } catch (error) {
            console.warn(`⚠️ Could not analyze file: ${fullPath}`, error);
          }
        } else {
          // Recursively analyze subdirectories
          await this.analyzeDirectoryRecursive(await join(directoryPath, entry.name), stats);
        }
      }
    } catch (error) {
      console.error(`❌ Failed to analyze directory: ${directoryPath}`, error);
    }
  }

  private async getFileSize(filePath: string): Promise<number> {
    try {
      // Try to get file size using ffprobe first (for video files)
      const command = Command.create('ffprobe', [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        filePath
      ]);
      
      const result = await command.execute();
      
      if (result.code === 0) {
        const data = JSON.parse(result.stdout);
        const size = parseInt(data.format?.size);
        if (size && size > 0) {
          return size;
        }
      }
    } catch (error) {
      // Fallback: try to read file to get size
      try {
        const fileData = await readFile(filePath);
        return fileData.length;
      } catch (readError) {
        console.warn(`Could not get size for: ${filePath}`);
        return 0;
      }
    }
    
    return 0;
  }

  private async cacheStorageStats(directoryPath: string, stats: StorageStats): Promise<void> {
    try {
      const { appDataDir } = await import('@tauri-apps/api/path');
      const appDir = await appDataDir();
      const cacheDir = await join(appDir, 'shadowcrawler', 'cache');
      const cacheFile = await join(cacheDir, 'storage_stats.json');
      
      // Create cache directory if it doesn't exist
      if (!(await exists(cacheDir))) {
        await mkdir(cacheDir, { recursive: true });
      }
      
      // Read existing cache
      let cachedStats: Record<string, StorageStats> = {};
      if (await exists(cacheFile)) {
        try {
          const cacheData = await readFile(cacheFile);
          cachedStats = JSON.parse(new TextDecoder().decode(cacheData));
        } catch (error) {
          console.warn('Failed to read cache file, creating new one');
        }
      }
      
      // Update cache with new stats
      cachedStats[directoryPath] = stats;
      
      // Write updated cache
      await writeFile(cacheFile, new TextEncoder().encode(JSON.stringify(cachedStats, null, 2)));
      console.log(`💾 Storage stats cached for: ${directoryPath}`);
    } catch (error) {
      console.error('Failed to cache storage stats:', error);
    }
  }

  async getCachedStorageStats(directoryPath: string): Promise<StorageStats | null> {
    try {
      const { appDataDir } = await import('@tauri-apps/api/path');
      const appDir = await appDataDir();
      const cacheFile = await join(appDir, 'shadowcrawler', 'cache', 'storage_stats.json');
      
      if (await exists(cacheFile)) {
        const cacheData = await readFile(cacheFile);
        const cachedStats: Record<string, StorageStats> = JSON.parse(new TextDecoder().decode(cacheData));
        
        const stats = cachedStats[directoryPath];
        if (stats) {
          // Check if cache is recent (less than 24 hours old)
          const cacheAge = Date.now() - stats.lastUpdated;
          const maxAge = 24 * 60 * 60 * 1000; // 24 hours
          
          if (cacheAge < maxAge) {
            console.log(`📊 Using cached storage stats (${Math.round(cacheAge / (60 * 60 * 1000))} hours old)`);
            return stats;
          } else {
            console.log(`📊 Cache expired (${Math.round(cacheAge / (60 * 60 * 1000))} hours old)`);
          }
        }
      }
    } catch (error) {
      console.warn('Failed to read cached storage stats:', error);
    }
    
    return null;
  }

  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }
}

export const videoIndexer = VideoIndexer.getInstance();
