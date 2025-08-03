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
import { invoke } from "@tauri-apps/api/core";
import {
  X,
  Save,
  RotateCcw,
  Download,
  Database,
  Search,
  Loader2,
  RefreshCw,
  Trash2,
  Info,
} from "lucide-react";
import { useTheme } from "./hooks/use-theme";

const TABS = [
  "General",
  "Download",
  "Stem Separation",
  "Download Manager",
] as const;
type Tab = (typeof TABS)[number];

interface ModelInfo {
  filename: string;
  arch: string;
  output_stems: string;
  friendly_name: string;
}

interface Settings {
  // Theme settings
  theme: string; // "light", "dark", "system"

  // Download settings (yt-dlp related)
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

  // Stem separation settings
  separation_settings: {
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
  };

  // Model management settings
  model_directory: string;
  enable_stem_extraction: boolean;
}

interface DownloadedModel {
  filename: string;
  friendly_name: string;
}

const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  download_path: "Documents/Resample", // This will be set properly by the backend
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
    output_format: "FLAC",
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
};

const fieldWrapperClass = "space-y-4";

// Helper component for info tooltip
const InfoTooltip = ({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) => (
  <div className="group relative inline-block">
    <div className="flex items-center gap-2">
      {children}
      <Info className="h-4 w-4 text-gray-400 hover:text-gray-600 cursor-help" />
    </div>
    <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-2 bg-gray-900 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none whitespace-normal max-w-xs z-50">
      {title}
      <div className="absolute top-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-gray-900"></div>
    </div>
  </div>
);

export function SettingsPage({
  onClose,
  onRefreshDownloadedModels,
  onSettingsSaved,
}: {
  onClose: () => void;
  onRefreshDownloadedModels?: () => Promise<void>;
  onSettingsSaved?: () => void;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("General");
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [savedSettings, setSavedSettings] =
    useState<Settings>(DEFAULT_SETTINGS);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Model download states
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);
  const [isDownloadingModels, setIsDownloadingModels] = useState(false);
  const [modelSearchTerm, setModelSearchTerm] = useState("");
  const [modelFilter, setModelFilter] = useState("all");

  // Downloaded models states
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>(
    []
  );
  const [isLoadingDownloadedModels, setIsLoadingDownloadedModels] =
    useState(false);
  const [confirmingDeleteModel, setConfirmingDeleteModel] = useState<
    string | null
  >(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");

  const { setTheme } = useTheme();

  // Load models and downloaded models when Download Manager tab is opened
  useEffect(() => {
    if (activeTab === "Download Manager") {
      loadModels();
      loadDownloadedModels();
    }
  }, [activeTab]);

  // Load settings and models on component mount
  useEffect(() => {
    loadSettings();
    loadModels();
    loadDownloadedModels();
  }, []);

  useEffect(() => {
    const hasChanges =
      JSON.stringify(settings) !== JSON.stringify(savedSettings);
    setHasUnsavedChanges(hasChanges);
  }, [settings, savedSettings]);

  const loadSettings = async () => {
    try {
      const savedSettingsJson = await invoke<string>("load_settings");
      const savedSettings = JSON.parse(savedSettingsJson) as Settings;
      setSettings(savedSettings);
      setSavedSettings(savedSettings);
      setTheme(savedSettings.theme as "light" | "dark" | "system");
    } catch (error) {
      console.error("Failed to load settings:", error);
    }
  };

  const saveSettings = async () => {
    setSaveStatus("saving");
    try {
      await invoke("save_settings", { settings: JSON.stringify(settings) });
      setSavedSettings(settings);
      setHasUnsavedChanges(false);
      setTheme(settings.theme as "light" | "dark" | "system");
      setSaveStatus("success");

      // Notify parent component that settings were saved
      if (onSettingsSaved) {
        onSettingsSaved();
      }

      // Clear success status after 2 seconds
      setTimeout(() => setSaveStatus("idle"), 2000);
    } catch (error) {
      console.error("Failed to save settings:", error);
      setSaveStatus("error");

      // Still update local state to show the save worked for now
      // This allows the UI to work even when backend commands aren't implemented
      setSavedSettings(settings);
      setHasUnsavedChanges(false);
      setTheme(settings.theme as "light" | "dark" | "system");

      // Notify parent component that settings were saved
      if (onSettingsSaved) {
        onSettingsSaved();
      }

      // Clear error status after 3 seconds
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const revertSettings = () => {
    setSettings(savedSettings);
    setHasUnsavedChanges(false);
  };

  const resetToDefaults = () => {
    setSettings(DEFAULT_SETTINGS);
    setHasUnsavedChanges(true);
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (
        confirm("You have unsaved changes. Are you sure you want to close?")
      ) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const updateSetting = <K extends keyof Settings>(
    key: K,
    value: Settings[K]
  ) => {
    setSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
    setHasUnsavedChanges(true);
  };

  const loadModels = async () => {
    try {
      setIsLoadingModels(true);
      const modelList = await invoke<ModelInfo[]>("list_separation_models");
      setModels(modelList);
    } catch (error) {
      console.error("Failed to load models:", error);
      setModels([]);
    } finally {
      setIsLoadingModels(false);
    }
  };

  const loadDownloadedModels = async () => {
    try {
      setIsLoadingDownloadedModels(true);
      const downloadedList = await invoke<DownloadedModel[]>(
        "list_downloaded_models",
        {
          modelDirectory: settings.model_directory,
        }
      );
      setDownloadedModels(downloadedList);
    } catch (error) {
      console.error("Failed to load downloaded models:", error);
      setDownloadedModels([]);
    } finally {
      setIsLoadingDownloadedModels(false);
    }
  };

  const deleteDownloadedModel = async (modelFilename: string) => {
    if (confirmingDeleteModel === modelFilename) {
      // Confirm deletion
      try {
        await invoke("delete_model", {
          modelDirectory: settings.model_directory,
          modelFilename,
        });
        // Reload the list after deletion
        await loadDownloadedModels();
        setConfirmingDeleteModel(null);
      } catch (error) {
        // Remove console.error statement
      }
    } else {
      // Show confirmation
      setConfirmingDeleteModel(modelFilename);
      // Auto-clear confirmation after 3 seconds
      setTimeout(() => setConfirmingDeleteModel(null), 3000);
    }
  };

  // Group models by architecture for display
  const groupModelsByArchitecture = (models: ModelInfo[]) => {
    const grouped: { [key: string]: ModelInfo[] } = {};
    models.forEach((model) => {
      const arch = model.arch.toLowerCase();
      if (!grouped[arch]) {
        grouped[arch] = [];
      }
      grouped[arch].push(model);
    });
    return grouped;
  };

  const downloadSelectedModels = async () => {
    try {
      setIsDownloadingModels(true);

      // Download each selected model using audio-separator
      for (const modelFilename of selectedModels) {
        try {
          await invoke("download_separation_model", {
            modelFilename,
            modelDirectory: settings.model_directory,
          });
        } catch (error) {
          // Remove console.error statement
        }
      }

      setSelectedModels([]);

      // Automatically refresh downloaded models after download
      await loadDownloadedModels();

      // Also refresh the main app's downloaded models if callback is provided
      if (onRefreshDownloadedModels) {
        await onRefreshDownloadedModels();
      }
    } catch (error) {
      // Remove console.error statement
    } finally {
      setIsDownloadingModels(false);
    }
  };

  const handleModelToggle = (modelFilename: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelFilename)
        ? prev.filter((f) => f !== modelFilename)
        : [...prev, modelFilename]
    );
  };

  return (
    <div className="flex flex-col h-full min-h-screen bg-white dark:bg-gray-900">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Tab navigation */}
      <nav className="flex border-b border-gray-200 dark:border-gray-700">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-center text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-indigo-600 text-indigo-700 dark:text-indigo-400"
                : "text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200"
            }`}
            type="button"
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Scrollable content */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-auto p-6"
        style={{ paddingBottom: "80px" }}
      >
        {/* Download Settings Tab */}
        {activeTab === "Download" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Download Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Audio Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">
                      Audio Format
                    </label>
                    <Select
                      value={settings.audio_format}
                      onValueChange={(val) =>
                        updateSetting("audio_format", val)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="wav">WAV</SelectItem>
                        <SelectItem value="mp3">MP3</SelectItem>
                        <SelectItem value="m4a">M4A</SelectItem>
                        <SelectItem value="opus">Opus</SelectItem>
                        <SelectItem value="flac">FLAC</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block mb-2 font-semibold">
                      Audio Quality
                    </label>
                    <Select
                      value={settings.audio_quality}
                      onValueChange={(val) =>
                        updateSetting("audio_quality", val)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="0">Best</SelectItem>
                        <SelectItem value="1">High</SelectItem>
                        <SelectItem value="2">Medium</SelectItem>
                        <SelectItem value="3">Low</SelectItem>
                        <SelectItem value="4">Worst</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Video Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">
                      Video Format
                    </label>
                    <Select
                      value={settings.video_format}
                      onValueChange={(val) =>
                        updateSetting("video_format", val)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mp4">MP4</SelectItem>
                        <SelectItem value="webm">WebM</SelectItem>
                        <SelectItem value="mkv">MKV</SelectItem>
                        <SelectItem value="avi">AVI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block mb-2 font-semibold">
                      Video Quality
                    </label>
                    <Select
                      value={settings.video_quality}
                      onValueChange={(val) =>
                        updateSetting("video_quality", val)
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="best">Best</SelectItem>
                        <SelectItem value="worst">Worst</SelectItem>
                        <SelectItem value="bestvideo+bestaudio">
                          Best Video + Audio
                        </SelectItem>
                        <SelectItem value="720p">720p</SelectItem>
                        <SelectItem value="1080p">1080p</SelectItem>
                        <SelectItem value="1440p">1440p</SelectItem>
                        <SelectItem value="2160p">4K</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Download Options */}
                <div>
                  <label className="block mb-3 font-semibold">
                    Download Options
                  </label>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="extractAudio"
                        checked={settings.extract_audio}
                        onCheckedChange={(checked) =>
                          updateSetting("extract_audio", checked as boolean)
                        }
                      />
                      <label htmlFor="extractAudio" className="text-sm">
                        Extract audio only
                      </label>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="writeSubtitles"
                        checked={settings.write_subtitles}
                        onCheckedChange={(checked) =>
                          updateSetting("write_subtitles", checked as boolean)
                        }
                      />
                      <label htmlFor="writeSubtitles" className="text-sm">
                        Write subtitles
                      </label>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="writeThumbnail"
                        checked={settings.write_thumbnail}
                        onCheckedChange={(checked) =>
                          updateSetting("write_thumbnail", checked as boolean)
                        }
                      />
                      <label htmlFor="writeThumbnail" className="text-sm">
                        Write thumbnail
                      </label>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="writeDescription"
                        checked={settings.write_description}
                        onCheckedChange={(checked) =>
                          updateSetting("write_description", checked as boolean)
                        }
                      />
                      <label htmlFor="writeDescription" className="text-sm">
                        Write description
                      </label>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="writeInfo"
                        checked={settings.write_info}
                        onCheckedChange={(checked) =>
                          updateSetting("write_info", checked as boolean)
                        }
                      />
                      <label htmlFor="writeInfo" className="text-sm">
                        Write info
                      </label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Stem Separation Settings Tab */}
        {activeTab === "Stem Separation" && (
          <div className="space-y-6">
            {/* Basic Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Basic Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Output Format */}
                <div>
                  <InfoTooltip title="Output format for separated files, any common format. Example: --output_format=MP3">
                    <label className="block mb-2 font-semibold">
                      Output Format
                    </label>
                  </InfoTooltip>
                  <Select
                    value={settings.separation_settings.output_format}
                    onValueChange={(val) =>
                      updateSetting("separation_settings", {
                        ...settings.separation_settings,
                        output_format: val,
                      })
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="WAV">WAV</SelectItem>
                      <SelectItem value="MP3">MP3</SelectItem>
                      <SelectItem value="FLAC">FLAC</SelectItem>
                      <SelectItem value="M4A">M4A</SelectItem>
                      <SelectItem value="OPUS">OPUS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Audio Processing Settings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <InfoTooltip title="Max peak amplitude to normalize input and output audio to. Example: --normalization=0.7">
                      <label className="block mb-2 font-semibold">
                        Normalization
                      </label>
                    </InfoTooltip>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={settings.separation_settings.normalization}
                      onChange={(e) =>
                        updateSetting("separation_settings", {
                          ...settings.separation_settings,
                          normalization: parseFloat(e.target.value) || 0.0,
                        })
                      }
                    />
                  </div>

                  <div>
                    <InfoTooltip title="Min peak amplitude to amplify input and output audio to. Example: --amplification=0.4">
                      <label className="block mb-2 font-semibold">
                        Amplification
                      </label>
                    </InfoTooltip>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="10"
                      value={settings.separation_settings.amplification}
                      onChange={(e) =>
                        updateSetting("separation_settings", {
                          ...settings.separation_settings,
                          amplification: parseFloat(e.target.value) || 0.0,
                        })
                      }
                    />
                  </div>

                  <div>
                    <InfoTooltip title="Modify the sample rate of the output audio. Example: --sample_rate=44100">
                      <label className="block mb-2 font-semibold">
                        Sample Rate
                      </label>
                    </InfoTooltip>
                    <Select
                      value={settings.separation_settings.sample_rate.toString()}
                      onValueChange={(val) =>
                        updateSetting("separation_settings", {
                          ...settings.separation_settings,
                          sample_rate: parseInt(val) || 44100,
                        })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="8000">8,000 Hz</SelectItem>
                        <SelectItem value="11025">11,025 Hz</SelectItem>
                        <SelectItem value="16000">16,000 Hz</SelectItem>
                        <SelectItem value="22050">22,050 Hz</SelectItem>
                        <SelectItem value="32000">32,000 Hz</SelectItem>
                        <SelectItem value="44100">
                          44,100 Hz (CD Quality)
                        </SelectItem>
                        <SelectItem value="48000">
                          48,000 Hz (Professional)
                        </SelectItem>
                        <SelectItem value="96000">
                          96,000 Hz (High Quality)
                        </SelectItem>
                        <SelectItem value="192000">
                          192,000 Hz (Studio Quality)
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Advanced Options */}
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="useAutocast"
                    checked={settings.separation_settings.use_autocast}
                    onCheckedChange={(checked) =>
                      updateSetting("separation_settings", {
                        ...settings.separation_settings,
                        use_autocast: checked as boolean,
                      })
                    }
                  />
                  <InfoTooltip title="Use PyTorch autocast for faster inference. Do not use for CPU inference. Example: --use_autocast">
                    <label htmlFor="useAutocast" className="text-sm">
                      Use Autocast
                    </label>
                  </InfoTooltip>
                </div>

                {/* MDX Architecture Settings */}
                <div>
                  <InfoTooltip title="MDX Architecture Parameters - Larger consumes more resources, but may give better results">
                    <label className="block mb-3 font-semibold">
                      MDX Architecture Settings
                    </label>
                  </InfoTooltip>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <InfoTooltip title="Larger consumes more resources, but may give better results. Example: --mdx_segment_size=256">
                        <label className="block mb-1 text-sm">
                          Segment Size
                        </label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        value={settings.separation_settings.mdx_segment_size}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            mdx_segment_size: parseInt(e.target.value) || 256,
                          })
                        }
                      />
                    </div>

                    <div>
                      <InfoTooltip title="Amount of overlap between prediction windows, 0.001-0.999. Higher is better but slower. Example: --mdx_overlap=0.25">
                        <label className="block mb-1 text-sm">Overlap</label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={settings.separation_settings.mdx_overlap}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            mdx_overlap: parseFloat(e.target.value) || 0.25,
                          })
                        }
                      />
                    </div>

                    <div>
                      <InfoTooltip title="Larger consumes more RAM but may process slightly faster. Example: --mdx_batch_size=4">
                        <label className="block mb-1 text-sm">Batch Size</label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        value={settings.separation_settings.mdx_batch_size}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            mdx_batch_size: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="mdxEnableDenoise"
                        checked={
                          settings.separation_settings.mdx_enable_denoise
                        }
                        onCheckedChange={(checked) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            mdx_enable_denoise: checked as boolean,
                          })
                        }
                      />
                      <InfoTooltip title="Enable denoising during separation. Example: --mdx_enable_denoise">
                        <label htmlFor="mdxEnableDenoise" className="text-sm">
                          Enable Denoise
                        </label>
                      </InfoTooltip>
                    </div>
                  </div>
                </div>

                {/* VR Architecture Settings */}
                <div>
                  <InfoTooltip title="VR Architecture Parameters - Balance quality and speed for vocal separation">
                    <label className="block mb-3 font-semibold">
                      VR Architecture Settings
                    </label>
                  </InfoTooltip>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <InfoTooltip title="Number of batches to process at a time. Higher = more RAM, slightly faster processing. Example: --vr_batch_size=16">
                        <label className="block mb-1 text-sm">Batch Size</label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        value={settings.separation_settings.vr_batch_size}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            vr_batch_size: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>

                    <div>
                      <InfoTooltip title="Balance quality and speed. 1024 = fast but lower, 320 = slower but better quality. Example: --vr_window_size=320">
                        <label className="block mb-1 text-sm">
                          Window Size
                        </label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        value={settings.separation_settings.vr_window_size}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            vr_window_size: parseInt(e.target.value) || 512,
                          })
                        }
                      />
                    </div>

                    <div>
                      <InfoTooltip title="Intensity of primary stem extraction, -100 - 100. Typically, 5 for vocals & instrumentals. Example: --vr_aggression=2">
                        <label className="block mb-1 text-sm">Aggression</label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        value={settings.separation_settings.vr_aggression}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            vr_aggression: parseInt(e.target.value) || 5,
                          })
                        }
                      />
                    </div>

                    <div>
                      <InfoTooltip title="Threshold for post_process feature: 0.1-0.3. Example: --vr_post_process_threshold=0.1">
                        <label className="block mb-1 text-sm">
                          Post Process Threshold
                        </label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        step="0.1"
                        min="0"
                        max="1"
                        value={
                          settings.separation_settings.vr_post_process_threshold
                        }
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            vr_post_process_threshold:
                              parseFloat(e.target.value) || 0.2,
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="vrEnableTta"
                        checked={settings.separation_settings.vr_enable_tta}
                        onCheckedChange={(checked) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            vr_enable_tta: checked as boolean,
                          })
                        }
                      />
                      <InfoTooltip title="Enable Test-Time-Augmentation; slow but improves quality. Example: --vr_enable_tta">
                        <label htmlFor="vrEnableTta" className="text-sm">
                          Enable TTA
                        </label>
                      </InfoTooltip>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="vrHighEndProcess"
                        checked={
                          settings.separation_settings.vr_high_end_process
                        }
                        onCheckedChange={(checked) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            vr_high_end_process: checked as boolean,
                          })
                        }
                      />
                      <InfoTooltip title="Mirror the missing frequency range of the output. Example: --vr_high_end_process">
                        <label htmlFor="vrHighEndProcess" className="text-sm">
                          High End Process
                        </label>
                      </InfoTooltip>
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="vrEnablePostProcess"
                        checked={
                          settings.separation_settings.vr_enable_post_process
                        }
                        onCheckedChange={(checked) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            vr_enable_post_process: checked as boolean,
                          })
                        }
                      />
                      <InfoTooltip title="Identify leftover artifacts within vocal output; may improve separation for some songs. Example: --vr_enable_post_process">
                        <label
                          htmlFor="vrEnablePostProcess"
                          className="text-sm"
                        >
                          Enable Post Process
                        </label>
                      </InfoTooltip>
                    </div>
                  </div>
                </div>

                {/* Demucs Architecture Settings */}
                <div>
                  <InfoTooltip title="Demucs Architecture Parameters - High-quality separation with segment-wise processing">
                    <label className="block mb-3 font-semibold">
                      Demucs Architecture Settings
                    </label>
                  </InfoTooltip>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <InfoTooltip title="Size of segments into which the audio is split, 1-100. Higher = slower but better quality. Example: --demucs_segment_size=256">
                        <label className="block mb-1 text-sm">
                          Segment Size
                        </label>
                      </InfoTooltip>
                      <Input
                        value={settings.separation_settings.demucs_segment_size}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            demucs_segment_size: e.target.value,
                          })
                        }
                      />
                    </div>

                    <div>
                      <InfoTooltip title="Number of predictions with random shifts, higher = slower but better quality. Example: --demucs_shifts=4">
                        <label className="block mb-1 text-sm">Shifts</label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        value={settings.separation_settings.demucs_shifts}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            demucs_shifts: parseInt(e.target.value) || 2,
                          })
                        }
                      />
                    </div>

                    <div>
                      <InfoTooltip title="Overlap between prediction windows, 0.001-0.999. Higher = slower but better quality. Example: --demucs_overlap=0.25">
                        <label className="block mb-1 text-sm">Overlap</label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={settings.separation_settings.demucs_overlap}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            demucs_overlap: parseFloat(e.target.value) || 0.25,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="demucsSegmentsEnabled"
                        checked={
                          settings.separation_settings.demucs_segments_enabled
                        }
                        onCheckedChange={(checked) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            demucs_segments_enabled: checked as boolean,
                          })
                        }
                      />
                      <InfoTooltip title="Enable segment-wise processing. Example: --demucs_segments_enabled=True">
                        <label
                          htmlFor="demucsSegmentsEnabled"
                          className="text-sm"
                        >
                          Segments Enabled
                        </label>
                      </InfoTooltip>
                    </div>
                  </div>
                </div>

                {/* MDXC Architecture Settings */}
                <div>
                  <InfoTooltip title="MDXC Architecture Parameters - Advanced separation with pitch shifting capabilities">
                    <label className="block mb-3 font-semibold">
                      MDXC Architecture Settings
                    </label>
                  </InfoTooltip>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                      <InfoTooltip title="Larger consumes more resources, but may give better results. Example: --mdxc_segment_size=256">
                        <label className="block mb-1 text-sm">
                          Segment Size
                        </label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        value={settings.separation_settings.mdxc_segment_size}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            mdxc_segment_size: parseInt(e.target.value) || 256,
                          })
                        }
                      />
                    </div>

                    <div>
                      <InfoTooltip title="Amount of overlap between prediction windows, 2-50. Higher is better but slower. Example: --mdxc_overlap=8">
                        <label className="block mb-1 text-sm">Overlap</label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        step="0.1"
                        min="2"
                        max="50"
                        value={settings.separation_settings.mdxc_overlap}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            mdxc_overlap: parseFloat(e.target.value) || 8,
                          })
                        }
                      />
                    </div>

                    <div>
                      <InfoTooltip title="Larger consumes more RAM but may process slightly faster. Example: --mdxc_batch_size=4">
                        <label className="block mb-1 text-sm">Batch Size</label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        value={settings.separation_settings.mdxc_batch_size}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            mdxc_batch_size: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>

                    <div>
                      <InfoTooltip title="Shift audio pitch by a number of semitones while processing. May improve output for deep/high vocals. Example: --mdxc_pitch_shift=2">
                        <label className="block mb-1 text-sm">
                          Pitch Shift
                        </label>
                      </InfoTooltip>
                      <Input
                        type="number"
                        step="0.1"
                        value={settings.separation_settings.mdxc_pitch_shift}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            mdxc_pitch_shift: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>

                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="mdxcOverrideModelSegmentSize"
                        checked={
                          settings.separation_settings
                            .mdxc_override_model_segment_size
                        }
                        onCheckedChange={(checked) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            mdxc_override_model_segment_size:
                              checked as boolean,
                          })
                        }
                      />
                      <InfoTooltip title="Override model default segment size instead of using the model default value. Example: --mdxc_override_model_segment_size">
                        <label
                          htmlFor="mdxcOverrideModelSegmentSize"
                          className="text-sm"
                        >
                          Override Model Segment Size
                        </label>
                      </InfoTooltip>
                    </div>
                  </div>
                </div>

                {/* Information Section */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <Info className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="space-y-2">
                      <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Audio Separation Information
                      </h4>
                      <div className="text-sm text-blue-700 dark:text-blue-300 space-y-1">
                        <p>
                          <strong>GPU Acceleration:</strong> Automatically uses
                          the best available GPU acceleration (CUDA, MPS,
                          CoreML) when available.
                        </p>
                        <p>
                          <strong>Architecture Types:</strong>
                        </p>
                        <ul className="list-disc list-inside ml-2 space-y-1">
                          <li>
                            <strong>MDX:</strong> General-purpose separation
                            with good quality/speed balance
                          </li>
                          <li>
                            <strong>VR:</strong> Specialized for vocal
                            separation with adjustable aggression
                          </li>
                          <li>
                            <strong>Demucs:</strong> High-quality separation
                            with segment-wise processing
                          </li>
                          <li>
                            <strong>MDXC:</strong> Advanced separation with
                            pitch shifting capabilities
                          </li>
                        </ul>
                        <p>
                          <strong>Performance Tips:</strong> Higher segment
                          sizes and overlaps improve quality but increase
                          processing time and memory usage.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Access Key Tab */}
        {activeTab === "General" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Theme Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={fieldWrapperClass}>
                  <label className="block mb-2 font-semibold">Theme Mode</label>
                  <Select
                    value={settings.theme}
                    onValueChange={(val) => updateSetting("theme", val)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select theme" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">
                    Choose your preferred theme mode
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Key</CardTitle>
              </CardHeader>
              <CardContent>
                <div className={fieldWrapperClass}>
                  <Input
                    placeholder="Enter your key here..."
                    className="w-full"
                  />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Download Manager Tab */}
        {activeTab === "Download Manager" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Model Download Manager
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Model Directory Setting */}
                <div className="space-y-2">
                  <label className="block text-sm font-medium">
                    Model Directory
                  </label>
                  <div className="flex gap-2">
                    <Input
                      value={settings.model_directory}
                      placeholder="Model storage directory"
                      onChange={(e) =>
                        updateSetting("model_directory", e.target.value)
                      }
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={async () => {
                        try {
                          const selectedPath = await invoke<string>(
                            "select_folder"
                          );
                          updateSetting("model_directory", selectedPath);
                        } catch (error) {
                          console.error("Failed to select folder:", error);
                        }
                      }}
                    >
                      Browse
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Directory where downloaded models will be stored
                  </p>
                </div>

                {/* Search and Filter */}
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search models..."
                      value={modelSearchTerm}
                      onChange={(e) => setModelSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                  <Select value={modelFilter} onValueChange={setModelFilter}>
                    <SelectTrigger className="w-48">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Models</SelectItem>
                      <SelectItem value="mdx">MDX Models</SelectItem>
                      <SelectItem value="vr">VR Models</SelectItem>
                      <SelectItem value="demucs">Demucs Models</SelectItem>
                      <SelectItem value="mdxc">MDXC Models</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    onClick={loadModels}
                    disabled={isLoadingModels}
                    variant="outline"
                  >
                    {isLoadingModels ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Database className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {/* Model List */}
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {models.length > 0 ? (
                    Object.entries(groupModelsByArchitecture(models)).map(
                      ([category, categoryModels]) => {
                        const filteredCategoryModels = categoryModels.filter(
                          (model) => {
                            const matchesSearch = model.friendly_name
                              .toLowerCase()
                              .includes(modelSearchTerm.toLowerCase());
                            const matchesFilter =
                              modelFilter === "all" || modelFilter === category;
                            return matchesSearch && matchesFilter;
                          }
                        );

                        if (filteredCategoryModels.length === 0) return null;

                        return (
                          <div key={category} className="space-y-2">
                            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">
                              {category} Models
                            </h4>
                            {filteredCategoryModels.map((model) => (
                              <div
                                key={model.filename}
                                className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                              >
                                <Checkbox
                                  checked={selectedModels.includes(
                                    model.filename
                                  )}
                                  onCheckedChange={() =>
                                    handleModelToggle(model.filename)
                                  }
                                />
                                <div className="flex-1">
                                  <div className="font-medium text-sm">
                                    {model.friendly_name}
                                  </div>
                                  <div className="text-xs text-gray-500">
                                    {model.filename}
                                  </div>
                                  <div className="text-xs text-gray-400">
                                    {model.arch} • {model.output_stems}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      }
                    )
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      {isLoadingModels
                        ? "Loading models..."
                        : "No models found. Click 'Load Models' to fetch available models from audio-separator."}
                    </div>
                  )}
                </div>

                {/* Download Button */}
                <Button
                  onClick={downloadSelectedModels}
                  disabled={selectedModels.length === 0 || isDownloadingModels}
                  className="w-full text-gray-400"
                >
                  {isDownloadingModels ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin " />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2 text-gray-400" />
                      Download Selected ({selectedModels.length})
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Downloaded Models Section */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  Downloaded Models
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Models stored in: {settings.model_directory || "Not set"}
                  </p>
                  <Button
                    onClick={loadDownloadedModels}
                    disabled={isLoadingDownloadedModels}
                    variant="outline"
                    size="sm"
                  >
                    {isLoadingDownloadedModels ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-2">
                  {downloadedModels.length > 0 ? (
                    downloadedModels.map((model) => (
                      <div
                        key={model.filename}
                        className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                      >
                        <div className="flex-1">
                          <div className="font-medium text-sm">
                            {model.friendly_name}
                          </div>
                          <div className="text-xs text-gray-500">
                            {model.filename}
                          </div>
                        </div>
                        <Button
                          onClick={() => deleteDownloadedModel(model.filename)}
                          variant="outline"
                          size="sm"
                          className={`${
                            confirmingDeleteModel === model.filename
                              ? "text-red-600 hover:text-red-700 bg-red-50 dark:bg-red-900/20"
                              : "text-red-600 hover:text-red-700"
                          }`}
                        >
                          {confirmingDeleteModel === model.filename ? (
                            "Confirm?"
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      {isLoadingDownloadedModels
                        ? "Loading downloaded models..."
                        : "No downloaded models found. Download models from above to see them here."}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center z-50 shadow-md">
        <div className="text-sm text-gray-500">
          {saveStatus === "saving" && "Saving settings..."}
          {saveStatus === "success" && "Settings saved successfully!"}
          {saveStatus === "error" && "Failed to save settings"}
          {saveStatus === "idle" &&
            hasUnsavedChanges &&
            "You have unsaved changes"}
        </div>
        <div className="flex gap-3">
          <Button
            variant="outline"
            onClick={resetToDefaults}
            className="text-orange-600 hover:text-orange-700 border-orange-600 hover:border-orange-700"
          >
            Reset to Defaults
          </Button>
          <Button
            variant="outline"
            onClick={revertSettings}
            disabled={!hasUnsavedChanges}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Revert
          </Button>
          <Button variant="ghost" onClick={handleClose}>
            Close
          </Button>
          <Button
            onClick={saveSettings}
            disabled={!hasUnsavedChanges || saveStatus === "saving"}
            className={`${
              saveStatus === "success"
                ? "bg-green-600 hover:bg-green-700"
                : saveStatus === "error"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-indigo-600 hover:bg-indigo-700"
            } text-white`}
          >
            {saveStatus === "saving" ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Save
              </>
            ) : saveStatus === "success" ? (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save
              </>
            ) : saveStatus === "error" ? (
              <>
                <Save className="h-4 w-4 mr-2" />
                Error
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save
              </>
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}
