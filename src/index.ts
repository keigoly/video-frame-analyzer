#!/usr/bin/env node
/**
 * MCP Server: video-frame-analyzer
 *
 * Extracts key frames from short videos and returns them as base64 images
 * for Claude to analyze UI flows, state transitions, and animations.
 * Transport: stdio (for local Claude Code integration).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { findFFmpeg, probeVideo, extractFramesSmart, extractFramesInterval } from "./ffmpeg.js";
import { validateFilePath, validateDuration } from "./validators.js";
import { MAX_FRAME_WIDTH } from "./types.js";
import type { ExtractionOptions } from "./types.js";

// ── Server ──────────────────────────────────────────────────────────────────

const server = new McpServer({
  name: "video-frame-analyzer",
  version: "1.0.0",
});

// ── Schemas ─────────────────────────────────────────────────────────────────

const AnalyzeVideoSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe("Absolute path to the video file (.mp4, .webm, .gif)"),
  mode: z
    .enum(["smart", "interval"])
    .default("smart")
    .describe("Extraction mode: 'smart' detects scene changes, 'interval' extracts at equal intervals (default: smart)"),
  maxFrames: z
    .number()
    .int()
    .min(1)
    .max(20)
    .default(10)
    .describe("Maximum number of frames to extract (1-20, default: 10)"),
  sceneThreshold: z
    .number()
    .min(0)
    .max(1)
    .default(0.3)
    .describe("Scene change detection threshold for smart mode (0.0-1.0, default: 0.3). Lower = more sensitive"),
}).strict();

const GetVideoInfoSchema = z.object({
  filePath: z
    .string()
    .min(1)
    .describe("Absolute path to the video file"),
}).strict();

// ── Tools ───────────────────────────────────────────────────────────────────

server.registerTool(
  "analyze_video",
  {
    title: "Analyze Video Frames",
    description: `Extract key frames from a short video file and return them as images for visual analysis.

Supports .mp4, .webm, and .gif files up to 60 seconds.

Two extraction modes:
- "smart" (default): Detects scene changes to capture meaningful transitions. Falls back to interval mode if no scene changes are detected.
- "interval": Extracts frames at equal time intervals.

Returns a metadata text block followed by JPEG image blocks with timestamps. Use this to review UI flows, state transitions, animations, and visual changes in short screen recordings.

Args:
  - filePath (string): Absolute path to the video file
  - mode ("smart" | "interval"): Extraction mode (default: "smart")
  - maxFrames (number 1-20): Maximum frames to extract (default: 10)
  - sceneThreshold (number 0-1): Scene change sensitivity for smart mode (default: 0.3)`,
    inputSchema: AnalyzeVideoSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    try {
      // Validate file
      const fileError = validateFilePath(params.filePath);
      if (fileError) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: fileError }],
        };
      }

      // Probe video metadata
      const metadata = await probeVideo(params.filePath);

      // Validate duration
      const durationError = validateDuration(metadata.duration);
      if (durationError) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: durationError }],
        };
      }

      // Build extraction options
      const options: ExtractionOptions = {
        mode: params.mode,
        maxFrames: params.maxFrames,
        sceneThreshold: params.sceneThreshold,
        maxWidth: MAX_FRAME_WIDTH,
      };

      // Extract frames
      const frames = params.mode === "smart"
        ? await extractFramesSmart(params.filePath, options)
        : await extractFramesInterval(params.filePath, options, metadata.duration);

      if (frames.length === 0) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: "No frames could be extracted from the video." }],
        };
      }

      // Build response: metadata text + image blocks
      const metadataBlock = {
        type: "text" as const,
        text: JSON.stringify({
          file: params.filePath,
          duration: metadata.duration,
          resolution: `${metadata.width}x${metadata.height}`,
          fps: metadata.fps,
          codec: metadata.codec,
          mode: params.mode,
          framesExtracted: frames.length,
          timestamps: frames.map((f) => ({
            frame: f.index,
            time: `${f.timestamp.toFixed(2)}s`,
          })),
        }, null, 2),
      };

      const imageBlocks = frames.map((frame) => ({
        type: "image" as const,
        data: frame.data,
        mimeType: "image/jpeg" as const,
      }));

      return {
        content: [metadataBlock, ...imageBlocks],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error analyzing video: ${error instanceof Error ? error.message : String(error)}`,
        }],
      };
    }
  },
);

server.registerTool(
  "get_video_info",
  {
    title: "Get Video Info",
    description: `Get metadata about a video file without extracting frames.

Returns JSON with duration, resolution, fps, codec, format, and file size.

Args:
  - filePath (string): Absolute path to the video file`,
    inputSchema: GetVideoInfoSchema,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params) => {
    try {
      const fileError = validateFilePath(params.filePath);
      if (fileError) {
        return {
          isError: true,
          content: [{ type: "text" as const, text: fileError }],
        };
      }

      const metadata = await probeVideo(params.filePath);
      return {
        content: [{
          type: "text" as const,
          text: JSON.stringify({
            file: params.filePath,
            duration: `${metadata.duration.toFixed(2)}s`,
            resolution: `${metadata.width}x${metadata.height}`,
            fps: metadata.fps,
            codec: metadata.codec,
            format: metadata.format,
            fileSize: `${(metadata.fileSize / 1024 / 1024).toFixed(2)} MB`,
          }, null, 2),
        }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{
          type: "text" as const,
          text: `Error getting video info: ${error instanceof Error ? error.message : String(error)}`,
        }],
      };
    }
  },
);

// ── Start ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  // Pre-check ffmpeg availability (warn only, don't block startup)
  try {
    const ffmpegPath = await findFFmpeg();
    console.error(`video-frame-analyzer v1.0.0: ffmpeg found at ${ffmpegPath}`);
  } catch {
    console.error("video-frame-analyzer v1.0.0: WARNING - ffmpeg not found. Tools will fail until ffmpeg is available.");
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("video-frame-analyzer v1.0.0 running via stdio");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
