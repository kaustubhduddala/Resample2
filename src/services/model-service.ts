import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { app } from 'electron';
import { getFFmpegPath } from './ytdlp-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

export interface ModelInfo {
  filename: string;
  arch: string;
  output_stems: string;
  friendly_name: string;
}

export interface DownloadedModel {
  filename: string;
  friendly_name: string;
  arch: string;
  file_size?: number;
}

// List all available models
export async function listModels(): Promise<ModelInfo[]> {
  return new Promise((resolve, reject) => {
    try {
      const pythonBin = getPythonBinaryPath();
      
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

      // Set up environment with FFmpeg in PATH
      const env = { ...process.env };
      const ffmpegDir = path.dirname(ffmpegPath);
      // Prepend FFmpeg directory to PATH so it's found first
      env.PATH = `${ffmpegDir}${path.delimiter}${env.PATH || ''}`;

      console.log(`[Model Service] FFmpeg path: ${ffmpegPath}`);
      console.log(`[Model Service] FFmpeg directory added to PATH: ${ffmpegDir}`);

      // Run audio-engine with --list_models --list_format=json
      const pythonProcess = spawn(pythonBin, ['--list_models', '--list_format=json'], { env });

      let stdoutData = '';
      let stderrData = '';

      pythonProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      pythonProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Process exited with code ${code}: ${stderrData || stdoutData}`));
          return;
        }
        
        try {
          // Extract JSON from output (may have logging mixed in)
          const jsonMatch = stdoutData.match(/\[(.*)\]|(\{.*\})/s);
          let jsonStr = stdoutData.trim();
          
          if (jsonMatch) {
            // Try to find the JSON array or object
            const match = stdoutData.match(/\[[\s\S]*\]|{[\s\S]*}/);
            if (match) {
              jsonStr = match[0];
            }
          }
          
          // Parse JSON output
          const models = JSON.parse(jsonStr);
          
          // Ensure it's an array
          if (!Array.isArray(models)) {
            reject(new Error('Model list is not an array'));
            return;
          }
          
          // Map to ModelInfo format
          const modelInfos: ModelInfo[] = models.map((model: any) => ({
            filename: model.filename || model.model_filename || '',
            arch: model.arch || model.architecture || 'Unknown',
            output_stems: model.output_stems || model.stems || '',
            friendly_name: model.friendly_name || model.name || model.filename || '',
          }));
          
          resolve(modelInfos);
        } catch (e) {
          console.error('Failed to parse model list:', e);
          console.error('Raw output:', stdoutData);
          reject(new Error(`Failed to parse model list: ${e}. Output: ${stdoutData.substring(0, 200)}`));
        }
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });
    } catch (error) {
      reject(error);
    }
  });
}

// Download a specific model
export async function downloadModel(modelFilename: string, modelDirectory: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const pythonBin = getPythonBinaryPath();
      
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

      // Ensure model directory exists
      if (!fs.existsSync(modelDirectory)) {
        fs.mkdirSync(modelDirectory, { recursive: true });
      }

      // Set up environment with FFmpeg in PATH
      const env = { ...process.env };
      const ffmpegDir = path.dirname(ffmpegPath);
      // Prepend FFmpeg directory to PATH so it's found first
      env.PATH = `${ffmpegDir}${path.delimiter}${env.PATH || ''}`;

      console.log(`[Model Service] FFmpeg path: ${ffmpegPath}`);
      console.log(`[Model Service] FFmpeg directory added to PATH: ${ffmpegDir}`);

      // Run audio-engine with --download_model_only
      const args = [
        '--download_model_only',
        '--model_filename', modelFilename,
        '--model_file_dir', modelDirectory,
      ];

      console.log(`[Model Service] Downloading model: ${modelFilename}`);
      const pythonProcess = spawn(pythonBin, args, { env });

      let stdoutData = '';
      let stderrData = '';

      pythonProcess.stdout.on('data', (data) => {
        const output = data.toString();
        stdoutData += output;
        console.log(`[Model Download] ${output.trim()}`);
      });

      pythonProcess.stderr.on('data', (data) => {
        const output = data.toString();
        stderrData += output;
        console.error(`[Model Download Error] ${output.trim()}`);
      });

      pythonProcess.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Download failed with code ${code}: ${stderrData || stdoutData}`));
          return;
        }
        
        console.log(`[Model Service] Model downloaded successfully: ${modelFilename}`);
        resolve();
      });

      pythonProcess.on('error', (error) => {
        reject(new Error(`Failed to spawn Python process: ${error.message}`));
      });
    } catch (error) {
      reject(error);
    }
  });
}

// List downloaded models from a directory
export async function listDownloadedModels(modelDirectory: string): Promise<DownloadedModel[]> {
  try {
    if (!fs.existsSync(modelDirectory)) {
      return [];
    }

    const files = fs.readdirSync(modelDirectory);
    const modelFiles: DownloadedModel[] = [];

    // Common model file extensions
    const modelExtensions = ['.ckpt', '.onnx', '.pth', '.yaml', '.yml'];

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (modelExtensions.includes(ext)) {
        const filePath = path.join(modelDirectory, file);
        const stats = fs.statSync(filePath);
        
        // Try to get model info from the list
        // For now, we'll use the filename as friendly_name
        modelFiles.push({
          filename: file,
          friendly_name: file.replace(/\.[^/.]+$/, ''), // Remove extension
          arch: 'Unknown', // Will be determined from model list
          file_size: stats.size,
        });
      }
    }

    return modelFiles;
  } catch (error) {
    console.error('Error listing downloaded models:', error);
    return [];
  }
}

// Delete a downloaded model
export async function deleteModel(modelFilename: string, modelDirectory: string): Promise<void> {
  try {
    const modelPath = path.join(modelDirectory, modelFilename);
    if (fs.existsSync(modelPath)) {
      fs.unlinkSync(modelPath);
      console.log(`[Model Service] Deleted model: ${modelFilename}`);
    } else {
      throw new Error(`Model file not found: ${modelPath}`);
    }
  } catch (error) {
    console.error('Error deleting model:', error);
    throw error;
  }
}

