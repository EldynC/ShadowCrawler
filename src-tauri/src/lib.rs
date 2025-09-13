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
extern crate ffmpeg_next as ffmpeg;
use std::env;
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
async fn crawl_directory(path: String) -> Result<Vec<VideoMetadata>, String> {
    let mut videos = Vec::new();
    let video_extensions = ["mp4", "avi", "mov", "mkv", "webm", "flv", "wmv", "m4v"];
    
    for entry in WalkDir::new(&path).into_iter().filter_map(|e| e.ok()) {
        if entry.file_type().is_file() {
            if let Some(extension) = entry.path().extension() {
                if let Some(ext_str) = extension.to_str() {
                    if video_extensions.contains(&ext_str.to_lowercase().as_str()) {
                        match extract_video_metadata(entry.path()).await {
                            Ok(metadata) => videos.push(metadata),
                            Err(e) => eprintln!("Error processing {}: {}", entry.path().display(), e),
                        }
                    }
                }
            }
        }
    }
    
    Ok(videos)
}

async fn extract_video_metadata(path: &std::path::Path) -> Result<VideoMetadata, String> {
    let metadata = fs::metadata(path).map_err(|e| e.to_string())?;
    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    
    let folder_name = path.parent()
        .and_then(|p| p.file_name())
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();
    
    let creation_time = metadata.created()
        .unwrap_or_else(|_| SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    let modified_time = metadata.modified()
        .unwrap_or_else(|_| SystemTime::UNIX_EPOCH)
        .duration_since(SystemTime::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    
    // Extract video metadata using ffmpeg
    let video_info = extract_ffmpeg_metadata(path).await?;
    let thumbnail_path = generate_thumbnail(path).await?;   
    
    Ok(VideoMetadata {
        id: format!("{}_{}", folder_name, file_name),
        folder_name,
        full_path: path.to_string_lossy().to_string(),
        file_name,
        file_size: metadata.len(),
        creation_date: format_timestamp(creation_time),
        modified_date: format_timestamp(modified_time),
        duration: video_info.duration,
        width: video_info.width,
        height: video_info.height,
        fps: video_info.fps,
        codec: video_info.codec,
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
    use ffmpeg_next::format::input;
    use ffmpeg_next::media::Type;
    
    let  ictx = input(path).map_err(|e| e.to_string())?;
    
    let video_stream = ictx
        .streams()
        .best(Type::Video)
        .ok_or("No video stream found")?;
    
    let codec_ctx = video_stream.parameters();
    let codec = codec_ctx.id().name();
    
    let duration = ictx.duration() as f64 / ffmpeg_next::ffi::AV_TIME_BASE as f64;
    let fps = video_stream.rate().0 as f32 / video_stream.rate().1 as f32;
    
    Ok(VideoInfo {
        duration: Some(duration),
        width: None, // Parameters doesn't have width/height
        height: None,
        fps: Some(fps),
        codec: Some(codec.to_string()),
    })
}

async fn generate_thumbnail(path: &std::path::Path) -> Result<Option<String>, String> {
    // Create thumbnails directory
    let thumbnails_dir = std::env::temp_dir().join("shadowcrawler_thumbnails");
    fs::create_dir_all(&thumbnails_dir).map_err(|e| e.to_string())?;
    
    let thumbnail_name = format!("{}.jpg", 
        path.file_stem().unwrap().to_string_lossy()
    );
    let thumbnail_path = thumbnails_dir.join(thumbnail_name);
    
    // Get video duration first to seek to 10% of the video
    let duration_output = Command::new("ffprobe")
        .args([
            "-v", "quiet",
            "-show_entries", "format=duration",
            "-of", "csv=p=0",
            path.to_str().unwrap()
        ])
        .output()
        .map_err(|e| e.to_string())?;
    
    let duration_str = String::from_utf8(duration_output.stdout)
        .map_err(|e| e.to_string())?;
    let duration: f64 = duration_str.trim().parse().unwrap_or(0.0);
    let seek_time = duration * 0.1; // 10% into the video
    
    // Generate thumbnail using ffmpeg
    let output = Command::new("ffmpeg")
        .args([
            "-i", path.to_str().unwrap(),
            "-ss", &format!("{:.2}", seek_time),
            "-vframes", "1",
            "-s", "320x180",
            "-y", // Overwrite output file
            thumbnail_path.to_str().unwrap()
        ])
        .output()
        .map_err(|e| e.to_string())?;
    
    if output.status.success() {
        Ok(Some(thumbnail_path.to_string_lossy().to_string()))
    } else {
        eprintln!("FFmpeg error: {}", String::from_utf8_lossy(&output.stderr));
        Ok(None)
    }
}

async fn save_frame_as_image(frame: &ffmpeg_next::util::frame::video::Video, video_path: &std::path::Path) -> Result<String, String> {
    use image::{RgbImage, Rgb};
    
    let width = frame.width();
    let height = frame.height();
    
    // Convert YUV to RGB
    let mut rgb_frame = RgbImage::new(width, height);
    
    for (y, row) in frame.data(0).chunks_exact(width as usize).enumerate() {
        for (x, &y_val) in row.iter().enumerate() {
            let r = y_val as u8;
            let g = y_val as u8;
            let b = y_val as u8;
            rgb_frame.put_pixel(x as u32, y as u32, Rgb([r, g, b]));
        }
    }
    
    // Create thumbnails directory
    let thumbnails_dir = std::env::temp_dir().join("shadowcrawler_thumbnails");
    fs::create_dir_all(&thumbnails_dir).map_err(|e| e.to_string())?;
    
    let thumbnail_name = format!("{}.jpg", 
        video_path.file_stem().unwrap().to_string_lossy()
    );
    let thumbnail_path = thumbnails_dir.join(thumbnail_name);
    
    rgb_frame.save(&thumbnail_path).map_err(|e| e.to_string())?;
    
    Ok(thumbnail_path.to_string_lossy().to_string())
}

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            crawl_directory,
            get_thumbnail_data,
            get_video_data
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
