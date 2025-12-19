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
        const output = data.toString();
        stdoutData += output;
        // Log for debugging
        console.log(`[Model Service] Received: ${output.substring(0, 100)}...`);
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
          // Try to parse the entire stdout as JSON first
          let parsed: any;
          let jsonStr = stdoutData.trim();
          
          try {
            // First attempt: parse entire stdout as JSON
            parsed = JSON.parse(jsonStr);
            console.log(`[Model Service] Successfully parsed entire stdout as JSON`);
          } catch (e) {
            // If that fails, try to extract JSON from mixed output
            console.log(`[Model Service] Failed to parse entire stdout, attempting extraction...`);
            
            // Find the first { that starts a JSON object
            const jsonStart = jsonStr.indexOf('{');
            if (jsonStart === -1) {
              throw new Error('No JSON object found in output');
            }
            
            jsonStr = jsonStr.substring(jsonStart);
            
            // Find the matching closing brace
            // This handles nested structures properly
            let depth = 0;
            let inString = false;
            let escapeNext = false;
            let endIndex = -1;
            
            for (let i = 0; i < jsonStr.length; i++) {
              const char = jsonStr[i];
              
              if (escapeNext) {
                escapeNext = false;
                continue;
              }
              
              if (char === '\\') {
                escapeNext = true;
                continue;
              }
              
              if (char === '"' && !escapeNext) {
                inString = !inString;
                continue;
              }
              
              if (!inString) {
                if (char === '{') {
                  depth++;
                } else if (char === '}') {
                  depth--;
                  if (depth === 0) {
                    endIndex = i + 1;
                    break;
                  }
                }
              }
            }
            
            if (endIndex === -1) {
              throw new Error('Could not find matching closing brace for JSON object');
            }
            
            jsonStr = jsonStr.substring(0, endIndex);
            console.log(`[Model Service] Extracted JSON length: ${jsonStr.length}`);
            console.log(`[Model Service] JSON preview: ${jsonStr.substring(0, 200)}...`);
            
            parsed = JSON.parse(jsonStr);
          }
          
          // Helper function to determine architecture from friendly name or filename
          const determineArchitecture = (friendlyName: string, filename: string): string => {
            const lowerFriendly = friendlyName.toLowerCase();
            const lowerFilename = filename.toLowerCase();
            
            // Check friendly name first (more reliable)
            if (lowerFriendly.includes('roformer')) return 'Roformer';
            if (lowerFriendly.includes('mdxc')) return 'MDXC';
            if (lowerFriendly.includes('mdx') && !lowerFriendly.includes('mdxc')) return 'MDX';
            if (lowerFriendly.includes('vr') || lowerFriendly.includes('vocal remover') || lowerFriendly.includes('vocalremover')) return 'VR';
            if (lowerFriendly.includes('demucs')) return 'Demucs';
            
            // Check filename patterns if friendly name didn't match
            if (lowerFilename.includes('roformer')) return 'Roformer';
            if (lowerFilename.includes('mdxc')) return 'MDXC';
            if (lowerFilename.includes('mdx') && !lowerFilename.includes('mdxc')) return 'MDX';
            if (lowerFilename.includes('vr_') || lowerFilename.includes('_vr') || lowerFilename.includes('vocal_remover') || lowerFilename.includes('vocalremover')) return 'VR';
            if (lowerFilename.includes('demucs')) return 'Demucs';
            if (lowerFilename.endsWith('.onnx')) return 'MDX'; // Most .onnx files are MDX
            
            return 'Unknown';
          };
          
          // Handle both dictionary (new CLI format) and array (old format) formats
          let models: any[];
          if (Array.isArray(parsed)) {
            // Old format: already an array
            models = parsed;
          } else if (typeof parsed === 'object' && parsed !== null) {
            // New format: nested dictionary structure
            // Top level: architecture names (VR, MDX, Demucs, MDXC, etc.)
            // Second level: friendly names as keys, model info as values
            models = [];
            
            for (const [archKey, archModels] of Object.entries(parsed)) {
              if (typeof archModels === 'object' && archModels !== null) {
                // Iterate through models within this architecture
                for (const [friendlyName, info] of Object.entries(archModels)) {
                  if (typeof info === 'object' && info !== null) {
                    const modelInfo = info as any;
                    const filename = modelInfo?.filename || '';
                    const stems = Array.isArray(modelInfo?.stems) ? modelInfo.stems : [];
                    // Use the architecture key, or determine from friendly name/filename
                    const arch = determineArchitecture(friendlyName, filename) || archKey;
                    
                    models.push({
                      filename: filename,
                      arch: arch,
                      output_stems: stems.join(', '),
                      friendly_name: friendlyName,
                    });
                  }
                }
              }
            }
          } else {
            reject(new Error('Model list format is not recognized'));
            return;
          }
          
          // Map to ModelInfo format
          const modelInfos: ModelInfo[] = models.map((model: any) => ({
            filename: model.filename || model.model_filename || '',
            arch: model.arch || model.architecture || 'Unknown',
            output_stems: model.output_stems || model.stems || '',
            friendly_name: model.friendly_name || model.name || model.filename || '',
          }));
          
          console.log(`[Model Service] Parsed ${modelInfos.length} models`);
          console.log(`[Model Service] Sample models:`, modelInfos.slice(0, 3).map(m => ({ filename: m.filename, arch: m.arch, friendly_name: m.friendly_name })));
          
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

