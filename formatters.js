// Formatter library — loaded before content.js in the isolated world.
// Exposes globalThis.PopyFmt with HTML→Markdown, table→CSV, code cleanup, selection helpers.
(function () {
  'use strict';

  // ── HTML → Markdown (minimal but covers common cases)
  function htmlToMarkdown(input) {
    let root;
    if (typeof input === 'string') {
      const d = document.createElement('div');
      d.innerHTML = input;
      root = d;
    } else {
      root = input;
    }
    const md = walk(root).replace(/\n{3,}/g, '\n\n').trim();
    return md;
  }

  function walk(node) {
    if (!node) return '';
    if (node.nodeType === 3) return node.nodeValue.replace(/\s+/g, ' ');
    if (node.nodeType !== 1) return '';
    const tag = node.tagName.toLowerCase();
    const kids = () => Array.from(node.childNodes).map(walk).join('');

    switch (tag) {
      case 'script': case 'style': case 'noscript': case 'template': return '';
      case 'h1': return '\n\n# ' + kids().trim() + '\n\n';
      case 'h2': return '\n\n## ' + kids().trim() + '\n\n';
      case 'h3': return '\n\n### ' + kids().trim() + '\n\n';
      case 'h4': return '\n\n#### ' + kids().trim() + '\n\n';
      case 'h5': return '\n\n##### ' + kids().trim() + '\n\n';
      case 'h6': return '\n\n###### ' + kids().trim() + '\n\n';
      case 'p': case 'div': case 'section': case 'article':
        return '\n\n' + kids().trim() + '\n\n';
      case 'br': return '  \n';
      case 'hr': return '\n\n---\n\n';
      case 'strong': case 'b': return '**' + kids().trim() + '**';
      case 'em': case 'i': return '*' + kids().trim() + '*';
      case 'del': case 's': case 'strike': return '~~' + kids().trim() + '~~';
      case 'mark': return '==' + kids().trim() + '==';
      case 'code': {
        const parent = node.parentElement;
        if (parent && parent.tagName === 'PRE') return kids();
        return '`' + (node.textContent || '') + '`';
      }
      case 'pre': {
        const codeEl = node.querySelector('code');
        const cls = codeEl?.className || node.className || '';
        const lang = (cls.match(/language-([\w+-]+)/) || cls.match(/lang-([\w+-]+)/) || [, ''])[1];
        const text = (codeEl?.textContent ?? node.textContent ?? '').replace(/\n+$/, '');
        return '\n\n```' + lang + '\n' + text + '\n```\n\n';
      }
      case 'a': {
        const href = node.getAttribute('href') || '';
        const text = kids().trim() || href;
        if (!href || href.startsWith('javascript:')) return text;
        return `[${text}](${href})`;
      }
      case 'img': {
        const src = node.getAttribute('src') || node.getAttribute('data-src') || '';
        const alt = node.getAttribute('alt') || '';
        if (!src) return '';
        return `![${alt}](${src})`;
      }
      case 'blockquote':
        return '\n\n' + kids().trim().split('\n').map(l => '> ' + l).join('\n') + '\n\n';
      case 'ul': case 'ol': {
        const items = Array.from(node.children).filter(c => c.tagName === 'LI');
        const lines = items.map((li, i) => {
          const mark = tag === 'ul' ? '- ' : `${i + 1}. `;
          const inner = Array.from(li.childNodes).map(walk).join('').trim();
          return mark + inner.replace(/\n/g, '\n  ');
        });
        return '\n\n' + lines.join('\n') + '\n\n';
      }
      case 'li': return kids();
      case 'table': return '\n\n' + tableToMarkdown(node) + '\n\n';
      case 'thead': case 'tbody': case 'tfoot': case 'tr':
      case 'th': case 'td': return kids();
      default: return kids();
    }
  }

  // ── Table → Markdown
  function tableToMarkdown(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    if (!rows.length) return '';
    const cells = rows.map(r =>
      Array.from(r.children).map(c =>
        (c.textContent || '').trim().replace(/\|/g, '\\|').replace(/\n+/g, ' ')
      )
    );
    const width = Math.max(...cells.map(r => r.length));
    cells.forEach(r => { while (r.length < width) r.push(''); });
    const header = cells[0];
    const body = cells.slice(1);
    let out = '| ' + header.join(' | ') + ' |\n';
    out += '| ' + header.map(() => '---').join(' | ') + ' |\n';
    for (const r of body) out += '| ' + r.join(' | ') + ' |\n';
    return out;
  }

  // ── Table → CSV
  function tableToCSV(table) {
    const rows = Array.from(table.querySelectorAll('tr'));
    return rows.map(r =>
      Array.from(r.children).map(c => {
        let t = (c.textContent || '').replace(/\r?\n+/g, ' ').trim();
        if (/[",\n]/.test(t)) t = '"' + t.replace(/"/g, '""') + '"';
        return t;
      }).join(',')
    ).join('\n');
  }

  // ── Code cleanup: strip line numbers, shell prompts, common indent
  function cleanCode(text) {
    let lines = text.split(/\r?\n/);

    // Strip leading sequential line numbers: "  12 " / "12. " / "12 | "
    const allNumbered = lines.filter(l => l.trim()).every(l => /^\s*\d{1,5}[\s.│|▏]+/.test(l));
    if (allNumbered) {
      lines = lines.map(l => l.replace(/^\s*\d{1,5}[\s.│|▏]+/, ''));
    }

    // Strip shell prompts
    lines = lines.map(l => l.replace(/^\s*(\$|>>>|>|#|PS[^>]*>|C:\\[^>]*>|➜\s)\s*/, ''));

    // Trim trailing blank lines
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
    while (lines.length && !lines[0].trim()) lines.shift();

    // Dedent common leading whitespace
    const nonEmpty = lines.filter(l => l.trim());
    if (nonEmpty.length) {
      const indents = nonEmpty.map(l => (l.match(/^[ \t]*/) || [''])[0].length);
      const common = Math.min(...indents);
      if (common > 0) lines = lines.map(l => l.slice(common));
    }
    return lines.join('\n');
  }

  // ── Selection helpers
  function getSelectionText() {
    return window.getSelection()?.toString() || '';
  }
  function getSelectionHtml() {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return '';
    const div = document.createElement('div');
    for (let i = 0; i < sel.rangeCount; i++) {
      div.appendChild(sel.getRangeAt(i).cloneContents());
    }
    return div.innerHTML;
  }
  function getSelectionContainer() {
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const c = sel.getRangeAt(0).commonAncestorContainer;
    return c.nodeType === 1 ? c : c.parentElement;
  }
  function getPageMeta() {
    return { title: document.title, url: location.href, host: location.hostname };
  }

  globalThis.PopyFmt = {
    htmlToMarkdown, tableToMarkdown, tableToCSV, cleanCode,
    getSelectionText, getSelectionHtml, getSelectionContainer, getPageMeta
  };
})();
