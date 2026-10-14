/* r1 storage probe (Codex 3155a5cd): WHERE and WHEN this r1 gives a creation window.creationStorage, and what ONE throwaway
 * round trip does, step by step. It answers: absent vs late vs a method mismatch vs a failed write / read / remove ('' vs null),
 * and whether the page's script policy blocks anything (CSP violations are counted by type, never by URL).
 *
 * - It re-reads window on EVERY sample (never a captured reference): at script start, DOMContentLoaded, load, then load +0.5,
 *   +1, +2, +5, +10 and +20 s. It records PRESENCE AND TYPES ONLY (typeof), never a stored value.
 * - Round trips (once, as soon as a storage has setItem/getItem/removeItem functions, else marked NA): secure and plain, each with
 *   a colon key ('orbit-companion:probe', as the shipped client uses) and a snake_case key ('orbit_companion_probe', as rabbit's
 *   examples use). Each writes ONE random throwaway Base64 value, reads it, removes it, reads again. Per step: ok / threw / no
 *   answer in 5 s, and for reads only typeof, length and whether it equals what was written (never the value itself).
 * - No network (CSP connect-src 'none'), no ORBIT, no account, no clear(). Synthetic. Not a credential. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.R1StorageProbe = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHANNELS = ['CreationStorageHandler', 'PluginMessageHandler', 'closeWebView', 'TouchEventHandler', 'AccelerometerHandler'];
  const METHODS = ['setItem', 'getItem', 'removeItem', 'clear'];
  const KEYS = [['colon', 'orbit-companion:probe'], ['hyphen', 'orbit_companion-probe'], ['snake', 'orbit_companion_probe']];
  const typeOf = (v) => (v === null ? 'null' : typeof v);
  const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };

  /** Presence and types only, read fresh from win every time. */
  function snapshot(win) {
    const s = {};
    const cs = safe(() => win.creationStorage);
    s.creationStorage = typeOf(cs);
    for (const k of ['secure', 'plain']) {
      const st = safe(() => cs && cs[k]);
      s[k] = typeOf(st);
      for (const m of METHODS) s[k + '.' + m] = typeOf(safe(() => st && st[m]));
    }
    for (const c of CHANNELS) { const ch = safe(() => win[c]); s[c] = typeOf(ch); s[c + '.postMessage'] = typeOf(safe(() => ch && ch.postMessage)); }
    s.creationSensors = typeOf(safe(() => win.creationSensors));
    // other window names that look like a bridge (names and types only)
    const extra = safe(() => Object.getOwnPropertyNames(win).filter((n) => /creation|plugin|rabbit|handler|bridge|storage/i.test(n) && !(n in s) && !/^(localStorage|sessionStorage|StorageEvent|StorageManager|Storage)$/.test(n)).slice(0, 20)) || [];
    s.other = extra.map((n) => n + ':' + typeOf(safe(() => win[n]))).join(',');
    return s;
  }
  const usable = (snap, kind) => ['setItem', 'getItem', 'removeItem'].every((m) => snap[kind + '.' + m] === 'function');

  function create({ win, now, rand, timeoutMs, b64 }) {
    const T0 = now();
    const timeline = []; const firstSeen = {}; const violations = [];
    const rts = {}; let rtDone = false; let rtRunning = null;
    const enc = b64 || ((s) => win.btoa(s));
    function sample(label) {
      const snap = snapshot(win);
      const at = now() - T0;
      timeline.push({ label, at, snap });
      for (const [k, v] of Object.entries(snap)) if (k !== 'other' && v !== 'undefined' && !(k in firstSeen)) firstSeen[k] = { label, at };
      return snap;
    }
    function violation(directive, blocked) {
      const b = String(blocked || '');
      const kind = /^(inline|eval|wasm-eval|data|blob)$/.test(b) ? b : b ? 'url' : 'unknown';
      violations.push({ directive: String(directive || '').split(' ')[0], blocked: kind, at: now() - T0 });
    }
    const wait = (p, ms) => new Promise((resolve) => {
      let done = false;
      const timer = setTimeout(() => { if (!done) { done = true; resolve({ outcome: 'timeout' }); } }, ms);
      p.then((value) => { if (!done) { done = true; clearTimeout(timer); resolve({ outcome: 'ok', value }); } },
        (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ outcome: 'threw', name: (e && (e.name || e.constructor && e.constructor.name)) || 'Error' }); } });
    });
    async function step(fn) {
      const t = now(); let ret;
      try { ret = fn(); } catch (e) { return { outcome: 'threw', name: (e && e.name) || 'Error', ms: now() - t, sync: true }; }
      const thenable = Boolean(ret && typeof ret.then === 'function');
      const r = await wait(Promise.resolve(ret), timeoutMs || 5000);
      return Object.assign({ ms: now() - t, returned: thenable ? 'promise' : typeOf(ret) }, r);
    }
    function describe(v, written) { // never the value: its type, length, and whether it equals what was written
      return { type: typeOf(v), length: typeof v === 'string' ? v.length : null, equal: v === written, decodedEqual: false };
    }
    async function roundTrip(kind, keyName, key) {
      const r = { kind, key: keyName };
      const st = safe(() => win.creationStorage && win.creationStorage[kind]); // read fresh now
      if (!st) { r.code = 'NA'; return r; }
      if (!['setItem', 'getItem', 'removeItem'].every((m) => typeof safe(() => st[m]) === 'function')) { r.code = 'NM'; return r; } // there, but without the methods
      const value = 'probe-' + rand(); const written = enc(value);
      r.set = await step(() => st.setItem(key, written));
      r.get = await step(() => st.getItem(key));
      if (r.get.outcome === 'ok') { const d = describe(r.get.value, written); d.decodedEqual = r.get.value === value; delete r.get.value; Object.assign(r.get, d); }
      r.remove = await step(() => st.removeItem(key));
      r.after = await step(() => st.getItem(key));
      if (r.after.outcome === 'ok') { const d = describe(r.after.value, written); delete r.after.value; Object.assign(r.after, d); }
      if (r.set.outcome === 'ok' && 'value' in r.set) delete r.set.value;
      if (r.remove.outcome === 'ok' && 'value' in r.remove) delete r.remove.value;
      const bad = (s, tag) => (s.outcome === 'threw' ? tag + '!' : s.outcome === 'timeout' ? tag + '~' : null);
      r.code = bad(r.set, 'SET')
        || bad(r.get, 'GET') || (r.get.type === 'null' || r.get.type === 'undefined' ? 'GET0' : r.get.equal ? null : r.get.decodedEqual ? 'GETD' : r.get.type === 'string' && r.get.length === 0 ? 'GETE' : 'GETX')
        || bad(r.remove, 'DEL') || bad(r.after, 'AFT')
        || (r.after.type === 'null' || r.after.type === 'undefined' ? 'OK' : r.after.type === 'string' && r.after.length === 0 ? 'LEFTE' : 'LEFTX');
      return r;
    }
    async function maybeRoundTrips(force) {
      if (rtDone) return rts;
      if (rtRunning) return rtRunning;
      const snap = snapshot(win);
      if (!force && !(usable(snap, 'secure') || usable(snap, 'plain'))) return rts;
      rtRunning = (async () => {
        for (const kind of ['secure', 'plain']) for (const [name, key] of KEYS) rts[kind + '.' + name] = await roundTrip(kind, name, key);
        rtDone = true; return rts;
      })();
      return rtRunning;
    }
    function when() {
      const f = firstSeen.creationStorage;
      if (!f) return 'N';
      if (f.label === 'script') return 'E';
      if (f.label === 'domcontentloaded') return 'D';
      if (f.label === 'load') return 'L';
      return 'T' + f.label; // e.g. T+1s
    }
    function summary(variant) {
      const rc = (k) => (rts[k] ? rts[k].code : '..');
      const trio = (kind) => KEYS.map(([n]) => rc(kind + '.' + n)).join('/'); // colon / hyphen / snake key
      const code = variant + '.' + when() + '.S' + trio('secure') + '.P' + trio('plain') + '.V' + violations.length;
      return { code, when: when(), firstSeen, roundTrips: rts, violations, timeline, done: rtDone };
    }
    return { sample, violation, maybeRoundTrips, summary, snapshot: () => snapshot(win) };
  }

  /** Plain words for a summary (shown on the r1). */
  function words(sum) {
    const w = [];
    const f = sum.firstSeen.creationStorage;
    if (!f) w.push('This r1 never gave this page window.creationStorage (watched for 20 s).');
    else if (sum.when === 'E') w.push('window.creationStorage was there when the page\'s first script ran.');
    else w.push('window.creationStorage appeared only at ' + f.label + ' (' + (f.at / 1000).toFixed(1) + ' s after the first script).');
    if (sum.firstSeen.CreationStorageHandler && !f) w.push('The CreationStorageHandler channel exists, but the creationStorage API on top of it never appeared.');
    const say = { OK: 'works (write, read, remove)', NA: 'not available', NM: 'there, but without setItem/getItem/removeItem','SET!': 'writing threw an error', 'SET~': 'writing never answered', 'GET!': 'reading threw an error', 'GET~': 'reading never answered',
      GET0: 'reading back gave nothing', GETE: 'reading back gave an empty string', GETX: 'reading back gave something different', GETD: 'reading back gave the value already decoded (not Base64)',
      'DEL!': 'removing threw an error', 'DEL~': 'removing never answered', 'AFT!': 'reading after remove threw', 'AFT~': 'reading after remove never answered',
      LEFTE: 'after remove, reading gives an empty string (not null)', LEFTX: 'after remove, the value is still there' };
    for (const kind of ['secure', 'plain']) {
      const r = KEYS.map(([n]) => [n, sum.roundTrips[kind + '.' + n]]);
      if (r.every(([, x]) => !x)) { w.push(kind + ' storage: not tried yet.'); continue; }
      const codes = r.map(([, x]) => (x ? x.code : '..'));
      if (codes.every((c) => c === codes[0])) w.push(kind + ' storage: ' + (say[codes[0]] || codes[0]) + '.');
      else w.push(kind + ' storage: ' + r.map(([n, x]) => 'with a ' + n + ' key ' + (x ? (say[x.code] || x.code) : 'not tried')).join('; ') + '.');
    }
    w.push(sum.violations.length ? 'The page\'s script policy blocked ' + sum.violations.length + ' thing(s): ' + sum.violations.map((v) => v.directive + ' ' + v.blocked).slice(0, 3).join(', ') + '.' : 'Nothing was blocked by the page\'s script policy.');
    return w;
  }

  /** In a browser: run, sample on schedule, show the result on the 240x282 screen. */
  function boot(win, doc) {
    const variant = (doc.documentElement.getAttribute('data-variant') || '?');
    const rand = () => Array.from(win.crypto.getRandomValues(new Uint8Array(6)), (x) => x.toString(16).padStart(2, '0')).join('');
    const p = create({ win, now: () => (win.performance && win.performance.now ? win.performance.now() : Date.now()), rand, timeoutMs: 5000 });
    doc.addEventListener('securitypolicyviolation', (e) => { p.violation(e.violatedDirective, e.blockedURI); });
    p.sample('script');
    const state = { hi: 0, lines: [] };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    function render() {
      const root = doc.getElementById('probe'); if (!root) return;
      const sum = p.summary(variant);
      const facts = [];
      const last = sum.timeline[sum.timeline.length - 1];
      if (last) for (const [k, v] of Object.entries(last.snap)) if (k !== 'other' || v) facts.push([k, v + (sum.firstSeen[k] ? ' (from ' + sum.firstSeen[k].label + ')' : '')]);
      facts.push(['This browser', String(win.navigator.userAgent || '').slice(0, 160)]);
      facts.push(['Window', win.innerWidth + '×' + win.innerHeight]);
      facts.push(['Network', "none (connect-src 'none')"]);
      state.lines = words(sum).map((t) => ['', t]).concat(facts);
      root.innerHTML = '<header class="hd"><div class="t">Storage probe ' + esc(variant) + '</div><div class="c" id="code">' + esc(sum.code) + '</div><div class="s">' + (sum.done && last && last.label === '+20s' ? 'Done. Photo this screen. Press to run again.' : 'Watching for 20 s…') + '</div></header>'
        + '<ul class="list">' + state.lines.map((l, i) => '<li class="' + (i === state.hi ? 'hi' : '') + '">' + (l[0] ? '<span class="k">' + esc(l[0]) + '</span> ' : '') + esc(l[1]) + '</li>').join('') + '</ul>';
      const hiEl = root.querySelector('li.hi'); if (hiEl && hiEl.scrollIntoView) hiEl.scrollIntoView({ block: 'nearest' });
      win.R1StorageProbeResult = sum; // for desktop walks
    }
    const tick = async (label) => { p.sample(label); await p.maybeRoundTrips(label === '+20s'); render(); };
    const startSchedule = () => {
      for (const [label, ms] of [['+0.5s', 500], ['+1s', 1000], ['+2s', 2000], ['+5s', 5000], ['+10s', 10000], ['+20s', 20000]]) win.setTimeout(() => { tick(label); }, ms);
    };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => { tick('domcontentloaded'); });
    else tick('domcontentloaded');
    if (doc.readyState === 'complete') { tick('load'); startSchedule(); } else win.addEventListener('load', () => { tick('load'); startSchedule(); });
    const move = (d) => { state.hi = Math.max(0, Math.min(state.lines.length - 1, state.hi + d)); render(); };
    win.addEventListener('scrollUp', () => move(-1)); win.addEventListener('scrollDown', () => move(1));
    win.addEventListener('sideClick', () => { win.location.reload(); });
    win.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') move(-1); else if (e.key === 'ArrowDown') move(1); else if (e.key === ' ' || e.key === 'Enter') win.location.reload(); });
    render();
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__R1_PROBE_NO_AUTOBOOT) boot(window, document);
  return { create, snapshot, words, KEYS };
});
