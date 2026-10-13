/* r1 capture check (local only). Takes ONE photo or records ONE 3-second clip when the person asks, shows it on this
 * screen, and throws it away. Nothing is sent (CSP connect-src 'none') and nothing is stored (no storage API is used).
 * The camera and microphone are on only while a capture is happening, and stop as soon as it is done, on Discard,
 * on Back, and when the page is hidden. Controls: the r1 SDK's own events (scrollUp, scrollDown, sideClick,
 * longPressStart, longPressEnd); on a desktop, arrow keys / Space / Enter / Shift dispatch the same events. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const live = $('live'); const shot = $('shot'); const play = $('play');
  const SDK = ['scrollUp', 'scrollDown', 'sideClick', 'longPressStart', 'longPressEnd'];
  const S = { screen: 'HOME', hi: 0, items: [], busy: false, facing: 'environment', stream: null, photo: null, clip: null,
    level: 0, peak: 0, note: '', seen: Object.fromEntries(SDK.map((e) => [e, 0])), log: [] };
  const urls = new Set();
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const record = (what) => { S.log.push(new Date().toISOString().slice(11, 19) + ' ' + what); };

  function stopAll() {
    if (S.stream) { S.stream.getTracks().forEach((t) => t.stop()); record('tracks stopped'); S.stream = null; }
    live.srcObject = null;
  }
  function discard() {
    stopAll();
    try { play.pause(); } catch (e) { /* not playing */ }
    play.removeAttribute('src');
    shot.removeAttribute('src');
    for (const u of urls) URL.revokeObjectURL(u);
    urls.clear();
    S.photo = null; S.clip = null; S.level = 0; S.peak = 0;
    record('discarded');
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

  // ---------- screens ----------
  function home() {
    discard();
    S.screen = 'HOME'; S.hi = 0;
    S.items = [
      { id: 'camera', label: 'Camera: take one photo', sub: 'Shown here, then thrown away' },
      { id: 'mic', label: 'Microphone: record 3 seconds', sub: 'Played back here, then thrown away' },
      { id: 'support', label: 'What this r1 supports', sub: 'No camera or mic needed' },
    ];
    if (window.closeWebView && typeof window.closeWebView.postMessage === 'function') S.items.push({ id: 'close', label: 'Close' });
  }
  async function camera() {
    stopAll();
    S.screen = 'CAMERA'; S.hi = 0; S.items = [{ id: 'wait', label: 'Starting the camera…', info: true }];
    paint();
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('getUserMedia is not available here'), { name: 'NotSupported' });
      S.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: S.facing }, width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
      record('camera on (' + S.facing + ')');
      live.srcObject = S.stream;
      await live.play().catch(() => undefined);
      const set = S.stream.getVideoTracks()[0].getSettings();
      S.items = [
        { id: 'take', label: 'Take the photo', sub: 'Camera: ' + (set.facingMode || 'unknown direction') + ' · ' + (set.width || '?') + '×' + (set.height || '?') },
        { id: 'flip', label: 'Switch camera direction' },
        { id: 'home', label: '‹ Back (camera off)' },
      ];
    } catch (err) {
      stopAll();
      S.items = [{ id: 'err', label: why(err), info: true }, { id: 'home', label: '‹ Back' }];
      record('camera refused: ' + (err && err.name));
    }
  }
  async function take() {
    if (!S.stream) return;
    const w = live.videoWidth; const h = live.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    canvas.getContext('2d').drawImage(live, 0, 0, w, h);
    stopAll(); // the camera goes off as soon as the frame is taken
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', 0.85));
    const bytes = new Uint8Array(await blob.arrayBuffer());
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
    discard();
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    S.mime = window.MediaRecorder ? (types.find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '') : null;
    S.screen = 'MIC'; S.hi = 0;
    S.items = S.mime === null
      ? [{ id: 'err', label: 'Recording is not available in this r1 browser (no MediaRecorder).', info: true }, { id: 'home', label: '‹ Back' }]
      : [{ id: 'rec', label: 'Record 3 seconds', sub: 'The mic is on only while recording' }, { id: 'home', label: '‹ Back' }];
  }
  async function rec() {
    S.items = [{ id: 'wait', label: 'Recording… 3 s', info: true }]; S.busy = true; paint();
    let ctx = null; let raf = 0;
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error('getUserMedia is not available here'), { name: 'NotSupported' });
      S.stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      record('mic on');
      try {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
        const an = ctx.createAnalyser(); an.fftSize = 512;
        ctx.createMediaStreamSource(S.stream).connect(an);
        const buf = new Uint8Array(an.fftSize);
        const tick = () => { an.getByteTimeDomainData(buf); let m = 0; for (const v of buf) m = Math.max(m, Math.abs(v - 128)); S.level = Math.min(100, Math.round(m / 1.28)); S.peak = Math.max(S.peak, S.level); paintMeter(); raf = requestAnimationFrame(tick); };
        tick();
      } catch (e) { record('level meter unavailable: ' + e.name); }
      const chunks = [];
      const mr = new MediaRecorder(S.stream, S.mime ? { mimeType: S.mime } : undefined);
      mr.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const t0 = performance.now();
      const stopped = new Promise((res) => { mr.onstop = res; });
      mr.start();
      await new Promise((res) => setTimeout(res, 3000));
      mr.stop();
      await stopped;
      const ms = Math.round(performance.now() - t0);
      cancelAnimationFrame(raf);
      if (ctx) ctx.close().catch(() => undefined);
      stopAll(); // the mic goes off as soon as the clip ends
      const blob = new Blob(chunks, { type: mr.mimeType || S.mime || 'audio/webm' });
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
    } catch (err) {
      cancelAnimationFrame(raf);
      if (ctx) ctx.close().catch(() => undefined);
      stopAll();
      S.items = [{ id: 'err', label: why(err), info: true }, { id: 'home', label: '‹ Back' }];
      record('mic refused: ' + (err && err.name));
    } finally { S.busy = false; }
  }
  async function support() {
    discard();
    const f = {};
    f['This browser'] = (navigator.userAgent || 'unknown').slice(0, 240);
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
      case 'play': try { await play.play(); S.note = 'Playing on the r1 speaker.'; } catch (e) { S.note = 'Playback failed: ' + e.name; } return undefined;
      case 'discard': discard(); home(); S.note = 'Thrown away. Camera and mic are off.'; return undefined;
      case 'support': return support();
      case 'home': home(); return undefined;
      case 'close': discard(); window.closeWebView.postMessage(''); return undefined;
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
    $('sub').textContent = S.screen === 'CAMERA' || (S.screen === 'MIC' && S.busy) ? (liveTracks() ? '● ' + (S.screen === 'CAMERA' ? 'Camera' : 'Mic') + ' is ON' : 'Nothing is sent. Nothing is kept.') : 'Nothing is sent. Nothing is kept.';
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
  document.addEventListener('visibilitychange', () => { if (document.hidden) { discard(); home(); paint(); } });
  window.addEventListener('pagehide', discard);

  window.r1cap = { state: S, run, liveTracks, urls };
  home(); paint();
})();
