import { useState, useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { VideoMetadata } from "../../types/video";
import PlayerModal from "./PlayerModal";

interface CardProps {
    video: VideoMetadata;
}

export default function Card({ video }: CardProps) {
    const [thumbnailData, setThumbnailData] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);  
    console.log(video.full_path);
    useEffect(() => {
        if (video.thumbnail_path) {
            loadThumbnail();
        }
    }, [video.thumbnail_path]);

    const loadThumbnail = async () => {
        try {
            const data = await invoke<number[]>("get_thumbnail_data", {
                thumbnailPath: video.thumbnail_path
            });
            const blob = new Blob([new Uint8Array(data)], { type: 'image/jpeg' });
            const url = URL.createObjectURL(blob);
            setThumbnailData(url);
        } catch (error) {
            console.error("Failed to load thumbnail:", error);
        }
    };

    const formatFileSize = (bytes: number) => {
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        if (bytes === 0) return '0 Bytes';
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
    };

    const formatDuration = (seconds?: number) => {
        if (!seconds) return 'Unknown';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatDate = (timestamp: string) => {
        const date = new Date(parseInt(timestamp));
        return isNaN(date.getTime()) ? 'Unknown' : date.toLocaleDateString();
    };

    return (
        <div className="block max-w-sm p-6 bg-white border border-gray-200 rounded-lg shadow-sm hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-700 dark:hover:bg-gray-700"
       
        >
            <h5 className="mb-2 text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
                {video.folder_name}
            </h5>
            <p className="font-normal text-gray-700 dark:text-gray-400 mb-2">
                {video.file_name}
            </p>
            
            {thumbnailData && (
                <img 
                onClick={() => setShowModal(true)}
                    src={thumbnailData} 
                    alt="Thumbnail" 
                    className="w-full h-48 object-cover rounded mb-2" 
                />
            )}
            
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1">
                <p>Size: {formatFileSize(video.file_size)}</p>
                <p>Duration: {formatDuration(video.duration)}</p>
                {video.width && video.height && (
                    <p>Resolution: {video.width}x{video.height}</p>
                )}
                {video.fps && <p>FPS: {video.fps.toFixed(1)}</p>}
                {video.codec && <p>Codec: {video.codec}</p>}
                <p>Created: {formatDate(video.creation_date)}</p>
            </div>
            {showModal && (
                <PlayerModal 
                    open={showModal} 
                    onClose={() => setShowModal(false)} 
                    videoPath={video.full_path}
                    videoBlobUrl={video.blobUrl}
                    isPreloaded={video.isPreloaded}
                />
            )}
        </div>
    );
}