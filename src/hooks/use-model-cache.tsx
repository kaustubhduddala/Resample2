import { useState } from "react";

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

// Barebones version - no API calls, just returns empty data
export function useModelCache() {
  const [models] = useState<ModelInfo[]>([]);
  const [downloadedModels] = useState<DownloadedModel[]>([]);

  return {
    models,
    downloadedModels,
    isLoading: false,
    isLoaded: false,
    lastUpdated: null,
    refreshDownloadedModels: async (_modelDirectory: string) => {
      // Barebones: No implementation
    },
    loadDownloadedModels: async (_modelDirectory: string) => {
      // Barebones: No implementation
    },
    downloadModel: async (_modelFilename: string, _modelDirectory: string) => {
      // Barebones: No implementation
    },
    setModelDirectory: (_directory: string) => {
      // Barebones: No implementation
    },
    getModelsCount: () => 0,
    getDownloadedModelsCount: () => 0,
  };
}

