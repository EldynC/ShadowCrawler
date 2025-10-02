import { useState, useEffect, useMemo } from "react";
import VideoContainer from "../components/viewer/VideoContainer";
import { VideoMetadata } from "../types/video";
import { useOnboardingStore } from "../utils/onboarding";
import Toolbar, { GroupByOption, SortByOption } from "../components/toolbar";
import { StorageProgress, StorageStats, videoIndexer } from "../services/videoIndexer";
import { videoStore, VideoStoreEntry } from "../services/videoStore";
import { open } from '@tauri-apps/plugin-dialog';
// import { dependencyChecker } from "../services/dependencyChecker";

function Viewer() {
    const [videos, setVideos] = useState<VideoMetadata[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [groupBy, setGroupBy] = useState<GroupByOption>("none");
    const [sortBy, setSortBy] = useState<SortByOption>("creation_date_desc");
    const [indexing, setIndexing] = useState(false);
    const [indexedCount, setIndexedCount] = useState(0);
    const [currentIndexingFile, setCurrentIndexingFile] = useState<string>("");
    
    // Pagination state
    const [currentPage, setCurrentPage] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [hasMore, setHasMore] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const pageSize = 20;
    
    // Storage stats state
    const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
    const [analyzingStorage, setAnalyzingStorage] = useState(false);
    const [storageProgress, setStorageProgress] = useState<StorageProgress | null>(null);
    
    const {directoryPath, setDirectoryPath} = useOnboardingStore();
   // console.log("Directory path:", directoryPath);

    const initializeDatabase = async () => {
        try {
            await videoStore.initialize();
        } catch (err) {
            console.error("Failed to initialize database:", err);
        }
    };

    // const checkDependencies = async () => {
    //     try {
    //         const dependencies = await dependencyChecker.checkDependencies();
    //         const missingDeps = dependencies.filter(dep => !dep.isInstalled);
        
    //         if (missingDeps.length > 0) {
    //             console.warn('Missing dependencies:', missingDeps);
    //             // Could show a dialog to user about missing dependencies
    //         }
    //     } catch (err) {
    //         console.error("Failed to check dependencies:", err);
    //     }
    // };

    const indexDirectory = async (directoryPath: string) => {
        initializeDatabase();
        setIndexing(true);
        setError(null);
        setIndexedCount(0);
        setCurrentIndexingFile("");
        
        // Set up progress callback
        videoIndexer.setProgressCallback((progress) => {
            setIndexedCount(progress.indexedCount);
            setCurrentIndexingFile(progress.currentFile || "");
            
            // Load videos every 20 files for live updates
            if (progress.indexedCount > 0 && progress.indexedCount % 20 === 0) {
                loadVideosFromDatabase(1, false); // Load first page only
            }
            
            if (progress.isComplete) {
                setIndexing(false);
                setCurrentIndexingFile("");
                loadVideosFromDatabase(1, false); // Load first page
            }
        });
        
        try {
            // Use threaded indexing with 4 concurrent workers
            const count = await videoIndexer.indexDirectoryWithThreading(directoryPath, 6);
            console.log(`Indexed ${count} videos using threading`);
        } catch (err) {
            setError(err as string);
            setIndexing(false);
        }
    };

    const changeDirectory = async () => {
        try {
            const newPath = await open({ 
                directory: true,
                title: "Select Video Directory",
                // Add these options to show network drives
                multiple: false,
                defaultPath: "Z:\\" // Start at Z: drive
            });
            if (newPath) {
                setDirectoryPath(newPath);
                // Clear current videos and reset count when changing directory
                setVideos([]);
                setIndexedCount(0);
                setError(null);
            }
        } catch (err) {
            console.error("Failed to change directory:", err);
            setError("Failed to change directory");
        }
    };

    const loadVideosFromDatabase = async (page: number = 1, append: boolean = false) => {
        if (page === 1) {
            setLoading(true);
        } else {
            setLoadingMore(true);
        }
        setError(null);
        
        try {
            let result;
            if (groupBy === "folder") {
                // For folder grouping, we need to load all folders first
                const folders = await videoStore.getFolders();
                const allVideos: VideoMetadata[] = [];
                
                for (const folder of folders) {
                    const folderResult = await videoStore.getVideosByFolderPaginated(folder, sortBy, page, pageSize);
                    const folderVideos = folderResult.videos.map(entry => videoStore.toVideoMetadata(entry));
                    allVideos.push(...folderVideos);
                }
                
                result = { videos: allVideos, totalCount: allVideos.length, hasMore: false };
            } else {
                result = await videoStore.getVideosPaginated(sortBy, page, pageSize);
            }
            
            const videos = result.videos.map(entry => videoStore.toVideoMetadata(entry as VideoStoreEntry));
            
            if (append) {
                setVideos(prev => [...prev, ...videos]);
            } else {
                setVideos(videos);
            }
            
            setTotalCount(result.totalCount);
            setHasMore(result.hasMore);
            setCurrentPage(page);
        } catch (err) {
            setError(err as string);
        } finally {
            setLoading(false);
            setLoadingMore(false);
        }
    };

    const loadMoreVideos = async () => {
        if (!hasMore || loadingMore) return;
        await loadVideosFromDatabase(currentPage + 1, true);
    };

    const analyzeStorage = async () => {
        if (!directoryPath) return;
        
        setAnalyzingStorage(true);
        setError(null);
        
        // Set up storage progress callback
        videoIndexer.setStorageProgressCallback((progress) => {
            setStorageProgress(progress);
            
            if (progress.isComplete) {
                setAnalyzingStorage(false);
                setStorageProgress(null);
            }
        });
        
        try {
            const stats = await videoIndexer.analyzeStorage(directoryPath);
            setStorageStats(stats);
        } catch (err) {
            setError(err as string);
            setAnalyzingStorage(false);
        }
    };

    const loadCachedStorageStats = async () => {
        if (!directoryPath) return;
        
        try {
            const cachedStats = await videoIndexer.getCachedStorageStats(directoryPath);
            if (cachedStats) {
                setStorageStats(cachedStats);
            }
        } catch (err) {
            console.warn('Failed to load cached storage stats:', err);
        }
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

            return Object.values(grouped).sort((a: { groupName: string; videos: VideoMetadata[] }, b: { groupName: string; videos: VideoMetadata[] }) => {
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

    // Load videos when component mounts or when sort/group changes
    useEffect(() => {
        if (directoryPath) {
            initializeDatabase().then(() => {
                loadVideosFromDatabase();
            });
        }
    }, [directoryPath, sortBy, groupBy]);

    // Load cached stats when directory changes
    useEffect(() => {
        if (directoryPath) {
            loadCachedStorageStats();
        }
    }, [directoryPath]);

    return (
        <main className="h-screen flex flex-col border-0 border-red-500">
            <nav className="flex gap-4 p-4 border-b border-gray-300">
                <Toolbar
                    groupBy={groupBy}
                    setGroupBy={setGroupBy}
                    sortBy={sortBy}
                    setSortBy={setSortBy}
                />
                <button
                    onClick={changeDirectory}
                    className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                    Change Directory
                </button>
                {directoryPath && (
                    <button
                        onClick={() => indexDirectory(directoryPath)}
                        disabled={indexing}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {indexing ? "Indexing..." : "Refresh Index"}
                    </button>
                )}
                {directoryPath && (
                    <button
                        onClick={analyzeStorage}
                        disabled={analyzingStorage}
                        className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {analyzingStorage ? "Analyzing..." : "Update Storage Stats"}
                    </button>
                )}
                {directoryPath && (
                    <div className="text-sm text-gray-600 flex items-center">
                        Directory: {directoryPath}
                    </div>
                )}
                {indexedCount > 0 && (
                    <div className="text-sm text-gray-600 flex items-center">
                        {indexedCount} videos indexed
                    </div>
                )}
                {storageStats && (
                    <div className="text-sm text-gray-600 flex items-center gap-4">
                        <span>📁 {storageStats.totalFiles.toLocaleString()} files</span>
                        <span>💾 {formatBytes(storageStats.totalSize)}</span>
                        <span>🎥 {storageStats.videoFiles.toLocaleString()} videos</span>
                    </div>
                )}
                {analyzingStorage && storageProgress && (
                    <div className="flex items-center gap-2">
                        <div className="text-sm">Analyzing storage...</div>
                        <div className="text-sm">{storageProgress.filesProcessed.toLocaleString()} files</div>
                        <div className="text-xs text-gray-500">
                            Current: {storageProgress.currentPath.split('\\').pop() || storageProgress.currentPath.split('/').pop()}
                        </div>
                    </div>
                )}
                {indexing && (
                    <div className="flex items-center gap-2">
                        <div className="text-sm">Indexing...</div>
                        <div className="text-sm">{indexedCount} videos indexed</div>
                        {currentIndexingFile && (
                            <div className="text-xs text-gray-500">
                                Processing: {currentIndexingFile}
                            </div>
                        )}
                    </div>
                )}
                {/* {preloadingProgress > 0 && preloadingProgress < 100 && (
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
                )} */}
            </nav>
            <div className="flex-1 p-4 overflow-auto">
                {loading && <div>Loading videos from database...</div>}
                {indexing && (
                    <div className="mb-4 p-3 bg-blue-50 rounded-lg">
                        <div className="text-blue-800 font-medium">Indexing in progress...</div>
                        <div className="text-sm text-blue-600">
                            {indexedCount} videos indexed so far
                        </div>
                        {currentIndexingFile && (
                            <div className="text-xs text-blue-500 mt-1">
                                Currently processing: {currentIndexingFile}
                            </div>
                        )}
                    </div>
                )}
                {analyzingStorage && storageProgress && (
                    <div className="mb-4 p-3 bg-purple-50 rounded-lg">
                        <div className="text-purple-800 font-medium">Storage analysis in progress...</div>
                        <div className="text-sm text-purple-600">
                            {storageProgress.filesProcessed.toLocaleString()} files analyzed
                        </div>
                        <div className="text-xs text-purple-500 mt-1">
                            Current: {storageProgress.currentPath.split('\\').pop() || storageProgress.currentPath.split('/').pop()}
                        </div>
                    </div>
                )}
                {error && <div className="text-red-500">Error: {error}</div>}
                {!loading && !indexing && videos.length === 0 && (
                    <div className="text-center text-gray-500 mt-8">
                        <p>No videos found in database.</p>
                        <p>Click "Refresh Index" to scan your directory for videos.</p>
                    </div>
                )}
                {processedVideos.length > 0 && (
                    <div className="space-y-8">
                        {processedVideos.map((group: { groupName: string; videos: VideoMetadata[] }) => (
                            <div key={group.groupName}>
                                <h2 className="text-2xl font-bold mb-4 text-gray-800 dark:text-gray-200">
                                    {group.groupName}
                                </h2>
                                <VideoContainer videos={group.videos} />
                            </div>
                        ))}
                        
                        {/* Load More Button */}
                        {hasMore && (
                            <div className="text-center mt-8">
                                <button
                                    onClick={loadMoreVideos}
                                    disabled={loadingMore}
                                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {loadingMore ? 'Loading...' : `Load More (${totalCount - videos.length} remaining)`}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </main>
    );
}

// Add this helper function
function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default Viewer;