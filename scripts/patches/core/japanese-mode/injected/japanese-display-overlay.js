;(() => {
  'use strict';

  const INSTALL_FLAG = '__zcodeJapaneseDisplayOverlayInstalled';
  if (window[INSTALL_FLAG]) return;
  window[INSTALL_FLAG] = true;

  const MESSAGE_SELECTOR = '.latest-message, .history-message';
  const CONTROL_SELECTOR = '[data-zcode-ja-control]';
  const SKIP_SELECTOR = [
    CONTROL_SELECTOR,
    '[data-zcode-ja-skip]',
    'a',
    'button',
    'canvas',
    'code',
    'input',
    'kbd',
    'pre',
    'samp',
    'select',
    'svg',
    'textarea',
    '[contenteditable="true"]',
    '[data-additions]',
    '[data-code]',
    '[data-deletions]',
    '[data-diff]',
    '[data-gutter]',
    '[data-line]',
    '[data-reasoning-content="true"]',
  ].join(',');
  const HAN_RE = /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g;
  const KANA_RE = /[\u3040-\u30ff\u31f0-\u31ff]/;
  const CHINESE_HINT_RE = /[的一是在不了有和人这中大为上个国我以要他时来用们生到作地于出就分对成会可主发年动同工也能下过子说产种面而方后多定行学法所民得经十三之进着等部度家电力里如水化高自二理起小物现实加量都两体制机当使点从业本去把性好应开它合还因由其些然前外天政四日那社义事平形相全表间样与关各重新线内数正心反你明看原又么利比或但质气第向道命此变条只没结解问意建月公无系军很情者最立代想已通并提直题党程展五果料象员革位入常文总]/;
  const STATE = new WeakMap();
  const PENDING = new WeakMap();
  const MAX_SEGMENTS = 40;
  const MAX_SEGMENT_CHARS = 2500;
  const MAX_TOTAL_CHARS = 12000;
  const DEFAULT_TIMEOUT_MS = 12000;

  function readBool(value) {
    if (value === undefined || value === null || value === '') return undefined;
    return /^(1|true|yes|on)$/i.test(String(value).trim());
  }

  function readNumber(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ''), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  function getLocalStorageValue(key) {
    try {
      return window.localStorage?.getItem(key) ?? undefined;
    } catch {
      return undefined;
    }
  }

  function getConfig() {
    let exposed = {};
    try {
      if (typeof window.zcode?.japaneseModeConfig === 'function') {
        exposed = window.zcode.japaneseModeConfig() || {};
      }
    } catch {
      exposed = {};
    }

    const localEnabled = readBool(getLocalStorageValue('zcode.japaneseMode.enabled'));
    const localAllowRemote = readBool(getLocalStorageValue('zcode.japaneseMode.allowRemote'));
    const localDebug = readBool(getLocalStorageValue('zcode.japaneseMode.debug'));
    const localEndpoint = getLocalStorageValue('zcode.japaneseMode.endpoint');
    const localTimeout = getLocalStorageValue('zcode.japaneseMode.timeoutMs');

    return {
      enabled: localEnabled ?? !!exposed.enabled,
      endpoint: (localEndpoint || exposed.endpoint || '').trim(),
      allowRemote: localAllowRemote ?? !!exposed.allowRemote,
      timeoutMs: readNumber(localTimeout ?? exposed.timeoutMs, DEFAULT_TIMEOUT_MS),
      debug: localDebug ?? !!exposed.debug,
    };
  }

  function log(config, ...args) {
    if (config?.debug) console.debug('[zcode-ja]', ...args);
  }

  function isLoopbackEndpoint(endpoint) {
    try {
      const url = new URL(endpoint);
      const host = url.hostname.toLowerCase();
      return (url.protocol === 'http:' || url.protocol === 'https:') &&
        (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]');
    } catch {
      return false;
    }
  }

  function canUseEndpoint(config) {
    if (!config.enabled || !config.endpoint) return false;
    return config.allowRemote || isLoopbackEndpoint(config.endpoint);
  }

  function hasLikelyChinese(text) {
    const trimmed = text.trim();
    if (trimmed.length < 2 || KANA_RE.test(trimmed)) return false;
    const hanMatches = trimmed.match(HAN_RE);
    const hanCount = hanMatches ? hanMatches.length : 0;
    if (hanCount === 0) return false;
    const compactLength = Math.max(1, trimmed.replace(/\s/g, '').length);
    const hanRatio = hanCount / compactLength;
    return CHINESE_HINT_RE.test(trimmed) ? hanRatio >= 0.08 : hanRatio >= 0.3 && compactLength >= 4;
  }

  function looksStructuralText(text) {
    const trimmed = text.trim();
    if (!trimmed) return true;
    if (/^(```|~~~)/.test(trimmed)) return true;
    if (/^(diff --git|@@\s|[+-]{3}\s|\+\+\+\s|---\s)/m.test(trimmed)) return true;
    if (/^\s*[$>#]\s+\S+/.test(text)) return true;
    if (/^\s*(git|make|npm|pnpm|yarn|node|python3?|pip|docker|kubectl|curl|wget|cd|cp|mv|rm|mkdir|sudo)\s+[-./:\w]/.test(trimmed)) return true;
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) return true;
    if (/^["']?([~.]?\/|[A-Za-z]:\\|[A-Za-z0-9_.-]+\/)[^\s]*["']?$/.test(trimmed)) return true;
    if (/^https?:\/\//i.test(trimmed)) return true;
    return false;
  }

  function isVisibleTextNode(node) {
    const parent = node.parentElement;
    if (!parent || parent.closest(SKIP_SELECTOR)) return false;
    if (parent.closest('[aria-hidden="true"], [hidden]')) return false;
    const text = node.nodeValue || '';
    if (looksStructuralText(text)) return false;
    if (!hasLikelyChinese(text)) return false;
    const range = document.createRange();
    try {
      range.selectNodeContents(parent);
      return range.getClientRects().length > 0;
    } finally {
      range.detach?.();
    }
  }

  function collectRecords(root) {
    const records = [];
    let totalChars = 0;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return isVisibleTextNode(node) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      },
    });
    while (records.length < MAX_SEGMENTS) {
      const node = walker.nextNode();
      if (!node) break;
      const text = node.nodeValue || '';
      if (text.length > MAX_SEGMENT_CHARS) continue;
      if (totalChars + text.length > MAX_TOTAL_CHARS) break;
      totalChars += text.length;
      records.push({ node, original: text, translated: null });
    }
    return records;
  }

  function hashRecords(records) {
    let hash = 2166136261;
    for (const record of records) {
      const text = record.original;
      for (let i = 0; i < text.length; i += 1) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
      hash ^= 10;
      hash = Math.imul(hash, 16777619);
    }
    return String(hash >>> 0);
  }

  function setShowingOriginal(root, showOriginal) {
    const state = STATE.get(root);
    if (!state) return;
    state.showingOriginal = showOriginal;
    for (const record of state.records) {
      if (!record.node.isConnected || !record.translated) continue;
      record.node.nodeValue = showOriginal ? record.original : record.translated;
    }
    updateControl(root);
  }

  function ensureStyle() {
    if (document.getElementById('zcode-ja-display-style')) return;
    const style = document.createElement('style');
    style.id = 'zcode-ja-display-style';
    style.textContent = `
.zcode-ja-control{align-items:center;display:flex;gap:6px;margin-top:2px;min-height:24px}
.zcode-ja-control button{background:transparent;border:1px solid color-mix(in srgb,currentColor 22%,transparent);border-radius:6px;color:inherit;cursor:pointer;font:inherit;font-size:12px;line-height:18px;opacity:.72;padding:1px 8px}
.zcode-ja-control button:hover{opacity:1}
.zcode-ja-control span{font-size:12px;opacity:.56}
`;
    document.head.appendChild(style);
  }

  function updateControl(root) {
    const state = STATE.get(root);
    let control = root.querySelector(CONTROL_SELECTOR);
    if (!state || state.records.length === 0) {
      control?.remove();
      return;
    }
    ensureStyle();
    if (!control) {
      control = document.createElement('div');
      control.className = 'zcode-ja-control';
      control.dataset.zcodeJaControl = 'true';
      control.dataset.zcodeJaSkip = 'true';
      const button = document.createElement('button');
      button.type = 'button';
      button.addEventListener('click', () => setShowingOriginal(root, !STATE.get(root)?.showingOriginal));
      const badge = document.createElement('span');
      control.append(button, badge);
      root.appendChild(control);
    }
    const button = control.querySelector('button');
    const badge = control.querySelector('span');
    const nextButtonText = state.showingOriginal ? '訳文を表示' : '原文を表示';
    const nextBadgeText = state.loading ? '翻訳中' : '日本語訳';
    if (button && button.textContent !== nextButtonText) button.textContent = nextButtonText;
    if (badge && badge.textContent !== nextBadgeText) badge.textContent = nextBadgeText;
  }

  async function fetchTranslations(config, records, messageId) {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const segments = records.map((record, index) => ({ id: String(index), text: record.original }));
      const response = await fetch(config.endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceLanguage: 'zh',
          targetLanguage: 'ja',
          messageId: messageId || null,
          segments,
        }),
        credentials: 'omit',
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return parseTranslationResponse(await response.json(), records.length);
    } finally {
      window.clearTimeout(timer);
    }
  }

  function parseTranslationResponse(data, expectedCount) {
    if (!data || typeof data !== 'object') return [];
    if (Array.isArray(data.segments)) {
      const out = new Array(expectedCount).fill(null);
      for (const item of data.segments) {
        const index = Number.parseInt(String(item?.id ?? ''), 10);
        const text = item?.text ?? item?.translatedText ?? item?.translation;
        if (Number.isInteger(index) && index >= 0 && index < expectedCount && typeof text === 'string') {
          out[index] = text;
        }
      }
      return out;
    }
    if (Array.isArray(data.translations)) {
      return data.translations.map((item) => {
        if (typeof item === 'string') return item;
        return item?.text ?? item?.translatedText ?? item?.translation ?? null;
      });
    }
    if (expectedCount === 1 && typeof data.text === 'string') return [data.text];
    if (expectedCount === 1 && typeof data.translatedText === 'string') return [data.translatedText];
    return [];
  }

  async function processMessage(root) {
    const config = getConfig();
    if (!canUseEndpoint(config) || !root.isConnected) return;

    const records = collectRecords(root);
    if (records.length === 0) {
      const existing = STATE.get(root);
      if (existing?.records.some((record) => record.node.isConnected)) {
        updateControl(root);
        return;
      }
      STATE.delete(root);
      updateControl(root);
      return;
    }

    const hash = hashRecords(records);
    const existing = STATE.get(root);
    if (existing?.hash === hash && existing.records.every((record) => record.translated)) {
      updateControl(root);
      return;
    }

    const state = { hash, records, showingOriginal: false, loading: true };
    STATE.set(root, state);
    updateControl(root);

    try {
      const messageId = root.closest('[data-message-id]')?.getAttribute('data-message-id') || '';
      const translated = await fetchTranslations(config, records, messageId);
      if (STATE.get(root) !== state || !root.isConnected) return;
      for (let index = 0; index < records.length; index += 1) {
        const next = translated[index];
        if (typeof next !== 'string' || !next.trim()) continue;
        const record = records[index];
        record.translated = next;
        if (record.node.isConnected && record.node.nodeValue === record.original) {
          record.node.nodeValue = next;
        }
      }
      state.loading = false;
      updateControl(root);
      log(config, 'translated message', { records: records.length, messageId });
    } catch (error) {
      if (STATE.get(root) === state) {
        state.loading = false;
        updateControl(root);
      }
      log(config, 'translation failed', error);
    }
  }

  function schedule(root) {
    if (!root || !(root instanceof Element)) return;
    const previous = PENDING.get(root);
    if (previous) window.clearTimeout(previous);
    PENDING.set(root, window.setTimeout(() => {
      PENDING.delete(root);
      processMessage(root);
    }, 900));
  }

  function findMessageRoot(target) {
    if (!(target instanceof Node)) return null;
    const element = target.nodeType === Node.ELEMENT_NODE ? target : target.parentElement;
    return element?.closest?.(MESSAGE_SELECTOR) || null;
  }

  function scan() {
    if (!canUseEndpoint(getConfig())) return;
    document.querySelectorAll(MESSAGE_SELECTOR).forEach(schedule);
  }

  function boot() {
    scan();
    const observer = new MutationObserver((mutations) => {
      const seen = new Set();
      for (const mutation of mutations) {
        const root = findMessageRoot(mutation.target);
        if (root) seen.add(root);
        for (const node of mutation.addedNodes) {
          const addedRoot = findMessageRoot(node);
          if (addedRoot) seen.add(addedRoot);
          if (node instanceof Element) {
            node.querySelectorAll?.(MESSAGE_SELECTOR).forEach((messageRoot) => seen.add(messageRoot));
          }
        }
      }
      seen.forEach(schedule);
    });
    observer.observe(document.body, { childList: true, characterData: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
