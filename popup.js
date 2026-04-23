(async function () {
  const gt = document.getElementById('global-toggle');
  const st = document.getElementById('site-toggle');
  const hostLabel = document.getElementById('host-label');
  const statBlocks = document.getElementById('stat-blocks');
  const statHistory = document.getElementById('stat-history');

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  let host = '';
  try { host = tab?.url ? new URL(tab.url).hostname : ''; } catch (_) {}
  const isWeb = /^https?:/i.test(tab?.url || '');
  hostLabel.textContent = isWeb && host ? host : '（不支持的页面）';

  const { enabled = true, disabledSites = [] } =
    await chrome.storage.sync.get(['enabled', 'disabledSites']);
  const { history = [] } = await chrome.storage.local.get('history');

  gt.checked = enabled;
  st.checked = isWeb ? !disabledSites.includes(host) : false;
  st.disabled = !isWeb;
  statHistory.textContent = history.length;

  if (tab?.id) {
    try {
      const txt = await chrome.action.getBadgeText({ tabId: tab.id });
      if (txt) statBlocks.textContent = txt;
    } catch (_) {}
  }

  gt.addEventListener('change', async () => {
    await chrome.storage.sync.set({ enabled: gt.checked });
  });

  st.addEventListener('change', async () => {
    if (!isWeb || !host) return;
    const { disabledSites = [] } = await chrome.storage.sync.get('disabledSites');
    const set = new Set(disabledSites);
    st.checked ? set.delete(host) : set.add(host);
    await chrome.storage.sync.set({ disabledSites: [...set] });
  });

  document.getElementById('open-options').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.querySelectorAll('.action').forEach(btn => {
    btn.addEventListener('click', async () => {
      const a = btn.dataset.action;
      if (a === 'open-history') {
        chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
      } else if (a === 'open-options') {
        chrome.runtime.openOptionsPage();
      } else if (a === 'reveal' && tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'command', command: 'reveal-hidden' }).catch(() => {});
        window.close();
      } else if (a === 'copy-md' && tab?.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'command', command: 'copy-as-markdown' }).catch(() => {});
        window.close();
      }
    });
  });
})();
