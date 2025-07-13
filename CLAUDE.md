# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

**Package Manager**: This project uses `pnpm` exclusively (enforced by preinstall script).

```bash
# Development
pnpm dev              # Start development server with hot reload
pnpm start            # Preview built application

# Building
pnpm build            # Full build with type checking
pnpm typecheck        # Run type checks (node + web)
pnpm typecheck:node   # Type check main process code
pnpm typecheck:web    # Type check renderer process code

# Code Quality
pnpm lint             # ESLint code checking
pnpm format           # Prettier code formatting

# Platform-specific builds
pnpm build:win        # Windows build
pnpm build:mac        # macOS build (Universal)
pnpm build:mac:arm64  # macOS ARM64 build
pnpm build:mac:x64    # macOS Intel x64 build
pnpm build:linux      # Linux build
pnpm build:unpack     # Build without packaging (for testing)
```

**Always run `pnpm typecheck` before committing changes.**

## Architecture Overview

This is an Electron application built with Vue 3 + TypeScript using a **Presenter Pattern** for clean separation between main and renderer processes.

### Core Architecture Components

**1. Presenter Pattern (`src/main/presenter/`)**
- `WindowPresenter`: Manages browser windows and window operations
- `ProtocolPresenter`: Handles custom protocol schemes (`eacompressor://`, `eacompressor-file://`)
- `NodeCompressPresenter`: Manages image compression using Node.js libraries
- `Presenter` (main): Coordinates all presenters and provides unified IPC interface

**2. IPC Communication (`src/shared/presenter.d.ts`)**
- Unified interface definitions for all presenter methods
- Type-safe communication between main and renderer processes
- Uses `presenter:call` IPC channel with automatic method routing

**3. Renderer Integration (`src/renderer/src/composables/usePresenter.ts`)**
- `usePresenter()` composable provides type-safe access to main process functionality
- Automatic serialization of complex objects (TypedArrays, ArrayBuffers)
- Proxy-based method calling with error handling

### Process Architecture

**Main Process** (`src/main/`):
- Entry point: `src/main/index.ts`
- Custom protocol registration for file handling
- Performance optimizations with command line switches
- Platform-specific configurations

**Renderer Process** (`src/renderer/`):
- Vue 3 SPA with TypeScript
- Two entry points: main app (`index.html`) and preview window (`preview/index.html`)
- UnoCSS for styling, Vue Router for navigation
- Auto-imports for Vue composables and components

**Preload Script** (`src/preload/`):
- Exposes secure IPC bridge to renderer process
- Type definitions in `index.d.ts`

### Key File Locations

- **Main application logic**: `src/main/presenter/`
- **Renderer composables**: `src/renderer/src/composables/`
- **Shared types**: `src/shared/presenter.d.ts`
- **Build configuration**: `electron.vite.config.ts`
- **ESLint rules**: `eslint.config.mjs` (TypeScript + Vue rules)

### Image Compression System

The application uses a multi-engine approach:
- **@awesome-compressor/node-image-compression**: Primary Node.js compression
- **browser-compress-image**: Browser-based compression fallback
- **CompressorJS**: Lightweight browser compression
- **gifsicle-wasm-browser**: Specialized GIF compression

Compression operations return `NodeCompressionStats` with results from all engines, allowing the system to choose the best compression ratio.

### Development Notes

- Uses `electron-vite` for development and building
- Vite plugins: Vue SFC, Pages routing, Auto-imports, UnoCSS
- TypeScript strict mode enabled
- Vue 3 Composition API with `<script setup lang="ts">`
- ESLint with Vue-specific rules and Prettier integration

### Window Management

- Main application window for compression interface
- Separate preview windows for before/after image comparison
- Windows can be minimized, maximized, closed independently
- macOS-specific app lifecycle handling (dock activation)

### Protocol Handling

Custom schemes registered:
- `eacompressor://`: Main application protocol
- `eacompressor-file://`: File handling protocol

Used for deep linking and file association handling.