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

static CURRENT_DL_PID: AtomicI64 = AtomicI64::new(0);

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
async fn fetch_video_info(url: String) -> Result<VideoInfo, String> {
    if url.trim().is_empty() {
        return Err("URL cannot be empty".to_string());
    }

    // Check if yt-dlp is available
    let yt_dlp_check = Command::new("yt-dlp")
        .arg("--version")
        .output();

    if yt_dlp_check.is_err() {
        return Err("yt-dlp is not installed or not available in PATH".to_string());
    }

    // Check if it's a Spotify URL
    if url.contains("spotify.com") || url.contains("open.spotify.com") {
        return handle_spotify_url(&url).await;
    }

    // Use yt-dlp to extract video information for other URLs
    let output = Command::new("yt-dlp")
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

async fn handle_spotify_url(spotify_url: &str) -> Result<VideoInfo, String> {
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
        let youtube_search_output = Command::new("yt-dlp")
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
        return Some(PathBuf::from(bin_name));
    }

    // Try bundled resource path
    if let Ok(resource_dir) = app_handle.path().resource_dir() {
        // resources/ffmpeg/<bin>
        let mut candidate = resource_dir.clone();
        candidate.push("resources/ffmpeg");

        // Platform specific executable name
        #[cfg(target_os = "windows")]
        let exe = format!("{}.exe", bin_name);
        #[cfg(not(target_os = "windows"))]
        let exe = bin_name.to_string();

        candidate.push(&exe);
        if candidate.exists() {
            return Some(candidate);
        }
    }

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
    let ffprobe_path = resolve_ff_binary(&app_handle, "ffprobe")
        .ok_or_else(|| "ffprobe not found in PATH or bundled resources".to_string())?;

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
                if let Ok(info) = handle_spotify_url(&input).await {
                    if let Some(yurl) = info.video_url {
                        final_input = yurl;
                    }
                }
            }

            // Ensure ffmpeg/ffprobe are found by yt-dlp
            let ffmpeg_path_opt = resolve_ff_binary(&app_handle, "ffmpeg");
            let ffprobe_path_opt = resolve_ff_binary(&app_handle, "ffprobe");
            if let (Some(ffmpeg_path), Some(_ffprobe_path)) = (ffmpeg_path_opt, ffprobe_path_opt) {
                if let Some(dir) = ffmpeg_path.parent() {
                    args.push("--ffmpeg-location".into());
                    args.push(dir.to_string_lossy().to_string());
                }
            }

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
            #[cfg(target_os = "windows")]
            {
                let _ = Command::new("taskkill").args(["/F", "/IM", "yt-dlp.exe"]).output();
                let _ = Command::new("taskkill").args(["/F", "/IM", "spotdl.exe"]).output();
                let _ = Command::new("taskkill").args(["/F", "/IM", "ffmpeg.exe"]).output();
            }
            #[cfg(not(target_os = "windows"))]
            {
                let _ = Command::new("pkill").args(["-f", "yt-dlp"]).output();
                let _ = Command::new("pkill").args(["-f", "spotdl"]).output();
                let _ = Command::new("pkill").args(["-f", "ffmpeg"]).output();
            }

            // Spawn yt-dlp and stream progress
            let mut child = TokioCommand::new("yt-dlp")
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
                let ffmpeg_path_opt = resolve_ff_binary(&app_handle, "ffmpeg");
                let ffprobe_path_opt = resolve_ff_binary(&app_handle, "ffprobe");
                if let (Some(ffmpeg_path), Some(_ffprobe_path)) = (ffmpeg_path_opt, ffprobe_path_opt) {
                    if let Some(dir) = ffmpeg_path.parent() {
                        retry_args.push("--ffmpeg-location".into());
                        retry_args.push(dir.to_string_lossy().to_string());
                    }
                }

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

                let retry_status = TokioCommand::new("yt-dlp")
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
        #[cfg(target_os = "windows")]
        {
            let _ = Command::new("taskkill").args(["/F", "/IM", "yt-dlp.exe"]).output();
            let _ = Command::new("taskkill").args(["/F", "/IM", "spotdl.exe"]).output();
            let _ = Command::new("taskkill").args(["/F", "/IM", "python.exe"]).output();
            let _ = Command::new("taskkill").args(["/F", "/IM", "ffmpeg.exe"]).output();
        }
        #[cfg(not(target_os = "windows"))]
        {
            let _ = Command::new("pkill").args(["-9", "-f", "yt-dlp"]).output();
            let _ = Command::new("pkill").args(["-f", "yt-dlp"]).output();
            let _ = Command::new("pkill").args(["-9", "-f", "spotdl"]).output();
            let _ = Command::new("pkill").args(["-f", "spotdl"]).output();
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
    #[cfg(target_os = "windows")]
    {
        let _ = Command::new("taskkill").args(["/F", "/IM", "yt-dlp.exe"]).output();
        let _ = Command::new("taskkill").args(["/F", "/IM", "spotdl.exe"]).output();
        let _ = Command::new("taskkill").args(["/F", "/IM", "python.exe"]).output();
        let _ = Command::new("taskkill").args(["/F", "/IM", "ffmpeg.exe"]).output();
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = Command::new("pkill").args(["-9", "-f", "yt-dlp"]).output();
        let _ = Command::new("pkill").args(["-f", "yt-dlp"]).output();
        let _ = Command::new("pkill").args(["-9", "-f", "spotdl"]).output();
        let _ = Command::new("pkill").args(["-f", "spotdl"]).output();
        let _ = Command::new("pkill").args(["-9", "-f", "ffmpeg"]).output();
        let _ = Command::new("pkill").args(["-f", "ffmpeg"]).output();
    }
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
            delete_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}


