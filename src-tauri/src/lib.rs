// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
// use tauri::api::dialog::FileDialogBuilder;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// #[tauri::command]
// async fn select_directory() -> Result<String, String> {
//     let file_dialog = FileDialogBuilder::new()
//         .set_title("Select Directory")
//         .pick_folder();
    
//     match file_dialog.await {
//         Some(path) => Ok(path.to_string_lossy().to_string()),
//         None => Err("No directory selected".to_string()),
//     }
// }

use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use std::fs;
use std::time::SystemTime;
use std::process::Command;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VideoMetadata {
    pub id: String,
    pub folder_name: String,
    pub full_path: String,
    pub file_name: String,
    pub file_size: u64,
    pub creation_date: String,
    pub modified_date: String,
    pub duration: Option<f64>,
    pub width: Option<u32>,
    pub height: Option<u32>,
    pub fps: Option<f32>,
    pub codec: Option<String>,
    pub thumbnail_path: Option<String>,
}

#[tauri::command]
/// Asynchronously crawls a directory and collects metadata for all video files found within it.
/// 
/// # Arguments
/// * `path` - The root directory path to start crawling from.
/// 
/// # Returns
/// * `Result<Vec<VideoMetadata>, String>` - On success, returns a vector of `VideoMetadata` for each video file found. On failure, returns an error message.
async fn crawl_directory(path: String) -> Result<Vec<VideoMetadata>, String> {
    // Create a vector to store metadata for each discovered video file.
    let mut videos = Vec::new();

    // Define a list of file extensions that are considered video files.
    let video_extensions = ["mp4", "avi", "mov", "mkv", "webm", "flv", "wmv", "m4v"];
    
    // Walk through the directory tree starting from the given path.
    // `WalkDir::new(&path)` creates an iterator over all entries (files and directories).
    // `.into_iter()` turns it into an iterator.
    // `.filter_map(|e| e.ok())` skips over entries that resulted in an error, only keeping successful ones.
    for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
        // Check if the current entry is a file (not a directory).
        if entry.file_type().is_file() {
            // Try to get the file extension of the current file.
            if let Some(extension) = entry.path().extension() {
                // Convert the extension to a string slice for comparison.
                if let Some(ext_str) = extension.to_str() {
                    // Convert the extension to lowercase and check if it matches any known video extension.
                    if video_extensions.contains(&ext_str.to_lowercase().as_str()) {
                        // If the file is a video, attempt to extract its metadata asynchronously.
                        match extract_video_metadata(entry.path()).await {
                            // On success, add the metadata to the videos vector.
                            Ok(metadata) => videos.push(metadata),
                            // On failure, print an error message to standard error, but continue processing other files.
                            Err(e) => eprintln!("Error processing {}: {}", entry.path().display(), e),
                        }
                    }
                }
            }
        }
    }
    
    // Return the collected video metadata as a successful result.
    Ok(videos)
}

/// Asynchronously extracts metadata for a single video file at the given path.
/// Returns a `VideoMetadata` struct on success, or an error message string on failure.
async fn extract_video_metadata(path: &std::path::Path) -> Result<VideoMetadata, String> {
    // Attempt to retrieve the file system metadata for the given path (e.g., size, timestamps).
    // If this fails (e.g., file doesn't exist or permission denied), convert the error to a string and return it.
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;

    // Extract the file name from the path.
    // `file_name()` returns an Option<&OsStr>, so we convert it to a string slice if possible.
    // If the file name can't be determined, use "unknown" as a fallback.
    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Extract the folder name (the parent directory's name) from the path.
    // `parent()` gives the parent path, then we get its file name and convert to a string.
    // If any step fails, use "unknown" as a fallback.
    let folder_name = path.parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    // Attempt to get the file's creation time as a SystemTime.
    // If not available (e.g., on some platforms), use UNIX_EPOCH (Jan 1, 1970).
    // Then, calculate the number of seconds since UNIX_EPOCH.
    let creation_time = metadata.created()
        .unwrap_or_else(|_| SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Attempt to get the file's last modified time as a SystemTime.
    // If not available, use UNIX_EPOCH.
    // Then, calculate the number of seconds since UNIX_EPOCH.
    let modified_time = metadata.modified()
        .unwrap_or_else(|_| SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();

    // Use ffmpeg to extract video-specific metadata (duration, resolution, codec, etc.).
    // This is an async operation and may fail, in which case the error is propagated.
    let video_info = extract_ffmpeg_metadata(path).await?;

    // Generate a thumbnail for the video and get the path to the generated image.
    // This is also an async operation and may fail.
    let thumbnail_path = None; // Let TypeScript handle thumbnail generation

    // Construct and return the VideoMetadata struct with all collected information.
    Ok(VideoMetadata {
        // Create a unique ID by combining the folder and file name.
        id: format!("{}_{}", folder_name, file_name),
        // The name of the folder containing the video.
        folder_name,
        // The full path to the video file, converted to a String.
        full_path: path.to_string_lossy().to_string(),
        // The name of the video file.
        file_name,
        // The size of the file in bytes.
        file_size: metadata.len(),
        // The creation date, formatted as a human-readable string.
        creation_date: format_timestamp(creation_time),
        // The last modified date, formatted as a human-readable string.
        modified_date: format_timestamp(modified_time),
        // The duration of the video in seconds (if available).
        duration: video_info.duration,
        // The width of the video in pixels (if available).
        width: video_info.width,
        // The height of the video in pixels (if available).
        height: video_info.height,
        // The frames per second of the video (if available).
        fps: video_info.fps,
        // The codec used for the video (if available).
        codec: video_info.codec,
        // The path to the generated thumbnail image (if available).
        thumbnail_path,
    })
}

#[derive(Debug)]
struct VideoInfo {
    duration: Option<f64>,
    width: Option<u32>,
    height: Option<u32>,
    fps: Option<f32>,
    codec: Option<String>,
}

async fn extract_ffmpeg_metadata(path: &std::path::Path) -> Result<VideoInfo, String> {
    // Use ffprobe to get video metadata
    let output = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            path.to_str().unwrap()
        ])
        .output()
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err("ffprobe failed".to_string());
    }
    
    let json_str = String::from_utf8(output.stdout).map_err(|e| e.to_string())?;
    let json: serde_json::Value = serde_json::from_str(&json_str).map_err(|e| e.to_string())?;
    
    // Extract video stream
    let streams = json["streams"].as_array().ok_or("No streams found")?;
    let video_stream = streams.iter()
        .find(|s| s["codec_type"] == "video")
        .ok_or("No video stream found")?;
    
    let duration = json["format"]["duration"].as_str()
        .and_then(|s| s.parse::<f64>().ok());
    
    let width = video_stream["width"].as_u64().map(|w| w as u32);
    let height = video_stream["height"].as_u64().map(|h| h as u32);
    
    let fps_str = video_stream["r_frame_rate"].as_str().unwrap_or("0/1");
    let fps = if let Some((num, den)) = fps_str.split_once('/') {
        let num: f32 = num.parse().unwrap_or(0.0);
        let den: f32 = den.parse().unwrap_or(1.0);
        if den != 0.0 { Some(num / den) } else { None }
    } else {
        None
    };
    
    let codec = video_stream["codec_name"].as_str().map(|s| s.to_string());
    
    Ok(VideoInfo {
        duration,
        width,
        height,
        fps,
        codec,
    })
}

// async fn generate_thumbnail(path: &std::path::Path) -> Result<Option<String>, String> {
//     // Create thumbnails directory
//     let thumbnails_dir = std::env::temp_dir().join("shadowcrawler_thumbnails");
//     fs::create_dir_all(&thumbnails_dir).map_err(|e| e.to_string())?;
    
//     let thumbnail_name = format!("{}.jpg", 
//         path.file_stem().unwrap().to_string_lossy()
//     );
//     let thumbnail_path = thumbnails_dir.join(thumbnail_name);
    
//     // Get video duration first to seek to 10% of the video
//     let duration_output = Command::new("ffprobe")
//         .args([
//             "-v", "quiet",
//             "-show_entries", "format=duration",
//             "-of", "csv=p=0",
//             path.to_str().unwrap()
//         ])
//         .output()
//         .map_err(|e| e.to_string())?;
    
//     let duration_str = String::from_utf8(duration_output.stdout)
//         .map_err(|e| e.to_string())?;
//     let duration: f64 = duration_str.trim().parse().unwrap_or(0.0);
//     let seek_time = duration * 0.1; // 10% into the video
    
//     // Generate thumbnail using ffmpeg
//     let output = Command::new("ffmpeg")
//         .args([
//             "-i", path.to_str().unwrap(),
//             "-ss", &format!("{:.2}", seek_time),
//             "-vframes", "1",
//             "-s", "320x180",
//             "-y", // Overwrite output file
//             thumbnail_path.to_str().unwrap()
//         ])
//         .output()
//         .map_err(|e| e.to_string())?;
    
//     if output.status.success() {
//         Ok(Some(thumbnail_path.to_string_lossy().to_string()))
//     } else {
//         eprintln!("FFmpeg error: {}", String::from_utf8_lossy(&output.stderr));
//         Ok(None)
//     }
// }

fn format_timestamp(timestamp: u64) -> String {
    // Return timestamp in milliseconds since epoch for easy JavaScript parsing
    (timestamp * 1000).to_string()
}

#[tauri::command]
async fn get_thumbnail_data(thumbnail_path: String) -> Result<Vec<u8>, String> {
    fs::read(&thumbnail_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_video_data(video_path: String) -> Result<Vec<u8>, String> {
    fs::read(&video_path).map_err(|e| e.to_string())
}

#[tauri::command]
async fn init_video_database() -> Result<(), String> {
    // Initialize database - placeholder implementation
    Ok(())
}

#[tauri::command]
async fn get_videos_from_database() -> Result<Vec<VideoMetadata>, String> {
    // Get videos from database - placeholder implementation
    Ok(vec![])
}

#[tauri::command]
async fn get_videos_by_folder(_folder_name: String) -> Result<Vec<VideoMetadata>, String> {
    // Get videos by folder - placeholder implementation
    Ok(vec![])
}

#[tauri::command]
async fn get_folders() -> Result<Vec<String>, String> {
    // Get folders - placeholder implementation
    Ok(vec![])
}

#[tauri::command]
async fn insert_video_record(_video: VideoMetadata) -> Result<(), String> {
    // Insert video record - placeholder implementation
    Ok(())
}

#[tauri::command]
async fn clear_video_database() -> Result<(), String> {
    // Clear video database - placeholder implementation
    Ok(())
}

#[tauri::command]
async fn index_directory(directory_path: String) -> Result<Vec<VideoMetadata>, String> {
    // Index directory - use existing crawl_directory implementation
    crawl_directory(directory_path).await
}

#[tauri::command]
async fn read_network_file(path: String) -> Result<Vec<u8>, String> {
    use std::fs;
    
    match fs::read(&path) {
        Ok(data) => Ok(data),
        Err(e) => Err(format!("Failed to read file: {}", e)),
    }
}

#[derive(Debug, Serialize, Deserialize)]
pub struct StreamChunk {
    pub data: Vec<u8>,
    pub offset: u64,
    pub total_size: u64,
    pub is_complete: bool,
}

#[tauri::command]
async fn stream_network_file_chunk(path: String, offset: u64, chunk_size: u64) -> Result<StreamChunk, String> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};
    
    let mut file = File::open(&path)
        .map_err(|e| format!("Failed to open file: {}", e))?;
    
    // Get file size
    let metadata = file.metadata()
        .map_err(|e| format!("Failed to get metadata: {}", e))?;
    let total_size = metadata.len();
    
    // Seek to offset
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("Failed to seek: {}", e))?;
    
    // Calculate actual chunk size
    let actual_chunk_size = std::cmp::min(chunk_size, total_size - offset);
    let mut buffer = vec![0u8; actual_chunk_size as usize];
    
    // Read chunk
    let bytes_read = file.read(&mut buffer)
        .map_err(|e| format!("Failed to read: {}", e))?;
    
    // Truncate to actual bytes read
    buffer.truncate(bytes_read);
    
    Ok(StreamChunk {
        data: buffer,
        offset,
        total_size,
        is_complete: offset + bytes_read as u64 >= total_size,
    })
}

// Keep the original function for backward compatibility but make it faster
#[tauri::command]
async fn stream_network_file(path: String) -> Result<Vec<u8>, String> {
    use std::fs::File;
    use std::io::{Read, Seek, SeekFrom};
    
    println!("🚀 Starting to stream file: {}", path);
    
    let mut file = File::open(&path)
        .map_err(|e| {
            let error_msg = format!("Failed to open file: {}", e);
            println!("❌ {}", error_msg);
            error_msg
        })?;
    
    println!("✅ File opened successfully");
    
    // Get file size first
    let metadata = file.metadata()
        .map_err(|e| {
            let error_msg = format!("Failed to get metadata: {}", e);
            println!("❌ {}", error_msg);
            error_msg
        })?;
    let file_size = metadata.len();
    
    println!("📊 File size: {} bytes ({:.2} MB)", file_size, file_size as f64 / (1024.0 * 1024.0));
    
    // For network drives, use smaller chunks and add more delays
    let chunk_size = if path.starts_with("\\\\") { 
        println!("🌐 Network drive detected, using 64KB chunks");
        64 * 1024 
    } else { 
        println!("💾 Local drive detected, using 1MB chunks");
        1024 * 1024 
    };
    
    let mut buffer = Vec::with_capacity(file_size as usize);
    let mut offset = 0;
    let mut chunk_count = 0;
    
    println!("🔄 Starting to read file in chunks...");
    
    while offset < file_size {
        chunk_count += 1;
        
        if chunk_count % 10 == 0 || chunk_count == 1 {
            println!("📖 Reading chunk {} at offset {} ({}% complete)", 
                chunk_count, 
                offset, 
                (offset as f64 / file_size as f64 * 100.0) as u32
            );
        }
        
        // Seek to current offset
        file.seek(SeekFrom::Start(offset))
            .map_err(|e| {
                let error_msg = format!("Failed to seek to offset {}: {}", offset, e);
                println!("❌ {}", error_msg);
                error_msg
            })?;
        
        // Calculate chunk size for this iteration
        let current_chunk_size = std::cmp::min(chunk_size, file_size - offset);
        let mut chunk = vec![0u8; current_chunk_size as usize];
        
        // Read chunk
        let bytes_read = file.read(&mut chunk)
            .map_err(|e| {
                let error_msg = format!("Failed to read chunk at offset {}: {}", offset, e);
                println!("❌ {}", error_msg);
                error_msg
            })?;
        
        if bytes_read == 0 {
            println!("📄 End of file reached at offset {}", offset);
            break; // End of file
        }
        
        // Truncate chunk to actual bytes read
        chunk.truncate(bytes_read);
        buffer.extend_from_slice(&chunk);
        
        offset += bytes_read as u64;
        
        // Add delay for network drives to prevent overwhelming
        if path.starts_with("\\\\") {
            tokio::time::sleep(tokio::time::Duration::from_millis(10)).await;
        }
    }
    
    println!("✅ File streaming complete! Read {} chunks, {} bytes total", chunk_count, buffer.len());
    Ok(buffer)
}

#[tauri::command]
async fn transcode_video_for_web(input_path: String) -> Result<String, String> {
    use std::process::Command;
    
    let output_path = format!("{}.web.mp4", input_path);
    
    let output = Command::new("ffmpeg")
        .args([
            "-i", &input_path,
            "-c:v", "libx264",  // H.264 for broad compatibility
            "-c:a", "aac",      // AAC audio
            "-preset", "fast",   // Fast encoding
            "-crf", "23",        // Good quality
            "-movflags", "+faststart", // Web optimization
            &output_path
        ])
        .output()
        .map_err(|e| e.to_string())?;
    
    if !output.status.success() {
        return Err("Transcoding failed".to_string());
    }
    
    Ok(output_path)
}


#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            greet,
            crawl_directory,
            get_thumbnail_data,
            get_video_data,
            init_video_database,
            get_videos_from_database,
            get_videos_by_folder,
            get_folders,
            insert_video_record,
            clear_video_database,
            index_directory,
            read_network_file,
            stream_network_file,
            stream_network_file_chunk,
            transcode_video_for_web
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
