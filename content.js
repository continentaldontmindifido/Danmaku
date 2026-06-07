(() => {
  'use strict';

  const PERSONALITY_PROMPTS = {
    funny: {
      label: 'Funny & Sarcastic',
      system: 'You are a sarcastic internet commentator watching a video. You can see the current video frame. Generate ONE short, funny, sarcastic comment (max 12 words) reacting to what is literally visible on screen RIGHT NOW. Use internet humor and meme culture. Be specific to what you see. No hashtags. No emojis unless they add to the joke.',
    },
    hype: {
      label: 'Hype & Enthusiastic',
      system: 'You are an extremely hyped sports commentator watching a video. You can see the current video frame. Generate ONE short, energetic, hype comment (max 12 words) reacting to what is literally on screen RIGHT NOW. Be specific to what you can see. Be enthusiastic. No hashtags.',
    },
    analytical: {
      label: 'Analytical & Thoughtful',
      system: 'You are a thoughtful film critic watching a video. You can see the current video frame. Generate ONE brief, insightful observation (max 12 words) about what is literally visible on screen — the scene, composition, facial expressions, or action. Be specific and concise.',
    },
    absurdist: {
      label: 'Absurdist & Random',
      system: 'You are an absurdist philosopher watching a video. You can see the current video frame. Generate ONE completely unexpected, surreal, or nonsensical comment (max 12 words) about what you see on screen. Be weird, creative, and unpredictable. Must relate somehow to the image.',
    },
  };

  const DANMAKU_COLORS = [
    '#FFFFFF', '#FFD700', '#FF69B4', '#00FFFF', '#98FB98',
    '#FFA500', '#FF6B6B', '#87CEEB', '#DDA0DD', '#F0E68C',
    '#7FFFD4', '#FF7F50', '#9ACD32', '#40E0D0', '#EE82EE',
  ];

  const SPEED_DURATIONS = {
    slow: 12,
    medium: 8,
    fast: 5,
  };

  let settings = {
    enabled: true,
    provider: 'openai',
    apiKey: '',
    ollamaEndpoint: 'http://localhost:11434',
    ollamaModel: 'llava',
    speed: 'medium',
    fontSize: 24,
    opacity: 0.9,
    styles: { funny: true, hype: true, analytical: true, absurdist: true },
  };

  let overlay = null;
  let tickInterval = null;
  let isFetching = false;
  let consecutiveErrors = 0;
  const MAX_CONSECUTIVE_ERRORS = 5;

  // ---------------------------------------------------------------------------
  // Persistent port connection to background service worker
  //
  // Strategy:
  //  1. Keep a single long-lived port open — this prevents Chrome from killing
  //     the worker while the port exists.
  //  2. Send a keepalive ping every 25 s so Chrome sees the worker as active
  //     and doesn't terminate it on the 30 s idle timer.
  //  3. Store both the resolve callback AND the original message for each
  //     in-flight request. If the port disconnects mid-request, reconnect and
  //     automatically re-send — the caller never sees the interruption.
  // ---------------------------------------------------------------------------

  let bgPort = null;
  // Map<id, { resolve, msg }>
  const pendingMessages = new Map();
  let msgIdCounter = 0;

  function connectPort() {
    if (bgPort) return bgPort;
    try {
      bgPort = chrome.runtime.connect({ name: 'danmaku-content' });
    } catch {
      bgPort = null;
      return null;
    }

    bgPort.onMessage.addListener((msg) => {
      if (msg.pong) return;
      const entry = pendingMessages.get(msg.id);
      if (entry) {
        pendingMessages.delete(msg.id);
        entry.resolve(msg);
      }
    });

    bgPort.onDisconnect.addListener(() => {
      bgPort = null;

      // Grab everything that was in-flight and try to replay after reconnect.
      const inflight = new Map(pendingMessages);
      pendingMessages.clear();

      if (inflight.size === 0) return;

      // Give Chrome a moment to spin the worker back up, then reconnect & retry.
      setTimeout(() => {
        const port = connectPort();
        for (const [id, { resolve, msg }] of inflight) {
          if (port) {
            pendingMessages.set(id, { resolve, msg });
            try {
              port.postMessage(msg);
            } catch {
              pendingMessages.delete(id);
              resolve({ error: 'Service worker unavailable' });
            }
          } else {
            resolve({ error: 'Service worker unavailable' });
          }
        }
      }, 300);
    });

    return bgPort;
  }

  function sendToBackground(message) {
    return new Promise((resolve) => {
      const id = ++msgIdCounter;
      const fullMsg = { ...message, id };

      const port = connectPort();
      if (!port) {
        resolve({ error: 'Could not connect to background service worker' });
        return;
      }

      pendingMessages.set(id, { resolve, msg: fullMsg });
      try {
        port.postMessage(fullMsg);
      } catch (e) {
        pendingMessages.delete(id);
        bgPort = null;
        resolve({ error: e.message });
      }
    });
  }

  // Keepalive: ping the worker every 25 s so it never hits Chrome's 30 s idle timeout.
  function startKeepalive() {
    setInterval(() => {
      const port = connectPort();
      if (port) {
        try { port.postMessage({ type: 'ping', id: 0 }); } catch { /* ignore */ }
      }
    }, 25000);
  }

  // ---------------------------------------------------------------------------
  // Settings
  // ---------------------------------------------------------------------------

  function loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (result) => {
        if (result.settings) {
          settings = { ...settings, ...result.settings };
          settings.styles = { ...settings.styles, ...(result.settings.styles || {}) };
        }
        resolve(settings);
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Overlay
  // ---------------------------------------------------------------------------

  function ensureOverlay() {
    if (document.getElementById('danmaku-overlay')) {
      overlay = document.getElementById('danmaku-overlay');
      return;
    }
    overlay = document.createElement('div');
    overlay.id = 'danmaku-overlay';
    document.body.appendChild(overlay);
  }

  function removeOverlay() {
    const existing = document.getElementById('danmaku-overlay');
    if (existing) existing.remove();
    overlay = null;
  }

  // ---------------------------------------------------------------------------
  // Video context
  // ---------------------------------------------------------------------------

  function getVideoContext() {
    const hostname = window.location.hostname;
    let platform = 'video';
    let title = document.title || 'a video';

    const video = document.querySelector('video');
    if (!video || video.paused || video.ended) return null;

    const timestamp = Math.floor(video.currentTime);

    if (hostname.includes('youtube.com')) {
      platform = 'YouTube';
      const titleEl =
        document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
        document.querySelector('h1.ytd-video-primary-info-renderer') ||
        document.querySelector('#container h1');
      if (titleEl) title = titleEl.textContent.trim();
    } else if (hostname.includes('netflix.com')) {
      platform = 'Netflix';
      const titleEl =
        document.querySelector('.video-title h4') ||
        document.querySelector('[data-uia="video-title"]') ||
        document.querySelector('.ellipsize-text h4') ||
        document.querySelector('.title-card-title-text');
      if (titleEl) title = titleEl.textContent.trim();
      if (!title || title === document.title) {
        const match = document.title.match(/^(.+?)\s*[-|–]\s*Netflix/);
        if (match) title = match[1].trim();
      }
    }

    const minutes = Math.floor(timestamp / 60);
    const seconds = timestamp % 60;
    const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    return { platform, title, timestamp: timeStr, video };
  }

  // ---------------------------------------------------------------------------
  // Style picker
  // ---------------------------------------------------------------------------

  function pickRandomStyle() {
    const enabled = Object.entries(settings.styles)
      .filter(([, on]) => on)
      .map(([key]) => key);
    if (enabled.length === 0) return null;
    return enabled[Math.floor(Math.random() * enabled.length)];
  }

  // ---------------------------------------------------------------------------
  // Frame capture
  // ---------------------------------------------------------------------------

  function captureVideoFrame(videoEl) {
    try {
      const maxWidth = 640;
      const aspectRatio = videoEl.videoHeight / videoEl.videoWidth;
      const canvas = document.createElement('canvas');
      canvas.width = Math.min(videoEl.videoWidth, maxWidth);
      canvas.height = Math.round(canvas.width * aspectRatio);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg', 0.7);
    } catch {
      return null;
    }
  }

  async function captureScreenshot() {
    if (overlay) overlay.style.visibility = 'hidden';
    await new Promise((r) => requestAnimationFrame(r));
    const response = await sendToBackground({ type: 'capture_frame' });
    if (overlay) overlay.style.visibility = 'visible';
    return response?.dataUrl || null;
  }

  async function getFrameDataUrl(videoEl) {
    const directFrame = captureVideoFrame(videoEl);
    if (directFrame) return directFrame;
    return await captureScreenshot();
  }

  // ---------------------------------------------------------------------------
  // Comment fetching
  // ---------------------------------------------------------------------------

  async function fetchComment(context) {
    if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) return null;

    const provider = settings.provider || 'openai';
    if (provider === 'openai' && !settings.apiKey) return null;

    const styleKey = pickRandomStyle();
    if (!styleKey) return null;

    const systemPrompt = PERSONALITY_PROMPTS[styleKey].system;
    const frameDataUrl = await getFrameDataUrl(context.video);

    const userText = frameDataUrl
      ? `I'm watching "${context.title}" on ${context.platform} at ${context.timestamp}. Here is the current frame. Generate ONE Danmaku comment about what you literally see on screen.`
      : `I'm watching "${context.title}" on ${context.platform} at ${context.timestamp}. Generate ONE Danmaku comment.`;

    const response = await sendToBackground({
      type: 'generate_comment',
      provider,
      apiKey: settings.apiKey,
      ollamaEndpoint: settings.ollamaEndpoint,
      ollamaModel: settings.ollamaModel,
      systemPrompt,
      userText,
      frameDataUrl,
    });

    if (response.error) {
      consecutiveErrors++;
      spawnErrorComment(`[Danmaku] ${response.error}`);
      return null;
    }

    consecutiveErrors = 0;
    return response.comment || null;
  }

  // ---------------------------------------------------------------------------
  // Danmaku rendering
  // ---------------------------------------------------------------------------

  function spawnErrorComment(text) {
    ensureOverlay();
    if (!overlay) return;
    const el = document.createElement('div');
    el.className = 'danmaku-comment';
    el.textContent = text;
    el.style.color = '#FF4444';
    el.style.fontSize = '13px';
    el.style.opacity = '1';
    el.style.top = '5%';
    el.style.animationDuration = '14s';
    overlay.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 16000);
  }

  function spawnComment(text) {
    if (!overlay) return;

    const el = document.createElement('div');
    el.className = 'danmaku-comment';
    el.textContent = text;

    const color = DANMAKU_COLORS[Math.floor(Math.random() * DANMAKU_COLORS.length)];
    const topPercent = 10 + Math.random() * 80;
    const duration = SPEED_DURATIONS[settings.speed] || 8;

    el.style.color = color;
    el.style.fontSize = `${settings.fontSize}px`;
    el.style.opacity = String(settings.opacity);
    el.style.top = `${topPercent}%`;
    el.style.animationDuration = `${duration}s`;

    overlay.appendChild(el);
    el.addEventListener('animationend', () => el.remove(), { once: true });
    setTimeout(() => el.remove(), (duration + 2) * 1000);
  }

  // ---------------------------------------------------------------------------
  // Tick
  // ---------------------------------------------------------------------------

  async function tick() {
    if (isFetching || !settings.enabled) return;
    const context = getVideoContext();
    if (!context) return;

    ensureOverlay();
    isFetching = true;
    try {
      const comment = await fetchComment(context);
      if (comment) spawnComment(comment);
    } finally {
      isFetching = false;
    }
  }

  function startTicking() {
    if (tickInterval) clearInterval(tickInterval);
    tickInterval = setInterval(tick, 5000);
  }

  function stopTicking() {
    if (tickInterval) {
      clearInterval(tickInterval);
      tickInterval = null;
    }
  }

  // ---------------------------------------------------------------------------
  // Init
  // ---------------------------------------------------------------------------

  async function init() {
    connectPort();
    startKeepalive();
    await loadSettings();
    if (settings.enabled) startTicking();

    chrome.storage.onChanged.addListener((changes) => {
      if (changes.settings) {
        const newSettings = changes.settings.newValue;
        settings = { ...settings, ...newSettings };
        settings.styles = { ...settings.styles, ...(newSettings.styles || {}) };

        if (settings.enabled) {
          consecutiveErrors = 0;
          startTicking();
        } else {
          stopTicking();
          removeOverlay();
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
