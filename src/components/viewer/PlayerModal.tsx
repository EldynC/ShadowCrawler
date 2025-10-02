import React, { useEffect, useRef, useState } from "react";
import { invoke } from '@tauri-apps/api/core';

interface PlayerModalProps {
    open: boolean;
    onClose: () => void;
    videoPath: string;
    onTrim?: () => void;
}

const PlayerModal: React.FC<PlayerModalProps> = ({
    open,
    onClose,
    videoPath,
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

    // Use preloaded blob URL if available, otherwise load the file
    useEffect(() => {
        if (open) {
            loadVideoData();
        }

        // Cleanup blob URL when modal closes
        return () => {
            if (videoUrl && videoUrl.startsWith('blob:')) {
                URL.revokeObjectURL(videoUrl);
            }
        };
    }, [open, videoUrl]);

    const loadVideoData = async () => {
        setLoading(true);
        setError(null);

        try {
            // Try original file first
            const { convertFileSrc } = await import('@tauri-apps/api/core');
            const fileUrl = convertFileSrc(videoPath);
            setVideoUrl(fileUrl);
            setLoading(false);
        } catch (err) {
            console.error("Failed to load video, trying transcoding:", err);
            // If original fails, transcode to web-compatible format
            try {
                console.log("Transcoding video for web compatibility...");
                const transcodedPath = await invoke<string>('transcode_video_for_web', { 
                    inputPath: videoPath 
                });
                console.log(`Transcoded path: ${transcodedPath}`);
                const { convertFileSrc } = await import('@tauri-apps/api/core');
                const fileUrl = convertFileSrc(transcodedPath);
                setVideoUrl(fileUrl);
                setLoading(false);
            } catch (transcodeErr) {
                setError("Video format not supported and transcoding failed");
                setLoading(false);
            }
        }
    };

    if (!open) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center"
            style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
            <div
                ref={modalRef}
                className="bg-transparent rounded-lg p-6 max-w-6xl w-full max-h-[90vh] flex flex-col items-center"
            >
                {loading && (
                    <div className="w-full max-h-[80vh] flex flex-col items-center justify-center bg-black bg-opacity-80 rounded mb-4 p-4">
                        <div className="text-white mb-2">Loading video...</div>
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                    </div>
                )}

                {error && (
                    <div className="w-full max-h-[80vh] flex items-center justify-center bg-red-900 bg-opacity-80 rounded mb-4">
                        <div className="text-white">{error}</div>
                    </div>
                )}

                {videoUrl && !loading && !error && (
                    <video
                        // onLoadStart={() => console.log("Video started loading")}
                        // onLoadedMetadata={() => console.log("Video metadata loaded")}
                        // onLoadedData={() => console.log("Video data loaded")}
                        // onCanPlay={() => console.log("Video can play")}
                        // onCanPlayThrough={() => console.log("Video can play through")}
                        // onError={(e) => {
                        //     console.error("Video error:", e);
                        //     console.error("Video error details:", e.currentTarget.error);
                        //     setError(`Video playback error: ${e.currentTarget.error?.message || 'Unknown error'}`);
                        // }}
                        src={videoUrl}
                        controls
                        className="w-full max-h-[80vh] rounded mb-4 bg-black"
                        preload="metadata"
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
