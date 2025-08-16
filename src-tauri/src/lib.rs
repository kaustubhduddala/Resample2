// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use rfd::FileDialog;
use serde_json::Value;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
use std::process::Command;
use serde::{Deserialize, Serialize};
use std::time::SystemTime;
use tauri::Emitter;
use reqwest;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;
use std::sync::atomic::{AtomicI64, Ordering};
use std::time::UNIX_EPOCH;
use tauri::path::BaseDirectory;


#[derive(Debug, Clone, Serialize, Deserialize)]
struct VideoInfo {
    title: String,
    duration: Option<f64>,
    thumbnail: Option<String>,
    uploader: Option<String>,
    view_count: Option<u64>,
    video_url: Option<String>,
    error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DownloadResult {
    success: bool,
    message: String,
    file_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DownloadProgress {
    progress: f64,
    message: String,
    status: String, // "downloading", "processing", "completed", "error"
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
enum InputType {
    #[serde(rename = "YouTube")]
    YouTube,
    #[serde(rename = "Spotify")]
    Spotify,
    #[serde(rename = "LocalFile")]
    LocalFile,
    #[serde(rename = "Unknown")]
    Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ModelInfo {
    filename: String,
    arch: String,
    output_stems: String,
    friendly_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct DownloadedModel {
    filename: String,
    friendly_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SeparationSettings {
    model_filename: String,
    output_format: String,
    output_dir: String,
    model_file_dir: String,
    normalization: f64,
    amplification: f64,
    single_stem: Option<String>,
    sample_rate: u32,
    use_autocast: bool,
    use_gpu: bool,
    gpu_type: String,
    mdx_segment_size: u32,
    mdx_overlap: f64,
    mdx_batch_size: u32,
    mdx_enable_denoise: bool,
    vr_batch_size: u32,
    vr_window_size: u32,
    vr_aggression: u32,
    vr_enable_tta: bool,
    vr_high_end_process: bool,
    vr_enable_post_process: bool,
    vr_post_process_threshold: f64,
    demucs_segment_size: String,
    demucs_shifts: u32,
    demucs_overlap: f64,
    demucs_segments_enabled: bool,
    mdxc_segment_size: u32,
    mdxc_override_model_segment_size: bool,
    mdxc_overlap: u32,
    mdxc_batch_size: u32,
    mdxc_pitch_shift: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SeparationResult {
    success: bool,
    message: String,
    output_files: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GPUInfo {
    gpu_type: String,
    is_available: bool,
    description: String,
}

static CURRENT_DL_PID: AtomicI64 = AtomicI64::new(0);

// Binary path resolution for yt-dlp
fn get_ytdlp_binary(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    resolve_ytdlp_binary(app_handle)
        .ok_or_else(|| "yt-dlp binary not found".to_string())
}

// Binary path resolution for ffmpeg binaries
fn get_ffmpeg_binary(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    resolve_ff_binary(app_handle, "ffmpeg")
        .ok_or_else(|| "ffmpeg binary not found".to_string())
}

fn get_ffprobe_binary(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    resolve_ff_binary(app_handle, "ffprobe")
        .ok_or_else(|| "ffprobe binary not found".to_string())
}

// Binary path resolution for audio-separator
fn get_audio_separator_binary(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    resolve_audio_separator_binary(app_handle)
        .ok_or_else(|| "audio-separator binary not found".to_string())
}

fn get_documents_dir() -> Result<PathBuf, String> {
    let docs_dir = dirs::home_dir()
        .ok_or_else(|| "Failed to get home directory".to_string())?
        .join("Documents");

    // Try to canonicalize, but if it fails, just use the path as is
    Ok(docs_dir.canonicalize().unwrap_or(docs_dir))
}

fn get_default_download_path() -> Result<String, String> {
    let docs_dir = get_documents_dir()?;
    let resample_dir = docs_dir.join("Resample");
    Ok(resample_dir.to_string_lossy().to_string())
}

fn get_default_model_directory() -> Result<String, String> {
    let docs_dir = get_documents_dir()?;
    let models_dir = docs_dir.join("Resample").join("Models");
    Ok(models_dir.to_string_lossy().to_string())
}

#[tauri::command]
fn detect_input_type(input: String) -> Result<InputType, String> {
    let input_trimmed = input.trim();
    let input_lower = input_trimmed.to_lowercase();
    
    // Check for YouTube URLs
    if input_lower.contains("youtube.com") || 
       input_lower.contains("youtu.be") || 
       input_lower.contains("music.youtube.com") {
        return Ok(InputType::YouTube);
    }
    
    // Check for Spotify URLs
    if input_lower.contains("spotify.com") || 
       input_lower.contains("open.spotify.com") {
        return Ok(InputType::Spotify);
    }
    
    // Check for local file paths
    // First, check if it's a URL (starts with http:// or https://)
    if input_lower.starts_with("http://") || input_lower.starts_with("https://") {
        // If it's a URL but not YouTube or Spotify, it's Unknown
        return Ok(InputType::Unknown);
    }
    
    // Check if it's a file path (contains path separators or is an absolute path)
    if input_trimmed.contains('/') || input_trimmed.contains('\\') || 
       (input_trimmed.len() > 2 && input_trimmed.chars().nth(1) == Some(':')) || // Windows drive letter
       input_trimmed.starts_with('.') || // Relative path starting with .
       PathBuf::from(input_trimmed).exists() { // File actually exists
        return Ok(InputType::LocalFile);
    }
    
    // Default to Unknown
    Ok(InputType::Unknown)
}

#[tauri::command]
fn load_settings(app_handle: tauri::AppHandle) -> Result<String, String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    let settings_path = app_dir.join("settings.json");

    if settings_path.exists() {
        let content = fs::read_to_string(&settings_path)
            .map_err(|e| format!("Failed to read settings file: {}", e))?;
        Ok(content)
    } else {
        // Return default settings if file doesn't exist
        let download_path =
            get_default_download_path().unwrap_or_else(|_| "Documents/Resample".to_string());
        let model_directory = get_default_model_directory()
            .unwrap_or_else(|_| "Documents/Resample/Models".to_string());

        let default_settings = format!(
            r#"{{
            "theme": "system",
            "download_path": "{}",
            "audio_format": "mp3",
            "audio_quality": "0",
            "video_format": "mp4",
            "video_quality": "best",
            "extract_audio": true,
            "write_subtitles": false,
            "write_thumbnail": false,
            "write_description": false,
            "write_info": false,
            "write_annotations": false,
            "write_comments": false,
            "write_automatic_subtitles": false,
            "write_manual_subtitles": false,
            "max_downloads": 1,
            "retries": 10,
            "fragment_retries": 10,
            "file_access_retries": 3,
            "concurrent_fragments": 1,
            "max_downloads_per_host": 0,
            "max_downloads_per_playlist": 0,
            "max_downloads_per_channel": 0,
            "max_downloads_per_user": 0,
            "max_downloads_per_extractor": 0,
            "max_downloads_per_video": 0,
            "max_downloads_per_audio": 0,
            "max_downloads_per_subtitle": 0,
            "max_downloads_per_thumbnail": 0,
            "max_downloads_per_description": 0,
            "max_downloads_per_info": 0,
            "max_downloads_per_annotations": 0,
            "max_downloads_per_comments": 0,
            "max_downloads_per_automatic_subtitles": 0,
            "max_downloads_per_manual_subtitles": 0,
            "separation_settings": {{
                "model_filename": "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
                "output_format": "WAV",
                "output_dir": "",
                "model_file_dir": "",
                "normalization": 0.9,
                "amplification": 0.0,
                "sample_rate": 44100,
                "use_autocast": false,
                "use_gpu": true,
                "gpu_type": "auto",
                "mdx_segment_size": 256,
                "mdx_overlap": 0.25,
                "mdx_batch_size": 1,
                "mdx_enable_denoise": false,
                "vr_batch_size": 1,
                "vr_window_size": 512,
                "vr_aggression": 5,
                "vr_enable_tta": false,
                "vr_high_end_process": false,
                "vr_enable_post_process": false,
                "vr_post_process_threshold": 0.2,
                "demucs_segment_size": "Default",
                "demucs_shifts": 2,
                "demucs_overlap": 0.25,
                "demucs_segments_enabled": true,
                "mdxc_segment_size": 256,
                "mdxc_override_model_segment_size": false,
                "mdxc_overlap": 8,
                "mdxc_batch_size": 1,
                "mdxc_pitch_shift": 0
            }},
            "model_directory": "{}",
            "enable_stem_extraction": false
        }}"#,
            download_path, model_directory
        );
        Ok(default_settings)
    }
}

#[tauri::command]
fn save_settings(app_handle: tauri::AppHandle, settings: String) -> Result<(), String> {
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;

    // Create app directory if it doesn't exist
    fs::create_dir_all(&app_dir).map_err(|e| format!("Failed to create app directory: {}", e))?;

    let settings_path = app_dir.join("settings.json");

    // Validate JSON before saving
    let _: Value = serde_json::from_str(&settings).map_err(|e| format!("Invalid JSON: {}", e))?;

    fs::write(&settings_path, settings)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn select_folder() -> Result<String, String> {
    let dialog = FileDialog::new()
        .set_title("Select Folder")
        .set_directory("/");

    match dialog.pick_folder() {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("No folder selected".to_string()),
    }
}

#[tauri::command]
async fn select_file() -> Result<String, String> {
    let dialog = FileDialog::new()
        .set_title("Select File")
        .add_filter("Audio Files", &["mp3", "wav", "flac", "m4a", "aac", "ogg"])
        .add_filter("Video Files", &["mp4", "avi", "mkv", "mov", "wmv", "flv"])
        .add_filter("All Files", &["*"]);

    match dialog.pick_file() {
        Some(path) => Ok(path.to_string_lossy().to_string()),
        None => Err("No file selected".to_string()),
    }
}

#[tauri::command]
async fn fetch_video_info(app_handle: tauri::AppHandle, url: String) -> Result<VideoInfo, String> {
    if url.trim().is_empty() {
        return Err("URL cannot be empty".to_string());
    }

    // Get yt-dlp binary path
    let yt_dlp_path = get_ytdlp_binary(&app_handle)?;

    // Check if it's a Spotify URL
    if url.contains("spotify.com") || url.contains("open.spotify.com") {
        return handle_spotify_url(&url, &yt_dlp_path).await;
    }
    
    // Use the cached binary path for fast execution
    let output = Command::new(yt_dlp_path)
        .args(&[
            "--dump-json",
            "--no-playlist",
            "--no-warnings",
            &url
        ])
        .output()
        .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

    if !output.status.success() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("yt-dlp failed: {}", error_msg));
    }

    // Parse the JSON output
    let json_str = String::from_utf8_lossy(&output.stdout);
    let json_value: Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Extract video information
    let title = json_value["title"]
        .as_str()
        .unwrap_or("Unknown Title")
        .to_string();

    let duration = json_value["duration"]
        .as_f64()
        .or_else(|| json_value["duration"].as_u64().map(|d| d as f64));

    let thumbnail = json_value["thumbnail"]
        .as_str()
        .map(|s| s.to_string());

    let uploader = json_value["uploader"]
        .as_str()
        .map(|s| s.to_string());

    let view_count = json_value["view_count"]
        .as_u64();

    let video_url = json_value["url"]
        .as_str()
        .map(|s| s.to_string());

    Ok(VideoInfo {
        title,
        duration,
        thumbnail,
        uploader,
        view_count,
        video_url,
        error: None,
    })
}

async fn handle_spotify_url(spotify_url: &str, yt_dlp_path: &PathBuf) -> Result<VideoInfo, String> {
    // Try to use Spotify oEmbed to get a clean title and artist
    #[derive(Deserialize)]
    struct SpotifyOembed {
        title: Option<String>,
        author_name: Option<String>,
        thumbnail_url: Option<String>,
    }

    let mut queries: Vec<String> = Vec::new();

    if let Ok(resp) = reqwest::get(format!("https://open.spotify.com/oembed?url={}", spotify_url)).await {
        if let Ok(oembed) = resp.json::<SpotifyOembed>().await {
            if let (Some(title), Some(author)) = (oembed.title, oembed.author_name) {
                queries.push(format!("{} {}", title, author));
                queries.push(format!("{} {} official audio", title, author));
                queries.push(format!("{} {} lyrics", title, author));
                queries.push(format!("{} {} topic", title, author));
            }
        }
    }

    // Fallback: search by extracted Spotify track id patterns if available
    if let Ok(track_id) = extract_spotify_track_id(spotify_url) {
        queries.push(format!("{}", track_id));
        queries.push(format!("spotify {}", track_id));
        queries.push(format!("spotify track {}", track_id));
    }

    if queries.is_empty() {
        queries.push("spotify track".to_string());
    }

    for search_query in queries.clone() {
        let youtube_search_output = Command::new(&yt_dlp_path)
            .args(&[
                &format!("ytsearch1:{}", search_query),
                "--dump-json",
                "--no-playlist",
                "--no-warnings"
            ])
            .output();

        if let Ok(output) = youtube_search_output {
            if output.status.success() {
                if let Ok(youtube_json) = serde_json::from_str::<Value>(&String::from_utf8_lossy(&output.stdout)) {
                    let youtube_title = youtube_json["title"]
                        .as_str()
                        .unwrap_or("Spotify Track")
                        .to_string();

                    let duration = youtube_json["duration"]
                        .as_f64()
                        .or_else(|| youtube_json["duration"].as_u64().map(|d| d as f64));

                    let thumbnail = youtube_json["thumbnail"]
                        .as_str()
                        .map(|s| s.to_string());

                    let uploader = youtube_json["uploader"]
                        .as_str()
                        .map(|s| s.to_string())
                        .or_else(|| Some("Unknown Artist".to_string()));

                    let view_count = youtube_json["view_count"].as_u64();

                    let video_url = youtube_json["webpage_url"]
                        .as_str()
                        .or_else(|| youtube_json["url"].as_str())
                        .map(|s| s.to_string());

                    return Ok(VideoInfo {
                        title: youtube_title,
                        duration,
                        thumbnail,
                        uploader,
                        view_count,
                        video_url,
                        error: None,
                    });
                }
            }
        }
    }

    // If all searches fail, return a fallback that still allows yt-dlp to search directly
    Ok(VideoInfo {
        title: "Spotify Track".to_string(),
        duration: None,
        thumbnail: None,
        uploader: Some("Unknown Artist".to_string()),
        view_count: None,
        video_url: queries
            .get(0)
            .map(|q| format!("ytsearch1:{}", q))
            .or(None),
        error: None,
    })
}

fn extract_spotify_track_id(url: &str) -> Result<String, String> {
    // Extract track ID from various Spotify URL formats
    if let Some(track_id) = url.split("track/").nth(1) {
        // Remove query parameters and other parts
        let clean_id = track_id.split('?').next().unwrap_or(track_id);
        Ok(clean_id.to_string())
    } else {
        Err("Could not extract track ID from Spotify URL".to_string())
    }
}

fn resolve_ff_binary(app_handle: &tauri::AppHandle, bin_name: &str) -> Option<PathBuf> {
    // Try PATH first
    if which::which(bin_name).is_ok() {
        println!("[DEBUG] {} found in PATH", bin_name);
        return Some(PathBuf::from(bin_name));
    }

    // Try bundled resource path using Tauri v2's correct method
    #[cfg(target_os = "windows")]
    {
        let resource_path = format!("resources/ffmpeg/{}.exe", bin_name);
        if let Ok(resolved_path) = app_handle.path().resolve(&resource_path, BaseDirectory::Resource) {
            println!("[DEBUG] Trying Windows {} path: {:?}", bin_name, resolved_path);
            if resolved_path.exists() {
                println!("[DEBUG] Windows {} found at: {:?}", bin_name, resolved_path);
                return Some(resolved_path);
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let resource_path = format!("resources/ffmpeg/{}", bin_name);
        if let Ok(resolved_path) = app_handle.path().resolve(&resource_path, BaseDirectory::Resource) {
            println!("[DEBUG] Trying macOS {} path: {:?}", bin_name, resolved_path);
            if resolved_path.exists() {
                println!("[DEBUG] macOS {} found at: {:?}", bin_name, resolved_path);
                return Some(resolved_path);
            }
        }
    }

    println!("[DEBUG] {} binary not found", bin_name);
    None
}

fn resolve_ytdlp_binary(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    // Try PATH first
    if which::which("yt-dlp").is_ok() {
        println!("[DEBUG] yt-dlp found in PATH");
        return Some(PathBuf::from("yt-dlp"));
    }

    // Try bundled resource path using Tauri v2's correct method
    #[cfg(target_os = "windows")]
    {
        let resource_path = "resources/yt-dlp/dist/yt-dlp/yt-dlp.exe";
        if let Ok(resolved_path) = app_handle.path().resolve(resource_path, BaseDirectory::Resource) {
            println!("[DEBUG] Trying Windows yt-dlp path: {:?}", resolved_path);
            if resolved_path.exists() {
                println!("[DEBUG] Windows yt-dlp found at: {:?}", resolved_path);
                return Some(resolved_path);
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let resource_path = "resources/yt-dlp/dist/yt-dlp/yt-dlp";
        if let Ok(resolved_path) = app_handle.path().resolve(resource_path, BaseDirectory::Resource) {
            println!("[DEBUG] Trying macOS yt-dlp path: {:?}", resolved_path);
            if resolved_path.exists() {
                println!("[DEBUG] macOS yt-dlp found at: {:?}", resolved_path);
                return Some(resolved_path);
            }
        }
    }

    println!("[DEBUG] yt-dlp binary not found");
    None
}

fn resolve_audio_separator_binary(app_handle: &tauri::AppHandle) -> Option<PathBuf> {
    // Try PATH first
    if which::which("audio-separator").is_ok() {
        println!("[DEBUG] audio-separator found in PATH");
        return Some(PathBuf::from("audio-separator"));
    }

    // Try bundled resource path using Tauri v2's correct method
    #[cfg(target_os = "windows")]
    {
        let resource_path = "resources/audio-separator/dist/audio-separator/audio-separator.exe";
        if let Ok(resolved_path) = app_handle.path().resolve(resource_path, BaseDirectory::Resource) {
            println!("[DEBUG] Trying Windows audio-separator path: {:?}", resolved_path);
            if resolved_path.exists() {
                println!("[DEBUG] Windows audio-separator found at: {:?}", resolved_path);
                return Some(resolved_path);
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        let resource_path = "resources/audio-separator/dist/audio-separator/audio-separator";
        if let Ok(resolved_path) = app_handle.path().resolve(resource_path, BaseDirectory::Resource) {
            println!("[DEBUG] Trying macOS audio-separator path: {:?}", resolved_path);
            if resolved_path.exists() {
                println!("[DEBUG] macOS audio-separator found at: {:?}", resolved_path);
                return Some(resolved_path);
            }
        }
    }

    println!("[DEBUG] audio-separator binary not found");
    None
}

fn newest_file_in_dir(dir: &Path) -> Option<PathBuf> {
    let mut newest: Option<(SystemTime, PathBuf)> = None;
    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    if let Ok(modified) = meta.modified() {
                        match &newest {
                            Some((t, _)) if *t >= modified => {}
                            _ => {
                                newest = Some((modified, entry.path()));
                            }
                        }
                    }
                }
            }
        }
    }
    newest.map(|(_, p)| p)
}

fn format_timestamp(ts_secs: u64) -> String {
    use chrono::{DateTime, NaiveDateTime, Utc};
    let naive = NaiveDateTime::from_timestamp_opt(ts_secs as i64, 0);
    if let Some(naive) = naive {
        let dt: DateTime<Utc> = DateTime::from_naive_utc_and_offset(naive, Utc);
        dt.format("%Y-%m-%d %H:%M").to_string()
    } else {
        "".to_string()
    }
}

#[tauri::command]
async fn get_local_file_info(app_handle: tauri::AppHandle, file_path: String) -> Result<VideoInfo, String> {
    if !PathBuf::from(&file_path).exists() {
        return Err("File does not exist".to_string());
    }

    // Use ffprobe to get file information
    let ffprobe_path = get_ffprobe_binary(&app_handle)?;

    let output = Command::new(ffprobe_path)
        .args(&[
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            &file_path
        ])
        .output()
        .map_err(|e| format!("Failed to execute ffprobe: {}", e))?;

    if !output.status.success() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("ffprobe failed: {}", error_msg));
    }

    // Parse the JSON output
    let json_str = String::from_utf8_lossy(&output.stdout);
    let json_value: Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse JSON: {}", e))?;

    // Extract file information
    let title = PathBuf::from(&file_path)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("Unknown File")
        .to_string();

    let duration = json_value["format"]["duration"]
        .as_str()
        .and_then(|d| d.parse::<f64>().ok());

    let uploader = Some("Local File".to_string());

    Ok(VideoInfo {
        title,
        duration,
        thumbnail: None,
        uploader,
        view_count: None,
        video_url: None,
        error: None,
    })
}

#[tauri::command]
async fn unified_download(
    app_handle: tauri::AppHandle,
    input: String,
    input_type: InputType,
    processing_mode: String,
    startTime: Option<f64>,
    endTime: Option<f64>,
) -> Result<DownloadResult, String> {
    // Helper to emit progress
    let emit_progress = |progress: f64, message: &str, status: &str| {
        let _ = app_handle.emit(
            "download-progress",
            DownloadProgress {
                progress,
                message: message.to_string(),
                status: status.to_string(),
            },
        );
    };

    match input_type {
        InputType::LocalFile => {
            // For local files, nothing to download. Optionally trim later.
            emit_progress(100.0, "Local file ready", "completed");
            return Ok(DownloadResult {
                success: true,
                message: "Local file is ready".to_string(),
                file_path: Some(input),
            });
        }
        InputType::YouTube | InputType::Spotify => {
            emit_progress(0.0, "Starting download", "downloading");

            // Resolve output directory from saved settings
            let app_dir = app_handle
                .path()
                .app_data_dir()
                .map_err(|e| format!("Failed to get app data dir: {}", e))?;
            let settings_path = app_dir.join("settings.json");

            // Defaults
            let mut download_base = get_default_download_path()?;
            let mut extract_audio = true;
            let mut audio_format = "mp3".to_string();
            let mut audio_quality = "0".to_string();
            let mut video_quality = "best".to_string();
            let mut write_subtitles = false;
            let mut write_thumbnail = false;
            let mut write_description = false;
            let mut write_info = false;
            let mut write_annotations = false;
            let mut write_comments = false;
            let mut write_automatic_subtitles = false;
            let mut write_manual_subtitles = false;
            let mut retries: Option<u64> = None;
            let mut fragment_retries: Option<u64> = None;
            let mut concurrent_fragments: Option<u64> = None;

            if settings_path.exists() {
                if let Ok(content) = fs::read_to_string(&settings_path) {
                    if let Ok(val) = serde_json::from_str::<Value>(&content) {
                        if let Some(s) = val.get("download_path").and_then(|v| v.as_str()) {
                            download_base = s.to_string();
                        }
                        if let Some(b) = val.get("extract_audio").and_then(|v| v.as_bool()) {
                            extract_audio = b;
                        }
                        if let Some(s) = val.get("audio_format").and_then(|v| v.as_str()) {
                            audio_format = s.to_string();
                        }
                        if let Some(s) = val.get("audio_quality").and_then(|v| v.as_str()) {
                            audio_quality = s.to_string();
                        }
                        if let Some(s) = val.get("video_quality").and_then(|v| v.as_str()) {
                            video_quality = s.to_string();
                        }
                        write_subtitles = val.get("write_subtitles").and_then(|v| v.as_bool()).unwrap_or(false);
                        write_thumbnail = val.get("write_thumbnail").and_then(|v| v.as_bool()).unwrap_or(false);
                        write_description = val.get("write_description").and_then(|v| v.as_bool()).unwrap_or(false);
                        write_info = val.get("write_info").and_then(|v| v.as_bool()).unwrap_or(false);
                        write_annotations = val.get("write_annotations").and_then(|v| v.as_bool()).unwrap_or(false);
                        write_comments = val.get("write_comments").and_then(|v| v.as_bool()).unwrap_or(false);
                        write_automatic_subtitles = val.get("write_automatic_subtitles").and_then(|v| v.as_bool()).unwrap_or(false);
                        write_manual_subtitles = val.get("write_manual_subtitles").and_then(|v| v.as_bool()).unwrap_or(false);
                        retries = val.get("retries").and_then(|v| v.as_u64());
                        fragment_retries = val.get("fragment_retries").and_then(|v| v.as_u64());
                        concurrent_fragments = val.get("concurrent_fragments").and_then(|v| v.as_u64());
                    }
                }
            }

            let downloads_dir = PathBuf::from(&download_base).join("Downloads");
            fs::create_dir_all(&downloads_dir)
                .map_err(|e| format!("Failed to create downloads directory: {}", e))?;

            // Build yt-dlp command
            let mut args: Vec<String> = Vec::new();

            // If Spotify, resolve to a YouTube URL first
            let mut final_input = input.clone();
            if matches!(input_type, InputType::Spotify) {
                let yt_dlp_path = get_ytdlp_binary(&app_handle)?;
                
                if let Ok(info) = handle_spotify_url(&input, &yt_dlp_path).await {
                    if let Some(yurl) = info.video_url {
                        final_input = yurl;
                    }
                }
            }

            // Ensure ffmpeg/ffprobe are found by yt-dlp
            let ffmpeg_path = get_ffmpeg_binary(&app_handle)?;
            
            // Set the full path to ffmpeg executable (yt-dlp will find ffprobe in the same directory)
            args.push("--ffmpeg-location".into());
            args.push(ffmpeg_path.to_string_lossy().to_string());
            
            // Debug logging to verify arguments are being set
            println!("[DEBUG] Setting ffmpeg-location: {}", ffmpeg_path.to_string_lossy());
            println!("[DEBUG] Full yt-dlp args: {:?}", args);

            // Progress output (will parse from stdout)
            args.push("--progress".into());
            args.push("--newline".into());
            args.push("--progress-template".into());
            args.push("download:%(progress._percent_str)s".into());
            args.push("--progress-template".into());
            args.push("postprocess:%(progress._percent_str)s".into());

            args.push("-o".into());
            args.push("%(title)s.%(ext)s".into());
            args.push("-P".into());
            args.push(downloads_dir.to_string_lossy().to_string());
            args.push("--no-playlist".into());
            args.push("--no-warnings".into());
            if extract_audio {
                args.push("-x".into());
                args.push("--audio-format".into());
                args.push(audio_format.clone());
                args.push("--audio-quality".into());
                args.push(audio_quality.clone());
                args.push("--prefer-ffmpeg".into());
            } else {
                args.push("--format".into());
                args.push(video_quality.clone());
            }

            // Additional options from settings
            if write_subtitles { args.push("--write-sub".into()); }
            if write_thumbnail { args.push("--write-thumbnail".into()); }
            if write_description { args.push("--write-description".into()); }
            if write_info { args.push("--write-info-json".into()); }
            if write_annotations { args.push("--write-annotations".into()); }
            if write_comments { args.push("--write-comments".into()); }
            if write_automatic_subtitles { args.push("--write-auto-sub".into()); }
            if write_manual_subtitles { args.push("--write-sub".into()); }

            if let Some(r) = retries { args.push("--retries".into()); args.push(r.to_string()); }
            if let Some(r) = fragment_retries { args.push("--fragment-retries".into()); args.push(r.to_string()); }
            if let Some(c) = concurrent_fragments { args.push("--concurrent-fragments".into()); args.push(c.to_string()); }
            // Time range options
            if let (Some(s), Some(e)) = (startTime, endTime) {
                if e > s {
                    // Helper: seconds -> HH:MM:SS
                    fn seconds_to_hhmmss(total_seconds: f64) -> String {
                        let secs = total_seconds.max(0.0).floor() as u64;
                        let h = secs / 3600;
                        let m = (secs % 3600) / 60;
                        let s = secs % 60;
                        format!("{:02}:{:02}:{:02}", h, m, s)
                    }

                    let start_tc = seconds_to_hhmmss(s);
                    let end_tc = seconds_to_hhmmss(e);
                    let duration_s = (e - s).max(0.0);

                    // yt-dlp section trimming
                    args.push("--download-sections".into());
                    args.push(format!("*{}-{}", start_tc, end_tc));

                    // Use yt-dlp section trimming only (avoid extra ffmpeg post-trim to prevent duplicates)
                }
            } else if let Some(s) = startTime { if s >= 0.0 { args.push("--postprocessor-args".into()); args.push(format!("ffmpeg:-ss {}", s)); } }
              else if let Some(e) = endTime { if e > 0.0 { args.push("--postprocessor-args".into()); args.push(format!("ffmpeg:-t {}", e)); } }

            // finally the input URL
            args.push(final_input.clone());

            // Proactively kill any older lingering processes before starting a new one
            // Note: yt-dlp is now a sidecar, so we only need to clean up ffmpeg processes
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("taskkill").args(["/F", "/IM", "ffmpeg.exe"]).output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = Command::new("pkill").args(["-f", "ffmpeg"]).output();
            }

            // Spawn yt-dlp and stream progress
            let yt_dlp_path = get_ytdlp_binary(&app_handle)?;
            let mut child = TokioCommand::new(&yt_dlp_path)
                .args(args)
                .stderr(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to execute yt-dlp: {}", e))?;

            // Record PID for stop_download
            if let Some(pid) = child.id() {
                CURRENT_DL_PID.store(pid as i64, Ordering::SeqCst);
            }

            let mut last_non_progress_line: Option<String> = None;
            if let Some(stdout) = child.stdout.take() {
                let reader = BufReader::new(stdout);
                let mut lines = reader.lines();
                while let Ok(Some(line)) = lines.next_line().await {
                    // Example lines from template: "download: 12.3%" or "postprocess: 45.0%"
                    if let Some(rest) = line.strip_prefix("download:") {
                        let pct = rest.trim().trim_end_matches('%').trim();
                        if let Ok(p) = pct.parse::<f64>() {
                            emit_progress(p, "Downloading...", "downloading");
                        }
                    } else if let Some(rest) = line.strip_prefix("postprocess:") {
                        let pct = rest.trim().trim_end_matches('%').trim();
                        if let Ok(p) = pct.parse::<f64>() {
                            emit_progress(p, "Processing...", "processing");
                        }
                    } else {
                        last_non_progress_line = Some(line);
                    }
                }
            }

            let status = child
                .wait()
                .await
                .map_err(|e| format!("Failed to wait for yt-dlp: {}", e))?;
            // Clear PID
            CURRENT_DL_PID.store(0, Ordering::SeqCst);
            if !status.success() {
                // Fallback: retry without progress flags and without sections
                let mut retry_args: Vec<String> = Vec::new();

                // ffmpeg location
                let ffmpeg_path = get_ffmpeg_binary(&app_handle)?;
                
                // Set the full path to ffmpeg executable (yt-dlp will find ffprobe in the same directory)
                retry_args.push("--ffmpeg-location".into());
                retry_args.push(ffmpeg_path.to_string_lossy().to_string());

                retry_args.push("-o".into());
                retry_args.push("%(title)s.%(ext)s".into());
                retry_args.push("-P".into());
                retry_args.push(downloads_dir.to_string_lossy().to_string());
                retry_args.push("--no-playlist".into());
                retry_args.push("--no-warnings".into());
                if extract_audio {
                    retry_args.push("-x".into());
                    retry_args.push("--audio-format".into());
                    retry_args.push(audio_format.clone());
                }
                // Preserve trimming on retry if a valid selection was provided
                if let (Some(s), Some(e)) = (startTime, endTime) {
                    if e > s {
                        fn seconds_to_hhmmss(total_seconds: f64) -> String {
                            let secs = total_seconds.max(0.0).floor() as u64;
                            let h = secs / 3600;
                            let m = (secs % 3600) / 60;
                            let s = secs % 60;
                            format!("{:02}:{:02}:{:02}", h, m, s)
                        }
                        let start_tc = seconds_to_hhmmss(s);
                        let end_tc = seconds_to_hhmmss(e);
                        let duration_s = (e - s).max(0.0);

                        retry_args.push("--download-sections".into());
                        retry_args.push(format!("*{}-{}", start_tc, end_tc));
                    }
                }

                retry_args.push(final_input.clone());

                let retry_status = TokioCommand::new(&yt_dlp_path)
                    .args(retry_args)
                    .stderr(std::process::Stdio::inherit())
                    .stdout(std::process::Stdio::inherit())
                    .status()
                    .await
                    .map_err(|e| format!("Failed to execute yt-dlp (retry): {}", e))?;
                if !retry_status.success() {
                    let msg = last_non_progress_line.unwrap_or_else(|| "yt-dlp failed".to_string());
                    emit_progress(0.0, &msg, "error");
                    return Err(msg);
                }
            }

            // Locate the downloaded file robustly (extensions + recent creation time)
            let mut file_path: PathBuf;
            {
                let files = fs::read_dir(&downloads_dir)
                    .map_err(|e| format!("Failed to read downloads directory: {}", e))?;
                let now = SystemTime::now();
                let valid_exts_audio = ["mp3", "m4a", "opus", "wav", "flac", "aac", "ogg"];
                let valid_exts_video = ["mp4", "webm", "mkv", "avi"];
                let mut newest: Option<(SystemTime, PathBuf)> = None;

                for entry in files.flatten() {
                    let path = entry.path();
                    if let Some(ext) = path.extension().and_then(|e| e.to_str()) {
                        let is_valid = if extract_audio {
                            valid_exts_audio.contains(&ext.to_lowercase().as_str())
                        } else {
                            valid_exts_video.contains(&ext.to_lowercase().as_str())
                        };
                        if is_valid {
                            if let Ok(meta) = fs::metadata(&path) {
                                if let Ok(created) = meta.created() {
                                    if let Ok(age) = now.duration_since(created) {
                                        // consider files created within last 30 seconds
                                        if age.as_secs() < 30 {
                                            match &newest {
                                                Some((t, _)) if *t >= created => {}
                                                _ => newest = Some((created, path.clone())),
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                if let Some((_, p)) = newest {
                    file_path = p;
                } else {
                    emit_progress(0.0, "Download completed, but file not found", "error");
                    return Err("Download completed, but could not locate output file".to_string());
                }
            }


            emit_progress(100.0, "Download completed", "completed");
            Ok(DownloadResult {
                success: true,
                message: "Download completed".to_string(),
                file_path: Some(file_path.to_string_lossy().to_string()),
            })
        }
        InputType::Unknown => Err("Unknown input type".to_string()),
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct AudioFileInfoFrontend {
    id: String,
    name: String,
    file_path: String,
    directory_type: String,   // "downloads" or "separated"
    created_timestamp: u64,   // Unix timestamp for sorting
    created_display: String,  // Human readable time
    duration: Option<String>, // Duration if available (not computed here)
    file_size: u64,           // File size in bytes
}

#[tauri::command]
async fn get_audio_file_history(app_handle: tauri::AppHandle) -> Result<Vec<AudioFileInfoFrontend>, String> {
    // Resolve output directory from saved settings
    let app_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let settings_path = app_dir.join("settings.json");

    let mut download_base = get_default_download_path()?;
    if settings_path.exists() {
        if let Ok(content) = fs::read_to_string(&settings_path) {
            if let Ok(val) = serde_json::from_str::<Value>(&content) {
                if let Some(s) = val.get("download_path").and_then(|v| v.as_str()) {
                    download_base = s.to_string();
                }
            }
        }
    }

    let downloads_dir = PathBuf::from(&download_base).join("Downloads");
    let separated_dir = PathBuf::from(&download_base).join("Separated");

    let mut items: Vec<AudioFileInfoFrontend> = vec![];
    for (dir, directory_type) in [(&downloads_dir, "downloads"), (&separated_dir, "separated")] {
        if !dir.exists() { continue; }
        for entry in fs::read_dir(dir).map_err(|e| format!("Failed to read dir: {}", e))? {
            if let Ok(entry) = entry {
                let path = entry.path();
                if path.is_file() {
                    if let Ok(meta) = entry.metadata() {
                        let created_ts = meta.created().ok()
                            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                            .map(|d| d.as_secs())
                            .unwrap_or(0);
                        let size = meta.len();
                        let name = path.file_name().and_then(|n| n.to_str()).unwrap_or("").to_string();
                        let created_display = format_timestamp(created_ts);
                        items.push(AudioFileInfoFrontend {
                            id: format!("{}_{}", directory_type, created_ts),
                            name,
                            file_path: path.to_string_lossy().to_string(),
                            directory_type: directory_type.to_string(),
                            created_timestamp: created_ts,
                            created_display,
                            duration: None,
                            file_size: size,
                        });
                    }
                }
            }
        }
    }

    // Newest first
    items.sort_by(|a, b| b.created_timestamp.cmp(&a.created_timestamp));
    Ok(items)
}

#[tauri::command]
async fn copy_audio_file_to_clipboard(filePath: String) -> Result<String, String> {
    let path = PathBuf::from(&filePath);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        // Method 1: AppleScript to set file on clipboard
        let script = format!("set the clipboard to (POSIX file \"{}\")", path.to_string_lossy());
        let status = Command::new("osascript")
            .args(["-e", &script])
            .status()
            .map_err(|e| format!("Failed to copy file to clipboard: {}", e))?;
        if status.success() {
            Ok("Copied file to clipboard".into())
        } else {
            // Method 2: Fallback to copying file URL via pbcopy
            let file_url = format!("file://{}", path.to_string_lossy());
            let fallback = Command::new("sh")
                .args(["-c", &format!("echo '{}' | pbcopy", file_url)])
                .status()
                .map_err(|e| format!("Failed to execute pbcopy: {}", e))?;
            if fallback.success() { Ok("Copied file URL to clipboard".into()) } else { Err("Failed to copy file to clipboard".into()) }
        }
    }

    #[cfg(target_os = "windows")]
    {
        // Method 1: PowerShell Set-Clipboard -Path
        let script = format!("Set-Clipboard -Path '{}'", filePath.replace("'", "''"));
        let status = Command::new("powershell")
            .args(["-Command", &script])
            .status()
            .map_err(|e| format!("Failed to execute PowerShell: {}", e))?;
        if status.success() {
            Ok("Copied file to clipboard".into())
        } else {
            // Method 2: Alternative pipeline fallback
            let alt = format!("Get-Item '{}' | Set-Clipboard", filePath.replace("'", "''"));
            let alt_status = Command::new("powershell")
                .args(["-Command", &alt])
                .status()
                .map_err(|e| format!("Failed to execute PowerShell fallback: {}", e))?;
            if alt_status.success() { Ok("Copied file to clipboard".into()) } else { Err("Failed to copy file to clipboard".into()) }
        }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        // Method 1: xclip with text/uri-list
        let file_uri = format!("file://{}", path.to_string_lossy());
        let output = Command::new("xclip")
            .args(["-selection", "clipboard", "-t", "text/uri-list"])
            .stdin(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to start xclip: {}", e))?;
        let mut child = output;
        if let Some(stdin) = child.stdin.as_mut() {
            use std::io::Write;
            stdin.write_all(file_uri.as_bytes()).map_err(|e| format!("Failed writing to xclip: {}", e))?;
        }
        let status = child.wait().map_err(|e| format!("xclip wait failed: {}", e))?;
        if status.success() {
            Ok("Copied file to clipboard".into())
        } else {
            // Method 2: Fallback copy path as text
            use std::io::Write;
            let mut child2 = Command::new("xclip")
                .args(["-selection", "clipboard"]).stdin(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to execute xclip: {}", e))?;
            if let Some(stdin) = child2.stdin.as_mut() { stdin.write_all(filePath.as_bytes()).map_err(|e| format!("Failed writing to xclip: {}", e))?; }
            let status2 = child2.wait().map_err(|e| format!("xclip wait failed: {}", e))?;
            if status2.success() { Ok("Copied file path to clipboard".into()) } else { Err("Failed to copy file to clipboard".into()) }
        }
    }
}

#[tauri::command]
async fn delete_file(filePath: String) -> Result<String, String> {
    let path = PathBuf::from(&filePath);
    if !path.exists() {
        return Err("File does not exist".to_string());
    }
    fs::remove_file(&path).map_err(|e| format!("Failed to delete file: {}", e))?;
    Ok("File deleted".into())
}

#[tauri::command]
async fn open_in_explorer(path: String) -> Result<(), String> {
    let target = PathBuf::from(&path);
    if !target.exists() {
        return Err("Path does not exist".to_string());
    }

    #[cfg(target_os = "macos")]
    {
        let status = Command::new("open")
            .args(["-R", target.to_string_lossy().as_ref()])
            .status()
            .map_err(|e| format!("Failed to open Finder: {}", e))?;
        if status.success() { Ok(()) } else { Err("Failed to open Finder".into()) }
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("explorer")
            .args(["/select,", target.to_string_lossy().as_ref()])
            .status()
            .map_err(|e| format!("Failed to open Explorer: {}", e))?;
        if status.success() { Ok(()) } else { Err("Failed to open Explorer".into()) }
    }

    #[cfg(all(unix, not(target_os = "macos")))]
    {
        let dir = target.parent().unwrap_or(Path::new("."));
        let status = Command::new("xdg-open")
            .arg(dir)
            .status()
            .map_err(|e| format!("Failed to open file manager: {}", e))?;
        if status.success() { Ok(()) } else { Err("Failed to open file manager".into()) }
    }
}

#[tauri::command]
async fn stop_download() -> Result<(), String> {
    let pid = CURRENT_DL_PID.load(Ordering::SeqCst);
    if pid <= 0 {
        // Even if we have no recorded PID, attempt aggressive cleanup of known tools
        // Note: yt-dlp is now a sidecar, so we only need to clean up ffmpeg processes
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill").args(["/F", "/IM", "ffmpeg.exe"]).output();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("pkill").args(["-9", "-f", "ffmpeg"]).output();
            let _ = Command::new("pkill").args(["-f", "ffmpeg"]).output();
        }
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        let status = Command::new("taskkill")
            .args(["/PID", &pid.to_string(), "/T", "/F"])
            .status()
            .map_err(|e| format!("Failed to kill process: {}", e))?;
        if !status.success() {
            return Err("Failed to kill process".into());
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let status = Command::new("kill")
            .args(["-TERM", &pid.to_string()])
            .status()
            .map_err(|e| format!("Failed to kill process: {}", e))?;
        if !status.success() {
            return Err("Failed to kill process".into());
        }
    }

    CURRENT_DL_PID.store(0, Ordering::SeqCst);

    // After killing the specific PID, also do an aggressive cleanup to ensure child processes are gone
    // Note: yt-dlp is now a sidecar, so we only need to clean up ffmpeg processes
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill").args(["/F", "/IM", "ffmpeg.exe"]).output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("pkill").args(["-9", "-f", "ffmpeg"]).output();
        let _ = Command::new("pkill").args(["-f", "ffmpeg"]).output();
    }
    Ok(())
}

#[tauri::command]
async fn list_audio_separator_models(app_handle: tauri::AppHandle) -> Result<Vec<ModelInfo>, String> {
    println!("[DEBUG] Starting list_audio_separator_models...");
    
    // Get audio-separator binary path
    let executable_path = get_audio_separator_binary(&app_handle)?;
    println!("[DEBUG] Executable path: {:?}", executable_path);
    println!("[DEBUG] Executable exists: {}", executable_path.exists());
    println!("[DEBUG] Executable is file: {}", executable_path.is_file());
    
    // Check executable permissions
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(&executable_path) {
            println!("[DEBUG] Executable permissions (octal): {:o}", metadata.permissions().mode());
        }
    }
    
    // List directory contents around the executable
    if let Some(parent) = executable_path.parent() {
        println!("[DEBUG] Executable parent directory: {:?}", parent);
        if let Ok(entries) = std::fs::read_dir(parent) {
            println!("[DEBUG] Parent directory contents:");
            for entry in entries.flatten() {
                println!("  - {:?}", entry.path());
            }
        }
    }

    // Try to run with --help first to test basic functionality
    println!("[DEBUG] Testing executable with --help...");
    let help_output = Command::new(&executable_path)
        .arg("--help")
        .output();
    
    match help_output {
        Ok(help) => {
            println!("[DEBUG] --help command successful: {}", help.status.success());
            if !help.status.success() {
                println!("[DEBUG] --help stderr: {}", String::from_utf8_lossy(&help.stderr));
            }
        }
        Err(e) => {
            println!("[DEBUG] --help command failed: {}", e);
        }
    }

    // Execute audio-separator --list_models --list_format json
    println!("[DEBUG] Executing --list_models command...");
    let output = Command::new(executable_path)
        .args(&["--list_models", "--list_format", "json"])
        .output()
        .map_err(|e| format!("Failed to execute audio-separator: {}", e))?;

    println!("[DEBUG] Command completed with status: {:?}", output.status);
    println!("[DEBUG] Command stdout length: {} bytes", output.stdout.len());
    println!("[DEBUG] Command stderr length: {} bytes", output.stderr.len());
    
    if !output.status.success() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        println!("[DEBUG] Command failed with stderr: {}", error_msg);
        return Err(format!("audio-separator failed: {}", error_msg));
    }

    // Parse the JSON output - it's an object with model names as keys
    let json_str = String::from_utf8_lossy(&output.stdout);
    println!("[DEBUG] Raw JSON output length: {} characters", json_str.len());
    println!("[DEBUG] Raw JSON output (first 500 chars): {}", &json_str[..std::cmp::min(500, json_str.len())]);
    
    let json_value: serde_json::Value = serde_json::from_str(&json_str)
        .map_err(|e| format!("Failed to parse models JSON: {}", e))?;
    println!("[DEBUG] JSON parsed successfully");

    let mut models = Vec::new();
    println!("[DEBUG] Starting to parse JSON structure...");
    
    if let Some(json_obj) = json_value.as_object() {
        println!("[DEBUG] JSON is an object with {} top-level keys", json_obj.len());
        println!("[DEBUG] Top-level keys: {:?}", json_obj.keys().collect::<Vec<_>>());
        
        for (architecture, category_data) in json_obj {
            println!("[DEBUG] Processing architecture: {}", architecture);
            
            if let Some(category_obj) = category_data.as_object() {
                println!("[DEBUG] Architecture {} has {} models", architecture, category_obj.len());
                
                for (model_name, model_data) in category_obj {
                    println!("[DEBUG] Processing model: {}", model_name);
                    
                    if let Some(model_obj) = model_data.as_object() {
                        if let Some(filename) = model_obj.get("filename").and_then(|v| v.as_str()) {
                            println!("[DEBUG] Model {} has filename: {}", model_name, filename);
                            
                            // Extract stems from the model data - only use the "stems" field
                            let stems = if let Some(stems_array) = model_obj.get("stems") {
                                if let Some(stems_vec) = stems_array.as_array() {
                                    let stems_list: Vec<&str> = stems_vec.iter()
                                        .filter_map(|s| s.as_str())
                                        .collect();
                                    println!("[DEBUG] Model {} has stems: {:?}", model_name, stems_list);
                                    stems_list.join(", ")
    } else {
                                    println!("[DEBUG] Model {} has stems but not as array: {:?}", model_name, stems_array);
                                    "Unknown".to_string()
                                }
                            } else {
                                println!("[DEBUG] Model {} has no stems field", model_name);
                                "Unknown".to_string()
                            };

                            // Use the architecture from the JSON structure (VR, MDX, Demucs, MDXC)
                            let arch = architecture.to_string();
                            println!("[DEBUG] Model {} assigned architecture: {}", model_name, arch);

                            models.push(ModelInfo {
                                filename: filename.to_string(),
                                arch: arch.to_string(),
                                output_stems: stems,
                                friendly_name: model_name.to_string(),
                            });
                            println!("[DEBUG] Added model {} to results", model_name);
                        } else {
                            println!("[DEBUG] Model {} has no filename field", model_name);
                        }
                    } else {
                        println!("[DEBUG] Model {} data is not an object", model_name);
                    }
                }
            } else {
                println!("[DEBUG] Architecture {} data is not an object", architecture);
            }
        }
    } else {
        println!("[DEBUG] JSON is not an object");
    }
    
    println!("[DEBUG] Parsing complete. Found {} models", models.len());

    Ok(models)
}

#[tauri::command]
async fn list_downloaded_models(app_handle: tauri::AppHandle, modelDirectory: String) -> Result<Vec<DownloadedModel>, String> {
    let model_dir = PathBuf::from(&modelDirectory);
    
    if !model_dir.exists() {
        return Ok(Vec::new());
    }

    let mut models = Vec::new();
    
    if let Ok(entries) = fs::read_dir(&model_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(filename) = path.file_name().and_then(|n| n.to_str()) {
                    // Only include actual model files
                    let is_model_file = filename.ends_with(".ckpt") || 
                                      filename.ends_with(".pth") || 
                                      filename.ends_with(".onnx") ||
                                      filename.ends_with(".safetensors") ||
                                      filename.ends_with(".bin");
                    
                    if is_model_file {
                        // Create a friendly name by replacing underscores and hyphens with spaces
                        let friendly_name = filename
                            .replace("_", " ")
                            .replace("-", " ")
                            .replace(".ckpt", "")
                            .replace(".pth", "")
                            .replace(".onnx", "")
                            .replace(".safetensors", "")
                            .replace(".bin", "");
                        
                        models.push(DownloadedModel {
                            filename: filename.to_string(),
                                friendly_name,
                            });
                        }
                    }
                }
            }
        }
        
    Ok(models)
}

#[tauri::command]
async fn delete_model(app_handle: tauri::AppHandle, model_filename: String, modelDirectory: String) -> Result<(), String> {
    let model_path = PathBuf::from(&modelDirectory).join(&model_filename);
    
    if !model_path.exists() {
        return Err("Model file not found".to_string());
    }

    fs::remove_file(&model_path)
        .map_err(|e| format!("Failed to delete model: {}", e))?;

    Ok(())
}

#[tauri::command]
async fn download_audio_separator_model(app_handle: tauri::AppHandle, model_filename: String, modelDirectory: String) -> Result<(), String> {
    // Get audio-separator binary path
    let executable_path = get_audio_separator_binary(&app_handle)?;

    // Create model directory if it doesn't exist
    let model_dir = PathBuf::from(&modelDirectory);
        fs::create_dir_all(&model_dir)
            .map_err(|e| format!("Failed to create model directory: {}", e))?;

    // Get ffmpeg directory for PATH
    let ffmpeg_dir = get_ffmpeg_binary(&app_handle)
        .ok()
        .and_then(|ffmpeg_path| ffmpeg_path.parent().map(|p| p.to_string_lossy().to_string()));

    // Execute audio-separator --download_model_only -m <model_filename> --model_file_dir <modelDirectory>
    let mut cmd = Command::new(executable_path);
    cmd.args(&[
            "--download_model_only",
            "-m", &model_filename,
        "--model_file_dir", &modelDirectory
    ]);
    
    // Add ffmpeg to PATH if available
    if let Some(ffmpeg_path) = ffmpeg_dir {
        let current_path = std::env::var("PATH").unwrap_or_default();
        let new_path = if cfg!(target_os = "windows") {
            format!("{};{}", current_path, ffmpeg_path)
        } else {
            format!("{}:{}", current_path, ffmpeg_path)
        };
        cmd.env("PATH", new_path);
        
        // Also set explicit environment variables for audio-separator
        cmd.env("FFMPEG_PATH", format!("{}/ffmpeg", ffmpeg_path));
        cmd.env("FFPROBE_PATH", format!("{}/ffprobe", ffmpeg_path));
    }

    let output = cmd
        .current_dir(&model_dir)
        .output()
        .map_err(|e| format!("Failed to execute audio-separator: {}", e))?;

    if !output.status.success() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        return Err(format!("audio-separator download failed: {}", error_msg));
    }

    // Verify the model was downloaded
    let expected_model_path = model_dir.join(&model_filename);
    if !expected_model_path.exists() {
        return Err("Model download completed but file not found".to_string());
    }

    Ok(())
}

#[tauri::command]
async fn list_separation_models(app_handle: tauri::AppHandle) -> Result<Vec<ModelInfo>, String> {
    // Alias for list_audio_separator_models for frontend compatibility
    list_audio_separator_models(app_handle).await
}

#[tauri::command]
async fn perform_audio_separation(
    app_handle: tauri::AppHandle,
    inputFile: String,
    settings: SeparationSettings,
    selectedStems: Vec<String>,
) -> Result<SeparationResult, String> {
    println!("[DEBUG] Starting audio separation...");
    println!("[DEBUG] Input file: {}", inputFile);
    println!("[DEBUG] Settings: {:?}", settings);
    println!("[DEBUG] Selected stems: {:?}", selectedStems);
    
    // Check system resources before starting
    #[cfg(target_os = "macos")]
    {
        use std::process::Command;
        if let Ok(output) = Command::new("top").args(["-l", "1", "-n", "0"]).output() {
            let top_output = String::from_utf8_lossy(&output.stdout);
            println!("[DEBUG] System resource status:");
            for line in top_output.lines().take(10) {
                println!("[DEBUG] {}", line);
            }
        }
    }
    
    // Get audio-separator binary path
    let executable_path = get_audio_separator_binary(&app_handle)?;
    println!("[DEBUG] Using executable: {:?}", executable_path);

    // Create output directory
    let output_dir = if settings.output_dir.is_empty() {
        let input_path = PathBuf::from(&inputFile);
        let parent = input_path.parent().unwrap_or_else(|| Path::new("."));
        parent.join("Separated")
    } else {
        PathBuf::from(&settings.output_dir)
    };
    
    println!("[DEBUG] Output directory: {:?}", output_dir);

    fs::create_dir_all(&output_dir)
        .map_err(|e| format!("Failed to create output directory: {}", e))?;
    println!("[DEBUG] Output directory created successfully");

    // Get ffmpeg directory for PATH
    let ffmpeg_dir = get_ffmpeg_binary(&app_handle)
        .ok()
        .and_then(|ffmpeg_path| ffmpeg_path.parent().map(|p| p.to_string_lossy().to_string()));

    // Build command arguments - store all strings in a vector to avoid lifetime issues
    let mut string_args = Vec::new();
    
    // Add basic arguments that are common to all models
    string_args.push(("--output_dir", output_dir.to_string_lossy().to_string()));

    // Determine model type from filename and only add relevant parameters
    let model_filename_lower = settings.model_filename.to_lowercase();
    
    // Add GPU acceleration if specified
    let mut use_autocast = false;
    if settings.use_gpu && settings.use_autocast {
        use_autocast = true;
    }
    
    // Performance optimizations for ONNX models
    if model_filename_lower.contains(".onnx") {
        // Enable autocast for better performance on supported hardware
        if settings.use_gpu {
            use_autocast = true;
        }
    }
    
    // For ONNX models, use minimal parameters to avoid conflicts and improve performance
    if model_filename_lower.contains(".onnx") {
        // Only add essential parameters for ONNX models
        string_args.push(("--sample_rate", settings.sample_rate.to_string()));
        string_args.push(("--normalization", settings.normalization.to_string()));
        string_args.push(("--amplification", settings.amplification.to_string()));
        
        // Add single stem if specified
        if let Some(single_stem) = &settings.single_stem {
            string_args.push(("--single_stem", single_stem.clone()));
        }
        
        // Add model file directory if specified
        if !settings.model_file_dir.is_empty() {
            string_args.push(("--model_file_dir", settings.model_file_dir.clone()));
        }
        
        // Skip all architecture-specific parameters for ONNX models
    } else if model_filename_lower.contains(".ckpt") || model_filename_lower.contains(".pth") {
        // MDX model - add MDX-specific parameters
        string_args.push(("--mdx_segment_size", settings.mdx_segment_size.to_string()));
        string_args.push(("--mdx_overlap", settings.mdx_overlap.to_string()));
        string_args.push(("--mdx_batch_size", settings.mdx_batch_size.to_string()));
        
        if settings.mdx_enable_denoise {
            string_args.push(("--mdx_enable_denoise", "".to_string())); // Boolean flag, no value
        }
    } else if model_filename_lower.contains("vr") || model_filename_lower.contains("vocal") {
        // VR model - add VR-specific parameters
        string_args.push(("--vr_batch_size", settings.vr_batch_size.to_string()));
        string_args.push(("--vr_window_size", settings.vr_window_size.to_string()));
        string_args.push(("--vr_aggression", settings.vr_aggression.to_string()));
        
        if settings.vr_enable_tta {
            string_args.push(("--vr_enable_tta", "".to_string())); // Boolean flag, no value
        }
        if settings.vr_high_end_process {
            string_args.push(("--vr_high_end_process", "".to_string())); // Boolean flag, no value
        }
        if settings.vr_enable_post_process {
            string_args.push(("--vr_enable_post_process", "".to_string())); // Boolean flag, no value
            string_args.push(("--vr_post_process_threshold", settings.vr_post_process_threshold.to_string()));
        }
    } else if model_filename_lower.contains("demucs") {
        // Demucs model - add Demucs-specific parameters
        string_args.push(("--demucs_segment_size", settings.demucs_segment_size.clone()));
        string_args.push(("--demucs_shifts", settings.demucs_shifts.to_string()));
        string_args.push(("--demucs_overlap", settings.demucs_overlap.to_string()));
        
        if !settings.demucs_segments_enabled {
            string_args.push(("--demucs_segments_enabled", "false".to_string()));
        }
    } else if model_filename_lower.contains("mdxc") {
        // MDXC model - add MDXC-specific parameters
        string_args.push(("--mdxc_segment_size", settings.mdxc_segment_size.to_string()));
        string_args.push(("--mdxc_overlap", settings.mdxc_overlap.to_string()));
        string_args.push(("--mdxc_batch_size", settings.mdxc_batch_size.to_string()));
        string_args.push(("--mdxc_pitch_shift", settings.mdxc_pitch_shift.to_string()));
        
        if settings.mdxc_override_model_segment_size {
            string_args.push(("--mdxc_override_model_segment_size", "".to_string())); // Boolean flag, no value
        }
    }

    // Debug: Print all collected string arguments
    println!("[DEBUG] Collected string arguments:");
    for (i, (arg_name, arg_value)) in string_args.iter().enumerate() {
        println!("[DEBUG]   [{}] {} = '{}' (len: {})", i, arg_name, arg_value, arg_value.len());
    }

    // Build the final args vector - be very careful about argument formatting
    let mut args = Vec::new();
    
    // Add model argument
    args.push("-m");
    args.push(&settings.model_filename);
    
    // Add all the string arguments with validation
    for (arg_name, arg_value) in &string_args {
        // Clean and validate argument name
        let clean_arg_name = arg_name.trim();
        if clean_arg_name.is_empty() {
            println!("[DEBUG] Skipping empty argument name");
            continue;
        }
        
        // Clean and validate argument value
        let clean_arg_value = arg_value.trim();
        
        // Additional validation: check for hidden characters or problematic values
        if clean_arg_value.contains('\0') || clean_arg_value.contains('\r') || clean_arg_value.contains('\n') {
            println!("[DEBUG] Skipping argument '{}' with problematic value: '{}'", clean_arg_name, clean_arg_value);
            continue;
        }
        
        // Handle boolean flags (empty values) vs regular arguments
        if clean_arg_value.is_empty() {
            // This is a boolean flag - add it without a value
            args.push(clean_arg_name);
            println!("[DEBUG] Added boolean flag: {}", clean_arg_name);
        } else {
            // This is a regular argument with a value
            args.push(clean_arg_name);
            args.push(clean_arg_value);
            println!("[DEBUG] Added argument: {} = {}", clean_arg_name, clean_arg_value);
        }
    }
    
    // Add GPU acceleration if specified
    if use_autocast {
        args.push("--use_autocast");
        println!("[DEBUG] Added GPU acceleration: --use_autocast");
    }

    // Add input file - validate the path
    let clean_input_file = inputFile.trim();
    if clean_input_file.is_empty() {
        return Err("Input file path is empty".to_string());
    }
    
    // Check for problematic characters in input file path
    if clean_input_file.contains('\0') || clean_input_file.contains('\r') || clean_input_file.contains('\n') {
        return Err(format!("Input file path contains problematic characters: '{}'", clean_input_file));
    }
    
    args.push(clean_input_file);
    println!("[DEBUG] Added input file: '{}' (len: {})", clean_input_file, clean_input_file.len());

    // Execute audio-separator
    println!("[DEBUG] Final command arguments: {:?}", args);
    println!("[DEBUG] Working directory: {:?}", output_dir);
    
    let mut cmd = Command::new(&executable_path);
    cmd.args(&args);
    
    // Debug: Print the exact command being executed
    println!("[DEBUG] Executable path: {:?}", executable_path);
    println!("[DEBUG] Command args: {:?}", args);
    println!("[DEBUG] Full command: {} {}", executable_path.display(), args.join(" "));
    
    // Add ffmpeg to PATH if available
    if let Some(ffmpeg_path) = ffmpeg_dir {
        let current_path = std::env::var("PATH").unwrap_or_default();
        let new_path = if cfg!(target_os = "windows") {
            format!("{};{}", current_path, ffmpeg_path)
        } else {
            format!("{}:{}", current_path, ffmpeg_path)
        };
        cmd.env("PATH", &new_path);
        println!("[DEBUG] Set PATH to include FFmpeg: {}", new_path);
        
        // Also set explicit environment variables for audio-separator
        cmd.env("FFMPEG_PATH", format!("{}/ffmpeg", ffmpeg_path));
        cmd.env("FFPROBE_PATH", format!("{}/ffprobe", ffmpeg_path));
        println!("[DEBUG] Set FFMPEG_PATH: {}/ffmpeg", ffmpeg_path);
        println!("[DEBUG] Set FFPROBE_PATH: {}/ffprobe", ffmpeg_path);
    }

    println!("[DEBUG] Starting audio-separator process...");
    println!("[DEBUG] This may take a while. Monitoring progress...");
    
    let output = cmd
        .current_dir(&output_dir)
        .output()
        .map_err(|e| format!("Failed to execute audio-separator: {}", e))?;

    println!("[DEBUG] Process completed with status: {:?}", output.status);
    println!("[DEBUG] STDOUT length: {} bytes", output.stdout.len());
    println!("[DEBUG] STDERR length: {} bytes", output.stderr.len());
    
    if !output.status.success() {
        let error_msg = String::from_utf8_lossy(&output.stderr);
        println!("[DEBUG] Process failed with stderr: {}", error_msg);
        return Err(format!("Audio separation failed: {}", error_msg));
    }
    
    let stdout = String::from_utf8_lossy(&output.stdout);
    println!("[DEBUG] Process stdout: {}", stdout);

    // Find output files
    println!("[DEBUG] Searching for output files in: {:?}", output_dir);
    let mut output_files = Vec::new();
    if let Ok(entries) = fs::read_dir(&output_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_file() {
                if let Some(ext) = path.extension() {
                    if ext == "wav" || ext == "mp3" || ext == "flac" {
                        output_files.push(path.to_string_lossy().to_string());
                        println!("[DEBUG] Found output file: {:?}", path);
                    }
                }
            }
        }
    }
    
    println!("[DEBUG] Total output files found: {}", output_files.len());

    Ok(SeparationResult {
        success: true,
        message: "Audio separation completed successfully".to_string(),
        output_files,
    })
}

#[tauri::command]
async fn detect_gpu_capabilities() -> Result<GPUInfo, String> {
    #[cfg(target_os = "macos")]
    {
        if std::env::consts::ARCH == "aarch64" {
            return Ok(GPUInfo {
                gpu_type: "mps".to_string(),
                is_available: true,
                description: "Apple Metal Performance Shaders (MPS) - Best for Apple Silicon Macs".to_string(),
            });
        }
        return Ok(GPUInfo {
            gpu_type: "cpu".to_string(),
            is_available: false,
            description: "CPU processing - Intel Mac fallback".to_string(),
        });
    }

    #[cfg(target_os = "windows")]
    {
        // Check for CUDA
        if let Ok(output) = Command::new("nvidia-smi").output() {
            if output.status.success() {
                return Ok(GPUInfo {
                    gpu_type: "cuda".to_string(),
                    is_available: true,
                    description: "NVIDIA CUDA GPU acceleration available".to_string(),
                });
            }
        }
        return Ok(GPUInfo {
            gpu_type: "cpu".to_string(),
            is_available: false,
            description: "CPU processing - Windows fallback".to_string(),
        });
    }

    #[cfg(target_os = "linux")]
    {
        // Check for CUDA
        if let Ok(output) = Command::new("nvidia-smi").output() {
    if output.status.success() {
                return Ok(GPUInfo {
                    gpu_type: "cpu".to_string(),
                    is_available: false,
                    description: "CPU processing - Linux fallback".to_string(),
                });
            }
        }
        return Ok(GPUInfo {
            gpu_type: "cpu".to_string(),
            is_available: false,
            description: "CPU processing - Linux fallback".to_string(),
        });
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
                            .setup(|app| {
                        // No initialization needed - binaries are resolved on-demand
                        Ok(())
                    })
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            select_folder,
            select_file,
            detect_input_type,
            fetch_video_info,
            get_local_file_info,
            unified_download,
            get_audio_file_history,
            open_in_explorer,
            stop_download,
            copy_audio_file_to_clipboard,
            delete_file,
            list_audio_separator_models,
            list_downloaded_models,
            list_separation_models,
            download_audio_separator_model,
            delete_model,
            perform_audio_separation,
            detect_gpu_capabilities
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}



