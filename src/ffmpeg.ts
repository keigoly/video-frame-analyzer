import { execFile } from "node:child_process";
import { readdir, readFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { promisify } from "node:util";
import type { VideoMetadata, ExtractedFrame, ExtractionOptions } from "./types.js";
import { MAX_FRAME_WIDTH } from "./types.js";

const execFileAsync = promisify(execFile);

// ── FFmpeg / FFprobe path resolution ────────────────────────────────────────

let cachedFFmpegPath: string | null = null;
let cachedFFprobePath: string | null = null;

async function which(cmd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync("where", [cmd]);
    const first = stdout.trim().split(/\r?\n/)[0];
    if (first) return first;
  } catch { /* not found */ }
  throw new Error(`${cmd} not found in PATH`);
}

export async function findFFmpeg(): Promise<string> {
  if (cachedFFmpegPath) return cachedFFmpegPath;
  if (process.env.FFMPEG_PATH) {
    cachedFFmpegPath = process.env.FFMPEG_PATH;
    return cachedFFmpegPath;
  }
  cachedFFmpegPath = await which("ffmpeg");
  return cachedFFmpegPath;
}

async function findFFprobe(): Promise<string> {
  if (cachedFFprobePath) return cachedFFprobePath;
  if (process.env.FFPROBE_PATH) {
    cachedFFprobePath = process.env.FFPROBE_PATH;
    return cachedFFprobePath;
  }
  cachedFFprobePath = await which("ffprobe");
  return cachedFFprobePath;
}

// ── Probe ───────────────────────────────────────────────────────────────────

export async function probeVideo(filePath: string): Promise<VideoMetadata> {
  const ffprobe = await findFFprobe();
  const { stdout } = await execFileAsync(ffprobe, [
    "-v", "quiet",
    "-print_format", "json",
    "-show_format",
    "-show_streams",
    "-select_streams", "v:0",
    filePath,
  ]);

  const data = JSON.parse(stdout);
  const stream = data.streams?.[0];
  const format = data.format;

  if (!stream) {
    throw new Error("No video stream found in file");
  }

  // Parse fps from r_frame_rate (e.g. "30/1" or "30000/1001")
  let fps = 30;
  if (stream.r_frame_rate) {
    const [num, den] = stream.r_frame_rate.split("/").map(Number);
    if (den && den > 0) fps = num / den;
  }

  return {
    duration: parseFloat(format?.duration ?? stream.duration ?? "0"),
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    fps: Math.round(fps * 100) / 100,
    codec: stream.codec_name ?? "unknown",
    format: format?.format_name ?? "unknown",
    fileSize: parseInt(format?.size ?? "0", 10),
  };
}

// ── Frame extraction ────────────────────────────────────────────────────────

async function createTmpDir(): Promise<string> {
  const dir = join(tmpdir(), `vfa-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Smart mode: detect scene changes using ffmpeg's scene filter.
 * Falls back to interval mode if no frames are detected.
 */
export async function extractFramesSmart(
  filePath: string,
  options: ExtractionOptions,
): Promise<ExtractedFrame[]> {
  const ffmpeg = await findFFmpeg();
  const tmpDir = await createTmpDir();

  try {
    const vf = `select='gt(scene,${options.sceneThreshold})',scale='min(${options.maxWidth},iw):-2',format=yuvj420p,showinfo`;

    let stderr = "";
    try {
      const result = await execFileAsync(ffmpeg, [
        "-i", filePath,
        "-vf", vf,
        "-fps_mode", "vfr",
        "-frames:v", String(options.maxFrames),
        "-q:v", "2",
        "-f", "image2",
        join(tmpDir, "frame_%04d.jpg"),
      ], { maxBuffer: 50 * 1024 * 1024 });
      stderr = result.stderr;
    } catch (e: unknown) {
      // ffmpeg exits non-zero when 0 frames are produced; check if files exist
      if (e && typeof e === "object" && "stderr" in e) {
        stderr = (e as { stderr: string }).stderr;
      }
    }

    const frames = await readFramesFromDir(tmpDir);

    if (frames.length === 0) {
      // No scene changes detected — fallback to interval mode
      await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
      return extractFramesInterval(filePath, options);
    }

    // Parse timestamps from showinfo in stderr
    const timestamps = parseShowInfoTimestamps(stderr);
    for (let i = 0; i < frames.length; i++) {
      frames[i].timestamp = timestamps[i] ?? 0;
    }

    return frames;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Interval mode: extract frames at regular intervals.
 */
export async function extractFramesInterval(
  filePath: string,
  options: ExtractionOptions,
  duration?: number,
): Promise<ExtractedFrame[]> {
  const ffmpeg = await findFFmpeg();
  const tmpDir = await createTmpDir();

  try {
    // If duration not provided, probe it
    let dur = duration;
    if (dur === undefined) {
      const meta = await probeVideo(filePath);
      dur = meta.duration;
    }

    const interval = dur / options.maxFrames;
    const vf = `fps=1/${Math.max(interval, 0.1)},scale='min(${options.maxWidth},iw):-2',format=yuvj420p,showinfo`;

    const { stderr } = await execFileAsync(ffmpeg, [
      "-i", filePath,
      "-vf", vf,
      "-frames:v", String(options.maxFrames),
      "-q:v", "2",
      "-f", "image2",
      join(tmpDir, "frame_%04d.jpg"),
    ], { maxBuffer: 50 * 1024 * 1024 });

    const frames = await readFramesFromDir(tmpDir);

    // Parse timestamps from showinfo
    const timestamps = parseShowInfoTimestamps(stderr);
    for (let i = 0; i < frames.length; i++) {
      frames[i].timestamp = timestamps[i] ?? (i * interval);
    }

    return frames;
  } finally {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Read JPEG files from a directory and return as base64-encoded ExtractedFrame[]. */
async function readFramesFromDir(dir: string): Promise<ExtractedFrame[]> {
  const files = (await readdir(dir))
    .filter((f) => f.endsWith(".jpg"))
    .sort();

  const frames: ExtractedFrame[] = [];

  for (let i = 0; i < files.length; i++) {
    const buf = await readFile(join(dir, files[i]));
    // Parse JPEG dimensions from SOF marker
    const { width, height } = parseJpegDimensions(buf);
    frames.push({
      index: i + 1,
      timestamp: 0,
      data: buf.toString("base64"),
      width,
      height,
    });
  }

  return frames;
}

/** Parse pts_time values from ffmpeg showinfo filter output. */
function parseShowInfoTimestamps(stderr: string): number[] {
  const timestamps: number[] = [];
  const regex = /pts_time:\s*([\d.]+)/g;
  let match;
  while ((match = regex.exec(stderr)) !== null) {
    timestamps.push(parseFloat(match[1]));
  }
  return timestamps;
}

/** Extract width/height from JPEG SOF0/SOF2 marker. */
function parseJpegDimensions(buf: Buffer): { width: number; height: number } {
  // Scan for SOF markers (0xFFC0-0xFFC3)
  for (let i = 0; i < buf.length - 8; i++) {
    if (buf[i] === 0xff && (buf[i + 1] >= 0xc0 && buf[i + 1] <= 0xc3) && buf[i + 1] !== 0xc1) {
      const height = buf.readUInt16BE(i + 5);
      const width = buf.readUInt16BE(i + 7);
      if (width > 0 && height > 0) return { width, height };
    }
  }
  return { width: 0, height: 0 };
}
