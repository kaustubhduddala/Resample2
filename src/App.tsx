import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "./components/ui/button";
import { Input } from "./components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "./components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./components/ui/select";
import { Checkbox } from "./components/ui/checkbox";
import { Slider } from "./components/ui/slider";
import { Badge } from "./components/ui/badge";

import {
  AlertTriangle as AlertTriangleIcon,
  ChevronDown,
  Clipboard,
  FolderOpen,
  Info,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  Settings,
  Trash2,
} from "lucide-react";
import { SettingsPage } from "./Settings";
import icon2 from "./assets/icon2.png";

type InputType = "YouTube" | "Spotify" | "LocalFile" | "Unknown";
type ProcessingMode = "DownloadOnly" | "DownloadAndExtract" | "ExtractOnly";

function App() {
  // Barebones: Basic state for UI display only
  const [url, setUrl] = useState("");
  const [inputType, setInputType] = useState<InputType>("YouTube");
  const [processingMode, setProcessingMode] =
    useState<ProcessingMode>("DownloadOnly");
  const [timeRange, setTimeRange] = useState([30, 90]);
  const [startTimeInput, setStartTimeInput] = useState("");
  const [endTimeInput, setEndTimeInput] = useState("");
  const [isEditingStart, setIsEditingStart] = useState(false);
  const [isEditingEnd, setIsEditingEnd] = useState(false);
  const [maxDuration, setMaxDuration] = useState(300); // Max duration for slider
  const videoThumbnailRef = useRef<string | null>(null);

  // Sync input values when slider changes (but not when user is typing)
  useEffect(() => {
    if (!isEditingStart) {
      setStartTimeInput(formatTimeToHHMMSS(Math.floor(timeRange[0])));
    }
  }, [timeRange[0], isEditingStart]);

  useEffect(() => {
    if (!isEditingEnd) {
      setEndTimeInput(formatTimeToHHMMSS(Math.floor(timeRange[1])));
    }
  }, [timeRange[1], isEditingEnd]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedStems, setSelectedStems] = useState<string[]>([]);
  const [availableStems, setAvailableStems] = useState<string[]>([]);
  const [simpleModels, setSimpleModels] = useState<any[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isSeparating, setIsSeparating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState<string>("idle");
  const [consoleMessages, setConsoleMessages] = useState<string[]>([
    "Initializing...",
  ]);
  const [audioFileHistory, setAudioFileHistory] = useState<
    {
      id: string;
      name: string;
      path: string;
      file_size: number;
      created: number;
      created_display: string;
      directory_type: "downloads" | "separated";
      file_extension: string;
    }[]
  >([]);
  const [videoInfo, setVideoInfo] = useState<any>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [stemDropdownOpen, setStemDropdownOpen] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    download_path: "",
    audio_format: "mp3",
    audio_quality: "0",
    video_format: "mp4",
    video_quality: "best",
    extract_audio: true,
    write_subtitles: false,
    write_thumbnail: false,
    write_description: false,
    write_info: false,
    separation_settings: { output_format: "FLAC" },
    model_directory: "",
    theme: "system",
  });
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  // Add console message helper
  const addConsoleMessage = useCallback((message: string) => {
    setConsoleMessages((prev) => [...prev, message]);
  }, []);

  // Wait for Electron API to be available
  useEffect(() => {
    const waitForElectronAPI = () => {
      return new Promise<void>((resolve) => {
        if (window.electronAPI) {
          resolve();
          return;
        }

        // Poll for electronAPI to be available
        const checkInterval = setInterval(() => {
          if (window.electronAPI) {
            clearInterval(checkInterval);
            resolve();
          }
        }, 100);

        // Timeout after 5 seconds
        setTimeout(() => {
          clearInterval(checkInterval);
          resolve();
        }, 5000);
      });
    };

    const initialize = async () => {
      await waitForElectronAPI();

      if (!window.electronAPI) {
        addConsoleMessage(
          "✗ Electron API not available. Please restart the app."
        );
        return;
      }

      addConsoleMessage("✓ Electron API ready");

      // Load saved settings
      try {
        const settingsResult = await window.electronAPI.loadSettings();
        if (settingsResult.success && settingsResult.settings) {
          setSettings(settingsResult.settings);
          addConsoleMessage("✓ Settings loaded");
        } else {
          // Load default paths if settings couldn't be loaded
          const pathsResult = await window.electronAPI.getDefaultPaths();
          if (pathsResult.success && pathsResult.paths) {
            setSettings((prev) => ({
              ...prev,
              download_path: pathsResult.paths!.defaultDownloadPath,
              model_directory: pathsResult.paths!.defaultModelDirectory,
            }));
          }
          addConsoleMessage("✓ Using default settings");
        }
        setSettingsLoaded(true);
      } catch (error) {
        addConsoleMessage(`✗ Error loading settings: ${error}`);
        setSettingsLoaded(true);
      }

      // Check FFmpeg
      const checkFFmpeg = async () => {
        try {
          const result = await window.electronAPI.checkFFmpeg();
          if (result.success) {
            if (result.installed) {
              addConsoleMessage("✓ FFmpeg is installed and ready");
            } else {
              addConsoleMessage("✗ FFmpeg check failed");
            }
          } else {
            addConsoleMessage(`✗ FFmpeg check error: ${result.error}`);
          }
        } catch (error) {
          addConsoleMessage(`✗ Error checking FFmpeg: ${error}`);
        }
      };
      checkFFmpeg();

      // Set up download progress listener
      window.electronAPI.onDownloadProgress((progress) => {
        if (progress.percent !== undefined) {
          setProgress(progress.percent);
          if (progress.percent === 100) {
            setProgressStatus("completed");
          }
        }
      });
    };

    initialize();

    // Cleanup listener on unmount
    return () => {
      if (window.electronAPI) {
        window.electronAPI.removeDownloadProgressListener();
      }
    };
  }, [addConsoleMessage]);

  // Helper function to detect if URL is a YouTube URL
  const isYouTubeUrl = (urlString: string): boolean => {
    if (!urlString || !urlString.trim()) return false;
    return urlString.includes("youtube.com") || urlString.includes("youtu.be");
  };

  // Extract YouTube video ID from URL
  const getYouTubeVideoId = (urlString: string): string => {
    if (!urlString) return "";

    // Handle youtu.be short URLs
    if (urlString.includes("youtu.be/")) {
      const match = urlString.match(/youtu\.be\/([^?&#]+)/);
      return match ? match[1] : "";
    }

    // Handle youtube.com URLs
    if (urlString.includes("youtube.com")) {
      const match = urlString.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
      return match ? match[1] : "";
    }

    return "";
  };

  // Handlers - defined before useEffects that use them
  const handleLoadVideoInfo = useCallback(
    async (videoUrl: string) => {
      if (!videoUrl.trim()) {
        addConsoleMessage("✗ Empty URL provided");
        return;
      }

      if (!window.electronAPI) {
        addConsoleMessage(
          "✗ Electron API not available. Please restart the app."
        );
        return;
      }

      setIsLoadingVideo(true);
      addConsoleMessage(`Loading video info for: ${videoUrl}`);

      try {
        const result = await window.electronAPI.getVideoInfo(videoUrl);
        if (result.success && result.info) {
          setVideoInfo(result.info);
          if (result.info.duration) {
            const duration = Math.floor(result.info.duration);
            setMediaDuration(duration);
            // Set max slider to full video duration
            setMaxDuration(duration);
            // Reset time range to full video
            setTimeRange([0, duration]);
          }

          // Get thumbnail
          try {
            const thumbResult =
              await window.electronAPI.getThumbnails(videoUrl);
            if (
              thumbResult.success &&
              thumbResult.thumbnails &&
              thumbResult.thumbnails.length > 0
            ) {
              // Get the highest quality thumbnail
              const bestThumb =
                thumbResult.thumbnails[thumbResult.thumbnails.length - 1];
              videoThumbnailRef.current =
                bestThumb.url || result.info.thumbnail || null;
            } else {
              videoThumbnailRef.current = result.info.thumbnail || null;
            }
          } catch (thumbError) {
            videoThumbnailRef.current = result.info.thumbnail || null;
          }

          addConsoleMessage(`✓ Loaded: ${result.info.title || "Video"}`);
        } else {
          addConsoleMessage(
            `✗ Failed to load video info: ${result.error || "Unknown error"}`
          );
        }
      } catch (error) {
        addConsoleMessage(`✗ Error loading video info: ${error}`);
      } finally {
        setIsLoadingVideo(false);
      }
    },
    [addConsoleMessage]
  );

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text.trim()) {
        setUrl(text);
        // The useEffect will handle auto-detection and loading
      }
    } catch (error) {
      addConsoleMessage("Failed to paste from clipboard");
    }
  };

  // Handle paste event directly on the input field
  const handleInputPaste = async (
    e: React.ClipboardEvent<HTMLInputElement>
  ) => {
    try {
      const pastedText = e.clipboardData.getData("text");
      if (pastedText && pastedText.trim()) {
        // The onChange handler will be called automatically, but we can also process it here
        // The useEffect will handle the rest
      }
    } catch (error) {
      // Fallback - let the default paste behavior handle it
    }
  };

  // Auto-detect input type based on URL
  useEffect(() => {
    if (url.trim()) {
      if (isYouTubeUrl(url)) {
        setInputType("YouTube");
        addConsoleMessage(`✓ Detected YouTube URL`);
      } else if (url.includes("spotify.com")) {
        setInputType("Spotify");
        addConsoleMessage(`✓ Detected Spotify URL`);
      } else if (
        url.includes("file://") ||
        url.startsWith("/") ||
        url.match(/^[A-Za-z]:/)
      ) {
        setInputType("LocalFile");
        addConsoleMessage(`✓ Detected Local File`);
      } else {
        setInputType("Unknown");
        addConsoleMessage(`⚠ Unknown URL type`);
      }
    }
  }, [url, addConsoleMessage]);

  // Auto-load video info when URL changes and it's a YouTube URL
  useEffect(() => {
    if (url.trim() && inputType === "YouTube" && isYouTubeUrl(url)) {
      // Wait for electronAPI to be available
      const waitAndLoad = async () => {
        // Wait up to 2 seconds for API to be available
        for (let i = 0; i < 20; i++) {
          if (window.electronAPI) {
            break;
          }
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        if (!window.electronAPI) {
          addConsoleMessage(
            "✗ Electron API not available. Please restart the app."
          );
          return;
        }

        addConsoleMessage(`Detected YouTube URL: ${url}`);
        const timeoutId = setTimeout(() => {
          handleLoadVideoInfo(url);
        }, 800); // Debounce for 800ms

        return () => clearTimeout(timeoutId);
      };

      waitAndLoad();
    }
  }, [url, inputType, handleLoadVideoInfo, addConsoleMessage]);

  // Handle URL input change with validation
  const handleUrlChange = (value: string) => {
    setUrl(value);
    // Clear video info when URL is cleared
    if (!value.trim()) {
      setVideoInfo(null);
      setMediaDuration(null);
      videoThumbnailRef.current = null;
      setMaxDuration(300);
      setTimeRange([30, 90]);
    }
  };

  const handleBrowserClick = async () => {
    if (!window.electronAPI) {
      addConsoleMessage("✗ Electron API not available");
      return;
    }

    try {
      addConsoleMessage("Opening file browser...");
      const result = await window.electronAPI.openFileDialog();
      if (result.success && result.filePaths && result.filePaths.length > 0) {
        const filePath = result.filePaths[0];
        setUrl(filePath);
        setInputType("LocalFile");
        addConsoleMessage(`✓ Selected file: ${filePath}`);
      }
    } catch (error) {
      addConsoleMessage(`✗ Error opening file dialog: ${error}`);
    }
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
  };
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };
  // Handle selecting download directory
  const handleSelectDownloadDirectory = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.openDirectoryDialog();
      if (result.success && result.filePaths && result.filePaths[0]) {
        const newPath = result.filePaths[0];
        setSettings((prev) => ({
          ...prev,
          download_path: newPath,
        }));
        // Save settings
        await window.electronAPI.saveSettings({
          ...settings,
          download_path: newPath,
        });
        addConsoleMessage(`✓ Download directory set to: ${newPath}`);
      }
    } catch (error) {
      addConsoleMessage(`✗ Error selecting download directory: ${error}`);
    }
  };

  // Handle opening download directory in file explorer
  const handleOpenDownloadDirectory = async () => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.openPathInShell(
        settings.download_path
      );
      if (!result.success) {
        addConsoleMessage(`✗ Error opening directory: ${result.error}`);
      }
    } catch (error) {
      addConsoleMessage(`✗ Error opening directory: ${error}`);
    }
  };

  // Handle saving settings
  const handleSaveSettings = async (newSettings: typeof settings) => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.saveSettings(newSettings);
      if (result.success) {
        setSettings(newSettings);
        addConsoleMessage("✓ Settings saved");
      } else {
        addConsoleMessage(`✗ Error saving settings: ${result.error}`);
      }
    } catch (error) {
      addConsoleMessage(`✗ Error saving settings: ${error}`);
    }
  };

  const handleDownload = async () => {
    if (!url.trim() || inputType !== "YouTube" || !window.electronAPI) {
      addConsoleMessage("Please enter a valid YouTube URL");
      return;
    }

    setIsDownloading(true);
    setProgressStatus("downloading");
    setProgress(0);
    addConsoleMessage(`Starting download: ${url}`);

    try {
      // Determine format based on settings
      let format: string;
      if (settings.extract_audio) {
        // Audio only - use bestaudio and convert to selected format
        format = "bestaudio";
      } else {
        // Video - use selected video quality
        if (settings.video_quality === "best") {
          format = "bestvideo+bestaudio";
        } else {
          format = `bestvideo[height<=${settings.video_quality}]+bestaudio`;
        }
      }

      // Build output path with proper extension
      const extension = settings.extract_audio
        ? settings.audio_format
        : settings.video_format;
      const outputPath = `${settings.download_path}/Downloads/%(title)s.${extension}`;

      addConsoleMessage(`Output: ${settings.download_path}/Downloads/`);
      addConsoleMessage(
        `Format: ${settings.extract_audio ? `Audio (${settings.audio_format})` : `Video (${settings.video_format})`}`
      );

      // Download with all settings
      const result = await window.electronAPI.downloadVideo(url, {
        outputPath,
        format,
        startTime: timeRange[0],
        endTime: timeRange[1],
        extractAudio: settings.extract_audio,
        audioFormat: settings.audio_format,
        audioQuality: settings.audio_quality,
        videoFormat: settings.video_format,
        writeSubtitles: settings.write_subtitles,
        writeThumbnail: settings.write_thumbnail,
        writeDescription: settings.write_description,
        writeInfo: settings.write_info,
      });

      if (result.success) {
        setProgress(100);
        setProgressStatus("completed");
        addConsoleMessage(`✓ Download completed!`);
        if (result.result) {
          addConsoleMessage(`  File: ${result.result}`);
        }
        // Refresh file history to show the new file
        loadFileHistory();
      } else {
        setProgressStatus("error");
        addConsoleMessage(`✗ Download failed: ${result.error}`);
      }
    } catch (error) {
      setProgressStatus("error");
      addConsoleMessage(`✗ Download error: ${error}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleStopDownload = () => {
    setIsDownloading(false);
    setProgressStatus("idle");
    addConsoleMessage("Download stopped");
  };
  const clearConsole = () => {
    setConsoleMessages(["Console cleared"]);
  };
  const handleStemToggle = (stem: string) => {
    setSelectedStems((prev) =>
      prev.includes(stem) ? prev.filter((s) => s !== stem) : [...prev, stem]
    );
  };
  const formatTimeToHHMMSS = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // Parse time input (supports HH:MM:SS, MM:SS, or just seconds)
  const parseTimeInput = (input: string): number | null => {
    if (!input || input.trim() === "") return null;

    // Remove any non-digit and colon characters
    const cleaned = input.replace(/[^\d:]/g, "");

    // Handle different formats
    const parts = cleaned.split(":").filter((p) => p !== "");

    if (parts.length === 0) return null;

    try {
      if (parts.length === 1) {
        // Just seconds
        return Math.max(0, Math.min(maxDuration, parseInt(parts[0], 10)));
      } else if (parts.length === 2) {
        // MM:SS
        const minutes = parseInt(parts[0], 10);
        const seconds = parseInt(parts[1], 10);
        const total = minutes * 60 + seconds;
        return Math.max(0, Math.min(300, total));
      } else if (parts.length === 3) {
        // HH:MM:SS
        const hours = parseInt(parts[0], 10);
        const minutes = parseInt(parts[1], 10);
        const seconds = parseInt(parts[2], 10);
        const total = hours * 3600 + minutes * 60 + seconds;
        return Math.max(0, Math.min(300, total));
      }
    } catch {
      return null;
    }

    return null;
  };

  const handleStartTimeChange = (value: string) => {
    setStartTimeInput(value);
    const parsed = parseTimeInput(value);
    if (parsed !== null) {
      const newStart = Math.max(0, Math.min(parsed, timeRange[1] - 1));
      setTimeRange([newStart, timeRange[1]]);
    }
  };

  const handleEndTimeChange = (value: string) => {
    setEndTimeInput(value);
    const parsed = parseTimeInput(value);
    if (parsed !== null) {
      const newEnd = Math.max(timeRange[0] + 1, Math.min(maxDuration, parsed));
      setTimeRange([timeRange[0], newEnd]);
    }
  };

  const handleStartTimeBlur = () => {
    setIsEditingStart(false);
    const parsed = parseTimeInput(startTimeInput);
    if (parsed !== null) {
      const newStart = Math.max(0, Math.min(parsed, timeRange[1] - 1));
      setTimeRange([newStart, timeRange[1]]);
      setStartTimeInput(formatTimeToHHMMSS(newStart));
    } else {
      setStartTimeInput(formatTimeToHHMMSS(timeRange[0]));
    }
  };

  const handleEndTimeBlur = () => {
    setIsEditingEnd(false);
    const parsed = parseTimeInput(endTimeInput);
    if (parsed !== null) {
      const newEnd = Math.max(timeRange[0] + 1, Math.min(maxDuration, parsed));
      setTimeRange([timeRange[0], newEnd]);
      setEndTimeInput(formatTimeToHHMMSS(newEnd));
    } else {
      setEndTimeInput(formatTimeToHHMMSS(timeRange[1]));
    }
  };
  const getProgressText = (status: string) => {
    if (status === "downloading") return "Downloading";
    if (status === "processing") return "Processing";
    if (status === "completed") return "Completed";
    if (status === "error") return "Error";
    return "Progress";
  };
  const getProgressColor = (status: string) => {
    if (status === "downloading") return "bg-blue-600";
    if (status === "processing") return "bg-purple-600";
    if (status === "completed") return "bg-green-600";
    if (status === "error") return "bg-red-600";
    return "bg-gray-200";
  };
  const getUniqueFileId = (file: any) => `${file.id}-${file.path}`;

  // Load file history from downloads folder
  const loadFileHistory = useCallback(async () => {
    if (!window.electronAPI || !settings.download_path) return;
    try {
      const result = await window.electronAPI.listDownloadedFiles(
        settings.download_path
      );
      if (result.success && result.files) {
        setAudioFileHistory(result.files);
      }
    } catch (error) {
      console.error("Error loading file history:", error);
    }
  }, [settings.download_path]);

  // Load file history when settings are loaded
  useEffect(() => {
    if (settingsLoaded && settings.download_path) {
      loadFileHistory();
    }
  }, [settingsLoaded, settings.download_path, loadFileHistory]);

  // Handle deleting a file
  const handleDeleteFile = async (filePath: string) => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.deleteFile(filePath);
      if (result.success) {
        addConsoleMessage("✓ File deleted");
        // Refresh file list
        loadFileHistory();
      } else {
        addConsoleMessage(`✗ Error deleting file: ${result.error}`);
      }
    } catch (error) {
      addConsoleMessage(`✗ Error deleting file: ${error}`);
    }
  };

  // Handle showing file in folder
  const handleShowFileInFolder = async (filePath: string) => {
    if (!window.electronAPI) return;
    try {
      await window.electronAPI.showFileInFolder(filePath);
    } catch (error) {
      addConsoleMessage(`✗ Error opening folder: ${error}`);
    }
  };

  if (showSettings) {
    return (
      <SettingsPage
        onClose={() => setShowSettings(false)}
        onSettingsSaved={(newSettings) => {
          setSettings(newSettings);
          addConsoleMessage("✓ Settings saved");
        }}
        onRefreshDownloadedModels={async () => {}}
        initialSettings={settings}
      />
    );
  }

  return (
    <div className="h-screen w-screen bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-gray-950 dark:to-gray-950 overflow-hidden">
      <div className="h-full w-full p-3 flex flex-col">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch flex-1 min-h-0">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4 flex flex-col h-full overflow-y-auto min-h-0">
            {/* URL Input */}
            <Card className="flex-shrink-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Input</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  <div className="flex gap-2">
                    <Select
                      value={inputType}
                      onValueChange={(value: InputType) => setInputType(value)}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue placeholder="Source" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="YouTube">YouTube</SelectItem>
                        <SelectItem value="Spotify">Spotify</SelectItem>
                        <SelectItem value="LocalFile">Local File</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder={
                        inputType === "YouTube"
                          ? "Paste YouTube URL..."
                          : inputType === "Spotify"
                            ? "Paste Spotify URL..."
                            : inputType === "LocalFile"
                              ? "Enter file path or drag & drop..."
                              : "Paste URL or file path..."
                      }
                      value={url}
                      onChange={(e) => handleUrlChange(e.target.value)}
                      onPaste={handleInputPaste}
                      className="flex-1"
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                    />
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={handlePaste}
                      title="Paste from clipboard"
                    >
                      <Clipboard className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={handleBrowserClick}
                      title="Browse files"
                      className="px-3"
                    >
                      Browse
                    </Button>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Download Directory
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={settings.download_path}
                        placeholder="Base directory for downloads and stems"
                        readOnly
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        onClick={handleOpenDownloadDirectory}
                        title="Open in file explorer"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={handleSelectDownloadDirectory}
                      >
                        Browse
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500">
                      Downloads: {settings.download_path}/Downloads/ • Separated
                      stems: {settings.download_path}/Separated/
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Preview Card */}
            <Card className="flex-shrink-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Preview</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-3">
                    <div className="relative aspect-video bg-slate-200 dark:bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden">
                      {isLoadingVideo ? (
                        <div className="text-center">
                          <Loader2 className="h-8 w-8 mx-auto mb-1 text-slate-400 dark:text-slate-500 animate-spin" />
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Loading preview...
                          </p>
                        </div>
                      ) : url &&
                        inputType === "YouTube" &&
                        isYouTubeUrl(url) &&
                        videoInfo ? (
                        // YouTube embed for YouTube videos
                        <iframe
                          src={`https://www.youtube.com/embed/${getYouTubeVideoId(url)}?start=${Math.floor(timeRange[0])}&end=${Math.floor(timeRange[1])}&rel=0`}
                          className="w-full h-full rounded-lg"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          title="Video preview"
                        />
                      ) : videoThumbnailRef.current ? (
                        <img
                          src={videoThumbnailRef.current}
                          alt="Video thumbnail"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-center">
                          <Info className="h-8 w-8 mx-auto mb-1 text-slate-400 dark:text-slate-500" />
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Preview
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-4">
                    {videoInfo?.title && (
                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 block">
                          {videoInfo.title}
                          {videoInfo.uploader && ` - ${videoInfo.uploader}`}
                          {typeof mediaDuration === "number" &&
                            ` (${formatTimeToHHMMSS(mediaDuration)})`}
                        </label>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="text-xs text-slate-400 mb-1 block">
                            Start Time
                          </label>
                          <Input
                            type="text"
                            value={
                              startTimeInput ||
                              formatTimeToHHMMSS(Math.floor(timeRange[0]))
                            }
                            onChange={(e) =>
                              handleStartTimeChange(e.target.value)
                            }
                            onBlur={handleStartTimeBlur}
                            onFocus={() => {
                              setIsEditingStart(true);
                              setStartTimeInput(
                                formatTimeToHHMMSS(Math.floor(timeRange[0]))
                              );
                            }}
                            className="text-xs h-8 px-2"
                            placeholder="HH:MM:SS or MM:SS"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 mb-1 block">
                            End Time
                          </label>
                          <Input
                            type="text"
                            value={
                              endTimeInput ||
                              formatTimeToHHMMSS(Math.floor(timeRange[1]))
                            }
                            onChange={(e) =>
                              handleEndTimeChange(e.target.value)
                            }
                            onBlur={handleEndTimeBlur}
                            onFocus={() => {
                              setIsEditingEnd(true);
                              setEndTimeInput(
                                formatTimeToHHMMSS(Math.floor(timeRange[1]))
                              );
                            }}
                            className="text-xs h-8 px-2"
                            placeholder="HH:MM:SS or MM:SS"
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs text-slate-400 block">
                          Time Range
                        </label>
                        <Slider
                          value={timeRange}
                          onValueChange={(value) =>
                            setTimeRange([
                              Math.floor(value[0]),
                              Math.floor(value[1]),
                            ])
                          }
                          min={0}
                          max={maxDuration}
                          step={1}
                          className="w-full"
                        />
                        <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400">
                          <span>
                            {formatTimeToHHMMSS(Math.floor(timeRange[0]))}
                          </span>
                          <span className="font-medium text-slate-600 dark:text-slate-300">
                            Duration:{" "}
                            {formatTimeToHHMMSS(
                              Math.floor(timeRange[1] - timeRange[0])
                            )}
                          </span>
                          <span>
                            {formatTimeToHHMMSS(Math.floor(timeRange[1]))}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Console */}
            <Card className="flex-1 min-h-0 flex flex-col">
              <CardHeader className="pb-3 flex-shrink-0">
                <CardTitle className="text-lg">Console</CardTitle>
              </CardHeader>

              {/* CHANGE 2: Content area also needs min-h-0 to contain the scroll area */}
              <CardContent className="pt-0 space-y-4 flex-1 flex flex-col min-h-0">
                {/* Progress Bar (Fixed height, won't shrink) */}
                <div className="space-y-2 flex-shrink-0">
                  <div className="flex justify-between text-sm">
                    <span>{getProgressText(progressStatus)}</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-300 ${getProgressColor(progressStatus)}`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    ></div>
                  </div>
                </div>

                {/* Controls (Fixed height, won't shrink) */}
                <div className="flex gap-2 flex-shrink-0 items-end">
                  <div className="flex flex-col">
                    <Select
                      value={processingMode}
                      onValueChange={(value: ProcessingMode) =>
                        setProcessingMode(value)
                      }
                    >
                      <SelectTrigger className="w-48 h-10">
                        <SelectValue placeholder="Select mode" />
                      </SelectTrigger>
                      <SelectContent>
                        {inputType === "LocalFile" ? (
                          <SelectItem value="ExtractOnly">
                            Extract Stems Only
                          </SelectItem>
                        ) : (
                          <>
                            <SelectItem value="DownloadOnly">
                              Download Only
                            </SelectItem>
                            <SelectItem value="DownloadAndExtract">
                              Download and Extract Stems
                            </SelectItem>
                          </>
                        )}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    className="text-slate-100 dark:text-slate-300 h-10"
                    onClick={handleDownload}
                    disabled={!url.trim() || inputType === "Unknown"}
                  >
                    {isDownloading || isSeparating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 mr-2 text-slate-300" />
                        {processingMode === "DownloadOnly"
                          ? "Process"
                          : processingMode === "DownloadAndExtract"
                            ? "Download & Extract"
                            : "Extract Stems"}
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleStopDownload}
                    disabled={!isDownloading && !isSeparating}
                  >
                    <Pause className="h-4 w-4 mr-2" />
                    Stop
                  </Button>
                  <Button
                    variant="outline"
                    onClick={clearConsole}
                    className="ml-auto"
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Clear
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => setShowSettings(!showSettings)}
                  >
                    <Settings className="h-4 w-4" />
                  </Button>
                </div>

                {/* CHANGE 3: The scroll container. 'flex-1' fills remaining space, 'min-h-0' ensures it respects parent height */}
                <div className="flex-1 min-h-0 overflow-hidden">
                  <div className="h-full w-full border rounded-md bg-slate-50 dark:bg-gray-800 overflow-y-auto p-3 font-mono text-sm">
                    <div className="space-y-1">
                      {consoleMessages.map((message, index) => (
                        <div
                          key={index}
                          className={`text-xs font-mono ${
                            message.includes("Error") ||
                            message.includes("Failed")
                              ? "text-red-600 dark:text-red-400"
                              : message.includes("Successfully") ||
                                  message.includes("completed")
                                ? "text-green-600 dark:text-green-400"
                                : "text-slate-700 dark:text-slate-300"
                          }`}
                        >
                          {message}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-4 flex flex-col h-full overflow-y-auto min-h-0">
            <Card className="flex-shrink-0">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 gap-6">
                    <img
                      src={icon2}
                      alt="Resample2 Logo"
                      className="h-16 w-16 rounded object-contain"
                    />
                    <div className="text-left text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      <div className="font-medium">
                        Resample2 by{" "}
                        <a
                          href="https://kaustubh.duddala.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                        >
                          Kaustubh Duddala
                        </a>
                      </div>
                      <div className="font-bold mt-1">A S 7 R A</div>
                      <div className="mt-1">0.0.1-alpha.1</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {(processingMode === "DownloadAndExtract" ||
              processingMode === "ExtractOnly") && (
              <Card className="flex-shrink-0">
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg">Stems</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-4">
                  <div>
                    <label className="text-sm font-medium mb-2 block">
                      Model
                    </label>
                    <Select
                      value={selectedModel}
                      onValueChange={setSelectedModel}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a model" />
                      </SelectTrigger>
                      <SelectContent>
                        {simpleModels.length > 0 ? (
                          simpleModels.map((model) => (
                            <SelectItem
                              key={model.filename}
                              value={model.filename}
                            >
                              <div className="flex flex-col">
                                <span className="font-medium">
                                  {model.friendly_name}
                                </span>
                                <span className="text-xs text-gray-500">
                                  {model.arch} • {model.output_stems}
                                </span>
                              </div>
                            </SelectItem>
                          ))
                        ) : (
                          <SelectItem value="no-models" disabled>
                            No models found
                          </SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {simpleModels.length === 0 && (
                      <p className="text-sm text-gray-500 mt-2">
                        No models found in the model directory. Download models
                        in Settings → Download Manager.
                      </p>
                    )}
                  </div>

                  {selectedModel && (
                    <div className="stem-dropdown">
                      <label className="block text-sm font-medium mb-2">
                        Available Stems
                      </label>
                      <div className="relative">
                        <div
                          className="flex items-center justify-between w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 cursor-pointer hover:border-gray-400 dark:hover:border-gray-500"
                          onClick={() => setStemDropdownOpen(!stemDropdownOpen)}
                        >
                          <span className="text-sm">
                            {selectedStems.length === 0
                              ? "Select stems to extract"
                              : `${selectedStems.length} stem(s) selected`}
                          </span>
                          <ChevronDown
                            className={`h-4 w-4 transition-transform ${stemDropdownOpen ? "rotate-180" : ""}`}
                          />
                        </div>

                        {stemDropdownOpen && (
                          <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-y-auto">
                            <div className="p-2">
                              {availableStems.map((stem) => (
                                <div
                                  key={stem}
                                  className="flex items-center space-x-2 px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                                  onClick={() => handleStemToggle(stem)}
                                >
                                  <Checkbox
                                    checked={selectedStems.includes(stem)}
                                    className="pointer-events-none"
                                  />
                                  <span className="text-sm capitalize">
                                    {stem}
                                  </span>
                                </div>
                              ))}
                              {availableStems.length === 0 && (
                                <div className="px-2 py-1 text-sm text-gray-500">
                                  No stems available
                                </div>
                              )}
                            </div>
                            {selectedStems.length > 0 && (
                              <div className="border-t border-gray-200 dark:border-gray-700 p-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedStems([])}
                                  className="w-full text-xs"
                                >
                                  Clear All
                                </Button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            <Card className="flex-1 min-h-0 flex flex-col">
              <CardHeader className="pt-4 pb-4 flex items-center justify-between">
                <CardTitle className="text-lg">Download History</CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={loadFileHistory}
                  title="Refresh file list"
                  className="h-7 w-7 p-0"
                >
                  <RotateCcw className="h-4 w-4" />
                </Button>
              </CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent min-h-0">
                  {audioFileHistory.map((file) => (
                    <div
                      key={getUniqueFileId(file)}
                      className="relative p-3 bg-slate-50 dark:bg-gray-800 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                      onClick={() => handleShowFileInFolder(file.path)}
                    >
                      <div className="pr-16">
                        <div className="font-medium text-sm text-gray-900 dark:text-gray-100 truncate">
                          {file.name}
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {file.directory_type === "downloads"
                              ? "Downloaded"
                              : "Separated"}
                          </Badge>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {file.created_display}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {(file.file_size / 1024 / 1024).toFixed(1)} MB
                          </span>
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                          Click to copy audio file for DAW pasting
                        </div>
                      </div>
                      <div className="absolute bottom-2 right-2 flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowFileInFolder(file.path);
                          }}
                          className="text-purple-600 hover:text-purple-700 h-6 w-6 p-0"
                          title="Open in file explorer"
                        >
                          <FolderOpen className="h-3 w-3" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (confirmingDelete === file.id) {
                              handleDeleteFile(file.path);
                              setConfirmingDelete(null);
                            } else {
                              setConfirmingDelete(file.id);
                              // Auto-cancel confirmation after 3 seconds
                              setTimeout(() => setConfirmingDelete(null), 3000);
                            }
                          }}
                          className={`h-6 px-2 text-xs ${
                            confirmingDelete === file.id
                              ? "text-white bg-red-600 hover:bg-red-700"
                              : "text-red-600 hover:text-red-700"
                          }`}
                          title={
                            confirmingDelete === file.id
                              ? "Click again to confirm deletion"
                              : "Delete file"
                          }
                        >
                          {confirmingDelete === file.id ? (
                            "Confirm?"
                          ) : (
                            <Trash2 className="h-3 w-3" />
                          )}
                        </Button>
                      </div>
                    </div>
                  ))}
                  {audioFileHistory.length === 0 && (
                    <div className="text-center text-gray-500 dark:text-gray-400 py-8">
                      No audio files found. Download or separate some audio to
                      see them here.
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App;
