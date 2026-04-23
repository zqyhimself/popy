// Popy service worker: dynamic MAIN-world registration, context menus,
// commands, badge counter, clipboard history CRUD.

const DEFAULTS = {
  enabled: true,
  disabledSites: [],
  features: {
    unlockCopy: true, superCopy: true, revealHidden: true,
    antiDebug: true, mediaUnlock: true, printUnlock: true,
    pasteUnlock: true, smartFormat: true, history: true, badge: true,
    autoCleanCode: true
  }
};

const HISTORY_MAX = 500;
const MAIN_SCRIPT_ID = 'popy-main-world';

// ─── Lifecycle ───
chrome.runtime.onInstalled.addListener(async () => {
  const cur = await chrome.storage.sync.get();
  const patch = {};
  for (const k of Object.keys(DEFAULTS)) {
    if (cur[k] === undefined) patch[k] = DEFAULTS[k];
  }
  if (Object.keys(patch).length) await chrome.storage.sync.set(patch);
  await setupContextMenus();
  await registerMainWorld();
});

chrome.runtime.onStartup.addListener(async () => {
  await setupContextMenus();
  await registerMainWorld();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'sync') return;
  if (changes.enabled || changes.disabledSites) registerMainWorld();
});

// ─── MAIN-world script registration (per-site disable support) ───
async function registerMainWorld() {
  const { enabled = true, disabledSites = [] } =
    await chrome.storage.sync.get(['enabled', 'disabledSites']);

  try {
    const existing = await chrome.scripting.getRegisteredContentScripts({ ids: [MAIN_SCRIPT_ID] });
    if (existing.length) await chrome.scripting.unregisterContentScripts({ ids: [MAIN_SCRIPT_ID] });
  } catch (_) {}

  if (!enabled) return;

  const excludeMatches = disabledSites
    .map(s => s.trim())
    .filter(Boolean)
    .flatMap(s => [`*://${s}/*`, `*://*.${s}/*`]);

  try {
    await chrome.scripting.registerContentScripts([{
      id: MAIN_SCRIPT_ID,
      matches: ['<all_urls>'],
      excludeMatches: excludeMatches.length ? excludeMatches : undefined,
      js: ['inject-main.js'],
      world: 'MAIN',
      runAt: 'document_start',
      allFrames: true,
      matchOriginAsFallback: true
    }]);
  } catch (err) {
    console.warn('[popy] registerMainWorld failed:', err);
  }
}

// ─── Context menus ───
async function setupContextMenus() {
  await new Promise(r => chrome.contextMenus.removeAll(r));
  const mk = (opts) => chrome.contextMenus.create(opts, () => void chrome.runtime.lastError);

  mk({ id: 'popy-copy-md', title: '✨ 复制为 Markdown', contexts: ['selection'] });
  mk({ id: 'popy-copy-quote', title: '❝ 复制为引用（带出处）', contexts: ['selection'] });
  mk({ id: 'popy-copy-plain', title: '📋 复制为纯文本', contexts: ['selection'] });
  mk({ id: 'popy-sep1', type: 'separator', contexts: ['selection'] });
  mk({ id: 'popy-code-clean', title: '🔤 复制代码（去行号/提示符）', contexts: ['selection'] });
  mk({ id: 'popy-table-csv', title: '📊 复制表格为 CSV', contexts: ['page', 'selection'] });

  mk({ id: 'popy-sep2', type: 'separator', contexts: ['page'] });
  mk({ id: 'popy-reveal', title: '👁 揭示隐藏文字', contexts: ['page'] });
  mk({ id: 'popy-unlock-media', title: '🎬 解锁图片/视频右键', contexts: ['image', 'video'] });

  mk({ id: 'popy-sep3', type: 'separator', contexts: ['page'] });
  mk({ id: 'popy-history', title: '📚 打开剪贴板历史', contexts: ['page'] });
  mk({ id: 'popy-options', title: '⚙️ 选项', contexts: ['page'] });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'popy-history') {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
    return;
  }
  if (info.menuItemId === 'popy-options') {
    chrome.runtime.openOptionsPage();
    return;
  }
  if (tab?.id) {
    chrome.tabs.sendMessage(tab.id, { type: 'menu', id: info.menuItemId }).catch(() => {});
  }
});

// ─── Commands ───
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'open-history') {
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
    return;
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  if (command === 'toggle-site') {
    try {
      const url = new URL(tab.url);
      const host = url.hostname;
      const { disabledSites = [] } = await chrome.storage.sync.get('disabledSites');
      const set = new Set(disabledSites);
      set.has(host) ? set.delete(host) : set.add(host);
      await chrome.storage.sync.set({ disabledSites: [...set] });
      chrome.tabs.reload(tab.id);
    } catch (_) {}
    return;
  }
  chrome.tabs.sendMessage(tab.id, { type: 'command', command }).catch(() => {});
});

// ─── Badge counter + history CRUD ───
const counts = new Map();

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg.type === 'blockCount' && sender.tab?.id) {
        const id = sender.tab.id;
        const n = (counts.get(id) || 0) + (msg.delta || 1);
        counts.set(id, n);
        chrome.action.setBadgeText({ text: n > 999 ? '999+' : String(n), tabId: id });
        chrome.action.setBadgeBackgroundColor({ color: '#2563eb', tabId: id });
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'saveHistory' && msg.entry) {
        const { history = [] } = await chrome.storage.local.get('history');
        history.unshift(msg.entry);
        if (history.length > HISTORY_MAX) history.length = HISTORY_MAX;
        await chrome.storage.local.set({ history });
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'getHistory') {
        const { history = [] } = await chrome.storage.local.get('history');
        sendResponse({ history });
        return;
      }
      if (msg.type === 'clearHistory') {
        await chrome.storage.local.set({ history: [] });
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'deleteHistoryItem' && typeof msg.ts === 'number') {
        const { history = [] } = await chrome.storage.local.get('history');
        await chrome.storage.local.set({ history: history.filter(h => h.ts !== msg.ts) });
        sendResponse({ ok: true });
        return;
      }
      if (msg.type === 'getStats' && sender.tab?.id) {
        sendResponse({ count: counts.get(sender.tab.id) || 0 });
        return;
      }
      sendResponse({});
    } catch (err) {
      sendResponse({ error: String(err) });
    }
  })();
  return true;
});

chrome.tabs.onRemoved.addListener(id => counts.delete(id));
chrome.tabs.onUpdated.addListener((id, info) => {
  if (info.status === 'loading') {
    counts.delete(id);
    chrome.action.setBadgeText({ text: '', tabId: id });
  }
});
