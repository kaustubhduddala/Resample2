NOTE: At this time the project functions fine, besides that the audio stem separation (atleast on my machine, an M2 Macbook Air) is expected to take just over 48 hours for a 1 minute audio sample (no seriously, 5764 segments at an average of 30 seconds per iteration -- you do the math). That to me is not viable at the moment so I'm pausing development until I can figure out what's going on. Feel free to put in a PR if you can figure it out.


> [!WARNING]
> **EARLY DEVELOPMENT**
>
> This project is currently in an **early development stage** and is not ready for production use.
> The codebase is primarily an Electron + React shell with project tooling; core audio‑separation
> functionality and UI are **not yet implemented** and are subject to major changes.

## Resample2 – Desktop Shell for an AI Audio Separation Tool

Resample2 is intended to become a cross‑platform desktop application for stem separation
(vocals, drums, bass, instruments, etc.).

**This revision of the app only contains the Electron + Vite + React scaffolding and build
pipeline – there is no end‑user functionality yet.**

### Preview

<img width="1152" height="1006" alt="image" src="https://github.com/user-attachments/assets/4f021b68-c3e6-464d-abc2-ea3a08018e05" />

<img width="1150" height="1007" alt="image" src="https://github.com/user-attachments/assets/62c5b6a2-4dfa-43fa-8d6e-e4c393a93ab0" />

<img width="1152" height="1006" alt="image" src="https://github.com/user-attachments/assets/4c382a80-e11c-4b1d-ac3f-2045e798f696" />

### Tech Stack (Current)

- **Electron 39** with **Electron Forge** and Vite plugin
- **React 18** + **TypeScript 5**
- **Vite 6** for bundling (`vite.main.config.ts`, `vite.preload.config.ts`, `vite.renderer.config.ts`)
- **Tailwind CSS** and Radix UI primitives
- **Node.js** runtime with `ytdlp-nodejs` available for future integration

## Status and Roadmap

- **Implemented now**
  - Basic Electron Forge configuration and Vite build setup
  - Empty `src/` directory ready for main / preload / renderer source files
  - Packaging configuration for Windows, macOS, and Linux (ZIP, Squirrel, Deb, RPM)

- **Planned (not yet implemented in this version)**
  - Neural‑network‑powered audio stem separation
  - GPU acceleration and model selection (MDX, Demucs, VR, MDXC, etc.)
  - Full UI for file/URL input, stem selection, and export into a DAW
  - Integrated YouTube/media download and FFmpeg‑based processing

## Getting Started (Development)

### Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** (or another package manager compatible with the existing `package-lock.json`)

### Install Dependencies

```bash
git clone https://github.com/yourusername/Resample2.git
cd Resample2

npm install
```

### Run the Electron App (Recommended)

This starts Electron Forge with the Vite plugin:

```bash
npm run start
```

### Run the Vite Dev Server Only (Browser Preview)

If you just want to develop the React UI in a browser (without Electron):

```bash
npm run dev
```

The dev server listens on port `5173` and opens automatically.

### Build Assets / Package the App

Build the Vite bundles:

```bash
npm run build
```

Package desktop artifacts with Electron Forge:

```bash
npm run package
```

Create platform installers:

```bash
npm run make
```

Artifacts will be placed in the default Electron Forge output directories (for example, `out/`).

## Project Structure (Current)

```text
Resample2/
├── dist/                   # (Currently empty) – can be used for static build artifacts
├── node_modules/           # Installed dependencies
├── src/                    # Electron main / preload / renderer sources (currently empty)
├── forge.config.ts         # Electron Forge + Vite plugin configuration
├── vite.config.ts          # Vite dev server config (React SPA)
├── vite.main.config.ts     # Vite config for Electron main process
├── vite.preload.config.ts  # Vite config for Electron preload script
├── vite.renderer.config.ts # Vite config for renderer build
├── package.json            # Scripts and dependencies
├── LICENSE                 # MIT license
└── README.md               # This file
```

As of this version, no production UI or business logic has been added to `src/`.

## Contributing / Development Notes

- **Primary goal right now** is to flesh out `src/main.ts`, `src/preload.ts`, and the React
  renderer (for example, `src/App.tsx`) while keeping the build pipeline working across platforms.
- Please avoid claiming fully‑functional AI separation features in documentation or marketing
  until they are actually wired into this repository.
- If/when audio‑separation engines (for example, `audio-separator`, UVR, PyTorch models) are
  integrated, this README should be expanded again to describe:
  - Supported models and quality/performance trade‑offs
  - GPU/CPU support and platform‑specific behavior
  - CLI tooling, if exposed

## License

This project is licensed under the **MIT License** – see the [`LICENSE`](LICENSE) file for details.

## Acknowledgments (Planned Integrations / Inspirations)

These projects and authors are **not yet fully integrated in this codebase**, but they are the
primary inspiration and likely upstream dependencies for future work:

- **Audio Separator** – Core audio separation engine
- **yt-dlp** – YouTube and media download capabilities
- **FFmpeg** – Audio/video processing backend
- **React** – Frontend framework
- **PyTorch** – Machine learning framework

Original and upstream work that inspired this project:

- **beveradb (Andrew Beveridge)** – Author of the `audio-separator` CLI and major contributor.
- **Anjok07** – Author of _Ultimate Vocal Remover GUI_, which heavily inspired this project.
- **DilanBoskan** – Early contributions to UVR.
- **Kuielab & Woosung Choi** – Original MDX-Net AI code.
- **KimberleyJSN** – Guidance on training scripts for MDX-Net and Demucs.
- **Hv** – Help implementing chunks into MDX-Net code.
- **zhzhongshi** – Added support for MDXC models in `audio-separator`.

Support channels such as GitHub Issues, Discussions, and a Wiki will be documented once the
project is closer to a usable alpha.

