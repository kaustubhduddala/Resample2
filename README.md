# Resample - AI-Powered Audio Separation Tool

A cross-platform desktop application built with Tauri, React, and TypeScript that provides professional-grade audio separation using state-of-the-art AI models. Resample allows you to separate vocals, instruments, drums, and other audio stems from any audio file with high quality and speed.

## Features

- **AI-Powered Separation**: Uses advanced neural network models (MDX, Demucs, VR) for high-quality audio separation
- **Multiple Output Formats**: Support for WAV, FLAC, MP3, and other common audio formats
- **GPU Acceleration**: Automatic GPU detection and acceleration for Apple Silicon (MPS/CoreML), NVIDIA (CUDA), and AMD (ROCm)
- **Batch Processing**: Process multiple audio files simultaneously
- **Customizable Quality**: Adjustable parameters for speed vs. quality trade-offs
- **Cross-Platform**: Native applications for macOS and Windows
- **Self-Contained**: Includes all dependencies and models for offline operation

## Supported Platforms

- **macOS**: 10.15+ (Catalina and later)
  - Intel Macs: Metal acceleration
  - Apple Silicon: MPS and CoreML acceleration
- **Windows**: 10/11 (64-bit)
  - NVIDIA GPUs: CUDA acceleration
  - AMD GPUs: DirectML acceleration
  - CPU fallback for all systems

## System Requirements

### Minimum Requirements

- **OS**: macOS 10.15+ or Windows 10/11 (64-bit)
- **RAM**: 8GB
- **Storage**: 2GB free space
- **Python**: 3.8+ (included in the application)

### Recommended Requirements

- **OS**: macOS 12+ or Windows 11
- **RAM**: 16GB+
- **Storage**: 5GB+ free space
- **GPU**: Apple Silicon M1/M2/M3, NVIDIA RTX series, or AMD RX series

## Installation

### Download Pre-built Binaries

1. Go to the [Releases](https://github.com/yourusername/resample/releases) page
2. Download the appropriate version for your platform:
   - **macOS**: `.dmg` file
   - **Windows**: `.exe` installer

### Build from Source

#### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Rust toolchain (for Tauri)

#### Build Steps

```bash
# Clone the repository
git clone https://github.com/yourusername/resample.git
cd resample

# Install dependencies
pnpm install

# Build the application
pnpm tauri build

# The built application will be in src-tauri/target/release/
```

## Usage

### Basic Audio Separation

1. **Launch the Application**: Open Resample from your Applications folder or Start menu
2. **Select Audio File**: Drag and drop an audio file or use the file browser
3. **Choose Model**: Select from available AI models (default: MDXC Roformer)
4. **Configure Settings**: Adjust quality, output format, and other parameters
5. **Start Separation**: Click "Separate Audio" and wait for processing
6. **Download Results**: Separated stems will be available in the output directory

### Command Line Usage

For advanced users, the application includes standalone command-line tools:

#### Audio Separation

```bash
# macOS/Linux
./audio-separator-standalone.sh -m "model_name.ckpt" input.mp3

# Windows
audio-separator-standalone.bat -m "model_name.ckpt" input.mp3
```

#### YouTube Download

```bash
# macOS/Linux
./yt-dlp-standalone.sh "https://youtube.com/watch?v=VIDEO_ID"

# Windows
yt-dlp-standalone.bat "https://youtube.com/watch?v=VIDEO_ID"
```

### Performance Optimization

#### GPU Acceleration

- **macOS**: Automatically uses MPS (Metal Performance Shaders) and CoreML
- **Windows**: Automatically detects and uses CUDA or DirectML
- **Linux**: Automatically detects and uses CUDA or ROCm

#### Quality vs. Speed Settings

- **Fast Mode**: Lower overlap, smaller batch sizes
- **Quality Mode**: Higher overlap, larger batch sizes
- **Custom**: Adjust individual parameters for your needs

## Supported Models

### MDX Architecture

- **General Purpose**: Good balance of quality and speed
- **Models**: `mdx_extra`, `mdx_extra_q`, `mdx_net_models`
- **Best for**: Most audio types, general separation tasks

### Demucs Architecture

- **High Quality**: Excellent separation quality
- **Models**: `demucs_extra`, `demucs_extra_h`
- **Best for**: Professional audio work, maximum quality

### VR Architecture

- **Vocal Focused**: Specialized for vocal separation
- **Models**: Various VR models with adjustable aggression
- **Best for**: Vocal extraction, karaoke creation

### MDXC Architecture

- **Advanced**: Latest generation with pitch shifting
- **Models**: `model_bs_roformer_ep_317_sdr_12.9755.ckpt` (default)
- **Best for**: Complex audio, professional applications

## Output Formats

### Audio Formats

- **WAV**: Uncompressed, highest quality, largest file size
- **FLAC**: Lossless compression, high quality, medium file size
- **MP3**: Lossy compression, good quality, small file size
- **AAC**: Advanced lossy compression, good quality, small file size

### Stem Types

- **Vocals**: Isolated vocal tracks
- **Instrumental**: Music without vocals
- **Drums**: Percussion and rhythm elements
- **Bass**: Low-frequency instruments
- **Guitar**: Guitar tracks
- **Piano**: Piano and keyboard tracks
- **Other**: Additional instruments and elements

## Configuration

### Application Settings

- **Theme**: Light, dark, or system preference
- **Download Path**: Default location for downloaded files
- **Model Directory**: Location for AI model files
- **GPU Settings**: Enable/disable GPU acceleration

### Separation Settings

- **Model Selection**: Choose the AI model for separation
- **Output Format**: Select audio format and quality
- **Batch Processing**: Configure batch sizes for performance
- **Quality Parameters**: Adjust overlap, segment sizes, and other settings

## Troubleshooting

### Common Issues

#### Slow Performance

- Ensure GPU acceleration is enabled
- Check available RAM and close other applications
- Use smaller batch sizes if memory is limited
- Consider using faster models (e.g., `mdx_extra_q`)

#### GPU Not Detected

- **macOS**: Ensure you're running macOS 10.15+ (Catalina)
- **Windows**: Install latest GPU drivers
- **Linux**: Install CUDA toolkit for NVIDIA GPUs

#### Model Download Issues

- Check internet connection
- Verify sufficient disk space
- Try downloading models manually from the model catalog

#### Audio Quality Issues

- Use higher quality input files (WAV, FLAC)
- Increase overlap and segment size parameters
- Try different models for your specific audio type

### Performance Tips

- **Batch Processing**: Process multiple files together for efficiency
- **Model Selection**: Choose models based on your audio type and quality needs
- **GPU Memory**: Close other GPU-intensive applications during processing
- **Storage**: Use fast storage (SSD) for better I/O performance

## Development

### Project Structure

```
resample/
├── src/                    # React frontend
├── src-tauri/             # Tauri backend
│   ├── resources/         # Python dependencies and models
│   ├── src/              # Rust backend code
│   └── Cargo.toml        # Rust dependencies
├── package.json           # Node.js dependencies
└── README.md             # This file
```

### Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

### Building for Development

```bash
# Install dependencies
pnpm install

# Start development server
pnpm tauri dev

# Build for production
pnpm tauri build
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Acknowledgments

- **Audio Separator**: Core audio separation engine
- **yt-dlp**: YouTube and media download capabilities
- **FFmpeg**: Audio/video processing backend
- **Tauri**: Cross-platform desktop framework
- **React**: Frontend framework
- **PyTorch**: Machine learning framework

## Support

- **Issues**: Report bugs and request features on [GitHub Issues](https://github.com/yourusername/resample/issues)
- **Discussions**: Join community discussions on [GitHub Discussions](https://github.com/yourusername/resample/discussions)
- **Wiki**: Check the [Wiki](https://github.com/yourusername/resample/wiki) for detailed documentation

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes and improvements.
