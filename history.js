(async function () {
  const list = document.getElementById('list');
  const empty = document.getElementById('empty');
  const search = document.getElementById('search');
  const filterKind = document.getElementById('filter-kind');
  const countEl = document.getElementById('count');

  let all = [];

  async function load() {
    const res = await chrome.runtime.sendMessage({ type: 'getHistory' });
    all = res?.history || [];
    render();
  }

  function render() {
    const q = search.value.trim().toLowerCase();
    const kind = filterKind.value;
    const filtered = all.filter(h => {
      if (kind && h.kind !== kind) return false;
      if (q) {
        const hay = `${h.text} ${h.host} ${h.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    countEl.textContent = `${filtered.length}${filtered.length !== all.length ? ` / ${all.length}` : ''}`;

    if (!filtered.length) {
      list.innerHTML = '';
      empty.classList.add('show');
      empty.textContent = all.length ? '没有匹配的记录' : '还没有记录 — 去复制一段文字看看吧';
      return;
    }
    empty.classList.remove('show');

    list.innerHTML = filtered.map(h => `
      <div class="item" data-ts="${h.ts}">
        <div class="item-header">
          <div class="item-header-left">
            <span class="badge ${escapeAttr(h.kind || 'copy')}">${escapeHtml(h.kind || 'copy')}</span>
            <a class="source" href="${escapeAttr(h.url || '#')}" target="_blank" rel="noopener" title="${escapeAttr(h.title || '')}">
              ${escapeHtml(h.host || '')} · ${escapeHtml(h.title || '')}
            </a>
          </div>
          <span class="time">${formatTime(h.ts)}</span>
        </div>
        <div class="text">${escapeHtml(h.text)}</div>
        <div class="item-actions">
          <button data-act="copy">📋 再次复制</button>
          <button data-act="del" class="del">删除</button>
        </div>
      </div>
    `).join('');
  }

  list.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const item = btn.closest('.item');
    const ts = Number(item.dataset.ts);
    const act = btn.dataset.act;
    const entry = all.find(h => h.ts === ts);
    if (!entry) return;
    if (act === 'copy') {
      await navigator.clipboard.writeText(entry.text);
      btn.textContent = '✓ 已复制';
      setTimeout(() => { btn.textContent = '📋 再次复制'; }, 1200);
    } else if (act === 'del') {
      await chrome.runtime.sendMessage({ type: 'deleteHistoryItem', ts });
      all = all.filter(h => h.ts !== ts);
      render();
    }
  });

  search.addEventListener('input', render);
  filterKind.addEventListener('change', render);

  document.getElementById('export').onclick = () => {
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `popy-history-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.getElementById('clear').onclick = async () => {
    if (!confirm('确认清空所有历史？')) return;
    await chrome.runtime.sendMessage({ type: 'clearHistory' });
    all = [];
    render();
  };

  function formatTime(ts) {
    const d = new Date(ts);
    const diff = Date.now() - ts;
    if (diff < 60_000) return '刚刚';
    if (diff < 3_600_000) return Math.floor(diff / 60_000) + ' 分钟前';
    if (diff < 86_400_000) return Math.floor(diff / 3_600_000) + ' 小时前';
    return d.toLocaleString('zh-CN', { hour12: false });
  }
  function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s); }

  await load();
})();
