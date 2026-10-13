/* r1 secure storage check (contract v2 hardware prerequisite: does creationStorage.secure exist, round-trip, and keep a
 * value across a restart and a reinstall?). It writes ONLY throwaway test values (a random marker and the time), never
 * an account pass or anything personal. Nothing is sent (CSP connect-src 'none'). A page cannot prove the platform
 * keeps data confidential; this records what the API does on this r1. Controls: the r1 SDK events; keys on a desktop. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const SDK = ['scrollUp', 'scrollDown', 'sideClick', 'longPressStart', 'longPressEnd'];
  const KEY = 'secure-check:marker';
  const S = { hi: 0, items: [], note: '', busy: false, facts: {} };
  const cs = window.creationStorage;
  const secure = cs && cs.secure;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const b64 = (s) => btoa(s);
  const unb64 = (s) => { try { return atob(s); } catch (e) { return '(not Base64: ' + String(s).slice(0, 20) + ')'; } };
  const rand = () => Array.from(crypto.getRandomValues(new Uint8Array(4)), (x) => x.toString(16).padStart(2, '0')).join('');
  const timeNow = () => new Date().toISOString().slice(0, 19).replace('T', ' ') + 'Z';

  async function roundTrip() {
    if (!secure) return 'not available (no creationStorage.secure)';
    const v = 'rt-' + rand();
    try {
      await secure.setItem('secure-check:rt', b64(v));
      const back = await secure.getItem('secure-check:rt');
      await secure.removeItem('secure-check:rt');
      const after = await secure.getItem('secure-check:rt');
      if (back == null) return 'FAILED: wrote, read back nothing';
      if (unb64(back) !== v) return 'FAILED: read back a different value';
      if (after != null) return 'FAILED: remove did not remove';
      return 'ok (write, read, remove)';
    } catch (e) { return 'FAILED: ' + (e && (e.name || e.message) || String(e)); }
  }
  async function readMarker() {
    if (!secure) return null;
    try { const v = await secure.getItem(KEY); return v == null ? null : unb64(v); } catch (e) { return 'error: ' + (e && (e.name || e.message)); }
  }
  async function facts() {
    const f = {};
    f['creationStorage'] = cs ? 'present' : 'absent';
    f['creationStorage.secure'] = secure ? 'present' : 'absent';
    f['creationStorage.plain'] = cs && cs.plain ? 'present' : 'absent';
    f['Round trip'] = await roundTrip();
    const m = await readMarker();
    f['Test marker now'] = m ? m : 'none stored';
    f['This session started'] = sessionStart;
    f['Window'] = window.innerWidth + '×' + window.innerHeight + ' @' + (window.devicePixelRatio || 1) + 'x';
    f['This browser'] = (navigator.userAgent || 'unknown').slice(0, 240);
    f['Network'] = "none: CSP connect-src 'none'";
    return f;
  }
  async function build() {
    S.facts = await facts();
    S.items = [
      { id: 'write', label: 'Keep a test marker', sub: 'Then close and reopen this page' },
      { id: 'read', label: 'Read the test marker', sub: 'After a restart or a reinstall' },
      { id: 'delete', label: 'Delete the test marker' },
    ].concat(Object.keys(S.facts).map((k) => ({ id: 'fact', label: k, sub: S.facts[k], fact: true })));
  }
  async function activate(it) {
    if (!secure && it.id !== 'fact') { S.note = 'This r1 has no creationStorage.secure, so a real pass could not be kept here.'; return; }
    if (it.id === 'write') {
      const v = 'marker ' + rand() + ' made ' + timeNow();
      try { await secure.setItem(KEY, b64(v)); S.note = 'Kept: "' + v + '". Close this page, open it again, then choose Read.'; }
      catch (e) { S.note = 'Could not keep it: ' + (e && (e.name || e.message)); }
    } else if (it.id === 'read') {
      const m = await readMarker();
      S.note = m ? 'Found: "' + m + '" (this session started ' + sessionStart + ')' : 'No marker stored.';
    } else if (it.id === 'delete') {
      try { await secure.removeItem(KEY); S.note = 'Deleted.'; } catch (e) { S.note = 'Could not delete: ' + (e && (e.name || e.message)); }
    }
    await build();
  }
  function move(d) {
    const n = S.items.length; if (!n) return;
    S.hi = Math.max(0, Math.min(n - 1, S.hi + d));
  }
  async function dispatch(type) {
    if (type === 'scrollUp') move(-1);
    else if (type === 'scrollDown') move(1);
    else if (type === 'sideClick') {
      if (S.busy) return;
      const it = S.items[S.hi]; if (!it || it.fact) return;
      S.busy = true; try { await activate(it); } finally { S.busy = false; }
    } else if (type === 'longPressStart') S.note = 'Long press seen by this page.';
  }
  function paint() {
    $('bd').innerHTML = '<ul class="list" role="listbox" aria-label="Choices">' + S.items.map((it, i) => '<li role="option" class="it' + (it.fact ? ' fact' : '')
      + (i === S.hi ? ' hi' : '') + '" aria-selected="' + (i === S.hi) + '"><span class="l">' + esc(it.label) + '</span>' + (it.sub ? '<span class="s">' + esc(it.sub) + '</span>' : '') + '</li>').join('') + '</ul>';
    const hi = $('bd').querySelector('.it.hi'); if (hi && hi.scrollIntoView) hi.scrollIntoView({ block: 'nearest' });
    $('note').hidden = !S.note; $('note').textContent = S.note;
    $('hint').textContent = S.busy ? 'Working…' : '⇅ · ●';
  }
  function fit() {
    const box = $('r1'); const w = window.innerWidth || 240; const h = window.innerHeight || 282;
    const s = Math.max(0.5, Math.min(w / 240, h / 282));
    box.style.transformOrigin = 'top left';
    box.style.transform = Math.abs(s - 1) < 0.01 ? '' : 'scale(' + s.toFixed(4) + ')';
    box.style.marginLeft = Math.max(0, Math.floor((w - 240 * s) / 2)) + 'px';
    box.style.marginTop = Math.max(0, Math.floor((h - 282 * s) / 2)) + 'px';
  }
  const sessionStart = timeNow();
  const run = (t) => dispatch(t).then(paint, (e) => { S.note = 'Error: ' + e.message; paint(); });
  for (const name of SDK) window.addEventListener(name, () => { run(name); });
  const KEYS = { ArrowUp: 'scrollUp', ArrowDown: 'scrollDown', ' ': 'sideClick', Enter: 'sideClick' };
  window.addEventListener('keydown', (e) => { if (KEYS[e.key]) { e.preventDefault(); window.dispatchEvent(new Event(KEYS[e.key])); } });
  window.addEventListener('resize', fit);
  window.r1secure = { state: S, run, build: () => build().then(paint) };
  fit();
  build().then(paint);
  paint();
})();
