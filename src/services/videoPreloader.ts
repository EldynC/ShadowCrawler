import { invoke } from "@tauri-apps/api/core";
import { VideoMetadata } from "../types/video";

class VideoPreloader {
  private preloadedVideos = new Map<string, string>(); // videoId -> blobUrl
  private preloadingVideos = new Set<string>(); // videoIds currently being preloaded

  async preloadVideo(video: VideoMetadata): Promise<string | null> {
    // Return existing blob URL if already preloaded
    if (this.preloadedVideos.has(video.id)) {
      return this.preloadedVideos.get(video.id)!;
    }

    // Return null if currently preloading
    if (this.preloadingVideos.has(video.id)) {
      return null;
    }

    this.preloadingVideos.add(video.id);

    try {
      console.log(`Preloading video: ${video.file_name}`);
      const videoData = await invoke<number[]>("get_video_data", {
        videoPath: video.full_path
      });
      
      const blob = new Blob([new Uint8Array(videoData)], { type: 'video/mp4' });
      const blobUrl = URL.createObjectURL(blob);
      
      this.preloadedVideos.set(video.id, blobUrl);
      console.log(`Preloaded video: ${video.file_name}`);
      
      return blobUrl;
    } catch (error) {
      console.error(`Failed to preload video ${video.file_name}:`, error);
      return null;
    } finally {
      this.preloadingVideos.delete(video.id);
    }
  }

  async preloadVideos(videos: VideoMetadata[]): Promise<void> {
    // Preload videos in batches to avoid overwhelming the system
    const batchSize = 2; // Adjust based on your system's capabilities
    
    for (let i = 0; i < videos.length; i += batchSize) {
      const batch = videos.slice(i, i + batchSize);
      await Promise.allSettled(
        batch.map(video => this.preloadVideo(video))
      );
      
      // Small delay between batches to prevent UI freezing
      if (i + batchSize < videos.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  getPreloadedUrl(videoId: string): string | null {
    return this.preloadedVideos.get(videoId) || null;
  }

  isPreloaded(videoId: string): boolean {
    return this.preloadedVideos.has(videoId);
  }

  isPreloading(videoId: string): boolean {
    return this.preloadingVideos.has(videoId);
  }

  cleanup() {
    // Clean up all blob URLs to prevent memory leaks
    for (const [ blobUrl] of this.preloadedVideos) {
      URL.revokeObjectURL(blobUrl);
    }
    this.preloadedVideos.clear();
    this.preloadingVideos.clear();
  }

  // Clean up specific video
  cleanupVideo(videoId: string) {
    const blobUrl = this.preloadedVideos.get(videoId);
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl);
      this.preloadedVideos.delete(videoId);
    }
  }
}

export const videoPreloader = new VideoPreloader();
