// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
use rfd::FileDialog;
use serde_json::Value;
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_python::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_settings,
            save_settings,
            select_folder,
            select_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
