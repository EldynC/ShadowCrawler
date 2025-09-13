import React, { useEffect, useRef, useState } from "react";

interface PlayerModalProps {
    open: boolean;
    onClose: () => void;
    videoPath: string;
    videoBlobUrl?: string; // Add preloaded blob URL
    isPreloaded?: boolean; // Add preload status
    onTrim?: () => void;
}

const PlayerModal: React.FC<PlayerModalProps> = ({ 
    open, 
    onClose, 
    videoPath, 
    videoBlobUrl, 
    isPreloaded = false,
    onTrim 
}) => {
    const modalRef = useRef<HTMLDivElement>(null);
    const [videoUrl, setVideoUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        }
        if (open) {
            document.addEventListener("mousedown", handleClickOutside);
        }
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [open, onClose]);

    // Use preloaded blob URL if available, otherwise load on demand
    useEffect(() => {
        if (open) {
            if (isPreloaded && videoBlobUrl) {
                setVideoUrl(videoBlobUrl);
                setLoading(false);
                setError(null);
            } else {
                // Fallback to loading on demand
                loadVideoData();
            }
        }
        
        // Cleanup blob URL when modal closes (only if we created it)
        return () => {
            if (videoUrl && !isPreloaded) {
                URL.revokeObjectURL(videoUrl);
            }
        };
    }, [open, isPreloaded, videoBlobUrl]);

    const loadVideoData = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const { invoke } = await import("@tauri-apps/api/core");
            const videoData = await invoke<number[]>("get_video_data", {
                videoPath: videoPath
            });
            
            const blob = new Blob([new Uint8Array(videoData)], { type: 'video/mp4' });
            const url = URL.createObjectURL(blob);
            setVideoUrl(url);
        } catch (err) {
            console.error("Failed to load video:", err);
            setError(err as string);
        } finally {
            setLoading(false);
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60"
            style={{ backdropFilter: "blur(2px)" }}
        >
            <div
                ref={modalRef}
                className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6 max-w-2xl w-full flex flex-col items-center"
            >
                {loading && (
                    <div className="w-full max-h-[60vh] flex items-center justify-center bg-black rounded mb-4">
                        <div className="text-white">Loading video...</div>
                    </div>
                )}
                
                {error && (
                    <div className="w-full max-h-[60vh] flex items-center justify-center bg-red-900 rounded mb-4">
                        <div className="text-white">Error loading video: {error}</div>
                    </div>
                )}
                
                {videoUrl && !loading && !error && (
                    <video
                        onError={(e) => {
                            console.error("Video error:", e);
                        }}
                        src={videoUrl}
                        controls
                        className="w-full max-h-[60vh] rounded mb-4 bg-black"
                    >
                        Your browser does not support the video tag.
                    </video>
                )}
                
                <div className="w-full flex justify-end">
                    <button
                        className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                        onClick={onTrim}
                    >
                        Trim
                    </button>
                </div>
            </div>
        </div>
    );
};

export default PlayerModal;
