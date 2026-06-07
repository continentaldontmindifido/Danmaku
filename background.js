chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({
        settings: {
          enabled: true,
          provider: 'openai',
          apiKey: '',
          ollamaEndpoint: 'http://localhost:11434',
          ollamaModel: 'llava',
          speed: 'medium',
          fontSize: 24,
          opacity: 0.9,
          styles: {
            funny: true,
            hype: true,
            analytical: true,
            absurdist: true
          }
        }
      });
    }
  });
});

async function callOpenAI({ apiKey, systemPrompt, userText, frameDataUrl }) {
  const userContent = frameDataUrl
    ? [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: frameDataUrl, detail: 'low' } },
      ]
    : userText;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 40,
      temperature: 1.1,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.status);
    throw new Error(`OpenAI error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

async function callOllama({ ollamaEndpoint, ollamaModel, systemPrompt, userText, frameDataUrl }) {
  const endpoint = `${ollamaEndpoint.replace(/\/$/, '')}/v1/chat/completions`;

  const userContent = frameDataUrl
    ? [
        { type: 'text', text: userText },
        { type: 'image_url', image_url: { url: frameDataUrl } },
      ]
    : userText;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: ollamaModel,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      max_tokens: 40,
      temperature: 1.1,
      stream: false,
    }),
  });

  if (!response.ok) {
    const err = await response.text().catch(() => response.status);
    throw new Error(`Ollama error ${response.status}: ${err}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content?.trim() || null;
}

async function handleMessage(msg, senderTab) {
  const { id, type } = msg;

  if (type === 'ping') {
    return { id, pong: true };
  }

  if (type === 'capture_frame') {
    return new Promise((resolve) => {
      const windowId = senderTab ? senderTab.windowId : chrome.windows.WINDOW_ID_CURRENT;
      chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 55 }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          resolve({ id, error: chrome.runtime.lastError.message });
        } else {
          resolve({ id, dataUrl });
        }
      });
    });
  }

  if (type === 'generate_comment') {
    const { provider, apiKey, ollamaEndpoint, ollamaModel, systemPrompt, userText, frameDataUrl } = msg;
    try {
      const comment = provider === 'ollama'
        ? await callOllama({ ollamaEndpoint, ollamaModel, systemPrompt, userText, frameDataUrl })
        : await callOpenAI({ apiKey, systemPrompt, userText, frameDataUrl });
      return { id, comment };
    } catch (err) {
      return { id, error: err.message };
    }
  }

  return { id, error: `Unknown message type: ${type}` };
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'danmaku-content') return;

  port.onMessage.addListener(async (msg) => {
    try {
      const reply = await handleMessage(msg, port.sender?.tab);
      port.postMessage(reply);
    } catch (err) {
      port.postMessage({ id: msg.id, error: err.message });
    }
  });
});
