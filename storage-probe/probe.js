/* r1 storage probe (Codex 3155a5cd; corrected for Codex 0273ecbe): WHERE and WHEN this r1 gives a creation window.creationStorage,
 * WHEN each storage (secure, plain) becomes usable, and what ONE throwaway round trip per storage and key does, step by step.
 * It tells apart: absent vs late vs a method mismatch vs a failed write / read / remove ('' vs null), and whether the page's
 * script policy blocks anything (CSP violations are counted by type, never by URL).
 *
 * - It re-reads window on EVERY sample (never a captured reference): at script start, DOMContentLoaded, load, then load +0.5,
 *   +1, +2, +5, +10 and +20 s. It records PRESENCE AND TYPES ONLY (typeof), never a stored value. A null creationStorage is
 *   recorded as null, never as "there".
 * - Each storage is tracked ON ITS OWN: it is "ready" the first time all three of setItem/getItem/removeItem are functions (read
 *   fresh). A ready storage gets exactly ONE round trip per key, whenever it becomes ready during the 20 s; a storage that never
 *   becomes ready is finalized at the deadline as NA (not there) or NM (there, without the methods). Nothing is re-run.
 * - Keys: 'orbit-companion:probe' (as the shipped client), 'orbit_companion-probe', 'orbit_companion_probe' (rabbit's style).
 *   A round trip writes ONE random throwaway Base64 value, reads it, removes it, reads again. Each step waits at most 5 s, so a
 *   storage's tests take at most 60 s; the screen shows which step is running. A write or remove that never answers cannot be
 *   cancelled, so removal is ATTEMPTED, not guaranteed. Reads record only typeof, length and "equal to what was written".
 * - No network (CSP connect-src 'none'), no ORBIT, no account, no clear(). Synthetic. Not a credential. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.R1StorageProbe = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const CHANNELS = ['CreationStorageHandler', 'PluginMessageHandler', 'closeWebView', 'TouchEventHandler', 'AccelerometerHandler'];
  const METHODS = ['setItem', 'getItem', 'removeItem', 'clear'];
  const KEYS = [['colon', 'orbit-companion:probe'], ['hyphen', 'orbit_companion-probe'], ['snake', 'orbit_companion_probe']];
  const KINDS = ['secure', 'plain'];
  const STEPS = 4; // set, get, remove, get-after
  const REV = '2'; // shown on screen and in the result, so a photo says which revision ran (Codex 0273ecbe correction)
  const typeOf = (v) => (v === null ? 'null' : typeof v);
  const safe = (fn) => { try { return fn(); } catch (e) { return undefined; } };
  const present = (t) => t !== 'undefined' && t !== 'null';

  /** Presence and types only, read fresh from win every time. */
  function snapshot(win) {
    const s = {};
    const cs = safe(() => win.creationStorage);
    s.creationStorage = typeOf(cs);
    for (const k of KINDS) {
      const st = safe(() => cs && cs[k]);
      s[k] = typeOf(st);
      for (const m of METHODS) s[k + '.' + m] = typeOf(safe(() => st && st[m]));
    }
    for (const c of CHANNELS) { const ch = safe(() => win[c]); s[c] = typeOf(ch); s[c + '.postMessage'] = typeOf(safe(() => ch && ch.postMessage)); }
    s.creationSensors = typeOf(safe(() => win.creationSensors));
    const extra = safe(() => Object.getOwnPropertyNames(win).filter((n) => /creation|plugin|rabbit|handler|bridge|storage/i.test(n) && !(n in s) && !/^(localStorage|sessionStorage|StorageEvent|StorageManager|Storage)$/.test(n)).slice(0, 20)) || [];
    s.other = extra.map((n) => n + ':' + typeOf(safe(() => win[n]))).join(',');
    return s;
  }
  const freshStorage = (win, kind) => safe(() => { const cs = win.creationStorage; return cs ? cs[kind] : undefined; });
  const usable = (st) => Boolean(st) && ['setItem', 'getItem', 'removeItem'].every((m) => typeof safe(() => st[m]) === 'function');

  function create({ win, now, rand, timeoutMs, b64 }) {
    const T0 = now();
    const STEP_MS = timeoutMs || 5000;
    const timeline = []; const firstSeen = {}; const violations = [];
    const ready = {}; const rts = {}; const state = { secure: 'waiting', plain: 'waiting' };
    const progress = { phase: 'discovery', kind: null, key: null, step: 0 };
    let lastLabel = null; let discoveryDone = false; let finishedAt = null;
    let chain = Promise.resolve();
    const enc = b64 || ((s) => win.btoa(s));
    let nullSeen = null;
    function sample(label) {
      const snap = snapshot(win);
      const at = now() - T0;
      timeline.push({ label, at, snap });
      lastLabel = label;
      for (const [k, v] of Object.entries(snap)) if (k !== 'other' && present(v) && !(k in firstSeen)) firstSeen[k] = { label, at };
      if (snap.creationStorage === 'null' && !nullSeen) nullSeen = { label, at };
      for (const kind of KINDS) if (!ready[kind] && usable(freshStorage(win, kind))) ready[kind] = { label, at };
      if (label === '+20s') discoveryDone = true;
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
        (e) => { if (!done) { done = true; clearTimeout(timer); resolve({ outcome: 'threw', name: (e && (e.name || (e.constructor && e.constructor.name))) || 'Error' }); } });
    });
    async function step(n, fn) {
      progress.step = n;
      const t = now(); let ret;
      try { ret = fn(); } catch (e) { return { outcome: 'threw', name: (e && e.name) || 'Error', ms: now() - t, sync: true }; }
      const thenable = Boolean(ret && typeof ret.then === 'function');
      const r = await wait(Promise.resolve(ret), STEP_MS);
      return Object.assign({ ms: now() - t, returned: thenable ? 'promise' : typeOf(ret) }, r);
    }
    const describe = (v, written) => ({ type: typeOf(v), length: typeof v === 'string' ? v.length : null, equal: v === written });
    async function roundTrip(st, keyName, key) {
      const r = { key: keyName };
      const value = 'probe-' + rand(); const written = enc(value);
      r.set = await step(1, () => st.setItem(key, written));
      r.get = await step(2, () => st.getItem(key));
      if (r.get.outcome === 'ok') { const d = describe(r.get.value, written); d.decodedEqual = r.get.value === value; delete r.get.value; Object.assign(r.get, d); }
      r.remove = await step(3, () => st.removeItem(key));
      r.after = await step(4, () => st.getItem(key));
      if (r.after.outcome === 'ok') { const d = describe(r.after.value, written); delete r.after.value; Object.assign(r.after, d); }
      for (const s of [r.set, r.remove]) if ('value' in s) delete s.value;
      const bad = (s, tag) => (s.outcome === 'threw' ? tag + '!' : s.outcome === 'timeout' ? tag + '~' : null);
      r.code = bad(r.set, 'SET')
        || bad(r.get, 'GET') || (r.get.type === 'null' || r.get.type === 'undefined' ? 'GET0' : r.get.equal ? null : r.get.decodedEqual ? 'GETD' : r.get.type === 'string' && r.get.length === 0 ? 'GETE' : 'GETX')
        || bad(r.remove, 'DEL') || bad(r.after, 'AFT')
        || (r.after.type === 'null' || r.after.type === 'undefined' ? 'OK' : r.after.type === 'string' && r.after.length === 0 ? 'LEFTE' : 'LEFTX');
      return r;
    }
    /** Per storage: test it once when it is ready; at the deadline (final) finalize what never became ready. Serialized. */
    function advance(final) {
      chain = chain.then(async () => {
        for (const kind of KINDS) {
          if (state[kind] !== 'waiting') continue;
          const st = freshStorage(win, kind);
          if (usable(st)) {
            if (!ready[kind]) ready[kind] = { label: lastLabel, at: now() - T0 };
            state[kind] = 'running'; progress.phase = 'testing'; progress.kind = kind;
            for (const [name, key] of KEYS) { progress.key = name; rts[kind + '.' + name] = await roundTrip(st, name, key); }
            state[kind] = 'done';
          } else if (final) {
            const code = st ? 'NM' : 'NA'; // there but without the methods, or not there
            for (const [name] of KEYS) rts[kind + '.' + name] = { key: name, code };
            state[kind] = 'done';
          }
        }
        progress.phase = isDone() ? 'done' : discoveryDone ? 'testing' : 'discovery'; progress.kind = null; progress.key = null; progress.step = 0;
        if (isDone() && finishedAt === null) finishedAt = now() - T0;
      });
      return chain;
    }
    const isDone = () => discoveryDone && KINDS.every((k) => state[k] === 'done');
    const at = (f) => (!f ? 'N' : f.label === 'script' ? 'E' : f.label === 'domcontentloaded' ? 'D' : f.label === 'load' ? 'L' : 'T' + f.label);
    function summary(variant) {
      const rc = (k) => (rts[k] ? rts[k].code : '..');
      const trio = (kind) => KEYS.map(([n]) => rc(kind + '.' + n)).join('/'); // colon / hyphen / snake key
      const when = at(firstSeen.creationStorage);
      const code = variant + '.' + when + '.S@' + at(ready.secure) + ':' + trio('secure') + '.P@' + at(ready.plain) + ':' + trio('plain') + '.V' + violations.length;
      return { rev: REV, code, when, firstSeen, nullSeen, ready, state: Object.assign({}, state), progress: Object.assign({}, progress), roundTrips: rts, violations, timeline, done: isDone(), finishedAt };
    }
    return { sample, violation, advance, summary, snapshot: () => snapshot(win) };
  }

  /** Plain words for a summary (shown on the r1). */
  function words(sum) {
    const w = [];
    const f = sum.firstSeen.creationStorage;
    if (!f) w.push(sum.nullSeen ? 'window.creationStorage was null, never an object (watched for 20 s).' : 'This r1 never gave this page window.creationStorage (watched for 20 s).');
    else if (sum.when === 'E') w.push('window.creationStorage was there when the page\'s first script ran.');
    else w.push('window.creationStorage appeared only at ' + f.label + ' (' + (f.at / 1000).toFixed(1) + ' s after the first script).');
    if (sum.firstSeen.CreationStorageHandler && !f) w.push('The CreationStorageHandler channel exists, but the creationStorage API on top of it never appeared.');
    const say = { OK: 'works (write, read, remove)', NA: 'not there', NM: 'there, but without setItem/getItem/removeItem', 'SET!': 'writing threw an error', 'SET~': 'writing never answered',
      'GET!': 'reading threw an error', 'GET~': 'reading never answered', GET0: 'reading back gave nothing', GETE: 'reading back gave an empty string', GETX: 'reading back gave something different',
      GETD: 'reading back gave the value already decoded (not Base64)', 'DEL!': 'removing threw an error', 'DEL~': 'removing never answered', 'AFT!': 'reading after remove threw',
      'AFT~': 'reading after remove never answered', LEFTE: 'after remove, reading gives an empty string (not null)', LEFTX: 'after remove, the value is still there' };
    for (const kind of KINDS) {
      const r = KEYS.map(([n]) => [n, sum.roundTrips[kind + '.' + n]]);
      const rd = sum.ready[kind];
      const when = rd ? (rd.label === 'script' ? 'from the first script' : 'usable from ' + rd.label) : 'never usable';
      if (r.every(([, x]) => !x)) { w.push(kind + ' storage: ' + when + '; ' + (sum.state[kind] === 'running' ? 'being tested now.' : 'not tested yet.')); continue; }
      const codes = r.map(([, x]) => (x ? x.code : '..'));
      if (codes.every((c) => c === codes[0])) w.push(kind + ' storage (' + when + '): ' + (say[codes[0]] || codes[0]) + '.');
      else w.push(kind + ' storage (' + when + '): ' + r.map(([n, x]) => 'with a ' + n + ' key ' + (x ? (say[x.code] || x.code) : 'not tried')).join('; ') + '.');
    }
    w.push(sum.violations.length ? 'The page\'s script policy blocked ' + sum.violations.length + ' thing(s): ' + sum.violations.map((v) => v.directive + ' ' + v.blocked).slice(0, 3).join(', ') + '.' : 'Nothing was blocked by the page\'s script policy.');
    if (KINDS.some((k) => KEYS.some(([n]) => { const x = sum.roundTrips[k + '.' + n]; return x && /~$/.test(x.code); }))) w.push('A step that never answered can\'t be cancelled, so its test value may stay on this r1 (it is a random value, nothing personal).');
    return w;
  }

  /** In a browser: run, sample on schedule, show honest progress and the result on the 240x282 screen. */
  function boot(win, doc) {
    const variant = (doc.documentElement.getAttribute('data-variant') || '?');
    const rand = () => Array.from(win.crypto.getRandomValues(new Uint8Array(6)), (x) => x.toString(16).padStart(2, '0')).join('');
    const clock = () => (win.performance && win.performance.now ? win.performance.now() : Date.now());
    const p = create({ win, now: clock, rand, timeoutMs: 5000 });
    doc.addEventListener('securitypolicyviolation', (e) => { p.violation(e.violatedDirective, e.blockedURI); });
    p.sample('script');
    let loadAt = null;
    const state = { hi: 0, lines: [] };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    function status(sum) {
      if (sum.done) return 'Done in ' + Math.round(sum.finishedAt / 1000) + ' s. Photo this screen. Press to run again.';
      const parts = [];
      if (loadAt === null) parts.push('Loading…');
      else if (!sum.timeline.some((x) => x.label === '+20s')) parts.push('Watching for storage: ' + Math.min(20, Math.round((clock() - loadAt) / 1000)) + ' of 20 s');
      if (sum.progress.phase === 'testing' && sum.progress.kind) parts.push('testing ' + sum.progress.kind + ', ' + sum.progress.key + ' key, step ' + sum.progress.step + ' of 4 (a step waits at most 5 s)');
      else if (sum.timeline.some((x) => x.label === '+20s')) parts.push('finishing the tests');
      return parts.join(' · ');
    }
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
      root.innerHTML = '<header class="hd"><div class="t">Storage probe ' + esc(variant) + ' · rev ' + REV + '</div><div class="c" id="code">' + esc(sum.code) + '</div><div class="s">' + esc(status(sum)) + '</div></header>'
        + '<ul class="list">' + state.lines.map((l, i) => '<li class="' + (i === state.hi ? 'hi' : '') + '">' + (l[0] ? '<span class="k">' + esc(l[0]) + '</span> ' : '') + esc(l[1]) + '</li>').join('') + '</ul>';
      const hiEl = root.querySelector('li.hi'); if (hiEl && hiEl.scrollIntoView) hiEl.scrollIntoView({ block: 'nearest' });
      win.R1StorageProbeResult = sum; // for desktop walks
    }
    const tick = (label) => { p.sample(label); render(); p.advance(label === '+20s').then(render); };
    const startSchedule = () => {
      loadAt = clock();
      for (const [label, ms] of [['+0.5s', 500], ['+1s', 1000], ['+2s', 2000], ['+5s', 5000], ['+10s', 10000], ['+20s', 20000]]) win.setTimeout(() => { tick(label); }, ms);
      const iv = win.setInterval(() => { render(); if (p.summary(variant).done) win.clearInterval(iv); }, 1000); // honest progress while anything runs
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
  return { create, snapshot, words, KEYS, REV };
});
