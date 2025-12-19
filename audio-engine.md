# Audio Engine Binary Documentation

The Audio Engine is a standalone, frozen Python executable that wraps the audio-separator library. It allows you to perform advanced AI audio separation (stem splitting) without requiring a local Python installation.

## 🚀 Usage

The binary accepts three arguments via the command line.

### Command Signature

```bash
./audio-engine <INPUT_FILE_PATH> <OUTPUT_DIRECTORY> [JSON_OPTIONS]
```

### Arguments

| Argument      | Type   | Required | Description                                                                               |
| ------------- | ------ | -------- | ----------------------------------------------------------------------------------------- |
| 1. Input File | string | ✅ Yes   | Absolute path to the source audio file (mp3, wav, flac, etc.)                             |
| 2. Output Dir | string | ✅ Yes   | Absolute path to the folder where stems should be saved.                                  |
| 3. Options    | JSON   | ❌ No    | A JSON string containing advanced configuration (models, format, etc.). Defaults to `{}`. |

## 💻 Examples

### 1. Basic Usage (Vocals + Instrumental)

Run with default settings (uses BS-Roformer model).

**Mac/Linux:**

```bash
./audio-engine "/Users/me/Music/song.mp3" "/Users/me/Downloads/stems"
```

**Windows:**

```powershell
.\audio-engine.exe "C:\Music\song.mp3" "C:\Downloads\stems"
```

### 2. Advanced Usage (JSON Configuration)

Pass a JSON string as the third argument to customize the output format, model, or quality.

**Example JSON:**

```json
{
  "output_format": "MP3",
  "output_bitrate": "320k",
  "normalization": 0.9,
  "model_filename": "htdemucs_ft.yaml"
}
```

**Command:**

```bash
./audio-engine "/song.mp3" "/out" '{"output_format": "MP3", "model_filename": "htdemucs_ft.yaml"}'
```

## ⚙️ Supported JSON Options

You can pass any parameter supported by the Separator class in audio-separator. Common options include:

| Key                  | Default                | Description                                                       |
| -------------------- | ---------------------- | ----------------------------------------------------------------- |
| `model_filename`     | `model_bs_roformer...` | The model to use. (e.g., `UVR-MDX-NET-Inst_HQ_3.onnx`)            |
| `output_format`      | `FLAC`                 | Output file format (MP3, WAV, FLAC, M4A).                         |
| `output_bitrate`     | `None`                 | Bitrate for compressed formats (e.g., `320k`).                    |
| `normalization`      | `0.9`                  | Max peak amplitude (0.0 to 1.0).                                  |
| `mdx_segment_size`   | `256`                  | Processing chunk size. Lower = less RAM, Higher = better quality. |
| `mdx_overlap`        | `0.25`                 | Overlap between chunks (0.001 - 0.999).                           |
| `output_single_stem` | `None`                 | Set to `"Vocals"` or `"Instrumental"` to save only one file.      |

## 📤 Output Format (Stdout)

The binary communicates entirely via Standard Output (stdout).

### ✅ Success

When separation finishes, it prints a single JSON object on the last line:

```json
{
  "status": "success",
  "files": [
    "/path/to/output/song_(Vocals).mp3",
    "/path/to/output/song_(Instrumental).mp3"
  ]
}
```

### ❌ Error

If an error occurs (missing file, invalid model, etc.), it prints:

```json
{
  "status": "error",
  "message": "Model file not found error..."
}
```

## ⚠️ Important Requirements

### 1. FFmpeg is Required

The binary does not bundle FFmpeg inside itself (to keep file size down).

- **Electron Usage**: You must inject the path to ffmpeg-static into the PATH environment variable when spawning the child process.
- **Manual Usage**: You must have ffmpeg installed and available in your system terminal.

### 2. Model Downloads

On the first run, the binary will attempt to download the AI models (approx 100MB+).

- By default, models are saved to `/tmp/audio-separator-models/`.
- **Recommendation**: Pass `model_file_dir` in your JSON options to save them to a persistent user folder (e.g., `%APPDATA%` or Application Support) so the user doesn't re-download them every time.

