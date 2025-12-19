import { useState, useEffect } from "react";
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
import { Badge } from "./components/ui/badge";
import {
  X,
  Save,
  RotateCcw,
  Download,
  Search,
  Loader2,
  RefreshCw,
  Trash2,
  Info,
  FolderOpen,
} from "lucide-react";
import { useTheme } from "./hooks/use-theme";
import { useModelCache } from "./hooks/use-model-cache";

const TABS = ["General", "Download", "Stem Separation", "Download Manager"] as const;
type Tab = (typeof TABS)[number];

interface AppSettings {
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
  separation_settings: {
    output_format: string;
    output_bitrate?: string | null;
    normalization_threshold?: number;
    amplification_threshold?: number;
    output_single_stem?: string | null;
    sample_rate?: number;
    use_soundfile?: boolean;
    use_autocast?: boolean;
    mdx_params?: {
      segment_size?: number;
      overlap?: number;
      batch_size?: number;
      hop_length?: number;
      enable_denoise?: boolean;
    };
    vr_params?: {
      batch_size?: number;
      window_size?: number;
      aggression?: number;
      enable_tta?: boolean;
      enable_post_process?: boolean;
      post_process_threshold?: number;
      high_end_process?: boolean;
    };
    demucs_params?: {
      segment_size?: string | number;
      shifts?: number;
      overlap?: number;
      segments_enabled?: boolean;
    };
    mdxc_params?: {
      segment_size?: number;
      override_model_segment_size?: boolean;
      batch_size?: number;
      overlap?: number;
      pitch_shift?: number;
    };
  };
  model_directory: string;
}

export function SettingsPage({
  onClose,
  onRefreshDownloadedModels,
  onSettingsSaved,
  initialSettings,
}: {
  onClose: () => void;
  onRefreshDownloadedModels?: () => Promise<void>;
  onSettingsSaved?: (settings: AppSettings) => void;
  initialSettings?: AppSettings;
}) {
  const [activeTab, setActiveTab] = useState<Tab>("General");
  const [settings, setSettings] = useState<AppSettings>({
    theme: "system",
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
    separation_settings: {
      output_format: "FLAC",
      output_bitrate: null, // Default: none
      normalization_threshold: 0.9,
      amplification_threshold: 0.0,
      output_single_stem: null,
      sample_rate: 44100,
      use_soundfile: false,
      use_autocast: false,
      mdx_params: {
        segment_size: 256,
        overlap: 0.25,
        batch_size: 1,
        hop_length: 1024,
        enable_denoise: false,
      },
      vr_params: {
        batch_size: 1,
        window_size: 512,
        aggression: 5,
        enable_tta: false,
        enable_post_process: false,
        post_process_threshold: 0.2,
        high_end_process: false,
      },
      demucs_params: {
        segment_size: "Default",
        shifts: 2,
        overlap: 0.25,
        segments_enabled: true,
      },
      mdxc_params: {
        segment_size: 256,
        override_model_segment_size: false,
        batch_size: 1,
        overlap: 8,
        pitch_shift: 0,
      },
    },
    model_directory: "",
  });
  const [originalSettings, setOriginalSettings] = useState<AppSettings | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [isDownloadingModels, setIsDownloadingModels] = useState(false);
  const [modelSearchTerm, setModelSearchTerm] = useState("");
  const [modelFilter, setModelFilter] = useState("all");
  const [confirmingDeleteModel, setConfirmingDeleteModel] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  const { setTheme } = useTheme();
  const { 
    models, 
    downloadedModels, 
    isLoading: isLoadingModels, 
    getModelsCount, 
    getDownloadedModelsCount,
    downloadModel,
    refreshDownloadedModels,
    setModelDirectory,
  } = useModelCache();
  const isLoadingDownloadedModels = isLoadingModels;

  // Load initial settings
  useEffect(() => {
    if (initialSettings) {
      setSettings(initialSettings);
      setOriginalSettings(initialSettings);
      if (initialSettings.model_directory) {
        setModelDirectory(initialSettings.model_directory);
      }
    } else if (window.electronAPI) {
      window.electronAPI.loadSettings().then((result) => {
        if (result.success && result.settings) {
          const loadedSettings = result.settings as AppSettings;
          setSettings(loadedSettings);
          setOriginalSettings(loadedSettings);
          if (loadedSettings.model_directory) {
            setModelDirectory(loadedSettings.model_directory);
          }
        }
      });
    }
  }, [initialSettings, setModelDirectory]);

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
    setHasUnsavedChanges(true);
  };

  const saveSettings = async () => {
    setSaveStatus("saving");
    try {
      if (window.electronAPI) {
        const result = await window.electronAPI.saveSettings(settings);
        if (result.success) {
          setSaveStatus("success");
          setHasUnsavedChanges(false);
          setOriginalSettings(settings);
          if (onSettingsSaved) onSettingsSaved(settings);
          setTimeout(() => setSaveStatus("idle"), 2000);
        } else {
          setSaveStatus("error");
          setTimeout(() => setSaveStatus("idle"), 2000);
        }
      } else {
        // Fallback for non-Electron environment
        setSaveStatus("success");
        setHasUnsavedChanges(false);
        if (onSettingsSaved) onSettingsSaved(settings);
        setTimeout(() => setSaveStatus("idle"), 2000);
      }
    } catch (error) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 2000);
    }
  };

  const revertSettings = () => {
    if (originalSettings) {
      setSettings(originalSettings);
    }
    setHasUnsavedChanges(false);
  };

  const handleSelectDirectory = async (settingKey: 'download_path' | 'model_directory') => {
    if (!window.electronAPI) return;
    try {
      const result = await window.electronAPI.openDirectoryDialog();
      if (result.success && result.filePaths && result.filePaths[0]) {
        updateSetting(settingKey, result.filePaths[0]);
      }
    } catch (error) {
      console.error('Error selecting directory:', error);
    }
  };

  const handleOpenDirectory = async (path: string) => {
    if (!window.electronAPI || !path) return;
    try {
      await window.electronAPI.openPathInShell(path);
    } catch (error) {
      console.error('Error opening directory:', error);
    }
  };

  const resetToDefaults = () => {
    if (confirm("Are you sure you want to reset all settings to defaults?")) {
      setSettings({
        theme: "system",
        download_path: "Documents/Resample2",
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
        model_directory: "Documents/Resample2/Models",
      });
      setHasUnsavedChanges(true);
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      if (confirm("You have unsaved changes. Are you sure you want to close?")) {
        onClose();
      }
    } else {
      onClose();
    }
  };

  const deleteDownloadedModel = async (modelFilename: string) => {
    if (confirmingDeleteModel === modelFilename) {
      // Confirm deletion
      if (window.electronAPI && settings.model_directory) {
        try {
          const result = await window.electronAPI.deleteModel(modelFilename, settings.model_directory);
          if (result.success) {
            await refreshDownloadedModels(settings.model_directory);
          }
        } catch (error) {
          console.error('Error deleting model:', error);
        }
      }
      setConfirmingDeleteModel(null);
    } else {
      setConfirmingDeleteModel(modelFilename);
      setTimeout(() => setConfirmingDeleteModel(null), 3000);
    }
  };

  const downloadSelectedModels = async () => {
    if (selectedModels.length === 0 || !settings.model_directory) {
      alert('Please select models to download and ensure the model directory is set.');
      return;
    }
    
    setIsDownloadingModels(true);
    try {
      for (const modelFilename of selectedModels) {
        console.log(`Downloading model: ${modelFilename} to ${settings.model_directory}`);
        const success = await downloadModel(modelFilename, settings.model_directory);
        if (!success) {
          console.error(`Failed to download model: ${modelFilename}`);
        }
      }
      setSelectedModels([]);
      // Refresh downloaded models list
      await refreshDownloadedModels(settings.model_directory);
      alert(`Successfully downloaded ${selectedModels.length} model(s)!`);
    } catch (error) {
      console.error('Error downloading models:', error);
      alert(`Error downloading models: ${error}`);
    } finally {
      setIsDownloadingModels(false);
    }
  };

  const handleModelToggle = (modelFilename: string) => {
    setSelectedModels((prev) =>
      prev.includes(modelFilename) ? prev.filter((f) => f !== modelFilename) : [...prev, modelFilename]
    );
  };

  const groupModelsByArchitecture = (models: any[]) => {
    const grouped: { [key: string]: any[] } = {};
    models.forEach((model) => {
      const arch = model.arch.toLowerCase();
      if (!grouped[arch]) grouped[arch] = [];
      grouped[arch].push(model);
    });
    return grouped;
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-white dark:bg-gray-900 overflow-hidden">
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-semibold">Settings</h1>
        <Button variant="ghost" size="icon" onClick={handleClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

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

      <div className="flex-1 overflow-y-auto p-6 min-h-0" style={{ paddingBottom: "80px" }}>
        {activeTab === "Download" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Download Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Audio Format</label>
                    <Select value={settings.audio_format} onValueChange={(val) => updateSetting("audio_format", val)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <label className="block mb-2 font-semibold">Audio Quality</label>
                    <Select value={settings.audio_quality} onValueChange={(val) => updateSetting("audio_quality", val)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Video Format</label>
                    <Select value={settings.video_format} onValueChange={(val) => updateSetting("video_format", val)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="mp4">MP4</SelectItem>
                        <SelectItem value="webm">WebM</SelectItem>
                        <SelectItem value="mkv">MKV</SelectItem>
                        <SelectItem value="avi">AVI</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">Video Quality</label>
                    <Select value={settings.video_quality} onValueChange={(val) => updateSetting("video_quality", val)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="best">Best</SelectItem>
                        <SelectItem value="worst">Worst</SelectItem>
                        <SelectItem value="bestvideo+bestaudio">Best Video + Audio</SelectItem>
                        <SelectItem value="720p">720p</SelectItem>
                        <SelectItem value="1080p">1080p</SelectItem>
                        <SelectItem value="1440p">1440p</SelectItem>
                        <SelectItem value="2160p">4K</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="block mb-3 font-semibold">Download Options</label>
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <Checkbox id="extractAudio" checked={settings.extract_audio} onCheckedChange={(checked) => updateSetting("extract_audio", checked as boolean)} />
                      <label htmlFor="extractAudio" className="text-sm">Extract audio only</label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Checkbox id="writeSubtitles" checked={settings.write_subtitles} onCheckedChange={(checked) => updateSetting("write_subtitles", checked as boolean)} />
                      <label htmlFor="writeSubtitles" className="text-sm">Write subtitles</label>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Checkbox id="writeThumbnail" checked={settings.write_thumbnail} onCheckedChange={(checked) => updateSetting("write_thumbnail", checked as boolean)} />
                      <label htmlFor="writeThumbnail" className="text-sm">Write thumbnail</label>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "Stem Separation" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Basic Configuration</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Output Format</label>
                    <Select value={settings.separation_settings.output_format} onValueChange={(val) => updateSetting("separation_settings", { ...settings.separation_settings, output_format: val })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="WAV">WAV</SelectItem>
                        <SelectItem value="MP3">MP3</SelectItem>
                        <SelectItem value="FLAC">FLAC</SelectItem>
                        <SelectItem value="M4A">M4A</SelectItem>
                        <SelectItem value="OPUS">OPUS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">Output Bitrate</label>
                    <Select 
                      value={settings.separation_settings.output_bitrate || "none"} 
                      onValueChange={(val) => updateSetting("separation_settings", { ...settings.separation_settings, output_bitrate: val === "none" ? null : val })}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None (Default)</SelectItem>
                        <SelectItem value="128k">128k</SelectItem>
                        <SelectItem value="192k">192k</SelectItem>
                        <SelectItem value="256k">256k</SelectItem>
                        <SelectItem value="320k">320k</SelectItem>
                        <SelectItem value="384k">384k</SelectItem>
                        <SelectItem value="448k">448k</SelectItem>
                        <SelectItem value="512k">512k</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Normalization Threshold (0.0 - 1.0)</label>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.separation_settings.normalization_threshold ?? 0.9}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= 0 && val <= 1) {
                          updateSetting("separation_settings", { ...settings.separation_settings, normalization_threshold: val });
                        }
                      }}
                    />
                    <p className="text-xs text-gray-500 mt-1">Default: 0.9</p>
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">Amplification Threshold (0.0 - 1.0)</label>
                    <Input
                      type="number"
                      min="0"
                      max="1"
                      step="0.1"
                      value={settings.separation_settings.amplification_threshold ?? 0.0}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= 0 && val <= 1) {
                          updateSetting("separation_settings", { ...settings.separation_settings, amplification_threshold: val });
                        }
                      }}
                    />
                    <p className="text-xs text-gray-500 mt-1">Default: 0.0</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Sample Rate</label>
                    <Select value={String(settings.separation_settings.sample_rate ?? 44100)} onValueChange={(val) => updateSetting("separation_settings", { ...settings.separation_settings, sample_rate: parseInt(val) })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="44100">44100 Hz (Default)</SelectItem>
                        <SelectItem value="48000">48000 Hz</SelectItem>
                        <SelectItem value="96000">96000 Hz</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <label className="block mb-2 font-semibold">Output Single Stem (Optional)</label>
                  <Select 
                    value={settings.separation_settings.output_single_stem || "all"} 
                    onValueChange={(val) => updateSetting("separation_settings", { ...settings.separation_settings, output_single_stem: val === "all" ? null : val })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Stems (Default)</SelectItem>
                      <SelectItem value="Vocals">Vocals Only</SelectItem>
                      <SelectItem value="Instrumental">Instrumental Only</SelectItem>
                      <SelectItem value="Drums">Drums Only</SelectItem>
                      <SelectItem value="Bass">Bass Only</SelectItem>
                      <SelectItem value="Guitar">Guitar Only</SelectItem>
                      <SelectItem value="Piano">Piano Only</SelectItem>
                      <SelectItem value="Other">Other Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">Select a single stem to output, or all stems (default)</p>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="useSoundfile" 
                    checked={settings.separation_settings.use_soundfile || false} 
                    onCheckedChange={(checked) => updateSetting("separation_settings", { ...settings.separation_settings, use_soundfile: checked as boolean })} 
                  />
                  <label htmlFor="useSoundfile" className="text-sm">Use soundfile (can solve OOM issues)</label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="useAutocast" 
                    checked={settings.separation_settings.use_autocast || false} 
                    onCheckedChange={(checked) => updateSetting("separation_settings", { ...settings.separation_settings, use_autocast: checked as boolean })} 
                  />
                  <label htmlFor="useAutocast" className="text-sm">Use PyTorch autocast (faster inference, not for CPU)</label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>MDX Architecture Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Segment Size</label>
                    <Input
                      type="number"
                      value={settings.separation_settings.mdx_params?.segment_size || 256}
                      onChange={(e) => updateSetting("separation_settings", { 
                        ...settings.separation_settings, 
                        mdx_params: { ...settings.separation_settings.mdx_params, segment_size: parseInt(e.target.value) || 256 }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">Overlap (0.001 - 0.999)</label>
                    <Input
                      type="number"
                      min="0.001"
                      max="0.999"
                      step="0.01"
                      value={settings.separation_settings.mdx_params?.overlap ?? 0.25}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= 0.001 && val <= 0.999) {
                          updateSetting("separation_settings", { 
                            ...settings.separation_settings, 
                            mdx_params: { ...settings.separation_settings.mdx_params, overlap: val }
                          });
                        }
                      }}
                    />
                    <p className="text-xs text-gray-500 mt-1">Default: 0.25</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Batch Size</label>
                    <Input
                      type="number"
                      value={settings.separation_settings.mdx_params?.batch_size || 1}
                      onChange={(e) => updateSetting("separation_settings", { 
                        ...settings.separation_settings, 
                        mdx_params: { ...settings.separation_settings.mdx_params, batch_size: parseInt(e.target.value) || 1 }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">Hop Length</label>
                    <Input
                      type="number"
                      value={settings.separation_settings.mdx_params?.hop_length || 1024}
                      onChange={(e) => updateSetting("separation_settings", { 
                        ...settings.separation_settings, 
                        mdx_params: { ...settings.separation_settings.mdx_params, hop_length: parseInt(e.target.value) || 1024 }
                      })}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="mdxEnableDenoise" 
                    checked={settings.separation_settings.mdx_params?.enable_denoise || false} 
                    onCheckedChange={(checked) => updateSetting("separation_settings", { 
                      ...settings.separation_settings, 
                      mdx_params: { ...settings.separation_settings.mdx_params, enable_denoise: checked as boolean }
                    })} 
                  />
                  <label htmlFor="mdxEnableDenoise" className="text-sm">Enable denoising</label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>VR Architecture Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Batch Size</label>
                    <Input
                      type="number"
                      value={settings.separation_settings.vr_params?.batch_size || 1}
                      onChange={(e) => updateSetting("separation_settings", { 
                        ...settings.separation_settings, 
                        vr_params: { ...settings.separation_settings.vr_params, batch_size: parseInt(e.target.value) || 1 }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">Window Size</label>
                    <Input
                      type="number"
                      value={settings.separation_settings.vr_params?.window_size || 512}
                      onChange={(e) => updateSetting("separation_settings", { 
                        ...settings.separation_settings, 
                        vr_params: { ...settings.separation_settings.vr_params, window_size: parseInt(e.target.value) || 512 }
                      })}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Aggression (-100 - 100)</label>
                    <Input
                      type="number"
                      min="-100"
                      max="100"
                      value={settings.separation_settings.vr_params?.aggression ?? 5}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val) && val >= -100 && val <= 100) {
                          updateSetting("separation_settings", { 
                            ...settings.separation_settings, 
                            vr_params: { ...settings.separation_settings.vr_params, aggression: val }
                          });
                        }
                      }}
                    />
                    <p className="text-xs text-gray-500 mt-1">Default: 5 (typically 5 for vocals & instrumentals)</p>
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">Post Process Threshold (0.1 - 0.3)</label>
                    <Input
                      type="number"
                      min="0.1"
                      max="0.3"
                      step="0.1"
                      value={settings.separation_settings.vr_params?.post_process_threshold ?? 0.2}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value);
                        if (!isNaN(val) && val >= 0.1 && val <= 0.3) {
                          updateSetting("separation_settings", { 
                            ...settings.separation_settings, 
                            vr_params: { ...settings.separation_settings.vr_params, post_process_threshold: val }
                          });
                        }
                      }}
                    />
                    <p className="text-xs text-gray-500 mt-1">Default: 0.2</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="vrEnableTTA" 
                    checked={settings.separation_settings.vr_params?.enable_tta || false} 
                    onCheckedChange={(checked) => updateSetting("separation_settings", { 
                      ...settings.separation_settings, 
                      vr_params: { ...settings.separation_settings.vr_params, enable_tta: checked as boolean }
                    })} 
                  />
                  <label htmlFor="vrEnableTTA" className="text-sm">Enable Test-Time-Augmentation (slow but improves quality)</label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="vrEnablePostProcess" 
                    checked={settings.separation_settings.vr_params?.enable_post_process || false} 
                    onCheckedChange={(checked) => updateSetting("separation_settings", { 
                      ...settings.separation_settings, 
                      vr_params: { ...settings.separation_settings.vr_params, enable_post_process: checked as boolean }
                    })} 
                  />
                  <label htmlFor="vrEnablePostProcess" className="text-sm">Enable post-process (may improve separation)</label>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="vrHighEndProcess" 
                    checked={settings.separation_settings.vr_params?.high_end_process || false} 
                    onCheckedChange={(checked) => updateSetting("separation_settings", { 
                      ...settings.separation_settings, 
                      vr_params: { ...settings.separation_settings.vr_params, high_end_process: checked as boolean }
                    })} 
                  />
                  <label htmlFor="vrHighEndProcess" className="text-sm">High-end process (mirror missing frequency range)</label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Demucs Architecture Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Segment Size</label>
                    <Input
                      value={String(settings.separation_settings.demucs_params?.segment_size || "Default")}
                      onChange={(e) => updateSetting("separation_settings", { 
                        ...settings.separation_settings, 
                        demucs_params: { ...settings.separation_settings.demucs_params, segment_size: e.target.value === "Default" ? "Default" : parseInt(e.target.value) || "Default" }
                      })}
                      placeholder="Default or number"
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">Shifts</label>
                    <Input
                      type="number"
                      value={settings.separation_settings.demucs_params?.shifts || 2}
                      onChange={(e) => updateSetting("separation_settings", { 
                        ...settings.separation_settings, 
                        demucs_params: { ...settings.separation_settings.demucs_params, shifts: parseInt(e.target.value) || 2 }
                      })}
                    />
                  </div>
                </div>
                <div>
                  <label className="block mb-2 font-semibold">Overlap (0.001 - 0.999)</label>
                  <Input
                    type="number"
                    min="0.001"
                    max="0.999"
                    step="0.01"
                    value={settings.separation_settings.demucs_params?.overlap ?? 0.25}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value);
                      if (!isNaN(val) && val >= 0.001 && val <= 0.999) {
                        updateSetting("separation_settings", { 
                          ...settings.separation_settings, 
                          demucs_params: { ...settings.separation_settings.demucs_params, overlap: val }
                        });
                      }
                    }}
                  />
                  <p className="text-xs text-gray-500 mt-1">Default: 0.25</p>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="demucsSegmentsEnabled" 
                    checked={settings.separation_settings.demucs_params?.segments_enabled !== false} 
                    onCheckedChange={(checked) => updateSetting("separation_settings", { 
                      ...settings.separation_settings, 
                      demucs_params: { ...settings.separation_settings.demucs_params, segments_enabled: checked as boolean }
                    })} 
                  />
                  <label htmlFor="demucsSegmentsEnabled" className="text-sm">Enable segment-wise processing</label>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>MDXC Architecture Parameters</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Segment Size</label>
                    <Input
                      type="number"
                      value={settings.separation_settings.mdxc_params?.segment_size || 256}
                      onChange={(e) => updateSetting("separation_settings", { 
                        ...settings.separation_settings, 
                        mdxc_params: { ...settings.separation_settings.mdxc_params, segment_size: parseInt(e.target.value) || 256 }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">Overlap (2 - 50)</label>
                    <Input
                      type="number"
                      min="2"
                      max="50"
                      value={settings.separation_settings.mdxc_params?.overlap ?? 8}
                      onChange={(e) => {
                        const val = parseInt(e.target.value);
                        if (!isNaN(val) && val >= 2 && val <= 50) {
                          updateSetting("separation_settings", { 
                            ...settings.separation_settings, 
                            mdxc_params: { ...settings.separation_settings.mdxc_params, overlap: val }
                          });
                        }
                      }}
                    />
                    <p className="text-xs text-gray-500 mt-1">Default: 8</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block mb-2 font-semibold">Batch Size</label>
                    <Input
                      type="number"
                      value={settings.separation_settings.mdxc_params?.batch_size || 1}
                      onChange={(e) => updateSetting("separation_settings", { 
                        ...settings.separation_settings, 
                        mdxc_params: { ...settings.separation_settings.mdxc_params, batch_size: parseInt(e.target.value) || 1 }
                      })}
                    />
                  </div>
                  <div>
                    <label className="block mb-2 font-semibold">Pitch Shift (semitones)</label>
                    <Input
                      type="number"
                      value={settings.separation_settings.mdxc_params?.pitch_shift || 0}
                      onChange={(e) => updateSetting("separation_settings", { 
                        ...settings.separation_settings, 
                        mdxc_params: { ...settings.separation_settings.mdxc_params, pitch_shift: parseInt(e.target.value) || 0 }
                      })}
                    />
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <Checkbox 
                    id="mdxcOverrideSegmentSize" 
                    checked={settings.separation_settings.mdxc_params?.override_model_segment_size || false} 
                    onCheckedChange={(checked) => updateSetting("separation_settings", { 
                      ...settings.separation_settings, 
                      mdxc_params: { ...settings.separation_settings.mdxc_params, override_model_segment_size: checked as boolean }
                    })} 
                  />
                  <label htmlFor="mdxcOverrideSegmentSize" className="text-sm">Override model default segment size</label>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "General" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Theme Settings</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <label className="block mb-2 font-semibold">Theme Mode</label>
                  <Select value={settings.theme} onValueChange={(val) => { updateSetting("theme", val); setTheme(val as "light" | "dark" | "system"); }}>
                    <SelectTrigger className="w-full"><SelectValue placeholder="Select theme" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500 mt-1">Choose your preferred theme mode</p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Directory Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="block font-semibold">Download Directory</label>
                  <div className="flex gap-2">
                    <Input
                      value={settings.download_path}
                      placeholder="Select download directory"
                      readOnly
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleOpenDirectory(settings.download_path)}
                      title="Open in file explorer"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleSelectDirectory('download_path')}
                    >
                      Browse
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Downloads will be saved to: {settings.download_path}/Downloads/
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="block font-semibold">Model Directory</label>
                  <div className="flex gap-2">
                    <Input
                      value={settings.model_directory}
                      placeholder="Select model directory"
                      readOnly
                      className="flex-1"
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleOpenDirectory(settings.model_directory)}
                      title="Open in file explorer"
                    >
                      <FolderOpen className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => handleSelectDirectory('model_directory')}
                    >
                      Browse
                    </Button>
                  </div>
                  <p className="text-xs text-gray-500">
                    Stem separation models will be stored here
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Key</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Input placeholder="Enter your key here..." className="w-full" />
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {activeTab === "Download Manager" && (
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Model Download Manager</span>
                  <span className="text-sm font-normal text-gray-500">{getModelsCount()} models found</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="block text-sm font-medium">Model Directory</label>
                  <div className="flex gap-2">
                    <Input value={settings.model_directory} placeholder="Model storage directory" onChange={(e) => {
                      updateSetting("model_directory", e.target.value);
                      setModelDirectory(e.target.value);
                    }} className="flex-1" />
                    <Button variant="outline" onClick={() => handleSelectDirectory('model_directory')}>Browse</Button>
                  </div>
                  <p className="text-xs text-gray-500">Directory where downloaded models will be stored</p>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search models..." value={modelSearchTerm} onChange={(e) => setModelSearchTerm(e.target.value)} className="pl-10" />
                  </div>
                  <Select value={modelFilter} onValueChange={setModelFilter}>
                    <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Models</SelectItem>
                      <SelectItem value="mdx">MDX Models</SelectItem>
                      <SelectItem value="vr">VR Models</SelectItem>
                      <SelectItem value="demucs">Demucs Models</SelectItem>
                      <SelectItem value="mdxc">MDXC Models</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button onClick={() => refreshDownloadedModels(settings.model_directory)} disabled={isLoadingDownloadedModels || !settings.model_directory} variant="outline" title="Refresh downloaded models">
                    {isLoadingDownloadedModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {isLoadingModels ? (
                    <div className="text-center py-8 text-gray-500">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                      Loading models...
                    </div>
                  ) : models.length > 0 ? (
                    Object.entries(groupModelsByArchitecture(models)).map(([category, categoryModels]) => {
                      const filtered = categoryModels.filter((model) => {
                        const searchLower = modelSearchTerm.toLowerCase();
                        const matchesSearch = 
                          model.friendly_name?.toLowerCase().includes(searchLower) ||
                          model.filename?.toLowerCase().includes(searchLower) ||
                          model.output_stems?.toLowerCase().includes(searchLower);
                        const matchesFilter = modelFilter === "all" || modelFilter.toLowerCase() === category.toLowerCase();
                        return matchesSearch && matchesFilter;
                      });
                      if (filtered.length === 0) return null;
                      return (
                        <div key={category} className="space-y-2">
                          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 capitalize">{category} Models ({filtered.length})</h4>
                          {filtered.map((model) => {
                            const isDownloaded = downloadedModels.some(dm => dm.filename === model.filename);
                            return (
                              <div key={model.filename} className="flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                                <Checkbox 
                                  checked={selectedModels.includes(model.filename)} 
                                  onCheckedChange={() => handleModelToggle(model.filename)}
                                  disabled={isDownloaded}
                                />
                                <div className="flex-1">
                                  <div className="font-medium text-sm flex items-center gap-2">
                                    {model.friendly_name || model.filename}
                                    {isDownloaded && (
                                      <Badge variant="outline" className="text-xs">Downloaded</Badge>
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500">{model.filename}</div>
                                  <div className="text-xs text-gray-400">{model.arch} • {model.output_stems}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      No models found. Make sure the audio-engine binary is built and supports --list_models.
                    </div>
                  )}
                </div>
                <Button onClick={downloadSelectedModels} disabled={selectedModels.length === 0 || isDownloadingModels} className="w-full text-gray-400">
                  {isDownloadingModels ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Downloaded Models</span>
                  <span className="text-sm font-normal text-gray-500">{getDownloadedModelsCount()} models</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Models stored in: {settings.model_directory || "Not set"}</p>
                  <Button onClick={() => refreshDownloadedModels(settings.model_directory)} disabled={isLoadingDownloadedModels || !settings.model_directory} variant="outline" size="sm">
                    {isLoadingDownloadedModels ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  </Button>
                </div>
                <div className="max-h-48 overflow-y-auto space-y-2">
                  {downloadedModels.length > 0 ? (
                    downloadedModels.map((model) => (
                      <div key={model.filename} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{model.friendly_name}</div>
                          <div className="text-xs text-gray-500">{model.filename}</div>
                        </div>
                        <Button onClick={() => deleteDownloadedModel(model.filename)} variant="outline" size="sm" className={confirmingDeleteModel === model.filename ? "text-red-600 hover:text-red-700 bg-red-50 dark:bg-red-900/20" : "text-red-600 hover:text-red-700"}>
                          {confirmingDeleteModel === model.filename ? "Confirm?" : <Trash2 className="h-4 w-4" />}
                        </Button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-gray-500">
                      {isLoadingDownloadedModels ? "Loading downloaded models..." : "No downloaded models found."}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <footer className="fixed bottom-0 left-0 right-0 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4 flex justify-between items-center z-50 shadow-md">
        <div className="text-sm text-gray-500">
          {saveStatus === "saving" && "Saving settings..."}
          {saveStatus === "success" && "Settings saved successfully!"}
          {saveStatus === "error" && "Failed to save settings"}
          {saveStatus === "idle" && hasUnsavedChanges && "You have unsaved changes"}
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={resetToDefaults} className="text-orange-600 hover:text-orange-700 border-orange-600 hover:border-orange-700">
            Reset to Defaults
          </Button>
          <Button variant="outline" onClick={revertSettings} disabled={!hasUnsavedChanges}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Revert
          </Button>
          <Button variant="ghost" onClick={handleClose}>Close</Button>
          <Button onClick={saveSettings} disabled={!hasUnsavedChanges || saveStatus === "saving"} className={saveStatus === "success" ? "bg-green-600 hover:bg-green-700 text-white" : saveStatus === "error" ? "bg-red-600 hover:bg-red-700 text-white" : "bg-indigo-600 hover:bg-indigo-700 text-white"}>
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
