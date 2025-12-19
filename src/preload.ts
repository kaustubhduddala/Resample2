import { contextBridge, ipcRenderer } from 'electron';

// Settings type definition
interface AppSettings {
  download_path: string;
  audio_format: string;
  audio_quality: string;
  video_format: string;
  video_quality: string;
  extract_audio: boolean;
  write_subtitles: boolean;
  write_thumbnail: boolean;
  write_description: boolean;
  write_info: boolean;
  separation_settings: { output_format: string };
  model_directory: string;
  theme: string;
}

// Downloaded file type
interface DownloadedFile {
  id: string;
  name: string;
  path: string;
  file_size: number;
  created: number;
  created_display: string;
  directory_type: 'downloads' | 'separated';
  file_extension: string;
}

// Expose protected methods that allow the renderer process to use
// the APIs in a safe way
contextBridge.exposeInMainWorld('electronAPI', {
  // FFmpeg check
  checkFFmpeg: () => ipcRenderer.invoke('ytdlp:check-ffmpeg'),
  
  // Video info
  getVideoInfo: (url: string) => ipcRenderer.invoke('ytdlp:get-info', url),
  getThumbnails: (url: string) => ipcRenderer.invoke('ytdlp:get-thumbnails', url),
  
  // Spotify
  getSpotifyTrackAndYouTube: (spotifyUrl: string) =>
    ipcRenderer.invoke('spotify:get-track-and-youtube', spotifyUrl),
  
  // Download
  downloadVideo: (url: string, options: any) =>
    ipcRenderer.invoke('ytdlp:download', url, options),
  
  // Download progress listener
  onDownloadProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('download-progress', (_, progress) => callback(progress));
  },
  removeDownloadProgressListener: () => {
    ipcRenderer.removeAllListeners('download-progress');
  },
  
  // File dialog
  openFileDialog: () => ipcRenderer.invoke('dialog:open-file'),
  
  // Directory dialog
  openDirectoryDialog: () => ipcRenderer.invoke('dialog:open-directory'),
  
  // Shell operations
  openPathInShell: (filePath: string) => ipcRenderer.invoke('shell:open-path', filePath),
  
  // Settings management
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:save', settings),
  
  // Get default paths
  getDefaultPaths: () => ipcRenderer.invoke('paths:get-defaults'),

  // File operations
  listDownloadedFiles: (downloadPath: string) => ipcRenderer.invoke('files:list-downloads', downloadPath),
  deleteFile: (filePath: string) => ipcRenderer.invoke('files:delete', filePath),
  showFileInFolder: (filePath: string) => ipcRenderer.invoke('files:show-in-folder', filePath),
  
  // Audio separation
  separateAudio: (filePath: string, outputDir: string, modelName?: string) =>
    ipcRenderer.invoke('audio:separate', filePath, outputDir, modelName),
  onAudioSeparationProgress: (callback: (progress: any) => void) => {
    ipcRenderer.on('audio-separation-progress', (_, progress) => callback(progress));
  },
  removeAudioSeparationProgressListener: () => {
    ipcRenderer.removeAllListeners('audio-separation-progress');
  },
});

// Type definitions for TypeScript
declare global {
  interface Window {
    electronAPI: {
      checkFFmpeg: () => Promise<{ success: boolean; installed?: boolean; error?: string }>;
      getVideoInfo: (url: string) => Promise<{ success: boolean; info?: any; error?: string }>;
      getThumbnails: (url: string) => Promise<{ success: boolean; thumbnails?: any[]; error?: string }>;
      getSpotifyTrackAndYouTube: (spotifyUrl: string) => Promise<{ 
        success: boolean; 
        spotifyInfo?: any; 
        youtubeUrl?: string | null; 
        youtubeVideoInfo?: { title: string | null; duration: number | null; thumbnail: string | null; uploader: string | null } | null;
        error?: string 
      }>;
      downloadVideo: (url: string, options: any) => Promise<{ success: boolean; result?: string; error?: string }>;
      onDownloadProgress: (callback: (progress: any) => void) => void;
      removeDownloadProgressListener: () => void;
      openFileDialog: () => Promise<{ success: boolean; filePaths?: string[]; error?: string }>;
      openDirectoryDialog: () => Promise<{ success: boolean; filePaths?: string[]; error?: string }>;
      openPathInShell: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      loadSettings: () => Promise<{ success: boolean; settings?: AppSettings; error?: string }>;
      saveSettings: (settings: AppSettings) => Promise<{ success: boolean; error?: string }>;
      getDefaultPaths: () => Promise<{ success: boolean; paths?: { home: string; documents: string; downloads: string; defaultDownloadPath: string; defaultModelDirectory: string }; error?: string }>;
      listDownloadedFiles: (downloadPath: string) => Promise<{ success: boolean; files?: DownloadedFile[]; error?: string }>;
      deleteFile: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      showFileInFolder: (filePath: string) => Promise<{ success: boolean; error?: string }>;
      separateAudio: (filePath: string, outputDir: string, modelName?: string) => Promise<{ status: string; files?: string[]; message?: string; error?: string }>;
      onAudioSeparationProgress: (callback: (progress: { message: string; isError?: boolean }) => void) => void;
      removeAudioSeparationProgressListener: () => void;
    };
  }
}

