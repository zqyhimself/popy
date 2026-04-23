// Runs in the page's MAIN world. Must hijack APIs BEFORE page scripts use them.
// Registered dynamically from background.js via chrome.scripting.registerContentScripts.
(function () {
  'use strict';
  if (window.__popyMainLoaded) return;
  window.__popyMainLoaded = true;

  const BLOCKED = [
    'copy', 'cut', 'paste',
    'contextmenu', 'selectstart',
    'mousedown', 'mouseup', 'dragstart',
    'beforecopy', 'beforecut', 'beforepaste'
  ];

  const notify = (kind, extra) => {
    try { window.postMessage({ __popy: true, kind, extra }, '*'); } catch (_) {}
  };

  // ── 1. Hijack addEventListener: block page-registered blockers
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, listener, options) {
    if (BLOCKED.includes(type)) {
      notify('blocked_listener', type);
      return;
    }
    return origAdd.call(this, type, listener, options);
  };

  // ── 2. Override on* properties across common prototypes
  const protos = [Document.prototype, HTMLElement.prototype, Window.prototype];
  for (const p of protos) {
    for (const evt of BLOCKED) {
      try {
        Object.defineProperty(p, 'on' + evt, {
          configurable: true,
          enumerable: true,
          get() { return null; },
          set() { notify('blocked_onprop', evt); }
        });
      } catch (_) { /* some are non-configurable */ }
    }
  }

  // ── 3. Anti-anti-debug: kill `debugger` traps in timers and Function constructor
  const hasDebugger = (h) => {
    if (typeof h === 'string' && /\bdebugger\b/.test(h)) return true;
    if (typeof h === 'function') {
      try {
        const s = Function.prototype.toString.call(h);
        if (/\bdebugger\b/.test(s)) return true;
      } catch (_) {}
    }
    return false;
  };

  try {
    const origSI = window.setInterval;
    const origST = window.setTimeout;
    window.setInterval = function (handler, timeout, ...rest) {
      if (hasDebugger(handler)) { notify('killed_debugger', 'setInterval'); return 0; }
      return origSI.call(this, handler, timeout, ...rest);
    };
    window.setTimeout = function (handler, timeout, ...rest) {
      if (hasDebugger(handler)) { notify('killed_debugger', 'setTimeout'); return 0; }
      return origST.call(this, handler, timeout, ...rest);
    };

    const OrigFunction = window.Function;
    const FnProxy = new Proxy(OrigFunction, {
      construct(T, args) {
        const body = args[args.length - 1];
        if (typeof body === 'string' && /\bdebugger\b/.test(body)) {
          notify('killed_debugger', 'new Function');
          return function () {};
        }
        return Reflect.construct(T, args);
      },
      apply(T, thisArg, args) {
        const body = args[args.length - 1];
        if (typeof body === 'string' && /\bdebugger\b/.test(body)) {
          notify('killed_debugger', 'Function()');
          return function () {};
        }
        return Reflect.apply(T, thisArg, args);
      }
    });
    try { FnProxy.prototype = OrigFunction.prototype; } catch (_) {}
    try { window.Function = FnProxy; } catch (_) {}
  } catch (_) {}

  // ── 4. Freeze console so sites can't blank it to hide output
  try {
    const c = window.console;
    const keep = {};
    for (const k of ['log','warn','error','info','debug','table','dir','trace','group','groupEnd']) {
      if (typeof c[k] === 'function') keep[k] = c[k];
    }
    for (const k of Object.keys(keep)) {
      try { Object.defineProperty(c, k, { value: keep[k], writable: false, configurable: false }); } catch (_) {}
    }
  } catch (_) {}

  // ── 5. Defeat devtools-open size detection (common anti-debug)
  try {
    const noop = { get: () => 0, set: () => {} };
    // Don't actually override outerWidth, just ensure the check can be tampered by setting values
    // Many scripts check `window.outerWidth - window.innerWidth > 200`. We can't alter without breakage.
    // Instead, intercept the detector's interval: already handled by setInterval/setTimeout debugger filter.
  } catch (_) {}

  // ── 6. Print unlock — when user prints, force all content visible
  window.addEventListener('beforeprint', () => {
    const s = document.createElement('style');
    s.dataset.popyPrint = '1';
    s.textContent = `
      @media print {
        *, *::before, *::after {
          visibility: visible !important;
          opacity: 1 !important;
          color: inherit !important;
        }
        body, html { display: block !important; overflow: visible !important; }
        [class*="noprint"], [class*="no-print"] { display: block !important; }
      }
    `;
    (document.head || document.documentElement).appendChild(s);
  }, true);

  notify('injected');
})();
