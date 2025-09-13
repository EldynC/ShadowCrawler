import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import VideoContainer from "../components/viewer/VideoContainer";
import { VideoMetadata } from "../types/video";
import { useOnboardingStore } from "../utils/onboarding";
import Toolbar, { GroupByOption, SortByOption } from "../components/toolbar";

function Viewer() {
    const [videos, setVideos] = useState<VideoMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [preloadingProgress, setPreloadingProgress] = useState(0);
    const [groupBy, setGroupBy] = useState<GroupByOption>("none");
    const [sortBy, setSortBy] = useState<SortByOption>("creation_date_desc");
    const {directoryPath} = useOnboardingStore();

    const crawlDirectory = async (directoryPath: string) => {
        setLoading(true);
        setError(null);
        
        try {
            const result = await invoke<VideoMetadata[]>("crawl_directory", { 
                path: directoryPath 
            });
            setVideos(result);
            
            // Start preloading videos in the background
            preloadVideos(result);
        } catch (err) {
            setError(err as string);
        } finally {
            setLoading(false);
        }
    };

    const preloadVideos = async (videos: VideoMetadata[]) => {
        const batchSize = 2; // Load 2 videos at a time
        
        for (let i = 0; i < videos.length; i += batchSize) {
            const batch = videos.slice(i, i + batchSize);
            
            await Promise.allSettled(
                batch.map(async (video, index) => {
                    try {
                        console.log(`Preloading video ${i + index + 1}/${videos.length}: ${video.file_name}`);
                        const videoData = await invoke<number[]>("get_video_data", {
                            videoPath: video.full_path
                        });
                        
                        const blob = new Blob([new Uint8Array(videoData)], { type: 'video/mp4' });
                        const blobUrl = URL.createObjectURL(blob);
                        
                        // Update the video with the blob URL
                        setVideos(prev => prev.map(v => 
                            v.id === video.id 
                                ? { ...v, blobUrl, isPreloaded: true }
                                : v
                        ));
                        
                        setPreloadingProgress(Math.round(((i + index + 1) / videos.length) * 100));
                    } catch (error) {
                        console.error(`Failed to preload video ${video.file_name}:`, error);
                    }
                })
            );
            
            // Small delay between batches
            if (i + batchSize < videos.length) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
        
        console.log("Video preloading completed!");
    };

    // Sort and group videos based on toolbar inputs
    const processedVideos = useMemo(() => {
        let sortedVideos = [...videos];

        // Sort videos
        sortedVideos.sort((a, b) => {
            switch (sortBy) {
                case "creation_date_desc":
                    const dateA_desc = new Date(parseInt(a.creation_date)).getTime();
                    const dateB_desc = new Date(parseInt(b.creation_date)).getTime();
                    return dateB_desc - dateA_desc; // Newest first
                case "creation_date_asc":
                    const dateA_asc = new Date(parseInt(a.creation_date)).getTime();
                    const dateB_asc = new Date(parseInt(b.creation_date)).getTime();
                    return dateA_asc - dateB_asc; // Oldest first
                case "name_asc":
                    return a.file_name.localeCompare(b.file_name);
                case "name_desc":
                    return b.file_name.localeCompare(a.file_name);
                default:
                    return 0;
            }
        });

        // Group videos
        if (groupBy === "folder") {
            const grouped = sortedVideos.reduce((groups, video) => {
                const folder = video.folder_name;
                if (!groups[folder]) {
                    groups[folder] = [];
                }
                groups[folder].push(video);
                return groups;
            }, {} as Record<string, VideoMetadata[]>);

            return Object.entries(grouped).map(([folderName, videos]) => ({
                groupName: folderName,
                videos
            }));
        } else if (groupBy === "month") {
            const grouped = sortedVideos.reduce((groups, video) => {
                const date = new Date(parseInt(video.creation_date));
                const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
                const monthName = date.toLocaleDateString('en-US', { 
                    year: 'numeric', 
                    month: 'long' 
                });
                
                if (!groups[monthKey]) {
                    groups[monthKey] = {
                        groupName: monthName,
                        videos: []
                    };
                }
                groups[monthKey].videos.push(video);
                return groups;
            }, {} as Record<string, { groupName: string; videos: VideoMetadata[] }>);

            return Object.values(grouped).sort((a, b) => {
                // Sort groups by month (newest first)
                const dateA = new Date(a.groupName);
                const dateB = new Date(b.groupName);
                return dateB.getTime() - dateA.getTime();
            });
        } else {
            // No grouping - show all videos in a single group
            return [{
                groupName: "All Videos",
                videos: sortedVideos
            }];
        }
    }, [videos, groupBy, sortBy]);

    // Load videos when component mounts
    useEffect(() => {
        crawlDirectory(directoryPath || "");
    }, []);

    return (
        <main className="h-screen flex flex-col border-0 border-red-500">
            <nav className="flex gap-4 p-4 border-b border-gray-300">
                <Toolbar
                    groupBy={groupBy}
                    setGroupBy={setGroupBy}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                />
                {preloadingProgress > 0 && preloadingProgress < 100 && (
                    <div className="flex items-center gap-2">
                        <div className="text-sm">Preloading videos...</div>
                        <div className="w-32 bg-gray-200 rounded-full h-2">
                            <div 
                                className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${preloadingProgress}%` }}
                            ></div>
                        </div>
                        <div className="text-sm">{preloadingProgress}%</div>
                    </div>
                )}
            </nav>
            <div className="flex-1 p-4 overflow-auto">
                {loading && <div>Loading videos...</div>}
                {error && <div className="text-red-500">Error: {error}</div>}
                {processedVideos.length > 0 && (
                    <div className="space-y-8">
                        {processedVideos.map((group) => (
                            <div key={group.groupName}>
                                <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                                    {group.groupName}
                                </h2>
                                <VideoContainer videos={group.videos} />
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </main>
    );
}

export default Viewer;