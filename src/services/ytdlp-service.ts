import { YtDlp, helpers } from 'ytdlp-nodejs';

// Lazy initialization - will be created after FFmpeg is set up
let ytdlp: YtDlp | null = null;

// Export function to get FFmpeg path for use in other services
export function getFFmpegPath(): string | null {
  const path = helpers.findFFmpegBinary();
  return path || null;
}

// Get or create YtDlp instance with proper paths
export function getYtDlpInstance(): YtDlp {
  if (ytdlp) {
    return ytdlp;
  }

  // Try to find both binaries
  const ytdlpPath = helpers.findYtdlpBinary();
  const ffmpegPath = helpers.findFFmpegBinary();
  
  // Create instance with paths if found
  ytdlp = new YtDlp({
    binaryPath: ytdlpPath || undefined,
    ffmpegPath: ffmpegPath || undefined,
  });

  return ytdlp;
}

// Check and download both yt-dlp and FFmpeg if needed
export async function checkAndSetupFFmpeg(): Promise<boolean> {
  try {
    // First check if yt-dlp binary exists
    let ytdlpPath = helpers.findYtdlpBinary();
    
    if (!ytdlpPath) {
      console.log('yt-dlp not found, downloading...');
      try {
        ytdlpPath = await helpers.downloadYtDlp();
        console.log('yt-dlp downloaded successfully to:', ytdlpPath);
      } catch (error) {
        console.error('Failed to download yt-dlp:', error);
        return false;
      }
    } else {
      console.log('yt-dlp found at:', ytdlpPath);
    }

    // Then check if FFmpeg binary exists
    let ffmpegPath = helpers.findFFmpegBinary();
    
    if (!ffmpegPath) {
      console.log('FFmpeg not found, downloading...');
      try {
        ffmpegPath = await helpers.downloadFFmpeg();
        
        if (!ffmpegPath) {
          console.error('Failed to download FFmpeg');
          return false;
        }
        
        console.log('FFmpeg downloaded successfully to:', ffmpegPath);
      } catch (error) {
        console.error('Failed to download FFmpeg:', error);
        return false;
      }
    } else {
      console.log('FFmpeg found at:', ffmpegPath);
    }

    // Re-initialize YtDlp instance with both paths
    ytdlp = new YtDlp({
      binaryPath: ytdlpPath,
      ffmpegPath: ffmpegPath,
    });

    // Verify installation
    const isInstalled = await ytdlp.checkInstallationAsync({ ffmpeg: true });
    if (!isInstalled) {
      console.error('Installation verification failed');
      return false;
    }

    console.log('Both yt-dlp and FFmpeg are ready');
    return true;
  } catch (error) {
    console.error('Error checking/setting up binaries:', error);
    return false;
  }
}

// Get video information
export async function getVideoInfo(url: string) {
  try {
    const instance = getYtDlpInstance();
    const info = await instance.getInfoAsync(url);
    if (info._type === 'video') {
      return {
        title: info.title,
        uploader: info.uploader || info.channel || null,
        duration: info.duration || null,
        thumbnail: info.thumbnail || null,
        description: info.description || null,
        viewCount: info.view_count || null,
      };
    }
    throw new Error('Not a video URL');
  } catch (error) {
    throw error;
  }
}

// Get video thumbnails
export async function getThumbnails(url: string) {
  try {
    const instance = getYtDlpInstance();
    const thumbnails = await instance.getThumbnailsAsync(url);
    return thumbnails;
  } catch (error) {
    throw error;
  }
}

// Download video
export async function downloadVideo(
  url: string,
  options: {
    outputPath?: string;
    format?: string;
    startTime?: number;
    endTime?: number;
    extractAudio?: boolean;
    audioFormat?: string;
    audioQuality?: string;
    videoFormat?: string;
    writeSubtitles?: boolean;
    writeThumbnail?: boolean;
    writeDescription?: boolean;
    writeInfo?: boolean;
    onProgress?: (progress: any) => void;
  }
) {
  try {
    const downloadOptions: any = {
      format: options.format || 'bestvideo+bestaudio',
    };

    // Handle audio extraction
    if (options.extractAudio) {
      downloadOptions.extractAudio = true;
      downloadOptions.audioFormat = options.audioFormat || 'mp3';
      // Audio quality: 0 (best) to 10 (worst)
      if (options.audioQuality) {
        downloadOptions.audioQuality = options.audioQuality;
      }
    }

    // Handle metadata options
    if (options.writeSubtitles) {
      downloadOptions.writeSubtitles = true;
      downloadOptions.writeAutoSubtitles = true;
    }
    if (options.writeThumbnail) {
      downloadOptions.writeThumbnail = true;
    }
    if (options.writeDescription) {
      downloadOptions.writeDescription = true;
    }
    if (options.writeInfo) {
      downloadOptions.writeInfoJson = true;
    }

    // Add time range if specified - use download sections for yt-dlp
    // Using downloadSections is more reliable than postprocessor args
    const hasStart = typeof options.startTime === 'number' && options.startTime >= 0;
    const hasEnd = typeof options.endTime === 'number' && options.endTime > 0;

    if (hasStart || hasEnd) {
      const start = hasStart ? Math.max(0, Math.floor(options.startTime!)) : 0;
      const end = hasEnd ? Math.floor(options.endTime!) : undefined;

      if (end !== undefined && end > start) {
        // Use yt-dlp's section download feature: "*start-end" (seconds)
        downloadOptions.downloadSections = `*${start}-${end}`;
      }
    }

    // Add output path if specified
    if (options.outputPath) {
      downloadOptions.output = options.outputPath;
    }

    // Add progress callback
    if (options.onProgress) {
      downloadOptions.onProgress = options.onProgress;
    }

    console.log('Download options:', JSON.stringify(downloadOptions, null, 2));

    const instance = getYtDlpInstance();
    const result = await instance.downloadAsync(url, downloadOptions);
    return result;
  } catch (error) {
    console.error('Download error:', error);
    throw error;
  }
}

