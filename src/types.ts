/** Supported video file extensions. */
export const SUPPORTED_EXTENSIONS = [".mp4", ".webm", ".gif"] as const;

/** Maximum allowed video duration in seconds. */
export const MAX_DURATION_SECONDS = 60;

/** Maximum width for extracted frames (aspect ratio preserved). */
export const MAX_FRAME_WIDTH = 1280;

/** Video metadata returned by ffprobe. */
export interface VideoMetadata {
  duration: number;
  width: number;
  height: number;
  fps: number;
  codec: string;
  format: string;
  fileSize: number;
}

/** A single extracted frame with its base64-encoded JPEG data. */
export interface ExtractedFrame {
  index: number;
  timestamp: number;
  data: string; // base64
  width: number;
  height: number;
}

/** Options for frame extraction. */
export interface ExtractionOptions {
  mode: "smart" | "interval";
  maxFrames: number;
  sceneThreshold: number;
  maxWidth: number;
}
