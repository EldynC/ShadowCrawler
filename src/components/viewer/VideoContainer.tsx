import Card from "./Card";
import { VideoMetadata } from "../../types/video";

interface VideoContainerProps {
    videos: VideoMetadata[];
}

export default function VideoContainer({ videos }: VideoContainerProps) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" style={{height: "100%", width: "100%"}}>
            {videos.map((video) => (
                <Card key={video.id} video={video} />
            ))}
        </div>
    );
}