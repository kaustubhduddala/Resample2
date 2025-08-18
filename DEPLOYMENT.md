# Deployment Guide for Resample

This guide explains how to deploy Resample using the automated GitHub Actions workflow, create releases, and manage the build process.

## Prerequisites

Before deploying, ensure you have:

1. **GitHub Repository**: A public or private repository with the Resample code
2. **GitHub Actions**: Enabled for your repository
3. **GitHub Token**: With appropriate permissions for releases
4. **Local Development Environment**: Set up for testing builds

## Automated Deployment with GitHub Actions

### 1. Workflow Overview

The GitHub Actions workflow (`/.github/workflows/build.yml`) automatically:

- **Builds** the application for macOS (Intel + Apple Silicon) and Windows
- **Creates** virtual environment packages for each platform
- **Generates** release artifacts (DMG for Mac, EXE for Windows)
- **Publishes** releases when tags are pushed
- **Uploads** all artifacts to GitHub Releases

### 2. Triggering a Build

#### Option A: Tag-Based Release (Recommended)

```bash
# Create and push a new tag
git tag v1.0.0
git push origin v1.0.0

# The workflow will automatically:
# 1. Build for all platforms
# 2. Create a GitHub release
# 3. Upload artifacts
```

#### Option B: Manual Trigger

1. Go to your GitHub repository
2. Click **Actions** tab
3. Select **Build and Release** workflow
4. Click **Run workflow**
5. Enter version (e.g., `v1.0.0`)
6. Click **Run workflow**

### 3. Workflow Jobs

The workflow consists of several jobs:

#### `setup-python`

- Determines required Python version from setup scripts
- Runs on Ubuntu (fastest for setup tasks)

#### `build-macos`

- Builds for both Intel (`x86_64-apple-darwin`) and Apple Silicon (`aarch64-apple-darwin`)
- Creates ZIP archives for each architecture
- Uploads artifacts for later use

#### `build-windows`

- Builds for Windows x64 (`x86_64-pc-windows-msvc`)
- Creates ZIP archive of the executable
- Uploads artifacts for later use

#### `create-release`

- Downloads all artifacts from previous jobs
- Creates a GitHub release with the tag
- Attaches all platform-specific builds
- Only runs when a tag is pushed

#### `build-venv-packages`

- Creates portable virtual environment packages
- Useful for offline distribution or custom deployments

## Manual Deployment Process

If you prefer to build manually or need custom builds:

### 1. Local Build Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/resample.git
cd resample

# Install dependencies
pnpm install

# Setup Python environment
cd src-tauri/resources
chmod +x setup.sh
./setup.sh  # On macOS/Linux
# OR
setup.bat   # On Windows

# Build the application
cd ../..
pnpm tauri build
```

### 2. Platform-Specific Builds

#### macOS

```bash
# Build for Intel Macs
pnpm tauri build --target x86_64-apple-darwin

# Build for Apple Silicon
pnpm tauri build --target aarch64-apple-darwin

# Builds will be in:
# src-tauri/target/x86_64-apple-darwin/release/
# src-tauri/target/aarch64-apple-darwin/release/
```

#### Windows

```bash
# Build for Windows x64
pnpm tauri build --target x86_64-pc-windows-msvc

# Build will be in:
# src-tauri/target/x86_64-pc-windows-msvc/release/
```

### 3. Creating Distribution Packages

#### macOS DMG Creation

```bash
# Install create-dmg (optional, for professional DMG files)
brew install create-dmg

# Create DMG from app bundle
create-dmg \
  --volname "Resample" \
  --window-pos 200 120 \
  --window-size 800 400 \
  --icon-size 100 \
  --icon "Resample2.app" 200 190 \
  --hide-extension "Resample2.app" \
  --app-drop-link 600 185 \
  "Resample-macOS.dmg" \
  "src-tauri/target/aarch64-apple-darwin/release/"
```

#### Windows Installer

The Tauri build process should automatically create an installer. If not:

```bash
# Create a simple ZIP archive
cd src-tauri/target/x86_64-pc-windows-msvc/release
Compress-Archive -Path "Resample2.exe" -DestinationPath "Resample-Windows.zip"
```

## Release Management

### 1. Versioning Strategy

Use semantic versioning:

- **Major** (v1.0.0): Breaking changes, major features
- **Minor** (v1.1.0): New features, backward compatible
- **Patch** (v1.0.1): Bug fixes, minor improvements

### 2. Creating a Release

```bash
# 1. Update version in package.json and Cargo.toml
# 2. Commit changes
git add .
git commit -m "Bump version to v1.0.0"

# 3. Create and push tag
git tag v1.0.0
git push origin v1.0.0

# 4. GitHub Actions will automatically:
#    - Build all platforms
#    - Create release
#    - Upload artifacts
```

### 3. Release Notes

The workflow automatically generates basic release notes. For better releases:

1. **Edit the release** after it's created
2. **Add detailed changelog** from your development notes
3. **Include screenshots** or videos of new features
4. **List known issues** or limitations
5. **Provide upgrade instructions** if needed

## Troubleshooting

### Common Build Issues

#### Python Environment Issues

```bash
# Clean and rebuild Python environment
cd src-tauri/resources
rm -rf .venv
./setup.sh  # or setup.bat on Windows
```

#### Rust Build Issues

```bash
# Clean Rust build cache
cd src-tauri
cargo clean
cargo build --release
```

#### Node.js Dependencies

```bash
# Clean and reinstall Node.js dependencies
rm -rf node_modules pnpm-lock.yaml
pnpm install
```

### GitHub Actions Issues

#### Workflow Not Triggering

- Check that the workflow file is in `.github/workflows/`
- Verify the workflow syntax is valid
- Ensure GitHub Actions is enabled for the repository

#### Build Failures

- Check the Actions tab for detailed error logs
- Verify all dependencies are properly specified
- Ensure the Python version requirements are correct

#### Artifact Upload Issues

- Check available storage space in GitHub
- Verify artifact retention settings
- Ensure file paths in the workflow are correct

## Advanced Configuration

### 1. Custom Build Parameters

Modify the workflow to add custom build flags:

```yaml
- name: Build Tauri app for macOS
  run: |
    cd src-tauri
    pnpm tauri build --target ${{ matrix.target }} -- --release
```

### 2. Additional Platforms

To add Linux support:

```yaml
build-linux:
  runs-on: ubuntu-latest
  strategy:
    matrix:
      target: [x86_64-unknown-linux-gnu, aarch64-unknown-linux-gnu]
  # ... rest of Linux build configuration
```

### 3. Code Signing

For production releases, add code signing:

```yaml
- name: Sign macOS app
  if: matrix.target == 'aarch64-apple-darwin'
  run: |
    codesign --force --deep --sign "Developer ID Application: Your Name" \
      "src-tauri/target/${{ matrix.target }}/release/Resample2.app"
```

## Security Considerations

### 1. Secrets Management

Store sensitive information in GitHub Secrets:

```yaml
- name: Sign Windows executable
  run: |
    # Use secrets for signing certificates
    $env:CERT_PASSWORD = "${{ secrets.CERT_PASSWORD }}"
    # ... signing commands
```

### 2. Dependency Scanning

Add security scanning to your workflow:

```yaml
- name: Run security scan
  uses: actions/dependency-review-action@v3
  with:
    fail-on-severity: moderate
```

## Monitoring and Maintenance

### 1. Build Metrics

Monitor your builds:

- **Success rate**: Track build failures
- **Build time**: Optimize slow builds
- **Artifact size**: Monitor package sizes

### 2. Regular Updates

Keep dependencies updated:

- **Monthly**: Update Python packages
- **Quarterly**: Update Rust dependencies
- **As needed**: Update Node.js packages

### 3. Backup Strategy

- **Repository**: Regular backups of your code
- **Artifacts**: Download and store important releases locally
- **Configuration**: Version control all build configurations

## Support and Resources

- **GitHub Actions Documentation**: https://docs.github.com/en/actions
- **Tauri Build Guide**: https://tauri.app/v1/guides/getting-started/setup
- **Python Packaging**: https://packaging.python.org/
- **Rust Cross-Compilation**: https://rust-lang.github.io/rustup/cross-compilation.html

## Next Steps

After setting up automated deployment:

1. **Test the workflow** with a patch release
2. **Customize release notes** for better user experience
3. **Set up monitoring** for build success rates
4. **Document release process** for your team
5. **Plan major releases** with proper testing cycles
