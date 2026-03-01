import { accessSync, constants } from "node:fs";
import { extname } from "node:path";
import { SUPPORTED_EXTENSIONS, MAX_DURATION_SECONDS } from "./types.js";

/**
 * Validate that the file exists and has a supported extension.
 * Returns an error message string, or null if valid.
 */
export function validateFilePath(filePath: string): string | null {
  try {
    accessSync(filePath, constants.R_OK);
  } catch {
    return `File not found or not readable: ${filePath}`;
  }

  const ext = extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.includes(ext as typeof SUPPORTED_EXTENSIONS[number])) {
    return `Unsupported file format "${ext}". Supported formats: ${SUPPORTED_EXTENSIONS.join(", ")}`;
  }

  return null;
}

/**
 * Validate that the video duration is within the allowed limit.
 * Returns an error message string, or null if valid.
 */
export function validateDuration(duration: number): string | null {
  if (duration > MAX_DURATION_SECONDS) {
    return `Video duration ${duration.toFixed(1)}s exceeds the ${MAX_DURATION_SECONDS}s limit. Please provide a shorter video.`;
  }
  return null;
}
