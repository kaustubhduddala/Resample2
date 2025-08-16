import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface ModelInfo {
  filename: string;
  arch: string;
  output_stems: string;
  friendly_name: string;
}

export interface DownloadedModel {
  filename: string;
  friendly_name: string;
}

interface ModelCache {
  models: ModelInfo[];
  downloadedModels: DownloadedModel[];
  isLoading: boolean;
  isLoaded: boolean;
  lastUpdated: number | null;
  modelDirectory?: string;
}

export class GlobalModelCache {
  private static instance: GlobalModelCache;
  private cache: ModelCache = {
    models: [],
    downloadedModels: [],
    isLoading: false,
    isLoaded: false,
    lastUpdated: null,
  };
  private listeners: Set<() => void> = new Set();

  static getInstance(): GlobalModelCache {
    if (!GlobalModelCache.instance) {
      GlobalModelCache.instance = new GlobalModelCache();
    }
    return GlobalModelCache.instance;
  }

  getCache(): ModelCache {
    return { ...this.cache };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }

  async loadModels(): Promise<void> {
    if (this.cache.isLoading || this.cache.isLoaded) {
      return;
    }

    this.cache.isLoading = true;
    this.notifyListeners();

    try {
      const modelList = await invoke<ModelInfo[]>(
        "list_audio_separator_models"
      );
      this.cache.models = modelList;
      this.cache.isLoaded = true;
      this.cache.lastUpdated = Date.now();
    } catch (error) {
      console.error("Failed to load models:", error);
      this.cache.models = [];
    } finally {
      this.cache.isLoading = false;
      this.notifyListeners();
    }
  }

  async loadDownloadedModels(modelDirectory: string): Promise<void> {
    try {
      const downloadedList = await invoke<DownloadedModel[]>(
        "list_downloaded_models",
        { modelDirectory }
      );
      this.cache.downloadedModels = downloadedList;
      this.cache.lastUpdated = Date.now();
      this.notifyListeners();
    } catch (error) {
      console.error("Failed to load downloaded models:", error);
      this.cache.downloadedModels = [];
    }
  }

  async refreshDownloadedModels(modelDirectory: string): Promise<void> {
    await this.loadDownloadedModels(modelDirectory);
  }

  async downloadModel(
    modelFilename: string,
    modelDirectory: string
  ): Promise<void> {
    try {
      await invoke("download_audio_separator_model", {
        modelFilename,
        modelDirectory,
      });
      // Refresh downloaded models after successful download
      await this.loadDownloadedModels(modelDirectory);
    } catch (error) {
      console.error("Failed to download model:", error);
      throw error;
    }
  }

  setModelDirectory(directory: string): void {
    this.cache.modelDirectory = directory;
    this.notifyListeners();
  }

  getModelsCount(): number {
    return this.cache.models.length;
  }

  getDownloadedModelsCount(): number {
    return this.cache.downloadedModels.length;
  }
}

export function useModelCache() {
  const [cache, setCache] = useState<ModelCache>(
    GlobalModelCache.getInstance().getCache()
  );

  useEffect(() => {
    const globalCache = GlobalModelCache.getInstance();
    const unsubscribe = globalCache.subscribe(() => {
      setCache(globalCache.getCache());
    });

    // Load models if not already loaded
    if (!cache.isLoaded && !cache.isLoading) {
      globalCache.loadModels();
    }

    return unsubscribe;
  }, [cache.isLoaded, cache.isLoading]);

  const refreshDownloadedModels = async (modelDirectory: string) => {
    const globalCache = GlobalModelCache.getInstance();
    await globalCache.refreshDownloadedModels(modelDirectory);
  };

  const loadDownloadedModels = async (modelDirectory: string) => {
    const globalCache = GlobalModelCache.getInstance();
    await globalCache.loadDownloadedModels(modelDirectory);
  };

  return {
    models: cache.models,
    downloadedModels: cache.downloadedModels,
    isLoading: cache.isLoading,
    isLoaded: cache.isLoaded,
    lastUpdated: cache.lastUpdated,
    refreshDownloadedModels,
    loadDownloadedModels,
    downloadModel: (modelFilename: string, modelDirectory: string) =>
      GlobalModelCache.getInstance().downloadModel(
        modelFilename,
        modelDirectory
      ),
    setModelDirectory: (directory: string) =>
      GlobalModelCache.getInstance().setModelDirectory(directory),
    getModelsCount: () => GlobalModelCache.getInstance().getModelsCount(),
    getDownloadedModelsCount: () =>
      GlobalModelCache.getInstance().getDownloadedModelsCount(),
  };
}
