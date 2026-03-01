# video-frame-analyzer

An MCP (Model Context Protocol) server that extracts key frames from short videos and returns them as base64 JPEG images. Designed for use with Claude Code to enable UI/UX review, state transition analysis, and animation inspection from screen recordings.

## How it works

```
[You] → provide a video file path
  ↓
[video-frame-analyzer MCP] → extract frames via ffmpeg
  ↓
[Claude Code] ← receives base64 images + timestamps → analyzes visually
```

## Prerequisites

- **Node.js** >= 18
- **ffmpeg** installed and available in PATH (or set `FFMPEG_PATH` env var)

## Installation

```bash
git clone https://github.com/skeig/video-frame-analyzer.git
cd video-frame-analyzer
npm install
npm run build
```

## MCP Configuration

Add to your `.mcp.json` (project-level) or `~/.claude/settings.json` (global):

```json
{
  "mcpServers": {
    "video-frame-analyzer": {
      "command": "node",
      "args": ["/path/to/video-frame-analyzer/dist/index.js"]
    }
  }
}
```

## Tools

### `analyze_video`

Extract key frames from a video file.

| Parameter | Type | Default | Description |
|---|---|---|---|
| `filePath` | string (required) | - | Absolute path to the video file |
| `mode` | `"smart"` \| `"interval"` | `"smart"` | `smart` detects scene changes; `interval` extracts at equal intervals |
| `maxFrames` | number (1-20) | 10 | Maximum number of frames to extract |
| `sceneThreshold` | number (0.0-1.0) | 0.3 | Scene change sensitivity for smart mode (lower = more sensitive) |

**Returns:** A metadata text block (JSON) + N image blocks (JPEG base64 with timestamps).

**Smart mode** uses ffmpeg's scene detection filter to capture frames at meaningful visual transitions. If no scene changes are detected (e.g., static content), it automatically falls back to interval mode.

### `get_video_info`

Get video metadata without extracting frames.

| Parameter | Type | Description |
|---|---|---|
| `filePath` | string (required) | Absolute path to the video file |

**Returns:** JSON with duration, resolution, fps, codec, format, and file size.

## Supported formats

- `.mp4`
- `.webm`
- `.gif`

Maximum video duration: **60 seconds**.

## Use cases

- **UI/UX review**: Record a short screen capture of a user flow and have Claude analyze layout, spacing, and visual consistency across states
- **State transition analysis**: Capture form submissions, loading states, error handling, and modal interactions
- **Animation inspection**: Review CSS transitions and animations frame by frame
- **Bug reproduction**: Record a bug and let Claude identify the visual issue

## License

MIT
