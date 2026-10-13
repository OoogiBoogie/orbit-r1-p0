/* r1 ORBIT companion P0: browser glue. Listens for the r1 creations SDK hardware events on window (scrollUp,
 * scrollDown, sideClick, longPressStart, longPressEnd). On a desktop, keys stand in by dispatching THOSE SAME events,
 * so nothing changes on a device. No network: the page's CSP has connect-src 'none'. */
(function () {
  'use strict';
  const fx = window.R1P0Fixtures;
  const A = window.R1P0Adapter;
  const C = window.R1P0Companion;
  const params = new URLSearchParams(location.search);

  const world = fx.world();
  const adapter = A.create(world);

  // creationStorage.plain on an r1 (values must be Base64); localStorage on a desktop; memory as a last resort.
  const mem = new Map();
  const b64 = (text) => btoa(String.fromCharCode.apply(null, Array.from(new TextEncoder().encode(text))));
  const unb64 = (data) => new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
  function makeStorage() {
    const cs = window.creationStorage && window.creationStorage.plain;
    if (cs) {
      return { kind: 'creationStorage.plain',
        get: async (k) => { const v = await cs.getItem('p0:' + k); return v == null ? null : unb64(v); },
        set: async (k, v) => { await cs.setItem('p0:' + k, b64(v)); },
        remove: async (k) => { await cs.removeItem('p0:' + k); } };
    }
    try {
      const ls = window.localStorage;
      ls.setItem('r1p0:check', '1'); ls.removeItem('r1p0:check');
      return { kind: 'localStorage', get: async (k) => ls.getItem('r1p0:' + k), set: async (k, v) => { ls.setItem('r1p0:' + k, v); },
        remove: async (k) => { ls.removeItem('r1p0:' + k); } };
    } catch (e) { /* storage blocked: fall through */ }
    return { kind: 'memory', get: async (k) => (mem.has(k) ? mem.get(k) : null), set: async (k, v) => { mem.set(k, v); }, remove: async (k) => { mem.delete(k); } };
  }
  const storage = makeStorage();

  // When this page first wrote to its storage (kept across restarts if the storage persists; device test U3).
  const sessionStarted = new Date().toISOString();
  const firstOpen = storage.get('first-open').then(async (v) => {
    if (v) return v;
    try { await storage.set('first-open', sessionStarted); } catch (e) { return 'not stored: ' + e.message; }
    return sessionStarted;
  }).catch((e) => 'not readable: ' + e.message);

  const idgen = () => (window.crypto && typeof crypto.randomUUID === 'function' && window.isSecureContext
    ? crypto.randomUUID() : 'p0-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));

  async function probe() {
    const f = {};
    f['This browser'] = (navigator.userAgent || 'unknown').slice(0, 240);
    f['Window'] = window.innerWidth + '×' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x';
    f['Online flag'] = String(navigator.onLine);
    f['Secure context'] = String(window.isSecureContext);
    f['SDK objects'] = ['PluginMessageHandler', 'creationStorage', 'creationSensors', 'closeWebView', 'TouchEventHandler']
      .map((n) => n + (typeof window[n] !== 'undefined' ? ' yes' : ' no')).join(', ');
    f['Storage used'] = storage.kind;
    let rt = 'failed';
    try {
      await storage.set('roundtrip', 'p0-check');
      rt = (await storage.get('roundtrip')) === 'p0-check' ? 'ok' : 'mismatch';
      await storage.remove('roundtrip');
    } catch (e) { rt = 'error: ' + e.message; }
    f['Storage round trip'] = rt;
    f['Stored since'] = await firstOpen;
    f['This session started'] = sessionStarted;
    f['Mic/camera API'] = navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? 'present (never called)' : 'absent';
    f['Network'] = "none: CSP connect-src 'none'";
    f['Data'] = 'synthetic only';
    return f;
  }

  const comp = C.create({ adapter, storage, now: () => world.now, idgen, probe });
  const el = document.getElementById('r1');
  function paint() {
    el.innerHTML = comp.render();
    const hi = el.querySelector('.it.hi');
    if (hi && hi.scrollIntoView) hi.scrollIntoView({ block: 'nearest' });
  }
  const run = (type) => { const p = comp.dispatch(type).then(paint, (e) => { console.error(e); paint(); }); paint(); return p; };

  for (const name of C.SDK_EVENTS) window.addEventListener(name, () => { run(name); });

  // Desktop stand-ins: dispatch the SDK's own event names.
  const KEYS = { ArrowUp: 'scrollUp', ArrowDown: 'scrollDown', ' ': 'sideClick', Enter: 'sideClick' };
  window.addEventListener('keydown', (e) => {
    const tag = e.target && e.target.tagName;
    if (tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (KEYS[e.key]) { e.preventDefault(); window.dispatchEvent(new Event(KEYS[e.key])); }
    else if (e.key === 'Shift' && !e.repeat) window.dispatchEvent(new Event('longPressStart'));
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') window.dispatchEvent(new Event('longPressEnd')); });

  // The synthetic clock follows real time unless frozen (?clock=frozen, used by the screenshot walk).
  if (params.get('clock') !== 'frozen') {
    setInterval(() => { adapter.control.advance(1000); run('tick'); }, 1000);
  }

  window.r1p0 = { comp, adapter, storage, world, paint, run };
  comp.start().then(paint, (e) => { console.error(e); paint(); });
  paint();
})();
