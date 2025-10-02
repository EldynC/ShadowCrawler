import { useState, useEffect } from "react";
import { VideoMetadata } from "../../types/video";
import PlayerModal from "./PlayerModal";
import { convertFileSrc } from '@tauri-apps/api/core';

interface CardProps {
    video: VideoMetadata;
}

export default function Card({ video }: CardProps) {
    const [thumbnailData, setThumbnailData] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);  
    // console.log(video);
    // console.log(video.full_path);
    useEffect(() => {
        if (video.thumbnail_path) {
            loadThumbnail();
        }
    }, [video.thumbnail_path]);

    const loadThumbnail = async () => {
        try {
            console.log(`Loading thumbnail: ${video.thumbnail_path}`);
            
            // Use the original path directly - no need for resolveResource
            const assetUrl = convertFileSrc(video.thumbnail_path!);
            console.log(`Asset URL: ${assetUrl}`);
            setThumbnailData(assetUrl);
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
        // console.log(date);
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
                {/* <p>Thumbnail Path: {video.thumbnail_path}</p> */}
                {/* <p className="text-xs text-gray-500 dark:text-gray-500 break-all">
                    Path: {video.full_path}
                </p> */}
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