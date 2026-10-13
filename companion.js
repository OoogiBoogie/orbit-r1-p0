/* r1 ORBIT companion P0: screens and rules. Pure: no DOM, no network. It takes the r1's five hardware events
 * (scrollUp, scrollDown, sideClick, longPressStart, longPressEnd: the names the creations SDK documents) plus 'tick',
 * calls an adapter, and renders an HTML string for a 240x282 screen. Selection is only by wheel and click. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.R1P0Companion = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SDK_EVENTS = ['scrollUp', 'scrollDown', 'sideClick', 'longPressStart', 'longPressEnd'];
  const ROLE_WORDS = { MANAGER: 'Manager', CONTRIBUTOR: 'Contributor', READER: 'Reader' };
  const DEFAULT_SINCE_MS = 2 * 60 * 60 * 1000;

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function create(options) {
    const { adapter, storage, now, idgen, probe } = options;
    const faults = { reuseKeyWithDifferentText: false };
    const s = {
      screen: 'START', params: {}, stack: [], viewer: null, viewerName: '', sel: {},
      items: [], hi: 0, body: '', title: '', banner: null, note: null, busy: false,
      data: {}, sdkSeen: Object.fromEntries(SDK_EVENTS.map((e) => [e, 0])), loads: 0,
    };
    const cache = new Map(); // key -> { data, at }

    // ---------- time and words ----------
    function ago(isoTime) {
      const ms = now() - Date.parse(isoTime);
      if (ms < 60000) return 'just now';
      const m = Math.round(ms / 60000);
      if (m < 60) return m + ' min ago';
      const h = Math.round(m / 60);
      return h < 48 ? h + ' h ago' : Math.round(h / 24) + ' d ago';
    }
    const size = (n) => (n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB');
    const crumb = () => (s.sel.orbit ? s.sel.orbit.name + (s.sel.project ? ' › ' + s.sel.project.title : '') : 'Choose an Orbit');

    // ---------- loading with an offline cache ----------
    async function load(key, fn) {
      s.loads += 1;
      try {
        const data = await fn();
        cache.set(key, { data, at: now() });
        return { data, stale: false };
      } catch (err) {
        if (err && err.code === 'OFFLINE' && cache.has(key)) {
          const hit = cache.get(key);
          return { data: hit.data, stale: true, age: hit.at };
        }
        if (err && (err.status === 404 || err.status === 403)) dropProject(s.sel.project && s.sel.project.project_id);
        throw err;
      }
    }
    function dropProject(projectId) {
      for (const k of [...cache.keys()]) if (k === 'creations' || (projectId && k.includes(projectId))) cache.delete(k);
    }
    const setBanner = (r) => { s.banner = r.stale ? 'Offline · showing what you saw ' + ago(new Date(r.age).toISOString()) : null; };

    // ---------- navigation ----------
    async function go(screen, params, push = true) {
      if (push && s.screen !== 'START' && s.screen !== 'ERROR') s.stack.push({ screen: s.screen, params: s.params });
      s.screen = screen; s.params = params || {}; s.note = null; s.busy = true;
      try { await enter(); } catch (err) { await fail(err); } finally { s.busy = false; }
    }
    async function back() {
      const prev = s.stack.pop();
      if (!prev) return go('ORBITS', {}, false);
      if (prev.screen === 'ORBITS') s.sel = {};
      if (prev.screen === 'CREATIONS') s.sel = { orbit: s.sel.orbit };
      return go(prev.screen, prev.params, false);
    }
    async function restart() {
      cache.clear(); s.stack = []; s.sel = {}; s.data = {};
      await storage.remove('pending');
      return start();
    }
    async function start() {
      s.busy = true;
      try {
        const me = await adapter.whoami();
        s.viewer = me.sub; s.viewerName = me.name;
        s.screen = 'ORBITS'; s.params = {};
        await enter();
      } catch (err) { await fail(err); } finally { s.busy = false; }
    }

    async function fail(err) {
      const code = err && err.code;
      s.banner = null;
      if (code === 'VIEWER_CHANGED' || code === 'IDENTITY_CHANGED') {
        cache.clear(); s.stack = []; s.sel = {};
        await storage.remove('pending');
        return show('ERROR', 'The signed-in account changed. Start again.', [{ id: 'restart', label: 'Start again' }]);
      }
      if (code === 'OFFLINE') {
        return show('ERROR', 'Offline. Nothing saved to show yet.', [{ id: 'retry', label: 'Try again' }, { id: 'back', label: '‹ Back' }]);
      }
      if (err && (err.status === 404 || err.status === 403)) {
        const was = s.params && s.params.fromList;
        return show('ERROR', was ? 'No longer available.' : 'Not available.', [{ id: 'home', label: 'Back to your Orbits' }]);
      }
      return show('ERROR', 'Something went wrong: ' + (err && err.message ? err.message : String(err)), [{ id: 'back', label: '‹ Back' }]);
    }
    function show(screen, body, items, hi) {
      s.screen = screen; s.title = screen === 'RESULT' ? 'Result' : '';
      s.body = '<p class="msg">' + esc(body) + '</p>'; s.items = items; s.hi = hi === undefined ? 0 : hi;
    }

    // ---------- screens ----------
    async function enter() {
      const p = s.params;
      switch (s.screen) {
        case 'ORBITS': {
          const r = await load('creations', () => adapter.listCreations({ viewer: s.viewer }));
          setBanner(r);
          s.data.creations = r.data.projects;
          const orbits = [];
          for (const c of r.data.projects) {
            let o = orbits.find((x) => x.id === c.orbit_id);
            if (!o) { o = { id: c.orbit_id, name: c.orbit_name, n: 0 }; orbits.push(o); }
            o.n += 1;
          }
          s.title = 'Choose an Orbit';
          s.body = '';
          s.items = orbits.map((o) => ({ id: 'orbit', label: o.name, sub: o.n + (o.n === 1 ? ' creation' : ' creations'), orbit: o }))
            .concat([{ id: 'device', label: 'Device check', sub: 'What this screen can use' }]);
          s.hi = 0;
          return;
        }
        case 'CREATIONS': {
          const r = await load('creations', () => adapter.listCreations({ viewer: s.viewer }));
          setBanner(r);
          const mine = r.data.projects.filter((c) => c.orbit_id === s.sel.orbit.id);
          if (!mine.length) { const e = new Error('gone'); e.status = 404; throw e; }
          s.title = 'Choose a creation';
          s.body = '';
          s.items = mine.map((c) => ({ id: 'project', label: c.title, sub: ROLE_WORDS[c.role] + ' · ' + ago(c.updated_at), project: c }))
            .concat([{ id: 'back', label: '‹ Back' }]);
          s.hi = 0;
          return;
        }
        case 'CREATION': {
          const pid = s.sel.project.project_id;
          const r = await load('creations', () => adapter.listCreations({ viewer: s.viewer }));
          setBanner(r);
          const fresh = r.data.projects.find((c) => c.project_id === pid);
          if (!fresh) { const e = new Error('gone'); e.status = 404; throw e; }
          s.sel.project = fresh;
          const since = await sinceFor(pid);
          s.title = 'What do you want?';
          s.body = '';
          s.items = [
            { id: 'changes', label: 'What changed?', sub: 'since ' + ago(since) },
            { id: 'files', label: 'Saved files', sub: 'Open one' },
            { id: 'back', label: '‹ Back' },
          ];
          s.hi = 0;
          return;
        }
        case 'CHANGES': {
          const pid = s.sel.project.project_id;
          const since = await sinceFor(pid);
          const cursor = p.cursor || null;
          const r = await load('changes:' + pid + ':' + since + ':' + (cursor || 0),
            () => adapter.whatChanged({ viewer: s.viewer, project_id: pid, since, cursor }));
          setBanner(r);
          s.title = 'What changed';
          s.body = r.data.items.length ? '' : '<p class="msg">Nothing new since ' + esc(ago(since)) + '.</p>';
          s.items = r.data.items.map((it) => ({ id: it.kind === 'FILE_VERSION' ? 'open-change' : 'info-change',
            label: it.title, sub: it.detail + ' · ' + ago(it.at), ref: it.ref, kind: it.kind }));
          if (r.data.cursor) s.items.push({ id: 'more', label: 'More…', cursor: r.data.cursor });
          if (!r.stale) s.items.push({ id: 'seen', label: 'Mark all as seen' });
          s.items.push({ id: 'back', label: '‹ Back' });
          s.hi = 0;
          return;
        }
        case 'FILES': {
          const pid = s.sel.project.project_id;
          const r = await load('files:' + pid, () => adapter.listFiles({ viewer: s.viewer, project_id: pid }));
          setBanner(r);
          s.title = 'Saved files';
          s.body = r.data.files.length ? '' : '<p class="msg">No saved files you can read.</p>';
          s.items = r.data.files.map((f) => ({ id: 'open-file', label: f.name + ' v' + f.v, sub: f.folder_name + ' · ' + ago(f.at), ref: { file_id: f.file_id, v: f.v } }))
            .concat([{ id: 'back', label: '‹ Back' }]);
          s.hi = 0;
          return;
        }
        case 'FILE': {
          const pid = s.sel.project.project_id;
          const { file_id, v } = p.ref;
          const r = await load('file:' + pid + ':' + file_id + ':' + v, () => adapter.openFile({ viewer: s.viewer, project_id: pid, file_id, v }));
          let opts = null;
          if (!r.stale) {
            const o = await load('handoff:' + pid + ':' + file_id, () => adapter.handoffOptions({ viewer: s.viewer, project_id: pid, file_id }));
            opts = o.data.simulated;
          }
          setBanner(r);
          s.data.file = r.data; s.data.options = opts; s.data.fileStale = r.stale;
          s.title = r.data.version.name + ' v' + r.data.version.v;
          renderFile(false);
          return;
        }
        case 'PHONE': {
          const ph = s.data.file.phone;
          s.title = 'Continue on your phone';
          s.body = '<p class="msg">Open ORBIT on your phone, then:</p><ol class="path">'
            + [ph.orbit_name, ph.creation, ph.place, 'Files', ph.file + ' v' + ph.v].map((x) => '<li>' + esc(x) + '</li>').join('')
            + '</ol><p class="fine">Nothing is sent from this r1. Sending for a yes, and saying yes, happen in ORBIT.</p>';
          s.items = [{ id: 'back', label: '‹ Back' }];
          s.hi = 0;
          return;
        }
        case 'CONFIRM': {
          const f = s.data.file; const h = s.data.options.handoff;
          const body = { text: f.version.name + ' v' + f.version.v + ' is ready for a yes.', expected_version: h.version };
          const pending = await readPending();
          let key = idgen();
          if (pending && pending.handoff_id === h.handoff_id && pending.text === body.text && pending.expected_version === body.expected_version) key = pending.key;
          await storage.set('pending', JSON.stringify({ key, project_id: s.sel.project.project_id, task_id: h.task_id,
            handoff_id: h.handoff_id, file_id: f.file.file_id, v: f.version.v, text: body.text, expected_version: body.expected_version }));
          s.title = 'Rehearsal (simulated)';
          s.body = '<p class="msg">Send <b>' + esc(f.version.name) + ' v' + f.version.v + '</b> to ' + esc(h.reviewer_name)
            + ' for a yes in <b>' + esc(h.step) + '</b>?</p><p class="fine">SIMULATED: no ORBIT write exists in P0.</p>';
          s.items = [{ id: 'send', label: 'Send (simulated)' }, { id: 'cancel', label: 'Cancel' }];
          s.hi = -1; // nothing highlighted: a click on arrival does nothing
          return;
        }
        case 'DEVICE': {
          const facts = probe ? await probe() : {};
          facts['SDK events seen'] = SDK_EVENTS.map((e) => e + ' ' + s.sdkSeen[e]).join(', ');
          s.title = 'Device check';
          s.body = '';
          // Each fact is a row the wheel can reach (pressing it does nothing), so every fact can be scrolled into view.
          s.items = Object.keys(facts).map((k) => ({ id: 'fact', label: k, sub: String(facts[k]), fact: true }))
            .concat([{ id: 'recheck', label: 'Check again' }, { id: 'back', label: '‹ Back' }]);
          s.hi = 0;
          return;
        }
        default:
          return;
      }
    }

    function renderFile(keepHighlight) {
      const f = s.data.file; const opts = s.data.options;
      const left = Math.round((Date.parse(f.link.expires_at) - now()) / 1000);
      const expired = left <= 0;
      const meta = [
        f.version.type + ' · ' + size(f.version.size),
        (f.version.why === 'GENERATED' ? 'Generated' : 'Saved') + ' by ' + f.version.by + ' · ' + ago(f.version.at),
        'In ' + f.file.folder_name + (f.file.current_v > f.version.v ? ' · newer: v' + f.file.current_v : ''),
        'sha256 ' + f.version.sha,
        expired ? 'Link expired' : 'Link valid ' + Math.floor(left / 60) + ':' + String(left % 60).padStart(2, '0'),
      ];
      const img = f.preview && !expired ? '<img class="pv" alt="Preview of ' + esc(f.version.name) + '" src="' + esc(f.preview) + '">' : '';
      const nonImage = !f.version.type.startsWith('image/') ? '<p class="fine">No preview here. Open on your phone.</p>' : '';
      s.body = '<div class="file">' + img + '<ul class="meta">' + meta.map((m) => '<li>' + esc(m) + '</li>').join('') + '</ul></div>' + nonImage;
      const items = [];
      if (expired) items.push({ id: 'refresh-link', label: 'Refresh link' });
      items.push({ id: 'phone', label: 'Continue on your phone', sub: 'Hand off in ORBIT' });
      if (s.data.fileStale) items.push({ id: 'info', label: 'Needs a connection to rehearse a send.', info: true });
      else if (opts && opts.allowed) items.push({ id: 'confirm', label: 'Rehearse: send for a yes', sub: 'Simulated · to ' + opts.handoff.reviewer_name });
      else if (opts) items.push({ id: 'info', label: opts.reason, info: true });
      items.push({ id: 'back', label: '‹ Back' });
      const keep = keepHighlight && s.items && s.items[s.hi] && s.items[s.hi].id;
      s.items = items;
      const at = keep ? items.findIndex((it) => it.id === keep && !it.info) : -1;
      s.hi = at >= 0 ? at : 0;
    }

    async function sinceFor(pid) {
      // The first look remembers its starting point, so the same "what changed" stays the same read (and cache key).
      const stored = await storage.get('seen:' + pid);
      if (stored) return stored;
      const first = new Date(now() - DEFAULT_SINCE_MS).toISOString();
      await storage.set('seen:' + pid, first);
      return first;
    }
    async function readPending() {
      try { const raw = await storage.get('pending'); return raw ? JSON.parse(raw) : null; } catch (e) { return null; }
    }

    // ---------- the simulated send ----------
    async function send(retry) {
      const pending = await readPending();
      if (!pending) return show('RESULT', 'Nothing to send. Start from the file again.', [{ id: 'to-file', label: 'Back to the file' }]);
      // A newer saved version means the person hasn't seen what they'd be sending: refresh, send nothing.
      try {
        const cur = await adapter.openFile({ viewer: s.viewer, project_id: pending.project_id, file_id: pending.file_id, v: pending.v });
        if (cur.file.current_v > pending.v) {
          await storage.remove('pending');
          return show('RESULT', 'A newer version (v' + cur.file.current_v + ') was saved since you looked. Refresh before sending.',
            [{ id: 'to-latest', label: 'Refresh', v: cur.file.current_v }]);
        }
      } catch (err) {
        if (err.code !== 'OFFLINE') return fail(err);
      }
      const text = faults.reuseKeyWithDifferentText && retry ? pending.text + ' (edited)' : pending.text;
      try {
        const out = await adapter.simulateSubmit({ viewer: s.viewer, project_id: pending.project_id, task_id: pending.task_id,
          handoff_id: pending.handoff_id, text, expected_version: pending.expected_version, client_request_id: pending.key });
        await storage.remove('pending');
        dropProject(pending.project_id);
        return show('RESULT', out.replayed
          ? 'Already sent. One request, not two (simulated). Waiting for ' + out.handoff.reviewer_name + '’s yes.'
          : 'Sent for a yes (simulated). Waiting for ' + out.handoff.reviewer_name + '’s yes in ORBIT.',
          [{ id: 'to-file', label: 'Done' }]);
      } catch (err) {
        if (err.code === 'ANSWER_LOST' || err.code === 'OFFLINE') {
          const words = err.code === 'OFFLINE' ? 'Offline. Nothing was sent.' : 'No answer came back. It may or may not have been sent.';
          return show('RESULT', words + ' Try again reuses the same request.', [{ id: 'retry-send', label: 'Try again' }, { id: 'leave', label: 'Leave it' }]);
        }
        if (err.code === 'REQUEST_ID_REUSED') {
          await storage.remove('pending');
          return show('RESULT', 'Stopped (409): ' + err.message + ' Nothing new was sent.', [{ id: 'to-file', label: 'Back to the file' }]);
        }
        if (err.code === 'HANDOFF_CHANGED') {
          await storage.remove('pending');
          return show('RESULT', err.message, [{ id: 'to-file', label: 'Refresh' }]);
        }
        if (err.status === 409 && err.code !== 'VIEWER_CHANGED') {
          await storage.remove('pending');
          return show('RESULT', err.message, [{ id: 'to-file', label: 'Back to the file' }]);
        }
        return fail(err);
      }
    }

    // ---------- events ----------
    async function activate(item) {
      switch (item.id) {
        case 'orbit': s.sel = { orbit: item.orbit }; return go('CREATIONS', { fromList: true });
        case 'project': s.sel = { orbit: s.sel.orbit, project: item.project }; return go('CREATION', { fromList: true });
        case 'device': return go('DEVICE', {});
        case 'recheck': return go('DEVICE', {}, false);
        case 'changes': return go('CHANGES', { fromList: true });
        case 'files': return go('FILES', { fromList: true });
        case 'more': return go('CHANGES', { cursor: item.cursor, fromList: true });
        case 'seen': await storage.set('seen:' + s.sel.project.project_id, new Date(now()).toISOString()); return go('CHANGES', { fromList: true }, false);
        case 'open-change': case 'open-file': return go('FILE', { ref: item.ref, fromList: true });
        case 'info-change': s.note = 'Open ORBIT on your phone for this.'; return undefined;
        case 'phone': return go('PHONE', {});
        case 'confirm': return go('CONFIRM', {});
        case 'refresh-link': return go('FILE', s.params, false);
        case 'cancel': await storage.remove('pending'); return back();
        case 'send': s.busy = true; try { return await send(false); } finally { s.busy = false; }
        case 'retry-send': s.busy = true; try { return await send(true); } finally { s.busy = false; }
        case 'leave': await storage.remove('pending'); return toFile();
        case 'to-file': return toFile();
        case 'to-latest': return toFile(item.v);
        case 'restart': return restart();
        case 'home': s.stack = []; s.sel = {}; return go('ORBITS', {}, false);
        case 'retry': return s.stack.length ? back() : start();
        case 'back': return back();
        default: return undefined;
      }
    }
    async function toFile(v) {
      // Back to the File screen (fresh), dropping the confirm/result frames from the stack.
      while (s.stack.length && s.stack[s.stack.length - 1].screen !== 'FILE') s.stack.pop();
      const frame = s.stack.pop();
      if (!frame) return go('CREATION', {}, false);
      const params = v ? Object.assign({}, frame.params, { ref: Object.assign({}, frame.params.ref, { v }) }) : frame.params;
      return go('FILE', params, false);
    }

    function move(delta) {
      const focusable = s.items.map((it, i) => (it.info ? -1 : i)).filter((i) => i >= 0);
      if (!focusable.length) return;
      let pos = focusable.indexOf(s.hi);
      if (pos < 0) pos = delta > 0 ? -1 : focusable.length;
      pos = Math.max(0, Math.min(focusable.length - 1, pos + delta));
      s.hi = focusable[pos];
      s.note = null;
    }

    async function dispatch(type) {
      if (SDK_EVENTS.includes(type)) s.sdkSeen[type] += 1;
      switch (type) {
        case 'scrollUp': move(-1); return;
        case 'scrollDown': move(1); return;
        case 'sideClick': {
          if (s.busy) return;                       // one press while something is in flight does nothing
          const item = s.items[s.hi];
          if (!item || item.info) return;            // nothing highlighted (e.g. on arrival at the confirm screen)
          await activate(item);
          return;
        }
        case 'longPressStart': s.note = 'Hold-to-talk is not part of P0. Nothing is recorded.'; return;
        case 'longPressEnd': return;
        case 'tick': if (s.screen === 'FILE' && s.data.file && !s.busy) renderFile(true); return;
        default: return; // no other way to choose anything
      }
    }

    function render() {
      const items = s.items.map((it, i) => '<li role="option" class="it' + (it.info ? ' info' : '') + (it.fact ? ' fact' : '') + (i === s.hi ? ' hi' : '')
        + '" aria-selected="' + (i === s.hi) + '" data-id="' + esc(it.id) + '"><span class="l">' + esc(it.label) + '</span>'
        + (it.sub ? '<span class="s">' + esc(it.sub) + '</span>' : '') + '</li>').join('');
      const role = s.sel.project ? ROLE_WORDS[s.sel.project.role] : '';
      return '<div class="r1" data-screen="' + s.screen + '" data-hi="' + s.hi + '">'
        + '<header class="hd"><div class="crumb" title="' + esc(crumb()) + '">' + esc(crumb()) + '</div>'
        + '<div class="who">' + esc(s.viewerName) + (role ? ' · ' + role : '') + (s.title ? ' — ' + esc(s.title) : '') + '</div></header>'
        + (s.banner ? '<div class="banner" role="status">' + esc(s.banner) + '</div>' : '')
        + '<main class="bd">' + s.body + (items ? '<ul class="list" role="listbox" aria-label="' + esc(s.title || 'Choices') + '">' + items + '</ul>' : '') + '</main>'
        + (s.note ? '<div class="note" role="status">' + esc(s.note) + '</div>' : '')
        + '<footer class="ft"><span class="syn">SYNTHETIC</span><span>' + (s.busy ? 'Working…' : 'wheel ⇅ · press ●') + '</span></footer></div>';
    }

    return {
      state: s, start, dispatch, render,
      setFault(name, value) { faults[name] = value !== false; },
      // for checks: what the screen offers now
      labels: () => s.items.map((it) => it.label),
      highlighted: () => (s.items[s.hi] || null),
    };
  }

  return { create, SDK_EVENTS };
});
