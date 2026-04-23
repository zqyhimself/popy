// Content script (isolated world). Runs at document_start.
// Handles: CSS unlock, inline attribute cleanup, super-copy toolbar,
// reveal-hidden, smart code cleanup on copy, history recording, and
// dispatches command / context-menu messages.
(async function () {
  'use strict';
  if (window.__popyContentLoaded) return;
  window.__popyContentLoaded = true;

  const DEFAULT_FEATURES = {
    unlockCopy: true, superCopy: true, revealHidden: true,
    antiDebug: true, mediaUnlock: true, printUnlock: true,
    pasteUnlock: true, smartFormat: true, history: true, badge: true,
    autoCleanCode: true
  };

  const { enabled = true, disabledSites = [], features = {} } =
    await chrome.storage.sync.get(['enabled', 'disabledSites', 'features']);

  const host = location.hostname;
  const siteEnabled = enabled && !disabledSites.includes(host);
  const F = { ...DEFAULT_FEATURES, ...features };

  if (!siteEnabled) return;

  // ─────────────────────────────────────────────────────────────
  // 1. CSS unlock
  // ─────────────────────────────────────────────────────────────
  if (F.unlockCopy) {
    const applyCss = () => {
      if (document.head?.querySelector('style[data-popy]')) return;
      const s = document.createElement('style');
      s.dataset.popy = 'unlock';
      s.textContent = `
        *, *::before, *::after {
          -webkit-user-select: text !important;
          -moz-user-select: text !important;
          -ms-user-select: text !important;
          user-select: text !important;
          -webkit-touch-callout: default !important;
        }
        html, body { user-select: text !important; }
      `;
      (document.head || document.documentElement).appendChild(s);
    };
    if (document.head || document.documentElement) applyCss();
    else document.addEventListener('DOMContentLoaded', applyCss, { once: true });
  }

  // ─────────────────────────────────────────────────────────────
  // 2. Inline attribute cleanup + MutationObserver
  // ─────────────────────────────────────────────────────────────
  const DIRTY = ['oncopy','oncut','onpaste','oncontextmenu','onselectstart','onmousedown','onmouseup','ondragstart','unselectable'];
  const DIRTY_SEL = DIRTY.map(a => `[${a}]`).join(',');

  const clean = (el) => {
    if (!el || el.nodeType !== 1) return;
    for (const a of DIRTY) if (el.hasAttribute?.(a)) el.removeAttribute(a);
  };
  const sweepClean = () => {
    try { document.querySelectorAll(DIRTY_SEL).forEach(clean); } catch (_) {}
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sweepClean, { once: true });
  } else {
    sweepClean();
  }

  const mo = new MutationObserver(muts => {
    for (const m of muts) {
      if (m.type === 'attributes') clean(m.target);
      else if (m.type === 'childList') {
        m.addedNodes.forEach(n => {
          if (n.nodeType === 1) {
            clean(n);
            try { n.querySelectorAll?.(DIRTY_SEL).forEach(clean); } catch (_) {}
          }
        });
      }
    }
  });
  const startMO = () => mo.observe(document.documentElement, {
    subtree: true, childList: true, attributes: true, attributeFilter: DIRTY
  });
  if (document.documentElement) startMO();
  else document.addEventListener('DOMContentLoaded', startMO, { once: true });

  // ─────────────────────────────────────────────────────────────
  // 3. Badge counter (messages come from MAIN-world via postMessage)
  // ─────────────────────────────────────────────────────────────
  const bump = () => {
    if (!F.badge) return;
    chrome.runtime.sendMessage({ type: 'blockCount', delta: 1 }).catch(() => {});
  };
  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data?.__popy) return;
    const k = e.data.kind;
    if (k === 'blocked_listener' || k === 'blocked_onprop' || k === 'killed_debugger') bump();
  });

  // ─────────────────────────────────────────────────────────────
  // 4. History recording
  // ─────────────────────────────────────────────────────────────
  const recordHistory = (text, kind = 'copy') => {
    if (!F.history || !text) return;
    const snippet = String(text).slice(0, 20000);
    if (snippet.length < 1) return;
    chrome.runtime.sendMessage({
      type: 'saveHistory',
      entry: {
        text: snippet,
        url: location.href,
        title: document.title,
        host,
        kind,
        ts: Date.now()
      }
    }).catch(() => {});
  };

  // ─────────────────────────────────────────────────────────────
  // 5. Copy event hook: smart code cleanup + history
  // ─────────────────────────────────────────────────────────────
  document.addEventListener('copy', (e) => {
    const text = PopyFmt.getSelectionText();
    if (!text) return;

    let out = text;
    if (F.autoCleanCode) {
      const container = PopyFmt.getSelectionContainer();
      const inCode = container?.closest?.('pre, code, .hljs, .highlight, [class*="language-"], [class*="codeBlock"], [class*="code-block"]');
      if (inCode) out = PopyFmt.cleanCode(text);
    }
    if (out !== text && e.clipboardData) {
      try {
        e.clipboardData.setData('text/plain', out);
        e.preventDefault();
      } catch (_) {}
    }
    recordHistory(out, out !== text ? 'code' : 'copy');
  }, true);

  // ─────────────────────────────────────────────────────────────
  // 6. Super-copy floating toolbar
  // ─────────────────────────────────────────────────────────────
  let toolbar = null;
  const hideToolbar = () => { toolbar?.remove(); toolbar = null; };

  if (F.superCopy) {
    document.addEventListener('mouseup', (e) => {
      if (toolbar?.contains(e.target)) return;
      setTimeout(() => {
        const sel = window.getSelection();
        const text = sel?.toString();
        if (!text || text.trim().length < 2) { hideToolbar(); return; }
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        if (!rect.width && !rect.height) return;
        showToolbar(rect, text);
      }, 10);
    }, true);

    document.addEventListener('mousedown', (e) => {
      if (toolbar && !toolbar.contains(e.target)) hideToolbar();
    }, true);
    window.addEventListener('scroll', hideToolbar, true);
    window.addEventListener('resize', hideToolbar);
  }

  function showToolbar(rect, text) {
    hideToolbar();
    toolbar = document.createElement('div');
    toolbar.setAttribute('data-popy-toolbar', '1');
    const top = rect.top > 48 ? rect.top - 44 : rect.bottom + 8;
    const left = Math.max(8, Math.min(window.innerWidth - 340, rect.left));
    Object.assign(toolbar.style, {
      position: 'fixed',
      top: top + 'px',
      left: left + 'px',
      zIndex: '2147483647',
      background: '#1f2937',
      color: 'white',
      borderRadius: '8px',
      padding: '4px',
      display: 'flex',
      gap: '2px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
      fontSize: '12px',
      fontFamily: '-apple-system, system-ui, "PingFang SC", sans-serif',
      userSelect: 'none'
    });

    const btn = (label, title, fn) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      Object.assign(b.style, {
        background: 'transparent', color: 'inherit', border: 'none',
        padding: '6px 10px', borderRadius: '4px', cursor: 'pointer',
        fontSize: '12px', whiteSpace: 'nowrap'
      });
      b.onmouseenter = () => b.style.background = '#374151';
      b.onmouseleave = () => b.style.background = 'transparent';
      b.onmousedown = (ev) => ev.stopPropagation();
      b.onclick = async (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        try { await fn(); } catch (err) { console.warn('[popy]', err); }
        hideToolbar();
      };
      return b;
    };

    toolbar.appendChild(btn('📋 复制', '复制纯文本 (Alt+C)', async () => {
      await navigator.clipboard.writeText(text);
      recordHistory(text, 'force-copy');
      toast('已复制');
    }));
    toolbar.appendChild(btn('✨ MD', '复制为 Markdown (Alt+Shift+C)', async () => {
      const md = PopyFmt.htmlToMarkdown(PopyFmt.getSelectionHtml());
      await navigator.clipboard.writeText(md);
      recordHistory(md, 'markdown');
      toast('已复制为 Markdown');
    }));
    toolbar.appendChild(btn('❝ 引用', '复制为引用（带出处）', async () => {
      const meta = PopyFmt.getPageMeta();
      const q = text.split('\n').map(l => '> ' + l).join('\n') +
                `\n\n— 《${meta.title}》 ${meta.url}`;
      await navigator.clipboard.writeText(q);
      recordHistory(q, 'quote');
      toast('已复制引用');
    }));
    toolbar.appendChild(btn('🔤 代码', '去除行号/提示符', async () => {
      const cleaned = PopyFmt.cleanCode(text);
      await navigator.clipboard.writeText(cleaned);
      recordHistory(cleaned, 'code');
      toast('代码已清理');
    }));
    toolbar.appendChild(btn('🔍 搜索', '用搜索引擎查询', () => {
      window.open('https://www.google.com/search?q=' + encodeURIComponent(text), '_blank');
    }));
    toolbar.appendChild(btn('🌐 译', '翻译这段文字', () => {
      window.open('https://translate.google.com/?sl=auto&tl=zh-CN&text=' + encodeURIComponent(text) + '&op=translate', '_blank');
    }));

    (document.body || document.documentElement).appendChild(toolbar);
  }

  // ─────────────────────────────────────────────────────────────
  // 7. Reveal hidden text
  // ─────────────────────────────────────────────────────────────
  function revealHidden() {
    let count = 0;
    const mark = document.createElement('style');
    mark.dataset.popyReveal = '1';
    mark.textContent = `
      [data-popy-revealed] {
        outline: 1px dashed #f59e0b !important;
        background: rgba(245, 158, 11, 0.12) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(mark);

    const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_ELEMENT);
    let el;
    while ((el = walker.nextNode())) {
      if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE') continue;
      const cs = getComputedStyle(el);
      let hidden = false;
      if (cs.visibility === 'hidden') hidden = true;
      else if (parseFloat(cs.opacity) < 0.05 && el.textContent?.trim()) hidden = true;
      else if (cs.color && cs.backgroundColor && cs.color === cs.backgroundColor && el.textContent?.trim()) hidden = true;
      else if (parseInt(cs.textIndent) < -999) hidden = true;
      else if (cs.fontSize === '0px' && el.textContent?.trim()) hidden = true;

      if (hidden) {
        el.setAttribute('data-popy-revealed', '1');
        el.style.setProperty('visibility', 'visible', 'important');
        el.style.setProperty('opacity', '1', 'important');
        el.style.setProperty('color', 'inherit', 'important');
        el.style.setProperty('text-indent', '0', 'important');
        el.style.setProperty('font-size', 'inherit', 'important');
        count++;
      }
    }
    toast(count ? `揭示了 ${count} 处隐藏文字` : '未发现隐藏文字');
  }

  // ─────────────────────────────────────────────────────────────
  // 8. Media unlock: stop oncontextmenu on images & videos
  //    (main-world script already handles addEventListener; here
  //     we also set draggable="true" so images can be dragged out)
  // ─────────────────────────────────────────────────────────────
  if (F.mediaUnlock) {
    const fixMedia = () => {
      document.querySelectorAll('img, video').forEach(el => {
        try {
          el.setAttribute('draggable', 'true');
          el.style.setProperty('pointer-events', 'auto', 'important');
        } catch (_) {}
      });
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', fixMedia, { once: true });
    } else { fixMedia(); }
  }

  // ─────────────────────────────────────────────────────────────
  // 9. Toast
  // ─────────────────────────────────────────────────────────────
  function toast(msg) {
    const t = document.createElement('div');
    t.textContent = msg;
    Object.assign(t.style, {
      position: 'fixed', bottom: '32px', left: '50%', transform: 'translateX(-50%) translateY(10px)',
      background: '#2563eb', color: 'white', padding: '8px 18px', borderRadius: '6px',
      zIndex: '2147483647', fontSize: '13px',
      fontFamily: '-apple-system, system-ui, "PingFang SC", sans-serif',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
      pointerEvents: 'none', opacity: '0',
      transition: 'opacity .25s, transform .25s'
    });
    (document.body || document.documentElement).appendChild(t);
    requestAnimationFrame(() => {
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(10px)';
      setTimeout(() => t.remove(), 300);
    }, 1600);
  }

  // ─────────────────────────────────────────────────────────────
  // 10. Message dispatcher (commands + context menu)
  // ─────────────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    handleMessage(msg).then(sendResponse).catch(err => sendResponse({ error: String(err) }));
    return true;
  });

  async function handleMessage(msg) {
    const text = PopyFmt.getSelectionText();
    const html = PopyFmt.getSelectionHtml();
    const meta = PopyFmt.getPageMeta();

    if (msg.type === 'command') {
      switch (msg.command) {
        case 'force-copy':
          if (text) {
            await navigator.clipboard.writeText(text);
            recordHistory(text, 'force-copy');
            toast('已强制复制');
          }
          return { ok: true };
        case 'copy-as-markdown': {
          const src = html || text;
          const md = html ? PopyFmt.htmlToMarkdown(html) : text;
          if (!src) { toast('没有选区'); return { ok: false }; }
          await navigator.clipboard.writeText(md);
          recordHistory(md, 'markdown');
          toast('已复制为 Markdown');
          return { ok: true };
        }
        case 'reveal-hidden':
          revealHidden();
          return { ok: true };
      }
    }

    if (msg.type === 'menu') {
      switch (msg.id) {
        case 'popy-copy-md': {
          const md = html ? PopyFmt.htmlToMarkdown(html) : text;
          await navigator.clipboard.writeText(md);
          recordHistory(md, 'markdown');
          toast('已复制为 Markdown');
          return { ok: true };
        }
        case 'popy-copy-quote': {
          const q = text.split('\n').map(l => '> ' + l).join('\n') +
                    `\n\n— 《${meta.title}》 ${meta.url}`;
          await navigator.clipboard.writeText(q);
          recordHistory(q, 'quote');
          toast('已复制为引用');
          return { ok: true };
        }
        case 'popy-copy-plain':
          await navigator.clipboard.writeText(text);
          recordHistory(text, 'plain');
          toast('已复制纯文本');
          return { ok: true };
        case 'popy-code-clean': {
          const cleaned = PopyFmt.cleanCode(text);
          await navigator.clipboard.writeText(cleaned);
          recordHistory(cleaned, 'code');
          toast('代码已清理并复制');
          return { ok: true };
        }
        case 'popy-table-csv': {
          const container = PopyFmt.getSelectionContainer();
          const table = container?.closest?.('table') || document.querySelector('table');
          if (!table) { toast('未找到表格'); return { ok: false }; }
          const csv = PopyFmt.tableToCSV(table);
          await navigator.clipboard.writeText(csv);
          recordHistory(csv, 'csv');
          toast('表格已转 CSV');
          return { ok: true };
        }
        case 'popy-reveal':
          revealHidden();
          return { ok: true };
        case 'popy-unlock-media':
          toast('图片/视频右键已解锁');
          return { ok: true };
      }
    }
    return { ok: false };
  }
})();
