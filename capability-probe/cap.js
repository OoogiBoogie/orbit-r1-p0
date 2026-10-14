/* r1 capability probe rev 1 (Codex 5ab79507, R1-EVERYDAY-1 item 3): what a STOCK r1 creation can actually do, OBSERVED on
 * the device instead of assumed from the docs. Synthetic and noncredential: it decodes and plays only its own small test
 * files (solid red pictures and videos, a 440 Hz tone), never calls PluginMessageHandler (no rabbit LLM or provider call),
 * never starts speech recognition, sends nothing anywhere (CSP connect-src 'self' = its own files only) and stores nothing.
 *
 * Automatic and silent on open:
 *  - each test file: does it decode and render? Video: metadata, a decoded RED frame drawn to a canvas, whether muted play()
 *    is allowed WITHOUT a gesture, and whether time advances. Audio: decoding (offline WebAudio) and an <audio> element's
 *    metadata. Images: decode plus a RED pixel;
 *  - what MediaRecorder can record, whether speechSynthesis / SpeechRecognition exist (presence only), how many voices are
 *    ON-DEVICE, which rabbit channels exist (typeof only).
 * Only when the person acts (side button OR a tap, recorded separately because a host-dispatched side click is not a browser
 * gesture): a beep (<audio>), a tone (WebAudio), a short red video with sound, a fixed test phrase with an ON-DEVICE voice
 * only. A side-button HOLD records from the mic only while held and reports length, bytes and loudness; whether the page
 * was hidden or lost focus during the hold (the r1's own assistant taking over); and the SHAPE of anything delivered to
 * window.onPluginMessage (keys, types, lengths; never content). The clip is never kept or sent. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.R1CapProbe = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const REV = 1;
  const FORMATS = [
    ['video', 'H264b', 'v-h264-base.mp4', 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"'],
    ['video', 'H264h', 'v-h264-high.mp4', 'video/mp4; codecs="avc1.640028, mp4a.40.2"'],
    ['video', 'HEVC', 'v-hevc.mp4', 'video/mp4; codecs="hvc1.1.6.L93.B0, mp4a.40.2"'],
    ['video', 'VP8', 'v-vp8.webm', 'video/webm; codecs="vp8, vorbis"'],
    ['video', 'VP9', 'v-vp9.webm', 'video/webm; codecs="vp9, opus"'],
    ['video', 'AV1', 'v-av1.webm', 'video/webm; codecs="av01.0.00M.08, opus"'],
    ['audio', 'AAC', 'a-aac.m4a', 'audio/mp4; codecs="mp4a.40.2"'],
    ['audio', 'MP3', 'a-mp3.mp3', 'audio/mpeg'],
    ['audio', 'OPUSw', 'a-opus.webm', 'audio/webm; codecs="opus"'],
    ['audio', 'OPUSo', 'a-opus.ogg', 'audio/ogg; codecs="opus"'],
    ['audio', 'VORB', 'a-vorbis.ogg', 'audio/ogg; codecs="vorbis"'],
    ['audio', 'WAV', 'a-wav.wav', 'audio/wav'],
    ['audio', 'FLAC', 'a-flac.flac', 'audio/flac'],
    ['image', 'JPG', 'i-jpg.jpg', 'image/jpeg'],
    ['image', 'PNG', 'i-png.png', 'image/png'],
    ['image', 'WEBP', 'i-webp.webp', 'image/webp'],
    ['image', 'GIF', 'i-gif.gif', 'image/gif'],
    ['image', 'AVIF', 'i-avif.avif', 'image/avif'],
  ];
  const RECORD_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus', 'video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/mp4'];
  const CHANNELS = ['PluginMessageHandler', 'closeWebView', 'TouchEventHandler', 'creationStorage', 'creationSensors'];
  const ACTIONS = [['beep', 'Play a test beep (audio element)'], ['tone', 'Play a test tone (WebAudio)'], ['video', 'Play a test video with sound'], ['phrase', 'Say a test phrase (on-device voice only)'], ['again', 'Run the format tests again']];
  const ACT_NAMES = { beep: 'Beep', tone: 'Tone', video: 'Video', phrase: 'Phrase' };
  const isRed = (px) => Boolean(px) && px[0] > 150 && px[1] < 100 && px[2] < 100;
  const typeOf = (v) => (v === null ? 'null' : typeof v);

  /** One verdict per test file (pure; the page and the checks share these). */
  function verdictVideo(t) {
    if (t.error) return 'ERR' + t.error;
    if (t.timeout && !t.meta) return 'TO';
    if (t.redFrame && t.advanced) return 'OK';
    if (t.redFrame && t.play !== 'ok') return 'FRAME'; // decoded a picture; playback wasn't allowed without a gesture
    if (t.redFrame) return 'STUCK'; // decoded, play() accepted, but time didn't move
    if (t.meta) return 'META'; // dimensions only: the container opened, no red picture decoded
    return 'NO';
  }
  function verdictAudio(t) {
    if (t.decoded && t.element) return 'OK';
    if (t.decoded) return 'DEC'; // decodes as data; the <audio> element didn't load it
    if (t.element) return 'EL'; // the element loads it; data decoding failed
    return 'NO';
  }
  const verdictImage = (t) => (t.decoded && t.red ? 'OK' : t.decoded ? 'DRAW?' : 'NO');
  /** The short line for a photo: OK counts per kind, then every other verdict by name. */
  function headline(results) {
    const by = (k) => results.filter((r) => r.kind === k);
    const ok = (rs) => rs.filter((r) => r.verdict === 'OK').length;
    const bad = results.filter((r) => r.verdict !== 'OK').map((r) => r.id + '-' + r.verdict);
    return 'r' + REV + ' V' + ok(by('video')) + '/' + by('video').length + ' A' + ok(by('audio')) + '/' + by('audio').length + ' I' + ok(by('image')) + '/' + by('image').length + (bad.length ? ' x ' + bad.join(',') : '');
  }
  /** Whether muted video may start WITHOUT a gesture, from the automatic run. */
  function autoplayFact(results) {
    const plays = results.filter((r) => r.kind === 'video' && r.detail.play && r.detail.play !== 'not tried').map((r) => r.detail.play);
    if (!plays.length) return 'not tried (no video opened)';
    if (plays.some((p) => p === 'ok')) return 'allowed';
    return 'not allowed (' + Array.from(new Set(plays)).join(', ') + ')';
  }
  /** Shape of a value, never its content: keys with their types, and string lengths. */
  function shape(v, depth) {
    const d = depth || 0;
    if (v === null || typeof v !== 'object') return typeof v === 'string' ? 'string(' + v.length + ')' : typeOf(v);
    if (d > 1) return 'object';
    return '{' + Object.keys(v).slice(0, 12).map((k) => k + ':' + shape(v[k], d + 1)).join(',') + '}';
  }
  const actLine = (list) => (list.length ? list.map((x) => x.trigger + ': ' + x.outcome).join(' · ') : 'not tried');

  function boot(win, doc) {
    const $ = (id) => doc.getElementById(id);
    const state = { hi: 0, results: [], facts: {}, note: '', busy: false, running: false, hold: null, messages: [], voices: null, localVoice: null,
      ev: { side: 0, start: 0, end: 0, up: 0, down: 0, hiddenInHold: 0, blurInHold: 0 }, acts: { beep: [], tone: [], video: [], phrase: [] } };
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
    const sleep = (ms) => new Promise((r) => win.setTimeout(r, ms));
    const within = (p, ms) => Promise.race([p, sleep(ms).then(() => 'timeout')]);
    const media = (f) => 'media/' + f;
    // what rabbit's system delivers to the page: shape only
    win.onPluginMessage = (data) => { state.messages.push({ at: Date.now(), shape: shape(data) }); render(); };
    doc.addEventListener('visibilitychange', () => { if (doc.hidden && state.hold && state.hold.active) { state.ev.hiddenInHold += 1; stopHoldRecording('hidden'); } });
    win.addEventListener('blur', () => { if (state.hold && state.hold.active) state.ev.blurInHold += 1; });

    function pixel(src, w, h) {
      const c = doc.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.drawImage(src, 0, 0, w, h);
      return Array.from(g.getImageData(Math.floor(w / 2), Math.floor(h / 2), 1, 1).data);
    }
    async function testVideo(f) {
      const t = { canPlay: '', meta: false, redFrame: false, play: 'not tried', advanced: false, error: 0, timeout: false };
      const v = doc.createElement('video'); v.muted = true; v.playsInline = true; v.preload = 'auto'; v.className = 'probe-media';
      t.canPlay = v.canPlayType(f[3]);
      $('stage').appendChild(v);
      const loaded = new Promise((res) => { v.addEventListener('loadeddata', () => res('data'), { once: true }); v.addEventListener('error', () => res('error'), { once: true }); });
      v.src = media(f[2]);
      const r = await within(loaded, 6000);
      if (r === 'error') t.error = (v.error && v.error.code) || 1;
      else if (r === 'timeout') t.timeout = true;
      t.meta = v.videoWidth > 0;
      if (!t.error && t.meta) {
        try { t.redFrame = isRed(pixel(v, 16, 12)); } catch (e) { t.redFrame = false; }
        try { const p = await within(v.play(), 3000); t.play = p === 'timeout' ? 'timeout' : 'ok'; } catch (e) { t.play = (e && e.name) || 'refused'; }
        const t0 = v.currentTime;
        for (let i = 0; i < 20 && v.currentTime - t0 < 0.2; i++) await sleep(100);
        t.advanced = v.currentTime - t0 >= 0.2;
        if (!t.redFrame) { try { t.redFrame = isRed(pixel(v, 16, 12)); } catch (e) { t.redFrame = false; } }
      }
      try { v.pause(); } catch (e) { /* gone */ }
      v.removeAttribute('src'); try { v.load(); } catch (e) { /* gone */ }
      v.remove();
      return t;
    }
    async function testAudio(f) {
      const t = { canPlay: '', decoded: false, element: false, duration: null };
      const a = doc.createElement('audio'); a.preload = 'auto'; a.muted = true;
      t.canPlay = a.canPlayType(f[3]);
      try {
        const Off = win.OfflineAudioContext || win.webkitOfflineAudioContext;
        if (Off) {
          const buf = await (await win.fetch(media(f[2]))).arrayBuffer();
          const ctx = new Off(1, 48000, 48000);
          // callbacks for old WebViews; newer ones ALSO return a promise, whose rejection is caught here
          const decoded = await within(new Promise((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p && p.catch) p.catch(rej); }), 6000).catch(() => null);
          t.decoded = Boolean(decoded && decoded !== 'timeout' && decoded.duration > 1);
          if (t.decoded) t.duration = Math.round(decoded.duration * 10) / 10;
        }
      } catch (e) { t.decoded = false; }
      const loaded = new Promise((res) => { a.addEventListener('loadedmetadata', () => res('meta'), { once: true }); a.addEventListener('error', () => res('error'), { once: true }); });
      a.src = media(f[2]);
      const r = await within(loaded, 6000);
      t.element = r === 'meta' && a.duration > 0; // > 0, not the full 2 s: without byte ranges Chrome estimates Ogg length short
      a.removeAttribute('src'); try { a.load(); } catch (e) { /* gone */ }
      return t;
    }
    async function testImage(f) {
      const t = { decoded: false, red: false };
      const img = new win.Image();
      img.src = media(f[2]);
      try { const d = await within(img.decode(), 6000); t.decoded = d !== 'timeout' && img.naturalWidth === 64; if (t.decoded) t.red = isRed(pixel(img, 64, 48)); } catch (e) { t.decoded = false; }
      return t;
    }
    async function formats() {
      if (state.running) return;
      state.running = true; state.results = []; render();
      try {
        for (const f of FORMATS) {
          const t = f[0] === 'video' ? await testVideo(f) : f[0] === 'audio' ? await testAudio(f) : await testImage(f);
          const verdict = f[0] === 'video' ? verdictVideo(t) : f[0] === 'audio' ? verdictAudio(t) : verdictImage(t);
          state.results.push({ kind: f[0], id: f[1], file: f[2], verdict, detail: t });
          render();
        }
        state.facts['Muted autoplay without a gesture'] = autoplayFact(state.results);
      } finally { state.running = false; }
    }
    function facts() {
      const MR = win.MediaRecorder;
      state.facts['Records'] = MR ? (RECORD_TYPES.filter((m) => typeof MR.isTypeSupported === 'function' && MR.isTypeSupported(m)).join(', ') || 'none of the listed types') : 'no MediaRecorder';
      state.facts['Mic/camera API'] = win.navigator.mediaDevices && win.navigator.mediaDevices.getUserMedia ? 'present' : 'absent';
      state.facts['Speech recognition API'] = (win.SpeechRecognition ? 'SpeechRecognition' : win.webkitSpeechRecognition ? 'webkitSpeechRecognition' : 'absent') + ' (presence only; never started)';
      state.facts['speechSynthesis'] = win.speechSynthesis ? 'present' : 'absent';
      state.facts['Channels'] = CHANNELS.map((c) => c + ':' + typeOf(win[c])).join(', ');
      state.facts['This browser'] = String(win.navigator.userAgent || '').slice(0, 180);
    }
    async function voices() {
      const ss = win.speechSynthesis;
      if (!ss) { state.voices = { total: 0, local: 0, langs: [] }; state.facts['Voices'] = 'none (no speechSynthesis)'; return; }
      let list = ss.getVoices();
      if (!list.length) { await within(new Promise((res) => { ss.onvoiceschanged = () => res(); }), 3000); list = ss.getVoices(); }
      const local = list.filter((v) => v.localService);
      state.voices = { total: list.length, local: local.length, langs: Array.from(new Set(local.map((v) => v.lang))).slice(0, 6) };
      state.localVoice = local.find((v) => /^en/i.test(v.lang)) || local[0] || null;
      state.facts['Voices'] = list.length + ' (on-device ' + local.length + (local.length ? ': ' + state.voices.langs.join(' ') : '') + ')';
    }
    // ---- person-pressed tests: play() / resume() / speak() are called synchronously from the press, so a TAP counts as a gesture ----
    async function playEl(el) {
      try { await within(el.play(), 3000); } catch (e) { return 'refused ' + ((e && e.name) || ''); }
      const t0 = el.currentTime;
      for (let i = 0; i < 15 && el.currentTime - t0 < 0.3; i++) await sleep(100);
      return el.currentTime - t0 >= 0.3 ? 'played' : 'stuck';
    }
    async function beep() {
      const a = doc.createElement('audio'); a.src = media('a-wav.wav'); a.volume = 0.6;
      const r = await playEl(a);
      if (r === 'played') await sleep(1200);
      try { a.pause(); } catch (e) { /* gone */ }
      a.removeAttribute('src');
      return r;
    }
    async function tone() {
      const Ctx = win.AudioContext || win.webkitAudioContext;
      if (!Ctx) return 'no WebAudio';
      const ctx = new Ctx();
      if (ctx.state === 'suspended') { try { await within(ctx.resume(), 1500); } catch (e) { /* stays suspended */ } }
      const st = ctx.state; let advanced = false;
      if (st === 'running') {
        const o = ctx.createOscillator(); const g = ctx.createGain(); g.gain.value = 0.2; o.frequency.value = 660;
        o.connect(g); g.connect(ctx.destination); const at = ctx.currentTime; o.start(); o.stop(at + 0.8);
        await sleep(1000); advanced = ctx.currentTime - at > 0.5;
      }
      try { ctx.close(); } catch (e) { /* closed */ }
      return st === 'running' ? (advanced ? 'played' : 'stuck') : 'context ' + st;
    }
    async function video() {
      const ok = state.results.find((r) => r.kind === 'video' && /^(OK|FRAME|STUCK)$/.test(r.verdict));
      const file = ok ? ok.file : 'v-h264-base.mp4';
      const box = $('player'); const v = doc.createElement('video'); v.playsInline = true; v.className = 'player'; v.src = media(file);
      box.appendChild(v); box.hidden = false;
      let r = await playEl(v);
      if (r.indexOf('refused') === 0) { v.muted = true; const m = await playEl(v); r += '; muted ' + m; } else r += ' unmuted';
      await sleep(900);
      try { v.pause(); } catch (e) { /* gone */ }
      v.removeAttribute('src'); try { v.load(); } catch (e) { /* gone */ }
      v.remove(); box.hidden = true;
      return file.replace(/^v-|\.\w+$/g, '') + ' ' + r;
    }
    function phrase() {
      return new Promise((res) => {
        const ss = win.speechSynthesis;
        if (!ss) return res('no speechSynthesis');
        if (!state.localVoice) return res('not spoken: no on-device voice (' + (state.voices ? state.voices.total : 0) + ' voices)');
        const u = new win.SpeechSynthesisUtterance('This is the ORBIT speaker test.');
        u.voice = state.localVoice; u.lang = state.localVoice.lang;
        let started = false; let tm = 0;
        const done = (x) => { win.clearTimeout(tm); res(x); };
        u.onstart = () => { started = true; };
        u.onend = () => done(started ? 'spoke' : 'ended without starting');
        u.onerror = (e) => done('error ' + ((e && e.error) || ''));
        tm = win.setTimeout(() => { try { ss.cancel(); } catch (e) { /* gone */ } res(started ? 'still speaking at 8 s' : 'never started'); }, 8000);
        ss.speak(u);
      });
    }
    const RUN = { beep, tone, video, phrase };
    async function press(trigger) {
      if (state.busy) return;
      const a = ACTIONS[state.hi]; if (!a) return; // highlighted row is a result line, not an action
      state.busy = true; state.note = a[1] + '…'; render();
      try {
        if (a[0] === 'again') { state.note = ''; await formats(); } else {
          const out = await RUN[a[0]]();
          state.acts[a[0]].push({ trigger, outcome: out });
          state.note = /^(played|spoke)|unmuted/.test(out) ? ACT_NAMES[a[0]] + ' ' + out + ' (' + trigger + '). Did you HEAR it? Tell the chat.' : ACT_NAMES[a[0]] + ': ' + out + ' (' + trigger + ').';
        }
      } catch (e) { state.note = 'Error: ' + ((e && e.name) || 'unknown'); } finally { state.busy = false; render(); }
    }
    // ---- side-button hold: the mic is open ONLY while held; nothing is kept ----
    async function startHoldRecording() {
      state.ev.start += 1;
      if (state.hold && state.hold.active) return;
      const h = { active: true, t0: Date.now(), bytes: 0, ms: 0, peak: 0, type: '', outcome: 'starting' };
      state.hold = h; render();
      if (!win.navigator.mediaDevices || !win.navigator.mediaDevices.getUserMedia || !win.MediaRecorder) { h.outcome = 'no mic API'; h.active = false; h.ms = 0; render(); return; }
      try {
        const st = await win.navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        if (!h.active) { st.getTracks().forEach((x) => x.stop()); h.outcome = 'released before the mic opened'; render(); return; }
        h.stream = st;
        const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => win.MediaRecorder.isTypeSupported(m)) || '';
        const rec = new win.MediaRecorder(st, type ? { mimeType: type } : undefined); h.rec = rec; h.type = type || 'default';
        rec.ondataavailable = (e) => { if (e.data) h.bytes += e.data.size; };
        try {
          const Ctx = win.AudioContext || win.webkitAudioContext; h.ctx = new Ctx(); const an = h.ctx.createAnalyser(); h.ctx.createMediaStreamSource(st).connect(an);
          const buf = new Uint8Array(an.fftSize);
          h.meter = win.setInterval(() => { an.getByteTimeDomainData(buf); let m = 0; for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i] - 128)); h.peak = Math.max(h.peak, Math.round(m / 1.28)); }, 50);
        } catch (e) { /* no meter */ }
        rec.start(250); h.outcome = 'recording';
      } catch (e) { h.outcome = 'mic refused: ' + ((e && e.name) || ''); h.active = false; h.ms = Date.now() - h.t0; }
      render();
    }
    function stopHoldRecording(why) {
      if (why === 'end') state.ev.end += 1;
      const h = state.hold; if (!h || !h.active) { render(); return; }
      h.active = false; h.ms = Date.now() - h.t0;
      win.clearInterval(h.meter);
      try { if (h.rec && h.rec.state !== 'inactive') h.rec.stop(); } catch (e) { /* stopped */ }
      try { if (h.stream) h.stream.getTracks().forEach((x) => x.stop()); } catch (e) { /* stopped */ }
      try { if (h.ctx) h.ctx.close(); } catch (e) { /* closed */ }
      h.stream = null; h.ctx = null; // the clip is never kept or sent
      if (h.outcome === 'recording') h.outcome = 'recorded';
      if (why === 'hidden') h.outcome += ' (stopped: page hidden)';
      win.setTimeout(() => { h.rec = null; render(); }, 400); win.setTimeout(render, 10000); // late data and messages within 10 s show up
      render();
    }
    // ---- screen ----
    function snapshot() {
      const h = state.hold; const done = state.results.length === FORMATS.length && !state.running;
      return { rev: REV, done, headline: done ? headline(state.results) : null, results: state.results, facts: state.facts, voices: state.voices, acts: state.acts, ev: state.ev,
        hold: h ? { outcome: h.outcome, ms: h.active ? Date.now() - h.t0 : h.ms, bytes: h.bytes, peak: h.peak, type: h.type } : null, messages: state.messages };
    }
    function render() {
      const root = $('cap'); if (!root) return;
      const s = snapshot();
      const lines = [];
      if (state.note) lines.push(['', state.note]);
      for (const id of Object.keys(ACT_NAMES)) lines.push([ACT_NAMES[id], actLine(state.acts[id])]);
      const h = s.hold;
      lines.push(['Side-button hold', h ? h.outcome + ' · ' + Math.round(h.ms / 100) / 10 + ' s · ' + h.bytes + ' B ' + (h.type || '') + ' · loudness ' + h.peak + '% · page hidden ' + state.ev.hiddenInHold + ' · lost focus ' + state.ev.blurInHold
        : 'not tried. Hold the side button 2–3 s and say only "one two three": the r1 itself may hand speech to rabbit\'s assistant.']);
      lines.push(['Messages to this page', state.messages.length ? state.messages.length + ': ' + state.messages.slice(-2).map((m) => m.shape).join(' ; ') : 'none (window.onPluginMessage watched; shape only)']);
      lines.push(['Hardware events', 'side ' + state.ev.side + ' · hold start ' + state.ev.start + ' / end ' + state.ev.end + ' · wheel up ' + state.ev.up + ' / down ' + state.ev.down]);
      for (const x of state.results) lines.push([x.id, x.verdict + (x.kind === 'video' ? ' · play ' + x.detail.play : '') + (x.kind !== 'image' ? ' · canPlayType "' + (x.detail.canPlay || '') + '"' : '')]);
      for (const k of Object.keys(state.facts)) lines.push([k, state.facts[k]]);
      const rows = ACTIONS.length + lines.length;
      if (state.hi >= rows) state.hi = rows - 1;
      const li = ACTIONS.map((a, i) => '<li class="act' + (i === state.hi ? ' hi' : '') + '" data-i="' + i + '">' + esc(a[1]) + '</li>')
        .concat(lines.map((l, j) => '<li data-i="' + (ACTIONS.length + j) + '"' + (ACTIONS.length + j === state.hi ? ' class="hi"' : '') + '>' + (l[0] ? '<span class="k">' + esc(l[0]) + '</span> ' : '') + esc(l[1]) + '</li>'));
      root.innerHTML = '<header class="hd"><div class="t">r1 capability probe · rev ' + REV + '</div><div class="c" id="code">' + esc(s.done ? s.headline : 'testing formats ' + state.results.length + '/' + FORMATS.length + '…') + '</div><div class="s">'
        + (s.done ? 'Photo this; turn the wheel for each line. Side button or tap = do the highlighted action.' : 'Working (about a minute). Nothing is sent or stored.') + '</div></header><ul class="list">' + li.join('') + '</ul>';
      const hiEl = root.querySelector('li.hi'); if (hiEl && hiEl.scrollIntoView) hiEl.scrollIntoView({ block: 'nearest' });
      win.R1CapResult = s;
    }
    const move = (d) => { state.hi = Math.max(0, state.hi + d); render(); };
    win.addEventListener('scrollUp', () => { state.ev.up += 1; move(-1); });
    win.addEventListener('scrollDown', () => { state.ev.down += 1; move(1); });
    win.addEventListener('sideClick', () => { state.ev.side += 1; press('side'); });
    win.addEventListener('longPressStart', () => { startHoldRecording(); });
    win.addEventListener('longPressEnd', () => { stopHoldRecording('end'); });
    $('cap').addEventListener('click', (e) => { const el = e.target && e.target.closest ? e.target.closest('li[data-i]') : null; if (!el) return; state.hi = Number(el.getAttribute('data-i')); press('tap'); });
    win.addEventListener('keydown', (e) => { if (e.key === 'ArrowUp') move(-1); else if (e.key === 'ArrowDown') move(1); else if (e.key === 'Enter') press('key'); });
    win.addEventListener('pagehide', () => { stopHoldRecording('hidden'); });
    facts(); render();
    (async () => { await voices(); render(); await formats(); render(); })();
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined' && !window.__R1_CAP_NO_AUTOBOOT) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => boot(window, document)); else boot(window, document);
  }
  return { REV, FORMATS, ACTIONS, verdictVideo, verdictAudio, verdictImage, headline, autoplayFact, shape };
});
