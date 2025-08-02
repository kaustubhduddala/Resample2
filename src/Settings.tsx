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
    output_bitrate?: string;
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
    mdxc_overlap: 0.25,
    mdxc_batch_size: 1,
    mdxc_pitch_shift: 0,
  },
  model_directory: "Documents/Resample/Models",
  enable_stem_extraction: false,
};

const fieldWrapperClass = "space-y-4";

export function SettingsPage({
  onClose,
  onRefreshDownloadedModels,
}: {
  onClose: () => void;
  onRefreshDownloadedModels?: () => Promise<void>;
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
      // Remove console.error statement
    }
  };

  const saveSettings = async () => {
    try {
      await invoke("save_settings", { settings: JSON.stringify(settings) });
      setSavedSettings(settings);
      setHasUnsavedChanges(false);
      setTheme(settings.theme as "light" | "dark" | "system");
    } catch (error) {
      // Remove console.error statement
    }
  };

  const revertSettings = () => {
    setSettings(savedSettings);
    setHasUnsavedChanges(false);
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
      // Remove console.error statement
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
      // Remove console.error statement
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
            {/* Audio Separator Configuration */}
            <Card>
              <CardHeader>
                <CardTitle>Audio Separator Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Model Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">
                      Model Filename
                    </label>
                    <Input
                      value={settings.separation_settings.model_filename}
                      placeholder="model_bs_roformer_ep_317_sdr_12.9755.ckpt"
                      onChange={(e) =>
                        updateSetting("separation_settings", {
                          ...settings.separation_settings,
                          model_filename: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-semibold">
                      Output Format
                    </label>
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
                </div>

                {/* Output Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">
                      Output Directory
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={settings.separation_settings.output_dir}
                        placeholder="Leave empty for current directory"
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            output_dir: e.target.value,
                          })
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
                            updateSetting("separation_settings", {
                              ...settings.separation_settings,
                              output_dir: selectedPath,
                            });
                          } catch (error) {
                            // Remove console.error statement
                          }
                        }}
                      >
                        Browse
                      </Button>
                    </div>
                  </div>

                  <div>
                    <label className="block mb-2 font-semibold">
                      Model File Directory
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={settings.separation_settings.model_file_dir}
                        placeholder="Path to model files"
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            model_file_dir: e.target.value,
                          })
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
                            updateSetting("separation_settings", {
                              ...settings.separation_settings,
                              model_file_dir: selectedPath,
                            });
                          } catch (error) {
                            // Remove console.error statement
                          }
                        }}
                      >
                        Browse
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Audio Processing Settings */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">
                      Normalization
                    </label>
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
                    <label className="block mb-2 font-semibold">
                      Amplification
                    </label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      max="10"
                      value={settings.separation_settings.amplification}
                      onChange={(e) =>
                        updateSetting("separation_settings", {
                          ...settings.separation_settings,
                          amplification: parseFloat(e.target.value) || 1.0,
                        })
                      }
                    />
                  </div>

                  <div>
                    <label className="block mb-2 font-semibold">
                      Sample Rate
                    </label>
                    <Input
                      type="number"
                      value={settings.separation_settings.sample_rate}
                      onChange={(e) =>
                        updateSetting("separation_settings", {
                          ...settings.separation_settings,
                          sample_rate: parseInt(e.target.value) || 44100,
                        })
                      }
                    />
                  </div>
                </div>

                {/* MDX Architecture Settings */}
                <div>
                  <label className="block mb-3 font-semibold">
                    MDX Architecture Settings
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block mb-1 text-sm">Segment Size</label>
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
                      <label className="block mb-1 text-sm">Overlap</label>
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
                      <label className="block mb-1 text-sm">Batch Size</label>
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
                      <label htmlFor="mdxEnableDenoise" className="text-sm">
                        Enable Denoise
                      </label>
                    </div>
                  </div>
                </div>

                {/* VR Architecture Settings */}
                <div>
                  <label className="block mb-3 font-semibold">
                    VR Architecture Settings
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block mb-1 text-sm">Batch Size</label>
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
                      <label className="block mb-1 text-sm">Window Size</label>
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
                      <label className="block mb-1 text-sm">Aggression</label>
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
                      <label className="block mb-1 text-sm">
                        Post Process Threshold
                      </label>
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
                      <label htmlFor="vrEnableTta" className="text-sm">
                        Enable TTA
                      </label>
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
                      <label htmlFor="vrHighEndProcess" className="text-sm">
                        High End Process
                      </label>
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
                      <label htmlFor="vrEnablePostProcess" className="text-sm">
                        Enable Post Process
                      </label>
                    </div>
                  </div>
                </div>

                {/* Demucs Architecture Settings */}
                <div>
                  <label className="block mb-3 font-semibold">
                    Demucs Architecture Settings
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block mb-1 text-sm">Segment Size</label>
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
                      <label className="block mb-1 text-sm">Shifts</label>
                      <Input
                        type="number"
                        value={settings.separation_settings.demucs_shifts}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            demucs_shifts: parseInt(e.target.value) || 1,
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="block mb-1 text-sm">Overlap</label>
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
                      <label
                        htmlFor="demucsSegmentsEnabled"
                        className="text-sm"
                      >
                        Segments Enabled
                      </label>
                    </div>
                  </div>
                </div>

                {/* MDXC Architecture Settings */}
                <div>
                  <label className="block mb-3 font-semibold">
                    MDXC Architecture Settings
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                    <div>
                      <label className="block mb-1 text-sm">Segment Size</label>
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
                      <label className="block mb-1 text-sm">Overlap</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="1"
                        value={settings.separation_settings.mdxc_overlap}
                        onChange={(e) =>
                          updateSetting("separation_settings", {
                            ...settings.separation_settings,
                            mdxc_overlap: parseFloat(e.target.value) || 0.25,
                          })
                        }
                      />
                    </div>

                    <div>
                      <label className="block mb-1 text-sm">Batch Size</label>
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
                      <label className="block mb-1 text-sm">Pitch Shift</label>
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
                      <label
                        htmlFor="mdxcOverrideModelSegmentSize"
                        className="text-sm"
                      >
                        Override Model Segment Size
                      </label>
                    </div>
                  </div>
                </div>

                {/* GPU Acceleration Info */}
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg">
                  <div className="flex items-start space-x-3">
                    <div className="flex-shrink-0">
                      <svg
                        className="w-5 h-5 text-blue-600 dark:text-blue-400"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        GPU Acceleration
                      </h4>
                      <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                        Audio separation automatically uses the best available
                        GPU acceleration (CUDA, MPS, CoreML) when available. No
                        manual configuration required.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Additional Settings */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                    <label htmlFor="useAutocast" className="text-sm">
                      Use Autocast
                    </label>
                  </div>

                  <div>
                    <label className="block mb-2 font-semibold">
                      Single Stem (Optional)
                    </label>
                    <Input
                      value={settings.separation_settings.single_stem || ""}
                      placeholder="e.g., vocals, instrumental"
                      onChange={(e) =>
                        updateSetting("separation_settings", {
                          ...settings.separation_settings,
                          single_stem: e.target.value,
                        })
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stem Extraction Settings */}
            <Card>
              <CardHeader>
                <CardTitle>Stem Extraction Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center space-x-3">
                  <Checkbox
                    id="enableStemExtraction"
                    checked={settings.enable_stem_extraction}
                    onCheckedChange={(checked) =>
                      updateSetting(
                        "enable_stem_extraction",
                        checked as boolean
                      )
                    }
                  />
                  <label htmlFor="enableStemExtraction" className="text-sm">
                    Enable Stem Extraction
                  </label>
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
                          // Remove console.error statement
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
                  className="w-full"
                >
                  {isDownloadingModels ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
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
          {hasUnsavedChanges && "You have unsaved changes"}
        </div>
        <div className="flex gap-3">
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
            disabled={!hasUnsavedChanges}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Save className="h-4 w-4 mr-2" />
            Save
          </Button>
        </div>
      </footer>
    </div>
  );
}
