/* r1 capture check (local only). Takes ONE photo or records ONE 3-second clip when the person asks, shows it on this
 * screen, and throws it away. Nothing is sent (CSP connect-src 'none') and nothing is stored (no storage API is used).
 *
 * Lifecycle (fix for Codex 4778d791, the late-camera privacy race): every capture runs in a numbered generation.
 * Hide, pagehide, Back/home, Discard, Close and starting another capture INVALIDATE the generation: they stop every
 * track, stop the recorder and the level meter, and revoke every object URL. Anything that arrives afterwards (a late
 * permission answer, a late frame encode, a late recorder stop) checks its generation and the page's visibility first;
 * a late stream is stopped BEFORE it is assigned or played, and no late result creates media, UI or an object URL.
 *
 * Controls: the r1 SDK's own events (scrollUp, scrollDown, sideClick, longPressStart, longPressEnd); on a desktop,
 * arrow keys / Space / Enter / Shift dispatch the same events. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const live = $('live'); const shot = $('shot'); const play = $('play');
  const SDK = ['scrollUp', 'scrollDown', 'sideClick', 'longPressStart', 'longPressEnd'];
  const S = { screen: 'HOME', hi: 0, items: [], busy: false, facing: 'environment', stream: null, photo: null, clip: null,
    level: 0, peak: 0, note: '', seen: Object.fromEntries(SDK.map((e) => [e, 0])), log: [] };
  const L = { gen: 0, raf: 0, ctx: null, rec: null }; // the lifecycle generation and what it owns
  const urls = new Set();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const record = (what) => { S.log.push(new Date().toISOString().slice(11, 19) + ' ' + what); };
  const current = (g) => g === L.gen && !document.hidden;
  const stopStream = (st) => { try { st.getTracks().forEach((t) => t.stop()); } catch (e) { /* already gone */ } };

  function stopAll() {
    if (S.stream) { stopStream(S.stream); record('tracks stopped'); S.stream = null; }
    live.srcObject = null;
  }
  /** End the current generation: nothing started before this may show, play or keep anything afterwards. */
  function invalidate(why) {
    L.gen += 1;
    if (L.raf) { cancelAnimationFrame(L.raf); L.raf = 0; }
    if (L.ctx) { try { L.ctx.close(); } catch (e) { /* closed */ } L.ctx = null; }
    if (L.rec) { try { if (L.rec.state !== 'inactive') L.rec.stop(); } catch (e) { /* stopped */ } L.rec = null; }
    stopAll();
    try { play.pause(); } catch (e) { /* not playing */ }
    play.removeAttribute('src');
    shot.removeAttribute('src');
    for (const u of urls) URL.revokeObjectURL(u);
    urls.clear();
    S.photo = null; S.clip = null; S.level = 0; S.peak = 0;
    record('invalidated (' + why + ')');
  }
  const liveTracks = () => (S.stream ? S.stream.getTracks().filter((t) => t.readyState === 'live').length : 0);
  const why = (err) => {
    const n = err && err.name;
    if (n === 'NotAllowedError') return 'Permission was refused on this r1 (NotAllowedError).';
    if (n === 'NotFoundError') return 'No ' + (S.screen === 'MIC' ? 'microphone' : 'camera') + ' was found (NotFoundError).';
    if (n === 'NotReadableError') return 'The device is busy or blocked (NotReadableError).';
    if (n === 'SecurityError') return 'Not allowed in this page (SecurityError).';
    if (n === 'OverconstrainedError') return 'That camera direction is not available (OverconstrainedError).';
    if (n === 'NotSupportedError' || n === 'NotSupported') return 'This page can’t use the ' + (S.screen === 'MIC' ? 'microphone' : 'camera') + ' here (' + n + ').';
    return (n || 'Error') + ': ' + (err && err.message ? err.message : String(err));
  };
  const askMedia = (constraints) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return Promise.reject(Object.assign(new Error('getUserMedia is not available here'), { name: 'NotSupported' }));
    return navigator.mediaDevices.getUserMedia(constraints);
  };

  // ---------- screens ----------
  function home(why) {
    invalidate(why || 'home');
    S.screen = 'HOME'; S.hi = 0;
    S.items = [
      { id: 'camera', label: 'Camera: take one photo', sub: 'Shown here, then thrown away' },
      { id: 'mic', label: 'Microphone: record 3 seconds', sub: 'Played back here, then thrown away' },
      { id: 'support', label: 'What this r1 supports', sub: 'No camera or mic needed' },
    ];
    if (window.closeWebView && typeof window.closeWebView.postMessage === 'function') S.items.push({ id: 'close', label: 'Close' });
  }
  async function camera() {
    invalidate('camera start');
    const g = L.gen;
    S.screen = 'CAMERA'; S.hi = 0; S.items = [{ id: 'wait', label: 'Starting the camera…', info: true }];
    paint();
    let stream;
    try {
      stream = await askMedia({ video: { facingMode: { ideal: S.facing }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
    } catch (err) {
      if (!current(g)) return; // the person already left; nothing to show
      S.items = [{ id: 'err', label: why(err), info: true }, { id: 'home', label: '‹ Back' }];
      record('camera refused: ' + (err && err.name));
      return;
    }
    if (!current(g)) { stopStream(stream); record('late camera stream stopped before use'); return; }
    S.stream = stream;
    record('camera on (' + S.facing + ')');
    live.srcObject = stream;
    await live.play().catch(() => undefined);
    if (!current(g)) return; // invalidate() has already stopped it
    const set = stream.getVideoTracks()[0].getSettings();
    S.items = [
      { id: 'take', label: 'Take the photo', sub: 'Camera: ' + (set.facingMode || 'unknown direction') + ' · ' + (set.width || '?') + '×' + (set.height || '?') },
      { id: 'flip', label: 'Switch camera direction' },
      { id: 'home', label: '‹ Back (camera off)' },
    ];
  }
  async function take() {
    const g = L.gen;
    if (!S.stream || !current(g)) return;
    const w = live.videoWidth; const h = live.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(live, 0, 0, w, h);
    stopAll(); // the camera goes off as soon as the frame is taken
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    if (!current(g) || !blob) { record('late photo dropped'); return; }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (!current(g)) { record('late photo dropped'); return; }
    const exif = hasExif(bytes);
    const url = URL.createObjectURL(blob); urls.add(url);
    shot.src = url;
    S.photo = { w, h, bytes: blob.size, exif };
    record('photo ' + w + 'x' + h + ' ' + blob.size + ' B, EXIF ' + (exif ? 'found' : 'none'));
    S.screen = 'PHOTO'; S.hi = 0;
    S.items = [
      { id: 'fact', label: 'Photo', sub: w + '×' + h + ' · ' + Math.round(blob.size / 1024) + ' KB · JPEG', fact: true },
      { id: 'fact', label: 'Location / EXIF data', sub: exif ? 'FOUND (would be removed before any send)' : 'none', fact: true },
      { id: 'fact', label: 'Camera now', sub: liveTracks() ? 'ON' : 'off', fact: true },
      { id: 'discard', label: 'Discard', sub: 'Throw it away now' },
      { id: 'camera', label: 'Take another' },
    ];
  }
  function hasExif(b) { // an APP1 "Exif\0\0" segment near the start of the JPEG
    for (let i = 2; i < Math.min(b.length - 10, 65536); i++) {
      if (b[i] === 0xff && b[i + 1] === 0xe1 && b[i + 4] === 0x45 && b[i + 5] === 0x78 && b[i + 6] === 0x69 && b[i + 7] === 0x66) return true;
    }
    return false;
  }
  function micScreen() {
    invalidate('mic screen');
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    S.mime = window.MediaRecorder ? (types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '') : null;
    S.screen = 'MIC'; S.hi = 0;
    S.items = S.mime === null
      ? [{ id: 'err', label: 'Recording is not available in this r1 browser (no MediaRecorder).', info: true }, { id: 'home', label: '‹ Back' }]
      : [{ id: 'rec', label: 'Record 3 seconds', sub: 'The mic is on only while recording' }, { id: 'home', label: '‹ Back' }];
  }
  async function rec() {
    invalidate('mic start');
    const g = L.gen;
    S.items = [{ id: 'wait', label: 'Recording… 3 s', info: true }]; S.busy = true; paint();
    try {
      let stream;
      try { stream = await askMedia({ audio: true, video: false }); }
      catch (err) {
        if (!current(g)) return;
        S.items = [{ id: 'err', label: why(err), info: true }, { id: 'home', label: '‹ Back' }];
        record('mic refused: ' + (err && err.name));
        return;
      }
      if (!current(g)) { stopStream(stream); record('late mic stream stopped before use'); return; }
      S.stream = stream;
      record('mic on');
      try {
        L.ctx = new (window.AudioContext || window.webkitAudioContext)();
        const an = L.ctx.createAnalyser(); an.fftSize = 512;
        L.ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => {
          if (!current(g)) return;
          an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128));
          S.level = Math.min(100, Math.round(m / 1.28)); S.peak = Math.max(S.peak, S.level); paintMeter();
          L.raf = requestAnimationFrame(tick);
        };
        tick();
      } catch (e) { record('level meter unavailable: ' + (e && e.name)); }
      const chunks = [];
      const mr = new MediaRecorder(stream, S.mime ? { mimeType: S.mime } : undefined);
      L.rec = mr;
      mr.ondataavailable = (e) => { if (current(g) && e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise((res) => { mr.onstop = res; });
      const t0 = performance.now();
      mr.start();
      await new Promise((res) => setTimeout(res, 3000));
      if (current(g) && mr.state !== 'inactive') mr.stop();
      await Promise.race([stopped, new Promise((res) => setTimeout(res, 2000))]);
      if (!current(g)) { chunks.length = 0; record('late clip dropped'); return; }
      const ms = Math.round(performance.now() - t0);
      if (L.raf) { cancelAnimationFrame(L.raf); L.raf = 0; }
      if (L.ctx) { try { L.ctx.close(); } catch (e) { /* closed */ } L.ctx = null; }
      L.rec = null;
      stopAll(); // the mic goes off as soon as the clip ends
      const blob = new Blob(chunks, { type: mr.mimeType || S.mime || 'audio/webm' });
      if (!current(g)) { record('late clip dropped'); return; }
      const url = URL.createObjectURL(blob); urls.add(url);
      play.src = url;
      S.clip = { bytes: blob.size, ms, mime: blob.type, peak: S.peak };
      record('clip ' + blob.size + ' B ' + ms + ' ms ' + blob.type + ' peak ' + S.peak);
      S.screen = 'CLIP'; S.hi = 0;
      S.items = [
        { id: 'fact', label: 'Clip', sub: (blob.size / 1024).toFixed(1) + ' KB · ' + (ms / 1000).toFixed(1) + ' s · ' + (blob.type || 'unknown type'), fact: true },
        { id: 'fact', label: 'Sound heard', sub: S.peak > 3 ? 'yes (peak ' + S.peak + '%)' : 'very quiet or silent (peak ' + S.peak + '%)', fact: true },
        { id: 'fact', label: 'Microphone now', sub: liveTracks() ? 'ON' : 'off', fact: true },
        { id: 'play', label: 'Play it back' },
        { id: 'discard', label: 'Discard', sub: 'Throw it away now' },
      ];
    } finally { S.busy = false; }
  }
  async function support() {
    invalidate('support');
    const g = L.gen;
    const f = {};
    f['This browser'] = (navigator.userAgent || 'unknown').slice(0, 240);
    f['Window'] = (window.innerWidth || '?') + '×' + (window.innerHeight || '?') + ' @' + (window.devicePixelRatio || 1) + 'x · drawn at ' + Math.round(fitState.s * 100) + '%';
    f['Secure context'] = String(window.isSecureContext);
    f['Camera/mic API'] = navigator.mediaDevices && navigator.mediaDevices.getUserMedia ? 'present' : 'absent';
    f['Recording (MediaRecorder)'] = window.MediaRecorder ? (['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'].filter((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)).join(', ') || 'present, no listed type') : 'absent';
    try {
      const devs = navigator.mediaDevices && navigator.mediaDevices.enumerateDevices ? await navigator.mediaDevices.enumerateDevices() : [];
      f['Devices seen'] = ['videoinput', 'audioinput', 'audiooutput'].map((k) => k + ' ' + devs.filter((d) => d.kind === k).length).join(', ');
    } catch (e) { f['Devices seen'] = 'error ' + e.name; }
    for (const name of ['camera', 'microphone']) {
      try { f['Permission: ' + name] = navigator.permissions ? (await navigator.permissions.query({ name })).state : 'no permissions API'; }
      catch (e) { f['Permission: ' + name] = 'not reported'; }
    }
    if (!current(g)) return;
    f['SDK objects'] = ['PluginMessageHandler', 'creationStorage', 'creationSensors', 'closeWebView'].map((n) => n + (typeof window[n] !== 'undefined' ? ' yes' : ' no')).join(', ');
    f['SDK events seen'] = SDK.map((e) => e + ' ' + S.seen[e]).join(', ');
    f['Network'] = "none: CSP connect-src 'none'";
    f['Storage'] = 'not used';
    S.screen = 'SUPPORT'; S.hi = 0;
    S.items = Object.keys(f).map((k) => ({ id: 'fact', label: k, sub: f[k], fact: true })).concat([{ id: 'home', label: '‹ Back' }]);
  }

  // ---------- events ----------
  async function activate(it) {
    switch (it.id) {
      case 'camera': return camera();
      case 'take': return take();
      case 'flip': S.facing = S.facing === 'environment' ? 'user' : 'environment'; return camera();
      case 'mic': return micScreen();
      case 'rec': return rec();
      case 'play':
        if (!S.clip || !play.getAttribute('src')) return undefined;
        try { await play.play(); S.note = 'Playing on the r1 speaker.'; } catch (e) { S.note = 'Playback failed: ' + e.name; }
        return undefined;
      case 'discard': home('discard'); S.note = 'Thrown away. Camera and mic are off.'; return undefined;
      case 'support': return support();
      case 'home': home('back'); return undefined;
      case 'close': invalidate('close'); window.closeWebView.postMessage(''); return undefined;
      default: return undefined;
    }
  }
  function move(d) {
    const f = S.items.map((it, i) => (it.info ? -1 : i)).filter((i) => i >= 0);
    if (!f.length) return;
    let p = f.indexOf(S.hi); if (p < 0) p = d > 0 ? -1 : f.length;
    S.hi = f[Math.max(0, Math.min(f.length - 1, p + d))];
  }
  async function dispatch(type) {
    if (SDK.includes(type)) S.seen[type] += 1;
    if (type === 'scrollUp') move(-1);
    else if (type === 'scrollDown') move(1);
    else if (type === 'sideClick') {
      if (S.busy) return;
      const it = S.items[S.hi];
      if (!it || it.info || it.fact) return;
      S.note = ''; S.busy = true;
      try { await activate(it); } finally { S.busy = false; }
    } else if (type === 'longPressStart') S.note = 'Long press seen by this page (nothing is recorded by it).';
  }

  // ---------- drawing ----------
  function paintMeter() {
    const bar = $('bar');
    bar.className = 'bar w' + Math.round(S.level / 10);
  }
  function paint() {
    const titles = { HOME: 'Capture check', CAMERA: 'Camera', PHOTO: 'Photo (not kept)', MIC: 'Microphone', CLIP: 'Clip (not kept)', SUPPORT: 'What this r1 supports' };
    $('title').textContent = titles[S.screen] || 'Capture check';
    $('sub').textContent = (S.screen === 'CAMERA' || (S.screen === 'MIC' && S.busy)) && liveTracks()
      ? '● ' + (S.screen === 'CAMERA' ? 'Camera' : 'Mic') + ' is ON' : 'Nothing is sent. Nothing is kept.';
    live.hidden = S.screen !== 'CAMERA' || !S.stream;
    shot.hidden = S.screen !== 'PHOTO' || !shot.getAttribute('src');
    $('meter').hidden = !(S.screen === 'MIC' && S.busy) && S.screen !== 'CLIP';
    if (S.screen === 'CLIP') { $('bar').className = 'bar w' + Math.round(S.peak / 10); }
    $('bd').innerHTML = '<ul class="list" role="listbox" aria-label="Choices">' + S.items.map((it, i) => '<li role="option" class="it'
      + (it.fact ? ' fact' : '') + (i === S.hi && !it.info ? ' hi' : '') + '" aria-selected="' + (i === S.hi) + '"><span class="l">' + esc(it.label) + '</span>'
      + (it.sub ? '<span class="s">' + esc(it.sub) + '</span>' : '') + '</li>').join('') + '</ul>';
    const hi = $('bd').querySelector('.it.hi');
    if (hi && hi.scrollIntoView) hi.scrollIntoView({ block: 'nearest' });
    $('note').hidden = !S.note; $('note').textContent = S.note;
    $('hint').textContent = S.busy ? 'Working…' : '⇅ · ●';
  }
  const run = (type) => { const p = dispatch(type).then(paint, (e) => { record('error ' + e.message); paint(); }); paint(); return p; };
  for (const name of SDK) window.addEventListener(name, () => { run(name); });
  const KEYS = { ArrowUp: 'scrollUp', ArrowDown: 'scrollDown', ' ': 'sideClick', Enter: 'sideClick' };
  window.addEventListener('keydown', (e) => {
    if (KEYS[e.key]) { e.preventDefault(); window.dispatchEvent(new Event(KEYS[e.key])); }
    else if (e.key === 'Shift' && !e.repeat) window.dispatchEvent(new Event('longPressStart'));
  });
  window.addEventListener('keyup', (e) => { if (e.key === 'Shift') window.dispatchEvent(new Event('longPressEnd')); });
  document.addEventListener('visibilitychange', () => { if (document.hidden) { home('hidden'); paint(); } });
  window.addEventListener('pagehide', () => { home('pagehide'); paint(); });

  // Fit the 240x282 design to whatever window the r1 gives a creation (owner feedback from the r1, 13 Oct 22:16Z: "the size of the window").
  // Scales the whole screen evenly and centres it; layout and logic are unchanged.
  const fitState = { w: 0, h: 0, s: 1 };
  function fit() {
    const box = document.getElementById('r1');
    if (!box || !box.style) return;
    const w = window.innerWidth || 240; const h = window.innerHeight || 282;
    const s = Math.max(0.5, Math.min(w / 240, h / 282));
    fitState.w = w; fitState.h = h; fitState.s = s;
    box.style.transformOrigin = 'top left';
    box.style.transform = Math.abs(s - 1) < 0.01 ? '' : 'scale(' + s.toFixed(4) + ')';
    box.style.marginLeft = Math.max(0, Math.floor((w - 240 * s) / 2)) + 'px';
    box.style.marginTop = Math.max(0, Math.floor((h - 282 * s) / 2)) + 'px';
  }
  window.addEventListener('resize', fit);
  fit();

  window.r1cap = { state: S, run, liveTracks, urls, generation: () => L.gen, fit: () => Object.assign({}, fitState) };
  home('start'); paint();
})();
