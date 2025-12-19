import { app, BrowserWindow, nativeImage, ipcMain, dialog, shell } from 'electron';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import {
  checkAndSetupFFmpeg,
  getVideoInfo,
  getThumbnails,
  downloadVideo,
  getFFmpegPath,
} from './services/ytdlp-service.js';
import {
  listModels,
  downloadModel,
  listDownloadedModels,
  deleteModel,
} from './services/model-service.js';
import { spawn } from 'node:child_process';
import {
  getSpotifyTrackAndYouTubeUrl,
} from './services/spotify-service.js';

// Settings file path
const getSettingsPath = () => {
  const userDataPath = app.getPath('userData');
  return path.join(userDataPath, 'settings.json');
};

// Default settings
const defaultSettings = {
  download_path: path.join(os.homedir(), 'Documents', 'Resample2'),
  audio_format: 'mp3',
  audio_quality: '0', // 0 = best
  video_format: 'mp4',
  video_quality: 'best',
  extract_audio: true,
  write_subtitles: false,
  write_thumbnail: false,
  write_description: false,
  write_info: false,
  separation_settings: {
    output_format: 'FLAC',
    output_bitrate: null as string | null,
    normalization_threshold: 0.9,
    amplification_threshold: 0.0,
    output_single_stem: null as string | null,
    sample_rate: 44100,
    use_soundfile: false,
    use_autocast: false,
    // MDX Architecture Parameters
    mdx_params: {
      segment_size: 256,
      overlap: 0.25,
      batch_size: 1,
      hop_length: 1024,
      enable_denoise: false,
    },
    // VR Architecture Parameters
    vr_params: {
      batch_size: 1,
      window_size: 512,
      aggression: 5,
      enable_tta: false,
      enable_post_process: false,
      post_process_threshold: 0.2,
      high_end_process: false,
    },
    // Demucs Architecture Parameters
    demucs_params: {
      segment_size: 'Default',
      shifts: 2,
      overlap: 0.25,
      segments_enabled: true,
    },
    // MDXC Architecture Parameters
    mdxc_params: {
      segment_size: 256,
      override_model_segment_size: false,
      batch_size: 1,
      overlap: 8,
      pitch_shift: 0,
    },
  },
  model_directory: path.join(os.homedir(), 'Documents', 'Resample2', 'Models'),
  theme: 'system',
};

// Load settings from file
const loadSettings = (): typeof defaultSettings => {
  try {
    const settingsPath = getSettingsPath();
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }
  return defaultSettings;
};

// Save settings to file
const saveSettings = (settings: typeof defaultSettings): boolean => {
  try {
    const settingsPath = getSettingsPath();
    const dir = path.dirname(settingsPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    return true;
  } catch (error) {
    console.error('Error saving settings:', error);
    return false;
  }
};

// Ensure directory exists
const ensureDirectoryExists = (dirPath: string): boolean => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
    return true;
  } catch (error) {
    console.error('Error creating directory:', error);
    return false;
  }
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// The built HTML file - Electron Forge will place it in the renderer output
const HTML_FILE = path.join(__dirname, '../renderer/main_window/index.html');

// Set app icon based on platform
const getIconPath = () => {
  // In development, assets are in src/assets
  // In production, they should be copied to the build output
  const assetsPath = process.env.NODE_ENV === 'development' 
    ? path.join(__dirname, '../../src/assets')
    : path.join(__dirname, '../assets');
  
  if (process.platform === 'win32') {
    return path.join(assetsPath, 'icon.ico');
  } else if (process.platform === 'darwin') {
    return path.join(assetsPath, 'icon.icns');
  } else {
    return path.join(assetsPath, 'icon.png');
  }
};

// Handle creating/removing shortcuts on Windows when installing/uninstalling
// This is handled by the package.json script, but we can also check here
// Note: electron-squirrel-startup is CommonJS, handled at build time

const createWindow = (): void => {
  // Create the browser window
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 900,
    minWidth: 1100,
    minHeight: 900,
    icon: getIconPath(), // Set window icon
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the app
  if (process.env.NODE_ENV === 'development') {
    // In development, load from Vite dev server
    mainWindow.loadURL('http://localhost:5173');
    // Open DevTools in development
    mainWindow.webContents.openDevTools();
  } else {
    // In production, load the built HTML file
    mainWindow.loadFile(HTML_FILE);
  }
};

// Set up IPC handlers
ipcMain.handle('ytdlp:check-ffmpeg', async () => {
  try {
    const isInstalled = await checkAndSetupFFmpeg();
    return { success: true, installed: isInstalled };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('ytdlp:get-info', async (_, url: string) => {
  try {
    const info = await getVideoInfo(url);
    return { success: true, info };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('ytdlp:get-thumbnails', async (_, url: string) => {
  try {
    const thumbnails = await getThumbnails(url);
    return { success: true, thumbnails };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('ytdlp:download', async (event, url: string, options: any) => {
  try {
    // Create a progress callback that sends updates via IPC
    let lastProgress = 0;
    const progressCallback = (progress: any) => {
      const percent = progress.percent || 0;
      // Send progress updates every 1% or on completion
      if (Math.abs(percent - lastProgress) >= 1 || percent === 100) {
        lastProgress = percent;
        // Send progress update to renderer via webContents
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
          window.webContents.send('download-progress', { percent, progress });
        }
      }
    };

    const downloadOptions = {
      ...options,
      onProgress: progressCallback,
    };

    const result = await downloadVideo(url, downloadOptions);
    return { success: true, result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Spotify track info and YouTube URL lookup
ipcMain.handle('spotify:get-track-and-youtube', async (_, spotifyUrl: string) => {
  try {
    const result = await getSpotifyTrackAndYouTubeUrl(spotifyUrl);
    return { success: true, ...result };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('dialog:open-file', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [
        { name: 'Audio/Video Files', extensions: ['mp4', 'mp3', 'wav', 'm4a', 'flac', 'webm', 'mkv', 'avi'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
    return { success: true, filePaths: result.filePaths };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Directory selection dialog
ipcMain.handle('dialog:open-directory', async () => {
  try {
    const result = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
    });
    return { success: true, filePaths: result.filePaths };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Open path in system file explorer
ipcMain.handle('shell:open-path', async (_, filePath: string) => {
  try {
    // Expand ~ to home directory
    const expandedPath = filePath.startsWith('~')
      ? path.join(os.homedir(), filePath.slice(1))
      : filePath;
    
    // Ensure directory exists before opening
    ensureDirectoryExists(expandedPath);
    
    await shell.openPath(expandedPath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Settings management
ipcMain.handle('settings:load', async () => {
  try {
    const settings = loadSettings();
    return { success: true, settings };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('settings:save', async (_, settings: typeof defaultSettings) => {
  try {
    const saved = saveSettings(settings);
    if (saved) {
      // Ensure download directories exist
      ensureDirectoryExists(settings.download_path);
      ensureDirectoryExists(path.join(settings.download_path, 'Downloads'));
      ensureDirectoryExists(path.join(settings.download_path, 'Separated'));
      ensureDirectoryExists(settings.model_directory);
    }
    return { success: saved };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Get default paths
ipcMain.handle('paths:get-defaults', async () => {
  return {
    success: true,
    paths: {
      home: os.homedir(),
      documents: path.join(os.homedir(), 'Documents'),
      downloads: path.join(os.homedir(), 'Downloads'),
      defaultDownloadPath: defaultSettings.download_path,
      defaultModelDirectory: defaultSettings.model_directory,
    },
  };
});

// List files in the downloads directory
ipcMain.handle('files:list-downloads', async (_, downloadPath: string) => {
  try {
    const downloadsDir = path.join(downloadPath, 'Downloads');
    const separatedDir = path.join(downloadPath, 'Separated');

    const files: Array<{
      id: string;
      name: string;
      path: string;
      file_size: number;
      created: number;
      created_display: string;
      directory_type: 'downloads' | 'separated';
      file_extension: string;
    }> = [];

    // Supported audio/video extensions
    const supportedExtensions = ['.mp3', '.mp4', '.wav', '.m4a', '.flac', '.opus', '.webm', '.mkv', '.avi', '.ogg'];

    // Read downloads directory
    if (fs.existsSync(downloadsDir)) {
      const downloadFiles = fs.readdirSync(downloadsDir);
      for (const file of downloadFiles) {
        const ext = path.extname(file).toLowerCase();
        if (supportedExtensions.includes(ext)) {
          const filePath = path.join(downloadsDir, file);
          try {
            const stats = fs.statSync(filePath);
            files.push({
              id: `${filePath}-${stats.mtimeMs}`,
              name: file,
              path: filePath,
              file_size: stats.size,
              created: stats.mtimeMs,
              created_display: new Date(stats.mtime).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              directory_type: 'downloads',
              file_extension: ext.slice(1).toUpperCase(),
            });
          } catch (e) {
            // Skip files we can't stat
          }
        }
      }
    }

    // Read separated directory
    if (fs.existsSync(separatedDir)) {
      const separatedFiles = fs.readdirSync(separatedDir);
      for (const file of separatedFiles) {
        const ext = path.extname(file).toLowerCase();
        if (supportedExtensions.includes(ext)) {
          const filePath = path.join(separatedDir, file);
          try {
            const stats = fs.statSync(filePath);
            files.push({
              id: `${filePath}-${stats.mtimeMs}`,
              name: file,
              path: filePath,
              file_size: stats.size,
              created: stats.mtimeMs,
              created_display: new Date(stats.mtime).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              }),
              directory_type: 'separated',
              file_extension: ext.slice(1).toUpperCase(),
            });
          } catch (e) {
            // Skip files we can't stat
          }
        }
      }
    }

    // Sort by creation date, newest first
    files.sort((a, b) => b.created - a.created);

    return { success: true, files };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Delete a file
ipcMain.handle('files:delete', async (_, filePath: string) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { success: true };
    }
    return { success: false, error: 'File not found' };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Show file in folder (reveal in finder/explorer)
ipcMain.handle('files:show-in-folder', async (_, filePath: string) => {
  try {
    shell.showItemInFolder(filePath);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Model management handlers
ipcMain.handle('models:list', async () => {
  try {
    const models = await listModels();
    return { success: true, models };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('models:download', async (_, modelFilename: string, modelDirectory: string) => {
  try {
    await downloadModel(modelFilename, modelDirectory);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('models:list-downloaded', async (_, modelDirectory: string) => {
  try {
    const models = await listDownloadedModels(modelDirectory);
    return { success: true, models };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

ipcMain.handle('models:delete', async (_, modelFilename: string, modelDirectory: string) => {
  try {
    await deleteModel(modelFilename, modelDirectory);
    return { success: true };
  } catch (error) {
    return { success: false, error: String(error) };
  }
});

// Helper to find the Python binary (handles Dev vs Prod)
const getPythonBinaryPath = (): string => {
  const binaryName = process.platform === 'win32' ? 'audio-engine.exe' : 'audio-engine';
  
  if (app.isPackaged) {
    // In production, the binary is usually in resources/
    return path.join(process.resourcesPath, 'audio-engine', binaryName);
  } else {
    // In dev, point to your dist folder
    return path.join(__dirname, '../../dist/audio-engine', binaryName);
  }
};

// Helper function to build CLI arguments from options
function buildCliArgs(filePath: string, outputDir: string, options: any, settings: any): string[] {
  const args: string[] = [];
  
  // Add positional argument: audio file path
  args.push(filePath);
  
  // Add output directory (always include it)
  args.push('--output_dir', outputDir);
  
  // Model file directory (from settings or options)
  const modelFileDir = options.model_file_dir || settings.model_directory || path.join(app.getPath('userData'), 'models');
  args.push('--model_file_dir', modelFileDir);
  
  // Model filename (from options or default)
  if (options.model_filename) {
    args.push('--model_filename', options.model_filename);
  }
  
  // Normalize model architecture for conditional params
  const modelArch = (options.model_arch || '').toString().toLowerCase();
  const isMDX =
    modelArch.includes('mdx') ||
    modelArch.includes('roformer'); // Roformer models are MDX-based
  const isVR = modelArch.includes('vr');
  const isDemucs = modelArch.includes('demucs');
  const isMDXC = modelArch.includes('mdxc');

  // Merge separation settings from settings object
  const sepSettings = settings.separation_settings;
  
  // Common parameters
  if (options.output_format || (sepSettings.output_format && sepSettings.output_format !== 'FLAC')) {
    args.push('--output_format', options.output_format || sepSettings.output_format);
  }
  if (options.output_bitrate || sepSettings.output_bitrate) {
    args.push('--output_bitrate', options.output_bitrate || sepSettings.output_bitrate);
  }
  if (options.normalization_threshold !== undefined || (sepSettings.normalization_threshold !== undefined && sepSettings.normalization_threshold !== 0.9)) {
    args.push('--normalization', String(options.normalization_threshold !== undefined ? options.normalization_threshold : sepSettings.normalization_threshold));
  }
  if (options.amplification_threshold !== undefined || (sepSettings.amplification_threshold !== undefined && sepSettings.amplification_threshold !== 0.0)) {
    args.push('--amplification', String(options.amplification_threshold !== undefined ? options.amplification_threshold : sepSettings.amplification_threshold));
  }
  if (options.output_single_stem || sepSettings.output_single_stem) {
    args.push('--single_stem', options.output_single_stem || sepSettings.output_single_stem);
  }
  if (options.sample_rate !== undefined || (sepSettings.sample_rate !== undefined && sepSettings.sample_rate !== 44100)) {
    args.push('--sample_rate', String(options.sample_rate !== undefined ? options.sample_rate : sepSettings.sample_rate));
  }
  if (options.use_soundfile || sepSettings.use_soundfile) {
    args.push('--use_soundfile');
  }
  if (options.use_autocast || sepSettings.use_autocast) {
    args.push('--use_autocast');
  }
  if (options.invert_using_spec || options.invert_spect) {
    args.push('--invert_spect');
  }
  if (options.custom_output_names) {
    args.push('--custom_output_names', JSON.stringify(options.custom_output_names));
  }
  
  // MDX Architecture Parameters (only if model is MDX/Roformer)
  if (isMDX) {
    const mdxParams = options.mdx_params || sepSettings.mdx_params;
    if (mdxParams) {
      if (mdxParams.segment_size !== undefined && mdxParams.segment_size !== 256) {
        args.push('--mdx_segment_size', String(mdxParams.segment_size));
      }
      if (mdxParams.overlap !== undefined && mdxParams.overlap !== 0.25) {
        args.push('--mdx_overlap', String(mdxParams.overlap));
      }
      if (mdxParams.batch_size !== undefined && mdxParams.batch_size !== 1) {
        args.push('--mdx_batch_size', String(mdxParams.batch_size));
      }
      if (mdxParams.hop_length !== undefined && mdxParams.hop_length !== 1024) {
        args.push('--mdx_hop_length', String(mdxParams.hop_length));
      }
      if (mdxParams.enable_denoise) {
        args.push('--mdx_enable_denoise');
      }
    }
  }
  
  // VR Architecture Parameters (only if model is VR)
  if (isVR) {
    const vrParams = options.vr_params || sepSettings.vr_params;
    if (vrParams) {
      if (vrParams.batch_size !== undefined && vrParams.batch_size !== 1) {
        args.push('--vr_batch_size', String(vrParams.batch_size));
      }
      if (vrParams.window_size !== undefined && vrParams.window_size !== 512) {
        args.push('--vr_window_size', String(vrParams.window_size));
      }
      if (vrParams.aggression !== undefined && vrParams.aggression !== 5) {
        args.push('--vr_aggression', String(vrParams.aggression));
      }
      if (vrParams.enable_tta) {
        args.push('--vr_enable_tta');
      }
      if (vrParams.high_end_process) {
        args.push('--vr_high_end_process');
      }
      if (vrParams.enable_post_process) {
        args.push('--vr_enable_post_process');
      }
      if (vrParams.post_process_threshold !== undefined && vrParams.post_process_threshold !== 0.2) {
        args.push('--vr_post_process_threshold', String(vrParams.post_process_threshold));
      }
    }
  }
  
  // Demucs Architecture Parameters (only if model is Demucs)
  if (isDemucs) {
    const demucsParams = options.demucs_params || sepSettings.demucs_params;
    if (demucsParams) {
      if (demucsParams.segment_size !== undefined && demucsParams.segment_size !== 'Default') {
        args.push('--demucs_segment_size', String(demucsParams.segment_size));
      }
      if (demucsParams.shifts !== undefined && demucsParams.shifts !== 2) {
        args.push('--demucs_shifts', String(demucsParams.shifts));
      }
      if (demucsParams.overlap !== undefined && demucsParams.overlap !== 0.25) {
        args.push('--demucs_overlap', String(demucsParams.overlap));
      }
      if (demucsParams.segments_enabled !== undefined && demucsParams.segments_enabled !== true) {
        args.push('--demucs_segments_enabled', String(demucsParams.segments_enabled));
      }
    }
  }
  
  // MDXC Architecture Parameters (only if model is MDXC)
  if (isMDXC) {
    const mdxcParams = options.mdxc_params || sepSettings.mdxc_params;
    if (mdxcParams) {
      if (mdxcParams.segment_size !== undefined && mdxcParams.segment_size !== 256) {
        args.push('--mdxc_segment_size', String(mdxcParams.segment_size));
      }
      if (mdxcParams.override_model_segment_size) {
        args.push('--mdxc_override_model_segment_size');
      }
      if (mdxcParams.batch_size !== undefined && mdxcParams.batch_size !== 1) {
        args.push('--mdxc_batch_size', String(mdxcParams.batch_size));
      }
      if (mdxcParams.overlap !== undefined && mdxcParams.overlap !== 8) {
        args.push('--mdxc_overlap', String(mdxcParams.overlap));
      }
      if (mdxcParams.pitch_shift !== undefined && mdxcParams.pitch_shift !== 0) {
        args.push('--mdxc_pitch_shift', String(mdxcParams.pitch_shift));
      }
    }
  }
  
  return args;
}

// Audio separation handler - uses CLI-style arguments
ipcMain.handle('audio:separate', async (event, filePath: string, outputDir: string, options: any = {}) => {
  return new Promise((resolve, reject) => {
    try {
      const pythonBin = getPythonBinaryPath();
      
      // Check if binary exists
      if (!fs.existsSync(pythonBin)) {
        reject(new Error(`Python binary not found at: ${pythonBin}`));
        return;
      }

      // Get FFmpeg path
      const ffmpegPath = getFFmpegPath();
      if (!ffmpegPath) {
        reject(new Error('FFmpeg not found. Please ensure FFmpeg is downloaded.'));
        return;
      }

      // Load settings
      const settings = loadSettings();
      
      // Build CLI arguments
      const args = buildCliArgs(filePath, outputDir, options, settings);

      // Set up environment with FFmpeg in PATH
      const env = { ...process.env };
      const ffmpegDir = path.dirname(ffmpegPath);
      // Prepend FFmpeg directory to PATH so it's found first
      env.PATH = `${ffmpegDir}${path.delimiter}${env.PATH || ''}`;

      console.log(`[AudioEngine] FFmpeg path: ${ffmpegPath}`);
      console.log(`[AudioEngine] FFmpeg directory added to PATH: ${ffmpegDir}`);
      console.log(`[AudioEngine] Command: ${pythonBin} ${args.join(' ')}`);

      const pythonProcess = spawn(pythonBin, args, { env });

      let stdoutData = '';
      let stderrData = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdoutData += output;
        // Log progress to console
        console.log(`[Audio Separator] ${output.trim()}`);
        // Send progress updates to renderer
          const window = BrowserWindow.fromWebContents(event.sender);
          if (window) {
            window.webContents.send('audio-separation-progress', { message: output.trim() });
        }
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderrData += output;
        console.error(`[Audio Separator Error] ${output.trim()}`);
        // Send error messages to renderer
        const window = BrowserWindow.fromWebContents(event.sender);
        if (window) {
          window.webContents.send('audio-separation-progress', { message: output.trim(), isError: true });
        }
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          const errorMsg = stderrData || stdoutData || `Process exited with code ${code}`;
          reject(new Error(errorMsg));
          return;
        }
        
        // Success - the CLI outputs log messages, not JSON
        // Extract output file paths from the log if possible
        const outputFiles: string[] = [];
        const outputMatch = stdoutData.match(/Output file\(s\): (.+)/);
        if (outputMatch) {
          outputFiles.push(...outputMatch[1].trim().split(/\s+/));
        }
        
        resolve({ 
          status: 'success', 
          message: stdoutData,
          files: outputFiles.length > 0 ? outputFiles : undefined
        });
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });
    } catch (error) {
      reject(error);
    }
  });
});

// This method will be called when Electron has finished initialization
app.on('ready', async () => {
  // Set macOS dock icon
  if (process.platform === 'darwin' && app.dock) {
    try {
      const iconPath = getIconPath();
      const icon = nativeImage.createFromPath(iconPath);
      if (!icon.isEmpty()) {
        app.dock.setIcon(icon);
      }
    } catch (error) {
      console.warn('Could not load app icon:', error);
    }
  }

  // Check FFmpeg on app startup
  console.log('Checking FFmpeg installation...');
  await checkAndSetupFFmpeg();
  
  createWindow();
});

// Quit when all windows are closed, except on macOS
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  // On macOS, re-create a window when the dock icon is clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

