# Danmaku AI Commentator — Browser Extension

A Chrome/Edge/Brave browser extension that overlays AI-generated Danmaku (弾幕) style floating comments on Netflix and YouTube videos, powered by OpenAI or a local Ollama model.

## How to Install

### Step 1: Load in Chrome / Edge / Brave

1. Open your browser and go to the Extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`

2. Enable **Developer mode** (toggle in the top-right corner).

3. Click **"Load unpacked"**.

4. Select the `danmaku` folder.

5. The extension will appear with the 弾幕 icon in your toolbar.

## How to Use

1. Click the **弾幕** icon in your browser toolbar to open the settings popup.

2. Choose your **AI provider** (OpenAI or Ollama).

3. Enter your settings and click **Save Settings**.

4. Navigate to **Netflix** or **YouTube** and start playing a video.

5. Every 5 seconds, a comment will float across the screen from right to left!

## Settings

| Setting | Description |
|---------|-------------|
| **On/Off Toggle** | Instantly enable or disable the overlay |
| **Provider** | OpenAI (cloud) or Ollama (local) |
| **OpenAI API Key** | Your personal API key — stored locally only |
| **Ollama Endpoint** | Default: `http://localhost:11434` |
| **Ollama Model** | Default: `llava` — must be a vision-capable model |
| **Comment Speed** | Slow (12s), Medium (8s), or Fast (5s) scroll duration |
| **Font Size** | Size of the floating text (14–48px) |
| **Opacity** | Transparency of comments (10–100%) |
| **Comment Styles** | Funny & Sarcastic, Hype & Enthusiastic, Analytical & Thoughtful, Absurdist & Random |

## Using Ollama (local AI)

Ollama lets you run a vision model on your own machine — no API key needed.

### Step 1 — Install Ollama
Download from [ollama.com](https://ollama.com) and install it.

### Step 2 — Pull a vision model
```bash
ollama pull llava
```
Other supported vision models: `llava-phi3`, `llama3.2-vision`

### Step 3 — Allow cross-origin requests (required)

By default Ollama only accepts requests from the same origin. Chrome extensions send requests from a different origin, so you must set this environment variable before starting Ollama:

**macOS / Linux:**
```bash
OLLAMA_ORIGINS="*" ollama serve
```

**macOS (launchd / persistent):**
```bash
launchctl setenv OLLAMA_ORIGINS "*"
# then restart Ollama from the menu bar
```

**Windows (PowerShell):**
```powershell
$env:OLLAMA_ORIGINS="*"
ollama serve
```

### Step 4 — Configure the extension
- Set Provider to **Ollama**
- Endpoint: `http://localhost:11434`
- Model: `llava` (or whichever model you pulled)
- Click **Save Settings**

## Troubleshooting

**No comments appearing?**
- Make sure the extension is enabled (toggle is on in the popup)
- Check that your API key / Ollama settings are saved
- Make sure the video is actually playing (comments don't appear when paused)
- If something is wrong, a **red error message** will scroll across the screen telling you exactly what failed

**Ollama: "Failed to fetch" or connection refused?**
- Make sure Ollama is running: `ollama serve`
- Make sure you started it with `OLLAMA_ORIGINS="*"` (see above)
- Confirm the model is pulled: `ollama list`

**Ollama: 404 or "model not found"?**
- Run `ollama pull llava` in your terminal
- Make sure the model name in the popup matches exactly what `ollama list` shows

**OpenAI errors?**
- Check your API key and billing status at [platform.openai.com](https://platform.openai.com)

## Privacy & Security

- Your OpenAI API key is stored **only in your browser's local storage** — it never leaves your device except when making direct API calls to OpenAI.
- Ollama runs entirely on your machine — no data leaves your computer.
- The extension only activates on `netflix.com` and `youtube.com`.

## Technical Details

- **Manifest V3** (latest Chrome extension standard)
- All API calls go through the **background service worker** — this is what allows Ollama's `localhost` endpoint to be reached without CORS issues from the page
- Frame capture: tries direct canvas draw first (unencrypted streams), falls back to `captureVisibleTab` (DRM content like Netflix)
- The overlay is hidden momentarily during screenshot so Danmaku text doesn't appear in the captured frame
- CSS animations for smooth right-to-left scrolling; overlay is `pointer-events: none` so it never blocks video controls
- Comments are removed from the DOM after their animation completes
