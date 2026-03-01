# video-frame-analyzer

An MCP (Model Context Protocol) server that extracts key frames from short videos and returns them as base64 JPEG images. Designed for use with Claude Code to enable UI/UX review, state transition analysis, and animation inspection from screen recordings.

短い動画からキーフレームを抽出し、base64 JPEG画像として返却するMCPサーバーです。Claude Codeと組み合わせて、画面録画からUI/UXレビュー・状態遷移の分析・アニメーション確認を行えます。

## How it works / 仕組み

```
[You / ユーザー] → provide a video file path / 動画ファイルパスを指定
  ↓
[video-frame-analyzer MCP] → extract frames via ffmpeg / ffmpegでフレーム抽出
  ↓
[Claude Code] ← receives base64 images + timestamps / base64画像+タイムスタンプで返却 → analyzes visually / 視覚的に分析
```

## Prerequisites / 前提条件

- **Node.js** >= 18
- **ffmpeg** installed and available in PATH (or set `FFMPEG_PATH` env var)
  - PATHに含まれている、または環境変数 `FFMPEG_PATH` で指定

## Installation / インストール

### Claude Code CLI (Recommended / 推奨)

The simplest way to install. Run the following command in your terminal:

最も簡単な方法です。ターミナルで以下のコマンドを実行してください:

```bash
claude mcp add video-frame-analyzer -- npx -y video-frame-analyzer
```

This registers the MCP server with Claude Code. No manual configuration needed.

これだけでClaude CodeにMCPサーバーが登録されます。手動の設定ファイル編集は不要です。

### npx (Direct execution / 直接実行)

You can also run it directly without installation:

インストールなしで直接実行することもできます:

```bash
npx -y video-frame-analyzer
```

### Manual installation / 手動インストール

```bash
git clone https://github.com/keigoly/video-frame-analyzer.git
cd video-frame-analyzer
npm install
npm run build
```

If you installed manually, add the following to your `.mcp.json` (project-level) or `~/.claude/settings.json` (global):

手動インストールの場合、プロジェクトの `.mcp.json` またはグローバルの `~/.claude/settings.json` に以下を追加してください:

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

## Tools / ツール

### `analyze_video`

Extract key frames from a video file. / 動画ファイルからキーフレームを抽出します。

| Parameter | Type | Default | Description |
|---|---|---|---|
| `filePath` | string (required) | - | Absolute path to the video file / 動画ファイルの絶対パス |
| `mode` | `"smart"` \| `"interval"` | `"smart"` | `smart`: scene change detection / シーン変化検出、`interval`: equal intervals / 等間隔抽出 |
| `maxFrames` | number (1-20) | 10 | Maximum number of frames / 最大フレーム数 |
| `sceneThreshold` | number (0.0-1.0) | 0.3 | Scene change sensitivity (lower = more sensitive) / シーン変化感度（低いほど敏感） |

**Returns / 返却値:** A metadata text block (JSON) + N image blocks (JPEG base64 with timestamps). / メタデータ(JSON) + N枚の画像(タイムスタンプ付きJPEG base64)

**Smart mode / スマートモード** uses ffmpeg's scene detection filter to capture frames at meaningful visual transitions. If no scene changes are detected, it automatically falls back to interval mode.

ffmpegのシーン検出フィルタを使い、視覚的に意味のある変化点でフレームを抽出します。シーン変化が検出されない場合は自動的にintervalモードにフォールバックします。

### `get_video_info`

Get video metadata without extracting frames. / フレーム抽出なしで動画のメタデータを取得します。

| Parameter | Type | Description |
|---|---|---|
| `filePath` | string (required) | Absolute path to the video file / 動画ファイルの絶対パス |

**Returns / 返却値:** JSON with duration, resolution, fps, codec, format, and file size. / 再生時間、解像度、fps、コーデック、フォーマット、ファイルサイズを含むJSON

## Supported formats / 対応フォーマット

- `.mp4`
- `.webm`
- `.gif`

Maximum video duration / 最大動画長: **60 seconds / 60秒**

## Use cases / ユースケース

- **UI/UX review / UI/UXレビュー**: Record a short screen capture of a user flow and have Claude analyze layout, spacing, and visual consistency across states / ユーザーフローの画面録画をClaudeに分析させ、レイアウト・余白・状態間の一貫性を確認
- **State transition analysis / 状態遷移の分析**: Capture form submissions, loading states, error handling, and modal interactions / フォーム送信、ローディング、エラー処理、モーダル操作を確認
- **Animation inspection / アニメーション確認**: Review CSS transitions and animations frame by frame / CSSトランジションやアニメーションをフレーム単位で確認
- **Bug reproduction / バグ再現**: Record a bug and let Claude identify the visual issue / バグを録画してClaudeに視覚的な問題を特定させる

## License

MIT
