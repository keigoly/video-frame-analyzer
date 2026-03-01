# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MCP (Model Context Protocol) server that extracts key frames from short videos and returns them as base64-encoded JPEG images via stdio transport. Designed for Claude Code integration to enable UI/UX review, state transition analysis, and animation inspection from screen recordings.

## Build & Run Commands

```bash
npm run build          # Compile TypeScript (tsc) → dist/
npm run dev            # Development with hot reload (tsx watch)
npm start              # Run compiled server (node dist/index.js)
```

No test framework is configured. No linter is configured.

## Architecture

The server exposes two MCP tools over stdio:

- **`analyze_video`** — Extracts frames using FFmpeg in two modes: `smart` (scene change detection via `select='gt(scene,threshold)'` filter) or `interval` (equal time spacing via `fps` filter). Smart mode falls back to interval if no scene changes are detected. Returns video metadata JSON + base64 JPEG image content blocks with timestamps.
- **`get_video_info`** — Returns video metadata (duration, resolution, FPS, codec, format, file size) without extracting frames.

### Source modules (`src/`)

| File | Purpose |
|------|---------|
| `index.ts` | MCP server setup, tool registration with Zod schemas, request handling |
| `ffmpeg.ts` | FFmpeg/FFprobe binary discovery (PATH or env vars), video probing, frame extraction in both modes, temp file management |
| `types.ts` | Shared interfaces (`VideoMetadata`, `ExtractedFrame`, `ExtractionOptions`) and constants (`SUPPORTED_EXTENSIONS`, `MAX_DURATION_SECONDS`, `MAX_FRAME_WIDTH`) |
| `validators.ts` | Input validation (file existence, extension check, duration limit) |

### Key constraints

- Supported formats: `.mp4`, `.webm`, `.gif`
- Max video duration: 60 seconds
- Max frame output width: 1280px
- Max frames per extraction: 20
- Requires FFmpeg >= 4.0 on PATH (or `FFMPEG_PATH` / `FFPROBE_PATH` env vars)

### Frame extraction flow

1. Validate input path and file extension
2. Probe video metadata via ffprobe (JSON output)
3. Validate duration limit
4. Extract frames to isolated temp dir (`{tmpdir}/vfa-{uuid}/`) as `frame_NNNN.jpg`
5. Parse timestamps from ffmpeg's `showinfo` filter stderr output
6. Read JPEGs, parse dimensions from SOF0/SOF2 markers, encode to base64
7. Clean up temp directory in finally block
8. Return metadata + image content blocks

## TypeScript Configuration

- Target: ES2022, Module: Node16 (ESM)
- Strict mode enabled
- Output: `dist/` with declarations and source maps
