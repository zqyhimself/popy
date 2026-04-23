const FEATURE_LIST = [
  ['unlockCopy',     '解除复制限制',            '拦截 copy/cut/contextmenu/selectstart 等事件'],
  ['superCopy',      '超级选择浮动工具条',      '选中文字后出现的小工具栏（复制 / MD / 引用 / 搜索）'],
  ['autoCleanCode',  '复制代码自动清理',        '在 pre/code 里复制时自动去行号、shell 提示符、公共缩进'],
  ['smartFormat',    'Markdown / CSV 格式化',   '右键支持复制为 Markdown、表格转 CSV 等'],
  ['history',        '剪贴板历史记录',          '记录所有通过 Popy 的复制操作（本地，最多 500 条）'],
  ['revealHidden',   '揭示隐藏文字',            '解析 visibility:hidden、透明色、负缩进等反爬手段'],
  ['antiDebug',      '反反调试',                '干掉 setInterval/setTimeout/Function 里的 debugger 陷阱'],
  ['printUnlock',    '打印限制解除',            '禁止打印时强制恢复所有内容可见'],
  ['pasteUnlock',    '粘贴限制解除',            '后台系统禁止粘贴时恢复（由核心拦截器处理）'],
  ['mediaUnlock',    '图片视频右键解锁',        '被禁右键的媒体也能下载 / 拖出'],
  ['badge',          '显示角标计数器',          '图标上显示本页拦截次数']
];

(async function () {
  const container = document.getElementById('features');

  const stored = await chrome.storage.sync.get(['features', 'disabledSites']);
  const features = stored.features || {};
  const disabledSites = stored.disabledSites || [];

  for (const [key, title, desc] of FEATURE_LIST) {
    const row = document.createElement('div');
    row.className = 'feature';
    const checked = features[key] !== false;
    row.innerHTML = `
      <div class="feature-body">
        <div class="feature-title"></div>
        <div class="feature-desc"></div>
      </div>
      <label class="switch">
        <input type="checkbox" data-feature="${key}" ${checked ? 'checked' : ''} />
        <span class="slider"></span>
      </label>
    `;
    row.querySelector('.feature-title').textContent = title;
    row.querySelector('.feature-desc').textContent = desc;
    container.appendChild(row);
  }

  container.addEventListener('change', async (e) => {
    const key = e.target?.dataset?.feature;
    if (!key) return;
    const { features: cur = {} } = await chrome.storage.sync.get('features');
    cur[key] = e.target.checked;
    await chrome.storage.sync.set({ features: cur });
  });

  const textarea = document.getElementById('disabled-sites');
  textarea.value = disabledSites.join('\n');
  textarea.addEventListener('blur', async () => {
    const list = textarea.value.split(/\n+/).map(s => s.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '')).filter(Boolean);
    await chrome.storage.sync.set({ disabledSites: list });
  });

  document.getElementById('export-settings').onclick = async () => {
    const all = await chrome.storage.sync.get();
    const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `popy-settings-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  document.getElementById('import-settings').onclick = () => {
    document.getElementById('import-file').click();
  };
  document.getElementById('import-file').onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (typeof data !== 'object' || !data) throw new Error('格式不正确');
      await chrome.storage.sync.clear();
      await chrome.storage.sync.set(data);
      alert('设置已导入。');
      location.reload();
    } catch (err) {
      alert('导入失败: ' + err.message);
    }
  };

  document.getElementById('reset-settings').onclick = async () => {
    if (!confirm('确认重置所有设置为默认？')) return;
    await chrome.storage.sync.clear();
    location.reload();
  };

  document.getElementById('clear-history').onclick = async () => {
    if (!confirm('确认清空所有剪贴板历史？')) return;
    await chrome.runtime.sendMessage({ type: 'clearHistory' });
    alert('历史已清空。');
  };

  document.getElementById('open-history').onclick = (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: chrome.runtime.getURL('history.html') });
  };
})();
