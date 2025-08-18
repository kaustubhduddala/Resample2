# Changelog

All notable changes to Resample will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- New features that have been added

### Changed

- Changes in existing functionality

### Deprecated

- Features that will be removed in upcoming releases

### Removed

- Features that have been removed

### Fixed

- Bug fixes

### Security

- Security-related fixes

## [1.0.0] - 2024-01-XX

### Added

- Initial release of Resample
- AI-powered audio separation using MDX, Demucs, and VR models
- Cross-platform support for macOS and Windows
- GPU acceleration for Apple Silicon (MPS/CoreML), NVIDIA (CUDA), and AMD
- Multiple output formats (WAV, FLAC, MP3, AAC)
- Batch processing capabilities
- YouTube download integration via yt-dlp
- Self-contained Python environment with all dependencies
- Standalone command-line tools for advanced users
- Modern React-based user interface
- Tauri backend for native performance

### Technical Features

- PyTorch-based machine learning models
- ONNX Runtime with CoreML execution provider
- FFmpeg integration for audio processing
- Virtual environment management
- Cross-compilation support for multiple architectures

### Supported Models

- MDX architecture models for general separation
- Demucs models for high-quality separation
- VR models for vocal-focused separation
- MDXC models with advanced features

## [0.1.0] - 2024-01-XX

### Added

- Project initialization
- Basic Tauri + React + TypeScript setup
- Audio separation core functionality
- Basic UI components
- Python environment setup scripts

---

## Version History

- **v1.0.0**: Initial stable release
- **v0.1.0**: Development preview

## Contributing

When contributing to this project, please update this changelog by adding a new entry under the [Unreleased] section. The entry should be descriptive of the changes made and follow the existing format.

## Release Process

1. **Development**: Features and fixes are developed in feature branches
2. **Testing**: Changes are tested locally and in CI/CD
3. **Release**: A new version tag is created and pushed
4. **Automation**: GitHub Actions automatically builds and releases
5. **Documentation**: This changelog is updated with release notes

## Notes

- All dates are in YYYY-MM-DD format
- Breaking changes are clearly marked
- Security updates are prioritized and documented
- Deprecated features include migration instructions when possible
