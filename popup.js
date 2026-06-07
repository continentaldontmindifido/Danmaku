(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const els = {
    enabledToggle: $('enabled-toggle'),
    providerGroup: $('provider-group'),
    openaiSection: $('openai-section'),
    ollamaSection: $('ollama-section'),
    apiKey: $('api-key'),
    toggleKeyBtn: $('toggle-key-visibility'),
    keyStatus: $('key-status'),
    ollamaEndpoint: $('ollama-endpoint'),
    ollamaModel: $('ollama-model'),
    speedGroup: $('speed-group'),
    fontSize: $('font-size'),
    fontSizeValue: $('font-size-value'),
    opacity: $('opacity'),
    opacityValue: $('opacity-value'),
    styleFunny: $('style-funny'),
    styleHype: $('style-hype'),
    styleAnalytical: $('style-analytical'),
    styleAbsurdist: $('style-absurdist'),
    saveBtn: $('save-btn'),
    saveStatus: $('save-status'),
  };

  let currentSpeed = 'medium';
  let currentProvider = 'openai';

  function setProvider(value) {
    currentProvider = value;
    document.querySelectorAll('#provider-group .seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
    els.openaiSection.style.display = value === 'openai' ? '' : 'none';
    els.ollamaSection.style.display = value === 'ollama' ? '' : 'none';
  }

  function setSpeed(value) {
    currentSpeed = value;
    document.querySelectorAll('#speed-group .seg-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.value === value);
    });
  }

  function updateKeyStatus(key) {
    if (!key) {
      els.keyStatus.textContent = 'No API key saved';
      els.keyStatus.className = 'key-status';
    } else if (key.startsWith('sk-') && key.length > 20) {
      els.keyStatus.textContent = `Key saved (${key.slice(0, 7)}...${key.slice(-4)})`;
      els.keyStatus.className = 'key-status valid';
    } else {
      els.keyStatus.textContent = 'Key format looks unusual — check it';
      els.keyStatus.className = 'key-status invalid';
    }
  }

  function getCurrentFormSettings() {
    return {
      enabled: els.enabledToggle.checked,
      provider: currentProvider,
      apiKey: els.apiKey.value.trim(),
      ollamaEndpoint: els.ollamaEndpoint.value.trim() || 'http://localhost:11434',
      ollamaModel: els.ollamaModel.value.trim() || 'llava',
      speed: currentSpeed,
      fontSize: parseInt(els.fontSize.value, 10),
      opacity: parseInt(els.opacity.value, 10) / 100,
      styles: {
        funny: els.styleFunny.checked,
        hype: els.styleHype.checked,
        analytical: els.styleAnalytical.checked,
        absurdist: els.styleAbsurdist.checked,
      },
    };
  }

  function loadSettings() {
    chrome.storage.local.get(['settings'], (result) => {
      const s = result.settings || {};

      els.enabledToggle.checked = s.enabled !== false;

      setProvider(s.provider || 'openai');
      els.apiKey.value = s.apiKey || '';
      updateKeyStatus(s.apiKey || '');

      els.ollamaEndpoint.value = s.ollamaEndpoint || 'http://localhost:11434';
      els.ollamaModel.value = s.ollamaModel || 'llava';

      setSpeed(s.speed || 'medium');

      els.fontSize.value = s.fontSize || 24;
      els.fontSizeValue.textContent = s.fontSize || 24;

      const opacityPct = Math.round((s.opacity || 0.9) * 100);
      els.opacity.value = opacityPct;
      els.opacityValue.textContent = opacityPct;

      const styles = s.styles || {};
      els.styleFunny.checked = styles.funny !== false;
      els.styleHype.checked = styles.hype !== false;
      els.styleAnalytical.checked = styles.analytical !== false;
      els.styleAbsurdist.checked = styles.absurdist !== false;
    });
  }

  function saveSettings(showConfirmation) {
    const settings = getCurrentFormSettings();
    chrome.storage.local.set({ settings }, () => {
      updateKeyStatus(settings.apiKey);
      if (showConfirmation) showSaveConfirmation();
    });
  }

  function showSaveConfirmation() {
    els.saveStatus.textContent = 'Saved!';
    els.saveStatus.classList.add('visible');
    setTimeout(() => els.saveStatus.classList.remove('visible'), 2000);
  }

  els.fontSize.addEventListener('input', () => {
    els.fontSizeValue.textContent = els.fontSize.value;
  });

  els.opacity.addEventListener('input', () => {
    els.opacityValue.textContent = els.opacity.value;
  });

  els.toggleKeyBtn.addEventListener('click', () => {
    els.apiKey.type = els.apiKey.type === 'password' ? 'text' : 'password';
  });

  document.querySelectorAll('#provider-group .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => setProvider(btn.dataset.value));
  });

  document.querySelectorAll('#speed-group .seg-btn').forEach((btn) => {
    btn.addEventListener('click', () => setSpeed(btn.dataset.value));
  });

  els.enabledToggle.addEventListener('change', () => saveSettings(false));

  els.saveBtn.addEventListener('click', () => saveSettings(true));

  loadSettings();
})();
