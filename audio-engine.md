# Audio Engine Binary Documentation

The Audio Engine is a standalone, frozen Python executable that wraps the audio-separator library. It allows you to perform advanced AI audio separation (stem splitting) without requiring a local Python installation.

**The binary works exactly like the `audio-separator` command-line tool** - you can use all the same arguments and options.

## 🚀 Usage

The binary accepts command-line arguments just like `audio-separator`.

### Basic Command Signature

```bash
./audio-engine <AUDIO_FILE> [OPTIONS]
```

### Arguments

| Argument | Type | Required | Description |
|----------|------|----------|-------------|
| Audio File | string | ✅ Yes | Path to the audio file(s) to separate. Can specify multiple files. |
| Options | flags | ❌ No | Various command-line flags (see below) |

## 💻 Examples

### 1. Basic Usage (Vocals + Instrumental)

Run with default settings (uses BS-Roformer model).

**Mac/Linux:**

```bash
./audio-engine "/Users/me/Music/song.mp3"
```

**Windows:**

```powershell
.\audio-engine.exe "C:\Music\song.mp3"
```

### 2. Specify Output Directory

```bash
./audio-engine song.mp3 --output_dir /path/to/output
```

### 3. Custom Model and Format

```bash
./audio-engine song.mp3 --model_filename "UVR_MDX.onnx" --output_format MP3 --output_bitrate 320k
```

### 4. List Available Models

```bash
./audio-engine --list_models
```

List models in JSON format:

```bash
./audio-engine --list_models --list_format=json
```

### 5. Download Model Only

```bash
./audio-engine --download_model_only --model_filename "UVR_MDX.onnx" --model_file_dir /path/to/models
```

### 6. Single Stem Output

```bash
./audio-engine song.mp3 --single_stem Vocals
```

### 7. Architecture-Specific Parameters

**MDX Parameters:**
```bash
./audio-engine song.mp3 --mdx_segment_size 512 --mdx_overlap 0.3 --mdx_batch_size 4
```

**VR Parameters:**
```bash
./audio-engine song.mp3 --vr_aggression 10 --vr_enable_tta --vr_window_size 320
```

**Demucs Parameters:**
```bash
./audio-engine song.mp3 --demucs_segment_size 256 --demucs_shifts 4
```

## ⚙️ Common Options

| Option | Default | Description |
|-------|---------|-------------|
| `-m, --model_filename` | `model_bs_roformer_ep_317_sdr_12.9755.ckpt` | Model to use for separation |
| `--output_format` | `FLAC` | Output format (MP3, WAV, FLAC, M4A) |
| `--output_bitrate` | `None` | Bitrate for compressed formats (e.g., `320k`) |
| `--output_dir` | Current directory | Directory to write output files |
| `--model_file_dir` | `/tmp/audio-separator-models/` | Directory for model files |
| `--normalization` | `0.9` | Max peak amplitude (0.0 to 1.0) |
| `--amplification` | `0.0` | Min peak amplitude to amplify to |
| `--single_stem` | `None` | Output only one stem (e.g., `Vocals`, `Instrumental`) |
| `--sample_rate` | `44100` | Sample rate of output audio |
| `--use_soundfile` | `False` | Use soundfile to write audio output |
| `--use_autocast` | `False` | Use PyTorch autocast for faster inference |
| `--invert_spect` | `False` | Invert secondary stem using spectrogram |

### Info and Debugging Options

| Option | Description |
|--------|-------------|
| `-v, --version` | Show version number and exit |
| `-d, --debug` | Enable debug logging |
| `-e, --env_info` | Print environment information and exit |
| `-l, --list_models` | List all supported models and exit |
| `--log_level` | Log level (debug, info, warning, error) |
| `--list_filter` | Filter model list by name, filename, or stem type |
| `--list_limit` | Limit the number of models shown |
| `--list_format` | Format for listing models (`pretty` or `json`) |

### MDX Architecture Parameters

| Option | Default | Description |
|-------|---------|-------------|
| `--mdx_segment_size` | `256` | Segment size (larger = more RAM, better quality) |
| `--mdx_overlap` | `0.25` | Overlap between windows (0.001-0.999) |
| `--mdx_batch_size` | `1` | Batch size (larger = more RAM, faster) |
| `--mdx_hop_length` | `1024` | Hop length (usually don't change) |
| `--mdx_enable_denoise` | `False` | Enable denoising during separation |

### VR Architecture Parameters

| Option | Default | Description |
|-------|---------|-------------|
| `--vr_batch_size` | `1` | Batch size |
| `--vr_window_size` | `512` | Window size (1024 = fast, 320 = better quality) |
| `--vr_aggression` | `5` | Intensity of extraction (-100 to 100) |
| `--vr_enable_tta` | `False` | Enable Test-Time-Augmentation |
| `--vr_high_end_process` | `False` | Mirror missing frequency range |
| `--vr_enable_post_process` | `False` | Identify leftover artifacts |
| `--vr_post_process_threshold` | `0.2` | Post-process threshold (0.1-0.3) |

### Demucs Architecture Parameters

| Option | Default | Description |
|-------|---------|-------------|
| `--demucs_segment_size` | `Default` | Segment size (1-100) |
| `--demucs_shifts` | `2` | Number of predictions with random shifts |
| `--demucs_overlap` | `0.25` | Overlap between windows (0.001-0.999) |
| `--demucs_segments_enabled` | `True` | Enable segment-wise processing |

### MDXC Architecture Parameters

| Option | Default | Description |
|-------|---------|-------------|
| `--mdxc_segment_size` | `256` | Segment size |
| `--mdxc_override_model_segment_size` | `False` | Override model default segment size |
| `--mdxc_overlap` | `8` | Overlap between windows (2-50) |
| `--mdxc_batch_size` | `1` | Batch size |
| `--mdxc_pitch_shift` | `0` | Pitch shift in semitones |

## 📤 Output Format

The binary outputs log messages to stdout. On successful completion, it prints:

```
Separation complete! Output file(s): /path/to/output/song_(Vocals).flac /path/to/output/song_(Instrumental).flac
```

Errors are printed to stderr.

## ⚠️ Important Requirements

### 1. FFmpeg is Required

The binary does not bundle FFmpeg inside itself (to keep file size down).

- **Electron Usage**: You must inject the path to ffmpeg-static into the PATH environment variable when spawning the child process.
- **Manual Usage**: You must have ffmpeg installed and available in your system terminal.

### 2. Model Downloads

On the first run, the binary will attempt to download the AI models (approx 100MB+).

- By default, models are saved to `/tmp/audio-separator-models/`.
- **Recommendation**: Use `--model_file_dir` to save them to a persistent user folder (e.g., `%APPDATA%` or Application Support) so the user doesn't re-download them every time.

## 📚 Full Documentation

For complete documentation of all options, run:

```bash
./audio-engine --help
```

This will display all available options and their descriptions, matching the `audio-separator` CLI tool.
