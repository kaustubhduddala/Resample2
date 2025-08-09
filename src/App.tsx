"use client";

import { useState, useEffect, useRef } from "react";
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
import { invoke, convertFileSrc } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { SettingsPage } from "./Settings";

interface AudioFileInfo {
  id: string;
  name: string;
  file_path: string;
  directory_type: string; // "downloads" or "separated"
  created_timestamp: number;
  created_display: string;
  duration?: string;
  file_size: number;
}

interface VideoInfo {
  title: string;
  duration?: number;
  thumbnail?: string;
  uploader?: string;
  view_count?: number;
  video_url?: string;
  error?: string;
}

interface DownloadResult {
  success: boolean;
  message: string;
  file_path?: string;
}

interface DownloadProgress {
  progress: number;
  message: string;
  status: string; // "downloading", "processing", "completed", "error"
}

interface ModelInfo {
  filename: string;
  arch: string;
  output_stems: string;
  friendly_name: string;
}

interface SeparationResult {
  success: boolean;
  message: string;
  output_files: string[];
}

interface SeparationSettings {
  model_filename: string;
  output_format: string;
  output_dir: string;
  model_file_dir: string;
  normalization: number;
  amplification: number;
  single_stem?: string;
  sample_rate: number;
  use_autocast: boolean;
  use_gpu: boolean;
  gpu_type: string; // "auto", "cuda", "mps", "coreml", "cpu"
  mdx_segment_size: number;
  mdx_overlap: number;
  mdx_batch_size: number;
  mdx_enable_denoise: boolean;
  vr_batch_size: number;
  vr_window_size: number;
  vr_aggression: number;
  vr_enable_tta: boolean;
  vr_high_end_process: boolean;
  vr_enable_post_process: boolean;
  vr_post_process_threshold: number;
  demucs_segment_size: string;
  demucs_shifts: number;
  demucs_overlap: number;
  demucs_segments_enabled: boolean;
  mdxc_segment_size: number;
  mdxc_override_model_segment_size: boolean;
  mdxc_overlap: number;
  mdxc_batch_size: number;
  mdxc_pitch_shift: number;
}

interface Settings {
  theme: string;
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
  write_annotations: boolean;
  write_comments: boolean;
  write_automatic_subtitles: boolean;
  write_manual_subtitles: boolean;
  max_downloads: number;
  retries: number;
  fragment_retries: number;
  file_access_retries: number;
  concurrent_fragments: number;
  max_downloads_per_host: number;
  max_downloads_per_playlist: number;
  max_downloads_per_channel: number;
  max_downloads_per_user: number;
  max_downloads_per_extractor: number;
  max_downloads_per_video: number;
  max_downloads_per_audio: number;
  max_downloads_per_subtitle: number;
  max_downloads_per_thumbnail: number;
  max_downloads_per_description: number;
  max_downloads_per_info: number;
  max_downloads_per_annotations: number;
  max_downloads_per_comments: number;
  max_downloads_per_automatic_subtitles: number;
  max_downloads_per_manual_subtitles: number;
  separation_settings: SeparationSettings;
  model_directory: string;
  enable_stem_extraction: boolean;
}

type InputType = "YouTube" | "Spotify" | "LocalFile" | "Unknown";
type ProcessingMode = "DownloadOnly" | "DownloadAndExtract" | "ExtractOnly";

interface SimpleModelInfo {
  filename: string;
  friendly_name: string;
  output_stems: string;
  arch: string;
}

function App() {
  const [url, setUrl] = useState("");
  const [inputType, setInputType] = useState<InputType>("Unknown");
  const [processingMode, setProcessingMode] =
    useState<ProcessingMode>("DownloadOnly");
  const [currentTime, setCurrentTime] = useState([30]);
  const [endTime, setEndTime] = useState([90]);
  const [selectedModel, setSelectedModel] = useState("");
  const [selectedStems, setSelectedStems] = useState<string[]>([]);
  const [availableStems, setAvailableStems] = useState<string[]>([]);
  const [simpleModels, setSimpleModels] = useState<SimpleModelInfo[]>([]);

  const [isDownloading, setIsDownloading] = useState(false);
  const [isSeparating, setIsSeparating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressStatus, setProgressStatus] = useState<string>("idle");
  const [consoleMessages, setConsoleMessages] = useState<string[]>([
    "Initializing...",
  ]);
  const [audioFileHistory, setAudioFileHistory] = useState<AudioFileInfo[]>([]);

  // Function to refresh audio file history
  const refreshAudioFileHistory = async () => {
    try {
      const history = await invoke<AudioFileInfo[]>("get_audio_file_history");
      setAudioFileHistory(history);
    } catch (error) {
      console.error("Failed to refresh audio file history:", error);
    }
  };

  const [videoInfo, setVideoInfo] = useState<VideoInfo | null>(null);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [deletingFileIds, setDeletingFileIds] = useState<Set<string>>(
    new Set()
  );
  const deleteTimeoutsRef = useRef<Map<string, number>>(new Map());
  const consoleRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Remove the Download Center state variables since it's now in Settings
  const [settings, setSettings] = useState<Settings>({
    theme: "system",
    download_path: "Documents/Resample",
    audio_format: "mp3",
    audio_quality: "0",
    video_format: "mp4",
    video_quality: "best",
    extract_audio: true,
    write_subtitles: false,
    write_thumbnail: false,
    write_description: false,
    write_info: false,
    write_annotations: false,
    write_comments: false,
    write_automatic_subtitles: false,
    write_manual_subtitles: false,
    max_downloads: 1,
    retries: 10,
    fragment_retries: 10,
    file_access_retries: 3,
    concurrent_fragments: 1,
    max_downloads_per_host: 0,
    max_downloads_per_playlist: 0,
    max_downloads_per_channel: 0,
    max_downloads_per_user: 0,
    max_downloads_per_extractor: 0,
    max_downloads_per_video: 0,
    max_downloads_per_audio: 0,
    max_downloads_per_subtitle: 0,
    max_downloads_per_thumbnail: 0,
    max_downloads_per_description: 0,
    max_downloads_per_info: 0,
    max_downloads_per_annotations: 0,
    max_downloads_per_comments: 0,
    max_downloads_per_automatic_subtitles: 0,
    max_downloads_per_manual_subtitles: 0,
    separation_settings: {
      model_filename: "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
      output_format: "WAV",
      output_dir: "",
      model_file_dir: "",
      normalization: 0.9,
      amplification: 0.0,
      sample_rate: 44100,
      use_autocast: false,
      use_gpu: true,
      gpu_type: "auto",
      mdx_segment_size: 256,
      mdx_overlap: 0.25,
      mdx_batch_size: 1,
      mdx_enable_denoise: false,
      vr_batch_size: 1,
      vr_window_size: 512,
      vr_aggression: 5,
      vr_enable_tta: false,
      vr_high_end_process: false,
      vr_enable_post_process: false,
      vr_post_process_threshold: 0.2,
      demucs_segment_size: "Default",
      demucs_shifts: 2,
      demucs_overlap: 0.25,
      demucs_segments_enabled: true,
      mdxc_segment_size: 256,
      mdxc_override_model_segment_size: false,
      mdxc_overlap: 8,
      mdxc_batch_size: 1,
      mdxc_pitch_shift: 0,
    },
    model_directory: "Documents/Resample/Models",
    enable_stem_extraction: false,
  });

  const [separationSettings] = useState<SeparationSettings>({
    model_filename: "model_bs_roformer_ep_317_sdr_12.9755.ckpt",
    output_format: "WAV",
    output_dir: "",
    model_file_dir: "/tmp/audio-separator-models/",
    normalization: 0.9,
    amplification: 0.0,
    single_stem: undefined,
    sample_rate: 44100,
    use_autocast: false,
    use_gpu: true,
    gpu_type: "auto",
    mdx_segment_size: 256,
    mdx_overlap: 0.25,
    mdx_batch_size: 1,
    mdx_enable_denoise: false,
    vr_batch_size: 1,
    vr_window_size: 512,
    vr_aggression: 5,
    vr_enable_tta: false,
    vr_high_end_process: false,
    vr_enable_post_process: false,
    vr_post_process_threshold: 0.2,
    demucs_segment_size: "Default",
    demucs_shifts: 2,
    demucs_overlap: 0.25,
    demucs_segments_enabled: true,
    mdxc_segment_size: 256,
    mdxc_override_model_segment_size: false,
    mdxc_overlap: 8,
    mdxc_batch_size: 1,
    mdxc_pitch_shift: 0,
  });

  // Function to refresh downloaded models

  // Load settings and initialize
  useEffect(() => {
    const loadSettingsAndInitialize = async () => {
      try {
        const settingsJson = await invoke<string>("load_settings");
        const loadedSettings = JSON.parse(settingsJson);
        setSettings(loadedSettings);

        // Refresh audio file history
        await refreshAudioFileHistory();
      } catch (error) {
        console.error("Failed to load settings:", error);
      }
    };

    loadSettingsAndInitialize();
  }, []);

  // Remove the useEffect that reloads model list on settings.model_directory change
  // Instead, load models only once at launch, and provide a reloadModelList function

  // Load available models and downloaded models
  useEffect(() => {
    const loadModels = async () => {
      try {
        // Load simple models (directly from model folders)
        if (settings.model_directory) {
          const simpleModelList = await invoke<SimpleModelInfo[]>(
            "list_available_models_simple",
            {
              modelDirectory: settings.model_directory,
            }
          );
          setSimpleModels(simpleModelList);

          // Extract available stems from simple models
          const allStems = new Set<string>();
          simpleModelList.forEach((model) => {
            const stems = model.output_stems.split(",").map((s) => s.trim());
            stems.forEach((stem) => allStems.add(stem));
          });
          setAvailableStems(Array.from(allStems));
        }
      } catch (error) {
        console.error("Failed to load models:", error);
      }
    };

    loadModels();
  }, [settings.model_directory]);

  // Update available stems when selected model changes
  useEffect(() => {
    if (selectedModel) {
      const model = simpleModels.find((m) => m.filename === selectedModel);
      if (model) {
        const stems = model.output_stems.split(",").map((s) => s.trim());
        setAvailableStems(stems);
        // Clear selected stems when model changes
        setSelectedStems([]);
      }
    } else {
      setAvailableStems([]);
      setSelectedStems([]);
    }
  }, [selectedModel, simpleModels]);

  // Listen for separation progress events
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlistenFn = await listen("separation-progress", (event) => {
          const { progress, message, status } =
            event.payload as DownloadProgress;
          setProgress(progress);
          setProgressStatus(status);
          setConsoleMessages((prev) => [...prev, message]);

          if (status === "completed") {
            setIsSeparating(false);
            // Refresh audio file history to show separated files
            refreshAudioFileHistory();
          } else if (status === "error") {
            setIsSeparating(false);
            setProgress(0);
            setProgressStatus("idle");
          } else if (status === "processing") {
            setIsSeparating(true);
          }
        });
      } catch (error) {
        console.error("Failed to setup separation progress listener:", error);
      }
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  // Listen for download progress events
  useEffect(() => {
    let unlistenFn: (() => void) | null = null;

    const setupListener = async () => {
      try {
        unlistenFn = await listen("download-progress", (event) => {
          const { progress, message, status } =
            event.payload as DownloadProgress;
          setProgress(progress);
          setProgressStatus(status);
          setConsoleMessages((prev) => [...prev, message]);

          if (status === "completed") {
            setIsDownloading(false);
          } else if (status === "error") {
            setIsDownloading(false);
            setProgress(0);
            setProgressStatus("idle");
          } else if (status === "downloading" || status === "processing") {
            setIsDownloading(true);
          }
        });
      } catch (error) {
        console.error("Failed to setup download progress listener:", error);
      }
    };

    setupListener();

    return () => {
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  const handleStemToggle = (stem: string) => {
    setSelectedStems((prev) =>
      prev.includes(stem) ? prev.filter((s) => s !== stem) : [...prev, stem]
    );
  };

  const formatTimeToHHMMSS = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const getUniqueFileId = (file: AudioFileInfo) => {
    return `${file.id}-${file.file_path}`;
  };

  const handleDeleteFile = async (
    uniqueFileId: string,
    fileToDelete: AudioFileInfo
  ) => {
    if (!fileToDelete) return;

    if (deletingFileIds.has(uniqueFileId)) {
      // Confirmed delete - actually delete the file
      // Clear any existing timeout for this file
      const existingTimeout = deleteTimeoutsRef.current.get(uniqueFileId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
        deleteTimeoutsRef.current.delete(uniqueFileId);
      }

      setDeletingFileIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(uniqueFileId);
        return newSet;
      });

      try {
        // Delete the actual file from filesystem
        await invoke("delete_file", { filePath: fileToDelete.file_path });

        // Refresh the audio file history to reflect the deletion
        await refreshAudioFileHistory();

        setConsoleMessages((prev) => [
          ...prev,
          `Deleted file: ${fileToDelete.name}`,
        ]);
      } catch (error) {
        console.error("Failed to delete file:", error);
        setConsoleMessages((prev) => [
          ...prev,
          `Failed to delete file: ${error}`,
        ]);
      }
    } else {
      // First click - ask for confirmation
      // Clear any existing timeout for this file
      const existingTimeout = deleteTimeoutsRef.current.get(uniqueFileId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      setDeletingFileIds((prev) => {
        const newSet = new Set(prev);
        newSet.add(uniqueFileId);
        return newSet;
      });

      // Auto-reset after 3 seconds
      const timeoutId = setTimeout(() => {
        setDeletingFileIds((prev) => {
          const newSet = new Set(prev);
          newSet.delete(uniqueFileId);
          return newSet;
        });
        deleteTimeoutsRef.current.delete(uniqueFileId);
      }, 3000);

      deleteTimeoutsRef.current.set(uniqueFileId, timeoutId);
    }
  };

  const fetchVideoInfo = async (videoUrl: string) => {
    if (!videoUrl.trim()) {
      setVideoInfo(null);
      return;
    }

    setIsLoadingVideo(true);
    setConsoleMessages((prev) => [
      ...prev,
      `Fetching video info for: ${videoUrl}`,
    ]);

    try {
      const result = await invoke<VideoInfo>("fetch_video_info", {
        url: videoUrl,
      });

      // Update video info with additional metadata
      const enhancedVideoInfo: VideoInfo = {
        ...result,
        title: result.title || "Unknown Title",
        duration: result.duration ? Math.floor(result.duration) : undefined,
        uploader: result.uploader || "Unknown Uploader",
      };

      setVideoInfo(enhancedVideoInfo);
      setConsoleMessages((prev) => [
        ...prev,
        `Successfully loaded: ${enhancedVideoInfo.title}`,
      ]);

      // Update timeline if duration is available
      if (enhancedVideoInfo.duration) {
        setCurrentTime([0]);
        setEndTime([enhancedVideoInfo.duration]);
      }
    } catch (error) {
      const errorMessage = error as string;
      setVideoInfo({
        title: "Error",
        error: errorMessage,
        duration: undefined,
        thumbnail: undefined,
        uploader: undefined,
        view_count: undefined,
        video_url: undefined,
      });
      setConsoleMessages((prev) => [...prev, `Error: ${errorMessage}`]);
    } finally {
      setIsLoadingVideo(false);
    }
  };

  const handleDownload = async () => {
    if (!url.trim()) {
      setConsoleMessages((prev) => [...prev, "No input provided"]);
      return;
    }

    if (inputType === "Unknown") {
      setConsoleMessages((prev) => [
        ...prev,
        "Unknown input type. Please select a valid input or specify the type manually.",
      ]);
      return;
    }

    setIsDownloading(true);
    setProgress(0);
    setProgressStatus("downloading");
    setConsoleMessages((prev) => [
      ...prev,
      `Starting ${inputType.toLowerCase()} processing...`,
    ]);

    try {
      const selectionStart = Math.floor(currentTime[0] ?? 0);
      const selectionEnd = Math.floor(endTime[0] ?? 0);
      const hasSelection = selectionEnd > selectionStart;

      // Use unified download for all input types
      const result = await invoke<DownloadResult>("unified_download", {
        input: url,
        inputType: inputType,
        processingMode: processingMode,
        startTime: hasSelection ? selectionStart : null,
        endTime: hasSelection ? selectionEnd : null,
      });

      // Only update progress to 100 if the download was successful
      if (result.success) {
        setProgress(100);

        // Refresh audio file history to show the new download
        await refreshAudioFileHistory();
        setConsoleMessages((prev) => [...prev, `File processed successfully`]);

        // Automatically perform stem separation if enabled in processing mode
        if (
          (processingMode === "DownloadAndExtract" ||
            processingMode === "ExtractOnly") &&
          selectedModel &&
          result.file_path
        ) {
          setConsoleMessages((prev) => [
            ...prev,
            "Starting automatic stem separation...",
          ]);
          setIsSeparating(true);
          setProgressStatus("processing");

          try {
            const separationResult = await invoke<SeparationResult>(
              "separate_audio",
              {
                inputFile: result.file_path,
                settings: {
                  ...separationSettings,
                  model_filename: selectedModel,
                  single_stem:
                    selectedStems.length === 1 ? selectedStems[0] : null,
                },
                modelDirectory: settings.model_directory,
              }
            );

            if (separationResult.success) {
              setConsoleMessages((prev) => [
                ...prev,
                "Stem separation completed successfully!",
              ]);

              // Files are automatically tracked via audioFileHistory refresh
            } else {
              setConsoleMessages((prev) => [
                ...prev,
                `Stem separation failed: ${separationResult.message}`,
              ]);
            }
          } catch (error) {
            setConsoleMessages((prev) => [
              ...prev,
              `Stem separation error: ${error}`,
            ]);
          } finally {
            setIsSeparating(false);
          }
        }
      } else {
        setProgress(0);
        setConsoleMessages((prev) => [
          ...prev,
          `Processing failed: ${result.message}`,
        ]);
      }
    } catch (error) {
      const errorMessage = error as string;
      setConsoleMessages((prev) => [
        ...prev,
        `Processing failed: ${errorMessage}`,
      ]);
      setProgress(0);
    } finally {
      // Only set downloading to false if we're not in the middle of a download
      // The progress listener will handle the final state
    }
  };

  const handleStopDownload = async () => {
    if (!url.trim()) {
      setConsoleMessages((prev) => [...prev, "No active process to stop"]);
      return;
    }

    // Immediately show feedback
    setConsoleMessages((prev) => [...prev, "Stopping process..."]);
    setIsDownloading(false);
    setIsSeparating(false);
    setProgress(0);
    setProgressStatus("idle");

    try {
      // Immediately stop the process
      const result = await invoke<string>("stop_download", {
        url: url,
      });

      setConsoleMessages((prev) => [...prev, result]);
    } catch (error) {
      const errorMessage = error as string;
      setConsoleMessages((prev) => [
        ...prev,
        `Failed to stop process: ${errorMessage}`,
      ]);
    }
  };

  const clearConsole = () => {
    setConsoleMessages(["Console cleared"]);
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setUrl(text);
    } catch (error) {
      setConsoleMessages((prev) => [...prev, "Failed to paste from clipboard"]);
    }
  };

  const handleBrowserClick = async () => {
    try {
      const selectedPath = await invoke<string>("select_file");
      setUrl(selectedPath);
      setInputType("LocalFile");
      setConsoleMessages((prev) => [
        ...prev,
        `Selected local file: ${selectedPath}`,
      ]);
    } catch (error) {
      setConsoleMessages((prev) => [
        ...prev,
        `Failed to select file: ${error}`,
      ]);
    }
  };

  const detectAndSetInputType = async (input: string) => {
    if (!input.trim()) {
      setInputType("Unknown");
      return;
    }

    try {
      const detectedType = await invoke<InputType>("detect_input_type", {
        input: input.trim(),
      });
      setInputType(detectedType);
      setConsoleMessages((prev) => [
        ...prev,
        `Detected input type: ${detectedType}`,
      ]);
    } catch (error) {
      setInputType("Unknown");
      setConsoleMessages((prev) => [
        ...prev,
        `Failed to detect input type: ${error}`,
      ]);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      const path = (file as any).path || file.name;
      setUrl(path);
      setInputType("LocalFile");
      setConsoleMessages((prev) => [...prev, `Dropped file: ${file.name}`]);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  // Load available stems when component mounts
  useEffect(() => {
    const loadAvailableStems = async () => {
      try {
        const modelList = await invoke<ModelInfo[]>("list_separation_models");
        const allStems = new Set<string>();
        modelList.forEach((model) => {
          const stems = model.output_stems.split(",").map((s) => s.trim());
          stems.forEach((stem) => allStems.add(stem));
        });
        setAvailableStems(Array.from(allStems));
      } catch (error) {
        console.error("Failed to load available stems:", error);
      }
    };

    loadAvailableStems();
  }, []);

  // Listen for download progress events
  useEffect(() => {
    const unlisten = listen("download-progress", (event) => {
      const { progress, message, status } = event.payload as DownloadProgress;
      setProgress(progress);
      setProgressStatus(status);
      setConsoleMessages((prev) => [...prev, message]);

      if (status === "completed") {
        setIsDownloading(false);
      } else if (status === "error") {
        setIsDownloading(false);
        setProgress(0);
        setProgressStatus("idle");
      } else if (status === "downloading" || status === "processing") {
        setIsDownloading(true);
      }
    });

    return () => {
      unlisten.then((f) => f());
    };
  }, []);

  // Update processing mode when input type changes
  useEffect(() => {
    if (inputType === "LocalFile") {
      setProcessingMode("ExtractOnly");
    } else if (processingMode === "ExtractOnly") {
      setProcessingMode("DownloadOnly");
    }
  }, [inputType, processingMode]);

  // Detect input type and fetch info when URL changes
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (url.trim()) {
        detectAndSetInputType(url);
        // Fetch video info for YouTube and Spotify URLs
        if (
          url.toLowerCase().includes("youtube.com") ||
          url.toLowerCase().includes("youtu.be") ||
          url.toLowerCase().includes("music.youtube.com") ||
          url.toLowerCase().includes("spotify.com") ||
          url.toLowerCase().includes("open.spotify.com")
        ) {
          fetchVideoInfo(url);
        } else if (inputType === "LocalFile") {
          // For local files, get metadata with FFprobe
          const getLocalInfo = async () => {
            try {
              const fileInfo = await invoke<VideoInfo>("get_local_file_info", {
                filePath: url,
              });
              setVideoInfo(fileInfo);
            } catch (error) {
              // Fallback to basic info
              setVideoInfo({
                title:
                  url.split("/").pop() || url.split("\\").pop() || "Local File",
                duration: undefined,
                thumbnail: undefined,
                uploader: "Local File",
                view_count: undefined,
                video_url: undefined,
              });
            }
          };
          getLocalInfo();
        } else {
          // For other types, clear video info
          setVideoInfo(null);
        }
      } else {
        setInputType("Unknown");
        setVideoInfo(null);
      }
    }, 1000); // Debounce for 1 second

    return () => clearTimeout(timeoutId);
  }, [url, inputType]);

  // Update timeline when video info changes
  useEffect(() => {
    if (typeof mediaDuration === "number" && mediaDuration > 0) {
      const duration = Math.floor(mediaDuration);
      setCurrentTime([0]);
      setEndTime([duration]);
    }
  }, [mediaDuration]);

  // Auto-scroll console to bottom when new messages are added
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight;
    }
  }, [consoleMessages]);

  const [stemDropdownOpen, setStemDropdownOpen] = useState(false);

  // Close stem dropdown when clicking outside
  useEffect(() => {
    if (!stemDropdownOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Element;
      if (!target.closest(".stem-dropdown")) {
        setStemDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [stemDropdownOpen]);

  // Handle layout recalculation when returning from settings
  useEffect(() => {
    if (!showSettings) {
      // Force a layout recalculation when returning from settings
      setTimeout(() => {
        // Trigger a small state update to force re-render with proper heights
        setProgressStatus((prev) => prev);

        // Refresh audio file history when returning from settings
        refreshAudioFileHistory();

        // Reload settings when returning from settings page
        const reloadSettings = async () => {
          try {
            const settingsJson = await invoke<string>("load_settings");
            const loadedSettings = JSON.parse(settingsJson);
            setSettings(loadedSettings);
          } catch (error) {
            console.error("Failed to reload settings:", error);
          }
        };
        reloadSettings();
      }, 0);
    }
  }, [showSettings]);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      deleteTimeoutsRef.current.forEach((timeoutId) => {
        clearTimeout(timeoutId);
      });
      deleteTimeoutsRef.current.clear();
    };
  }, []);

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

  // Conditional rendering without early return
  if (showSettings) {
    return (
      <SettingsPage
        onClose={() => setShowSettings(false)}
        onSettingsSaved={() => {
          // Reload settings when they are saved
          const reloadSettings = async () => {
            try {
              const settingsJson = await invoke<string>("load_settings");
              const loadedSettings = JSON.parse(settingsJson);
              setSettings(loadedSettings);
            } catch (error) {
              console.error("Failed to reload settings after save:", error);
            }
          };
          reloadSettings();
        }}
      />
    );
  }

  // TODO: Implement database reload button and uncomment this function
  // const reloadModelList = async () => {
  //   try {
  //     const modelList = await invoke<ModelInfo[]>("list_separation_models");
  //     setAvailableModels(modelList);
  //     // Extract available stems from models
  //     const allStems = new Set<string>();
  //     modelList.forEach((model) => {
  //       const stems = model.output_stems.split(",").map((s) => s.trim());
  //       stems.forEach((stem) => allStems.add(stem));
  //       setAvailableStems(Array.from(allStems));
  //       // Optionally refresh downloaded models
  //       await refreshDownloadedModels();
  //   } catch (error) {
  //     console.error("Failed to load models:", error);
  //   }
  // };

  return (
    <div
      key={showSettings ? "settings" : "main"}
      className="min-h-screen bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-gray-950 dark:to-gray-950"
    >
      <div className="container mx-auto p-3 max-w-7xl">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch h-[calc(100vh-3rem)]">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-4 flex flex-col h-full">
            {/* URL Input */}
            <Card className="flex-shrink-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Input</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="space-y-4">
                  {/* Source Type Dropdown */}
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
                      onChange={(e) => setUrl(e.target.value)}
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

                  {/* Download Directory */}
                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Download Directory
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={settings.download_path}
                        placeholder="Base directory for downloads and stems"
                        onChange={async (e) => {
                          const newSettings = {
                            ...settings,
                            download_path: e.target.value,
                          };
                          setSettings(newSettings);
                          try {
                            await invoke("save_settings", {
                              settings: JSON.stringify(newSettings),
                            });
                          } catch (error) {
                            setConsoleMessages((prev) => [
                              ...prev,
                              `Failed to save settings: ${error}`,
                            ]);
                          }
                        }}
                        className="flex-1"
                      />
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            await invoke("open_in_explorer", {
                              path: settings.download_path,
                            });
                            setConsoleMessages((prev) => [
                              ...prev,
                              `Opened ${settings.download_path} in file explorer`,
                            ]);
                          } catch (error) {
                            setConsoleMessages((prev) => [
                              ...prev,
                              `Failed to open directory: ${error}`,
                            ]);
                          }
                        }}
                        title="Open in file explorer"
                      >
                        <FolderOpen className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          try {
                            const selectedPath = await invoke<string>(
                              "select_folder"
                            );
                            const newSettings = {
                              ...settings,
                              download_path: selectedPath,
                            };
                            setSettings(newSettings);
                            await invoke("save_settings", {
                              settings: JSON.stringify(newSettings),
                            });
                          } catch (error) {
                            setConsoleMessages((prev) => [
                              ...prev,
                              `Failed to select folder: ${error}`,
                            ]);
                          }
                        }}
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

            {/* Compact Media Preview & Selection */}
            <Card className="flex-shrink-0">
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Preview</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Compact Media Preview */}
                  <div className="space-y-3">
                    <div className="relative aspect-video bg-slate-200 dark:bg-gray-700 rounded-lg flex items-center justify-center overflow-hidden">
                      {isLoadingVideo ? (
                        <div className="text-center">
                          <Loader2 className="h-8 w-8 mx-auto mb-1 text-slate-400 dark:text-slate-500 animate-spin" />
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            Loading preview...
                          </p>
                        </div>
                      ) : videoInfo?.thumbnail ||
                        inputType === "LocalFile" ||
                        inputType === "Spotify" ||
                        videoInfo?.title ? (
                        <div className="w-full h-full relative">
                          {inputType === "LocalFile" ? (
                            // Audio player for local files
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-100 to-purple-100 dark:from-blue-900 dark:to-purple-900">
                              <div className="text-center mb-4">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                  {videoInfo?.title || "Audio File"}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {videoInfo?.uploader || "Local File"}
                                </p>
                                {mediaDuration && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Duration:{" "}
                                    {formatTimeToHHMMSS(mediaDuration)}
                                  </p>
                                )}
                              </div>
                              <audio
                                ref={audioRef}
                                className="w-full max-w-sm"
                                onTimeUpdate={() => {
                                  if (audioRef.current) {
                                    setCurrentTime([
                                      Math.floor(audioRef.current.currentTime),
                                    ]);
                                  }
                                }}
                                onLoadedMetadata={() => {
                                  if (audioRef.current) {
                                    const audio = audioRef.current;
                                    setCurrentTime([0]);
                                    setEndTime([
                                      Math.floor(audio.duration || 300),
                                    ]);
                                    setMediaDuration(
                                      Number.isFinite(audio.duration)
                                        ? Math.floor(audio.duration)
                                        : mediaDuration
                                    );
                                  }
                                }}
                                controls
                                preload="metadata"
                                src={url ? convertFileSrc(url) : undefined}
                              >
                                Your browser does not support the audio element.
                              </audio>
                            </div>
                          ) : videoInfo?.thumbnail ? (
                            // Video player for YouTube/Spotify with thumbnails
                            <div className="w-full h-full">
                              {inputType === "Spotify" ? (
                                // For Spotify, show YouTube video preview if available, otherwise show Spotify info
                                videoInfo.video_url ? (
                                  // Show YouTube video preview for Spotify track
                                  <div className="w-full h-full relative">
                                    <video
                                      ref={videoRef}
                                      className="w-full h-full object-cover rounded-lg"
                                      onTimeUpdate={() => {
                                        if (videoRef.current) {
                                          setCurrentTime([
                                            Math.floor(
                                              videoRef.current.currentTime
                                            ),
                                          ]);
                                        }
                                      }}
                                      onLoadedMetadata={() => {
                                        if (videoRef.current) {
                                          setCurrentTime([0]);
                                          const d = Math.floor(
                                            videoRef.current.duration || 300
                                          );
                                          setEndTime([d]);
                                          setMediaDuration(
                                            Number.isFinite(
                                              videoRef.current.duration
                                            )
                                              ? d
                                              : mediaDuration
                                          );
                                        }
                                      }}
                                      onError={() => {
                                        setConsoleMessages((prev) => [
                                          ...prev,
                                          "Video preview not available",
                                        ]);
                                      }}
                                      controls
                                      preload="metadata"
                                      poster={videoInfo?.thumbnail}
                                    >
                                      {videoInfo?.video_url && (
                                        <source
                                          src={videoInfo?.video_url}
                                          type="video/mp4"
                                        />
                                      )}
                                      Your browser does not support the video
                                      tag.
                                    </video>
                                    {/* Spotify track info overlay */}
                                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3 rounded-b-lg">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                                        <p className="text-white text-sm font-medium truncate">
                                          {videoInfo.title}
                                        </p>
                                      </div>
                                      <p className="text-white/80 text-xs">
                                        {videoInfo.uploader}
                                        {typeof mediaDuration === "number" &&
                                          ` • ${formatTimeToHHMMSS(
                                            mediaDuration
                                          )}`}
                                      </p>
                                      <p className="text-white/60 text-xs">
                                        Found on YouTube for Spotify track
                                      </p>
                                    </div>
                                  </div>
                                ) : (
                                  // Fallback Spotify display without YouTube video
                                  <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-green-100 to-green-200 dark:from-green-900 dark:to-green-800 relative">
                                    {videoInfo.thumbnail && (
                                      <img
                                        src={videoInfo.thumbnail}
                                        alt={videoInfo.title}
                                        className="w-16 h-16 rounded-lg object-cover mb-3"
                                      />
                                    )}
                                    <div className="text-center">
                                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                        {videoInfo.title || "Spotify Track"}
                                      </p>
                                      <p className="text-xs text-gray-500 dark:text-gray-400">
                                        {videoInfo.uploader || "Spotify"}
                                      </p>
                                      {videoInfo.duration && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400">
                                          Duration:{" "}
                                          {formatTimeToHHMMSS(
                                            videoInfo.duration
                                          )}
                                        </p>
                                      )}
                                      <div className="text-xs text-green-600 dark:text-green-400 mt-2 flex items-center justify-center">
                                        <span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span>
                                        Spotify Track
                                      </div>
                                    </div>
                                  </div>
                                )
                              ) : (
                                // Regular video player for YouTube
                                <div className="w-full h-full relative">
                                  <video
                                    ref={videoRef}
                                    className="w-full h-full object-cover rounded-lg"
                                    onTimeUpdate={() => {
                                      if (videoRef.current) {
                                        setCurrentTime([
                                          Math.floor(
                                            videoRef.current.currentTime
                                          ),
                                        ]);
                                      }
                                    }}
                                    onLoadedMetadata={() => {
                                      if (videoRef.current) {
                                        setCurrentTime([0]);
                                        const d = Math.floor(
                                          videoRef.current.duration || 300
                                        );
                                        setEndTime([d]);
                                        setMediaDuration(
                                          Number.isFinite(
                                            videoRef.current.duration
                                          )
                                            ? d
                                            : mediaDuration
                                        );
                                      }
                                    }}
                                    onError={() => {
                                      setConsoleMessages((prev) => [
                                        ...prev,
                                        "Video preview not available",
                                      ]);
                                    }}
                                    controls
                                    preload="metadata"
                                    poster={videoInfo?.thumbnail}
                                  >
                                    {videoInfo?.video_url && (
                                      <source
                                        src={videoInfo?.video_url}
                                        type="video/mp4"
                                      />
                                    )}
                                    Your browser does not support the video tag.
                                  </video>
                                </div>
                              )}
                            </div>
                          ) : videoInfo?.title ? (
                            // Fallback for videos without thumbnails
                            <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700">
                              <div className="text-center">
                                <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  {videoInfo.title}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {videoInfo.uploader || "Unknown Uploader"}
                                </p>
                                {typeof mediaDuration === "number" && (
                                  <p className="text-xs text-gray-500 dark:text-gray-400">
                                    Duration:{" "}
                                    {formatTimeToHHMMSS(mediaDuration)}
                                  </p>
                                )}
                              </div>
                            </div>
                          ) : (
                            <img
                              src={videoInfo?.thumbnail}
                              alt={videoInfo?.title}
                              className="w-full h-full object-cover rounded-lg"
                            />
                          )}
                        </div>
                      ) : videoInfo?.error ? (
                        <div className="text-center">
                          <AlertTriangleIcon className="h-8 w-8 mx-auto mb-1 text-red-400" />
                          <p className="text-xs text-red-400">
                            Error loading preview
                          </p>
                          <p className="text-xs text-red-300 mt-1">
                            {videoInfo.error}
                          </p>
                        </div>
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

                  {/* Timeline & Time Selection */}
                  <div className="space-y-4">
                    <div>
                      <div className="space-y-4">
                        {/* Video Info Display */}
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

                        {/* Time Sliders */}
                        <div className="space-y-3">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs text-slate-400 mb-1 block">
                                Start Time
                              </label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="text"
                                  value={formatTimeToHHMMSS(
                                    Math.floor(currentTime[0])
                                  )}
                                  onChange={(e) => {
                                    const timeStr = e.target.value;
                                    const timeParts = timeStr
                                      .split(":")
                                      .map(Number);
                                    if (timeParts.length === 3) {
                                      const seconds =
                                        timeParts[0] * 3600 +
                                        timeParts[1] * 60 +
                                        timeParts[2];
                                      const maxDuration =
                                        (videoInfo?.duration ?? 300) - 5;
                                      if (
                                        seconds >= 0 &&
                                        seconds < maxDuration
                                      ) {
                                        setCurrentTime([seconds]);
                                        // Update media element position
                                        if (inputType === "LocalFile") {
                                          if (audioRef.current) {
                                            audioRef.current.currentTime =
                                              seconds;
                                          }
                                        } else if (videoRef.current) {
                                          videoRef.current.currentTime =
                                            seconds;
                                        }
                                      }
                                    }
                                  }}
                                  className="text-xs h-8 px-2"
                                  placeholder="HH:MM:SS"
                                />
                              </div>
                              <Slider
                                value={currentTime}
                                onValueChange={(value) => {
                                  if (value[0] < endTime[0] - 5) {
                                    setCurrentTime([Math.floor(value[0])]);
                                    // Update media element position
                                    if (videoRef.current) {
                                      if (inputType === "LocalFile") {
                                        (
                                          videoRef.current as HTMLAudioElement
                                        ).currentTime = value[0];
                                      } else {
                                        videoRef.current.currentTime = value[0];
                                      }
                                    }
                                  }
                                }}
                                max={(videoInfo?.duration ?? 300) - 5}
                                step={1}
                                className="w-full mt-2"
                              />
                            </div>
                            <div>
                              <label className="text-xs text-slate-400 mb-1 block">
                                End Time
                              </label>
                              <div className="flex items-center gap-2">
                                <Input
                                  type="text"
                                  value={formatTimeToHHMMSS(
                                    Math.floor(endTime[0])
                                  )}
                                  onChange={(e) => {
                                    const timeStr = e.target.value;
                                    const timeParts = timeStr
                                      .split(":")
                                      .map(Number);
                                    if (timeParts.length === 3) {
                                      const seconds =
                                        timeParts[0] * 3600 +
                                        timeParts[1] * 60 +
                                        timeParts[2];
                                      const maxDuration =
                                        videoInfo?.duration ?? 300;
                                      if (
                                        seconds > currentTime[0] + 5 &&
                                        seconds <= maxDuration
                                      ) {
                                        setEndTime([seconds]);
                                      }
                                    }
                                  }}
                                  className="text-xs h-8 px-2"
                                  placeholder="HH:MM:SS"
                                />
                              </div>
                              <Slider
                                value={endTime}
                                onValueChange={(value) => {
                                  const minValue = currentTime[0] + 5;
                                  const maxValue = videoInfo?.duration ?? 300;
                                  if (
                                    value[0] > minValue &&
                                    value[0] <= maxValue
                                  ) {
                                    setEndTime([Math.floor(value[0])]);
                                  }
                                }}
                                min={5}
                                max={videoInfo?.duration ?? 300}
                                step={1}
                                className="w-full mt-2"
                              />
                            </div>
                          </div>
                        </div>

                        <div className="text-center">
                          <span className="text-sm text-slate-600 dark:text-slate-300">
                            Selected:{" "}
                            {formatTimeToHHMMSS(
                              Math.floor(endTime[0] - currentTime[0])
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Console */}
            <Card className="flex-1 flex flex-col min-h-0">
              <CardHeader className="pb-3 flex-shrink-0">
                <CardTitle className="text-lg">Console</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-4 flex-1 flex flex-col min-h-0">
                <div className="space-y-2 flex-shrink-0">
                  <div className="flex justify-between text-sm">
                    <span>{getProgressText(progressStatus)}</span>
                    <span>{Math.round(progress)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
                    <div
                      className={`h-2.5 rounded-full transition-all duration-300 ${getProgressColor(
                        progressStatus
                      )}`}
                      style={{ width: `${Math.min(progress, 100)}%` }}
                    ></div>
                  </div>
                </div>

                <div className="flex gap-2 flex-shrink-0 items-end">
                  {/* Processing Mode Dropdown */}
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
                    disabled={
                      !url.trim() ||
                      inputType === "Unknown" ||
                      isDownloading ||
                      isSeparating ||
                      ((processingMode === "DownloadAndExtract" ||
                        processingMode === "ExtractOnly") &&
                        !selectedModel)
                    }
                  >
                    {isDownloading || isSeparating ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        {isSeparating
                          ? "Processing..."
                          : processingMode === "DownloadOnly"
                          ? "Processing..."
                          : processingMode === "DownloadAndExtract"
                          ? "Downloading..."
                          : "Extracting..."}
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

                <div className="flex-1 min-h-0 overflow-hidden">
                  <div
                    ref={consoleRef}
                    className="h-full w-full border rounded-md bg-slate-50 dark:bg-gray-800 overflow-y-auto p-3 font-mono text-sm relative"
                    style={{ height: "180px" }}
                  >
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
          <div className="space-y-4 flex flex-col h-full">
            {/* Creator Info */}
            <Card className="flex-shrink-0">
              <CardContent className="pt-4 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3 gap-6">
                    <img
                      src="../src-tauri/icons/icon2.png"
                      alt="Logo"
                      className="h-16 w-16"
                    />
                    <div className="text-left text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                      <div className="font-medium">
                        Resample by{" "}
                        <a
                          href="https://kaustubh.duddala.com"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                        >
                          Kaustubh Duddala
                        </a>
                      </div>
                      <div className="font-bold mt-1">PARANØID</div>
                      <div className="mt-1">0.0.1-alpha.1</div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stems Section - only show for relevant processing modes */}
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

                  {/* Available Stems for Selected Model */}
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
                            className={`h-4 w-4 transition-transform ${
                              stemDropdownOpen ? "rotate-180" : ""
                            }`}
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

            {/* Download History */}
            <Card className="flex-1 flex flex-col h-full">
              <CardHeader className="pt-4 pb-4 flex items-left">
                <CardTitle className="text-lg">Download History</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 flex-1 flex flex-col min-h-0">
                <div className="flex-grow max-h-[calc(100vh-300px)] overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
                  {audioFileHistory.map((file) => (
                    <div
                      key={getUniqueFileId(file)}
                      className="relative p-3 bg-slate-50 dark:bg-gray-800 rounded-lg hover:bg-slate-100 dark:hover:bg-gray-700 transition-colors cursor-pointer"
                      onClick={async (e) => {
                        // Don't copy if clicking on buttons
                        if ((e.target as Element).closest("button")) {
                          return;
                        }

                        if (file.file_path) {
                          try {
                            const result = await invoke<string>(
                              "copy_audio_file_to_clipboard",
                              {
                                filePath: file.file_path,
                              }
                            );
                            setConsoleMessages((prev) => [...prev, result]);
                          } catch (error) {
                            // Fallback to copying file path as text
                            const textToCopy = file.file_path || file.name;
                            navigator.clipboard.writeText(textToCopy);
                            setConsoleMessages((prev) => [
                              ...prev,
                              `Fallback: Copied file path "${textToCopy}" to clipboard. Error: ${error}`,
                            ]);
                          }
                        } else {
                          // If no file path, copy the name as before
                          navigator.clipboard.writeText(file.name);
                          setConsoleMessages((prev) => [
                            ...prev,
                            `Copied "${file.name}" to clipboard.`,
                          ]);
                        }
                      }}
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
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await invoke("open_in_explorer", {
                                path: file.file_path,
                              });
                              setConsoleMessages((prev) => [
                                ...prev,
                                `Opened file location: ${file.name}`,
                              ]);
                            } catch (error) {
                              setConsoleMessages((prev) => [
                                ...prev,
                                `Failed to open file location: ${error}`,
                              ]);
                            }
                          }}
                          className="text-blue-600 hover:text-blue-700 h-6 w-6 p-0"
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
                            e.nativeEvent.stopImmediatePropagation();
                            handleDeleteFile(getUniqueFileId(file), file);
                          }}
                          className={`h-6 px-2 text-xs ${
                            deletingFileIds.has(getUniqueFileId(file))
                              ? "text-red-600 hover:text-red-700 bg-red-50 dark:bg-red-900/20"
                              : "text-red-600 hover:text-red-700"
                          }`}
                          title={
                            deletingFileIds.has(getUniqueFileId(file))
                              ? "Click again to confirm"
                              : "Delete file"
                          }
                        >
                          {deletingFileIds.has(getUniqueFileId(file)) ? (
                            "Confirm"
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
