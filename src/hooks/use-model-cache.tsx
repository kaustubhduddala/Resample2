import { useState, useEffect, useCallback } from "react";

export interface ModelInfo {
  filename: string;
  arch: string;
  output_stems: string;
  friendly_name: string;
}

export interface DownloadedModel {
  filename: string;
  friendly_name: string;
  arch?: string;
  file_size?: number;
}

export function useModelCache() {
  const [models, setModels] = useState<ModelInfo[]>([]);
  const [downloadedModels, setDownloadedModels] = useState<DownloadedModel[]>(
    []
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [modelDirectory, setModelDirectoryState] = useState<string>("");

  // Load available models from API
  const loadModels = useCallback(async () => {
    if (!window.electronAPI) return;

    setIsLoading(true);
    try {
      const result = await window.electronAPI.listModels();
      if (result.success && result.models) {
        setModels(result.models);
        setIsLoaded(true);
        setLastUpdated(new Date());
      }
    } catch (error) {
      console.error("Error loading models:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Load downloaded models from directory
  const loadDownloadedModels = useCallback(async (directory: string) => {
    if (!window.electronAPI || !directory) return;

    try {
      const result = await window.electronAPI.listDownloadedModels(directory);
      if (result.success && result.models) {
        setDownloadedModels(result.models);
      }
    } catch (error) {
      console.error("Error loading downloaded models:", error);
    }
  }, []);

  // Refresh downloaded models
  const refreshDownloadedModels = useCallback(
    async (directory: string) => {
      await loadDownloadedModels(directory);
    },
    [loadDownloadedModels]
  );

  // Download a model
  const downloadModel = useCallback(
    async (modelFilename: string, directory: string) => {
      if (!window.electronAPI) return;

      try {
        const result = await window.electronAPI.downloadModel(
          modelFilename,
          directory
        );
        if (result.success) {
          // Refresh downloaded models after successful download
          await loadDownloadedModels(directory);
          return true;
        }
        return false;
      } catch (error) {
        console.error("Error downloading model:", error);
        return false;
      }
    },
    [loadDownloadedModels]
  );

  // Set model directory and load downloaded models
  const setModelDirectory = useCallback(
    (directory: string) => {
      setModelDirectoryState(directory);
      if (directory) {
        loadDownloadedModels(directory);
      }
    },
    [loadDownloadedModels]
  );

  // Load models on mount
  useEffect(() => {
    loadModels();
  }, [loadModels]);

  return {
    models,
    downloadedModels,
    isLoading,
    isLoaded,
    lastUpdated,
    refreshDownloadedModels,
    loadDownloadedModels,
    downloadModel,
    setModelDirectory,
    getModelsCount: () => models.length,
    getDownloadedModelsCount: () => downloadedModels.length,
  };
}
