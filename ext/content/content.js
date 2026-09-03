/* Video Text — content script.
   Draws a selection overlay on top of any <video>, grabs the current frame,
   crops the selected region and sends it to the background for OCR. */
(() => {
  if (window.__vtxLoaded) return;
  window.__vtxLoaded = true;

  const RT = chrome.runtime;
  const url = () => location.href;

  /* ---------------- site adapters (inlined; content scripts aren't modules) --------------- */
  const ADAPTERS = [
    { id: 'youtube', name: 'YouTube', match: /(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$|(^|\.)youtu\.be$/,
      sel: ['video.html5-main-video', '#movie_player video', 'video'],
      title: () => document.querySelector('h1.ytd-watch-metadata, h1.title yt-formatted-string')?.textContent?.trim() || document.title.replace(/ - YouTube$/, ''),
      link: (t) => { const id = new URL(location.href).searchParams.get('v') || location.pathname.split('/').pop(); return t != null ? `https://youtu.be/${id}?t=${Math.floor(t)}` : location.href; } },
    { id: 'facebook', name: 'Facebook', match: /(^|\.)facebook\.com$|(^|\.)fb\.watch$/, sel: ['div[role="dialog"] video', 'video'] },
    { id: 'instagram', name: 'Instagram', match: /(^|\.)instagram\.com$/, sel: ['article video', 'section main video', 'video'] },
    { id: 'tiktok', name: 'TikTok', match: /(^|\.)tiktok\.com$/, sel: ['div[class*="DivVideoWrapper"] video', 'video'] },
    { id: 'x', name: 'X', match: /(^|\.)twitter\.com$|(^|\.)x\.com$/, sel: ['div[data-testid="videoPlayer"] video', 'video'] },
    { id: 'vimeo', name: 'Vimeo', match: /(^|\.)vimeo\.com$/, sel: ['.vp-video video', 'video'] },
    { id: 'twitch', name: 'Twitch', match: /(^|\.)twitch\.tv$/, sel: ['[data-a-target="video-player"] video', 'video'] },
    { id: 'reddit', name: 'Reddit', match: /(^|\.)reddit\.com$/, sel: ['shreddit-player video', 'video'] },
    { id: 'linkedin', name: 'LinkedIn', match: /(^|\.)linkedin\.com$/, sel: ['video'] },
    { id: 'coursera', name: 'Coursera', match: /(^|\.)coursera\.org$/, sel: ['video'] },
    { id: 'udemy', name: 'Udemy', match: /(^|\.)udemy\.com$/, sel: ['video'] },
    { id: 'netflix', name: 'Netflix', match: /(^|\.)netflix\.com$/, sel: ['video'], drm: true },
    { id: 'disneyplus', name: 'Disney+', match: /(^|\.)disneyplus\.com$/, sel: ['video'], drm: true },
    { id: 'primevideo', name: 'Prime Video', match: /(^|\.)primevideo\.com$/, sel: ['video'], drm: true },
  ];
  const GENERIC = { id: 'generic', name: 'This page', sel: ['video'] };
  const A = (() => {
    const a = ADAPTERS.find((x) => x.match.test(location.hostname)) || GENERIC;
    return {
      ...a,
      sel: a.sel || GENERIC.sel,
      title: a.title || (() => document.title),
      link: a.link || ((t) => (t != null ? `${location.href}#t=${Math.floor(t)}` : location.href)),
    };
  })();

  function findVideo() {
    const found = [];
    for (const s of A.sel) {
      for (const v of document.querySelectorAll(s)) {
        const r = v.getBoundingClientRect();
        if (r.width > 80 && r.height > 60 && !found.includes(v)) found.push(v);
      }
    }
    found.sort((a, b) => {
      const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
      return rb.width * rb.height - ra.width * ra.height;
    });
    return found[0] || null;
  }

  /* ---------------- state ---------------- */
  const S = {
    active: false,
    video: null,
    box: null,        // selection in video-pixel space {x,y,w,h}
    lastText: '',
    busy: false,
    autoTimer: null,
    autoLast: '',
    prefs: { autoPause: true, autoCopy: false, lang: 'eng', psm: 6, contrast: true, upscale: 2 },
  };

  chrome.storage.sync.get('prefs').then(({ prefs }) => Object.assign(S.prefs, prefs || {}));

  /* ---------------- UI ---------------- */
  let host, root, ui;

  function css() {
    return `
:host { all: initial; }
* { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
.dim { position: fixed; background: rgba(9,12,20,.55); pointer-events: auto; cursor: crosshair; transition: opacity .12s; }
.frame { position: fixed; pointer-events: none; border: 2px solid #4f8cff; border-radius: 4px;
  box-shadow: 0 0 0 1px rgba(0,0,0,.6), 0 8px 30px rgba(0,0,0,.45); cursor: move; pointer-events: auto; }
.frame.dragging { transition: none; }
.grip { position: absolute; width: 12px; height: 12px; background: #fff; border: 2px solid #4f8cff; border-radius: 3px; }
.grip.nw { left: -7px; top: -7px; cursor: nwse-resize; }
.grip.ne { right: -7px; top: -7px; cursor: nesw-resize; }
.grip.sw { left: -7px; bottom: -7px; cursor: nesw-resize; }
.grip.se { right: -7px; bottom: -7px; cursor: nwse-resize; }
.hint { position: fixed; transform: translateX(-50%); background: #111826; color: #dfe7f5; font-size: 12px;
  padding: 6px 10px; border-radius: 6px; white-space: nowrap; pointer-events: none; box-shadow: 0 6px 20px rgba(0,0,0,.5); }
.bar { position: fixed; display: flex; align-items: center; gap: 6px; padding: 6px; border-radius: 10px;
  background: #0e1420; border: 1px solid #253049; box-shadow: 0 12px 40px rgba(0,0,0,.55); pointer-events: auto; }
button { all: unset; cursor: pointer; color: #cfdcf2; font-size: 12px; font-weight: 600; padding: 7px 10px;
  border-radius: 7px; background: #1a2334; border: 1px solid #2b3852; white-space: nowrap; }
button:hover { background: #24304a; color: #fff; }
button.primary { background: #2f6df6; border-color: #2f6df6; color: #fff; }
button.primary:hover { background: #4a82ff; }
button.on { background: #16452c; border-color: #2e7d52; color: #7fe3ac; }
button[disabled] { opacity: .5; cursor: default; }
.panel { position: fixed; width: 360px; max-height: 60vh; display: flex; flex-direction: column;
  background: #0e1420; border: 1px solid #253049; border-radius: 12px; overflow: hidden;
  box-shadow: 0 20px 60px rgba(0,0,0,.6); pointer-events: auto; }
.panel header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: #131b2b;
  border-bottom: 1px solid #253049; color: #eaf1ff; font-size: 13px; font-weight: 700; cursor: move; }
.panel header .count { margin-left: auto; font-weight: 500; color: #8ba0c4; font-size: 11px; }
.out { flex: 1; overflow: auto; padding: 10px 12px; color: #dbe6f8; font-size: 13px; line-height: 1.5;
  white-space: pre-wrap; word-break: break-word; user-select: text; -webkit-user-select: text; min-height: 60px; }
.out:empty::before { content: 'Drag a box over the text in the video, then press Grab.'; color: #6d80a3; }
.foot { display: flex; gap: 6px; padding: 8px; border-top: 1px solid #253049; background: #0b111c; flex-wrap: wrap; }
.spin { width: 13px; height: 13px; border: 2px solid #4f8cff; border-right-color: transparent; border-radius: 50%;
  animation: sp .7s linear infinite; display: inline-block; }
@keyframes sp { to { transform: rotate(360deg) } }
.toast { position: fixed; left: 50%; bottom: 28px; transform: translateX(-50%); background: #14351f; color: #8ef0b4;
  border: 1px solid #2c7a4c; padding: 9px 14px; border-radius: 8px; font-size: 13px; pointer-events: none; }
.toast.err { background: #3a1620; color: #ffb3c1; border-color: #8c2f45; }
`;
  }

  function build() {
    host = document.createElement('div');
    host.className = 'vtx-host';
    host.dataset.active = '0';
    root = host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = css();
    root.append(style);
    (document.body || document.documentElement).append(host);

    ui = {};
    // Four dim panels around the selection (so the selection stays clear).
    ui.dims = ['t', 'r', 'b', 'l'].map(() => {
      const d = document.createElement('div');
      d.className = 'dim';
      root.append(d);
      return d;
    });

    ui.frame = document.createElement('div');
    ui.frame.className = 'frame';
    for (const g of ['nw', 'ne', 'sw', 'se']) {
      const el = document.createElement('div');
      el.className = 'grip ' + g;
      el.dataset.grip = g;
      ui.frame.append(el);
    }
    root.append(ui.frame);

    ui.hint = document.createElement('div');
    ui.hint.className = 'hint';
    root.append(ui.hint);

    ui.bar = document.createElement('div');
    ui.bar.className = 'bar';
    ui.bar.innerHTML = `
      <button class="primary" data-a="grab">Grab text</button>
      <button data-a="auto">Auto</button>
      <button data-a="all">Select all</button>
      <button data-a="panel">Results</button>
      <button data-a="exit">Done</button>`;
    root.append(ui.bar);

    ui.panel = document.createElement('div');
    ui.panel.className = 'panel';
    ui.panel.innerHTML = `
      <header>Extracted text<span class="count"></span></header>
      <div class="out" contenteditable="plaintext-only" spellcheck="false"></div>
      <div class="foot">
        <button data-a="copy">Copy</button>
        <button data-a="save">Save capture</button>
        <button data-a="library">Library</button>
        <button data-a="hide">Hide</button>
      </div>`;
    root.append(ui.panel);
    ui.out = ui.panel.querySelector('.out');
    ui.count = ui.panel.querySelector('.count');

    root.addEventListener('click', onClick);
    ui.frame.addEventListener('pointerdown', onFramePointerDown);
    for (const d of ui.dims) d.addEventListener('pointerdown', onDimPointerDown);
    makeDraggable(ui.panel.querySelector('header'), ui.panel);
    setPanel(false);
  }

  function toast(msg, isErr) {
    const t = document.createElement('div');
    t.className = 'toast' + (isErr ? ' err' : '');
    t.textContent = msg;
    root.append(t);
    setTimeout(() => t.remove(), 2600);
  }

  /* ---------------- geometry ---------------- */
  // Video pixel box <-> screen rect. Handles letterboxing from object-fit.
  function videoRect() {
    const v = S.video;
    const r = v.getBoundingClientRect();
    const vw = v.videoWidth || r.width, vh = v.videoHeight || r.height;
    const fit = getComputedStyle(v).objectFit || 'contain';
    let w = r.width, h = r.height, x = r.left, y = r.top;
    if (fit === 'contain' && vw && vh) {
      const scale = Math.min(r.width / vw, r.height / vh);
      w = vw * scale; h = vh * scale;
      x = r.left + (r.width - w) / 2;
      y = r.top + (r.height - h) / 2;
    } else if (fit === 'cover' && vw && vh) {
      const scale = Math.max(r.width / vw, r.height / vh);
      w = vw * scale; h = vh * scale;
      x = r.left + (r.width - w) / 2;
      y = r.top + (r.height - h) / 2;
    }
    return { x, y, w, h, vw: vw || w, vh: vh || h };
  }

  function toScreen(box) {
    const r = videoRect();
    const sx = r.w / r.vw, sy = r.h / r.vh;
    return { left: r.x + box.x * sx, top: r.y + box.y * sy, width: box.w * sx, height: box.h * sy };
  }

  function toVideoPx(rect) {
    const r = videoRect();
    const sx = r.vw / r.w, sy = r.vh / r.h;
    let x = (rect.left - r.x) * sx, y = (rect.top - r.y) * sy;
    let w = rect.width * sx, h = rect.height * sy;
    // Clamp inside the frame, preserving the box size where possible: size is
    // capped to the frame first, then the origin is pulled back so the whole
    // box stays visible instead of collapsing to a sliver at the edge.
    const MIN = 8;
    w = Math.max(MIN, Math.min(w, r.vw));
    h = Math.max(MIN, Math.min(h, r.vh));
    x = Math.max(0, Math.min(x, r.vw - w));
    y = Math.max(0, Math.min(y, r.vh - h));
    return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
  }

  function defaultBox() {
    const r = videoRect();
    // Subtitle strip: bottom 28% of the frame, centred.
    return { x: Math.round(r.vw * 0.06), y: Math.round(r.vh * 0.68), w: Math.round(r.vw * 0.88), h: Math.round(r.vh * 0.26) };
  }

  function layout() {
    if (!S.active || !S.video) return;
    const s = toScreen(S.box);
    const W = innerWidth, H = innerHeight;
    Object.assign(ui.frame.style, { left: s.left + 'px', top: s.top + 'px', width: s.width + 'px', height: s.height + 'px' });
    const [t, r, b, l] = ui.dims;
    Object.assign(t.style, { left: 0, top: 0, width: W + 'px', height: Math.max(0, s.top) + 'px' });
    Object.assign(b.style, { left: 0, top: s.top + s.height + 'px', width: W + 'px', height: Math.max(0, H - s.top - s.height) + 'px' });
    Object.assign(l.style, { left: 0, top: s.top + 'px', width: Math.max(0, s.left) + 'px', height: s.height + 'px' });
    Object.assign(r.style, { left: s.left + s.width + 'px', top: s.top + 'px', width: Math.max(0, W - s.left - s.width) + 'px', height: s.height + 'px' });

    // toolbar just below (or above) the selection
    const barH = 44;
    let by = s.top + s.height + 10;
    if (by + barH > H) by = Math.max(8, s.top - barH - 6);
    ui.bar.style.left = Math.max(8, Math.min(s.left, W - 420)) + 'px';
    ui.bar.style.top = by + 'px';

    ui.hint.style.left = s.left + s.width / 2 + 'px';
    ui.hint.style.top = Math.max(6, s.top - 30) + 'px';
    ui.hint.textContent = `${S.box.w}×${S.box.h}px — drag to move, corners to resize`;

    if (!ui.panel.dataset.moved) {
      ui.panel.style.right = '18px';
      ui.panel.style.left = 'auto';
      ui.panel.style.top = '80px';
    }
  }

  function makeDraggable(handle, el) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const ox = e.clientX - r.left, oy = e.clientY - r.top;
      const move = (ev) => {
        el.dataset.moved = '1';
        el.style.right = 'auto';
        el.style.left = Math.max(0, Math.min(ev.clientX - ox, innerWidth - r.width)) + 'px';
        el.style.top = Math.max(0, Math.min(ev.clientY - oy, innerHeight - 40)) + 'px';
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
    });
  }

  /* ---------------- pointer interactions ---------------- */
  function onDimPointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const sx = e.clientX, sy = e.clientY;
    const move = (ev) => {
      const rect = {
        left: Math.min(sx, ev.clientX), top: Math.min(sy, ev.clientY),
        width: Math.abs(ev.clientX - sx), height: Math.abs(ev.clientY - sy),
      };
      if (rect.width > 6 && rect.height > 6) { S.box = toVideoPx(rect); layout(); }
    };
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  function onFramePointerDown(e) {
    if (e.button !== 0) return;
    e.preventDefault(); e.stopPropagation();
    const grip = e.target.dataset?.grip;
    const start = toScreen(S.box);
    const sx = e.clientX, sy = e.clientY;
    ui.frame.classList.add('dragging');
    const move = (ev) => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy;
      let rect;
      if (!grip) {
        rect = { left: start.left + dx, top: start.top + dy, width: start.width, height: start.height };
      } else {
        let l = start.left, t = start.top, w = start.width, h = start.height;
        if (grip.includes('n')) { t += dy; h -= dy; }
        if (grip.includes('s')) { h += dy; }
        if (grip.includes('w')) { l += dx; w -= dx; }
        if (grip.includes('e')) { w += dx; }
        if (w < 12) w = 12;
        if (h < 12) h = 12;
        rect = { left: l, top: t, width: w, height: h };
      }
      S.box = toVideoPx(rect);
      layout();
    };
    const up = () => {
      ui.frame.classList.remove('dragging');
      removeEventListener('pointermove', move); removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  }

  function onClick(e) {
    const a = e.target.dataset?.a;
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    ({
      grab: () => grab(),
      auto: () => toggleAuto(e.target),
      all: () => { const r = videoRect(); S.box = { x: 0, y: 0, w: Math.round(r.vw), h: Math.round(r.vh) }; layout(); },
      panel: () => setPanel(ui.panel.style.display === 'none'),
      exit: () => deactivate(),
      hide: () => setPanel(false),
      copy: () => copyOut(),
      save: () => saveCapture(),
      library: () => RT.sendMessage({ type: 'open-library' }),
    }[a] || (() => {}))();
  }

  function setPanel(on) {
    ui.panel.style.display = on ? 'flex' : 'none';
  }

  /* ---------------- capture + OCR ---------------- */
  function grabFrameBitmap() {
    const v = S.video;
    if (!v || !v.videoWidth) throw new Error('No video frame available yet.');
    const b = S.box;
    const up = Math.max(1, Math.min(4, S.prefs.upscale || 2));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(b.w * up);
    canvas.height = Math.round(b.h * up);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(v, b.x, b.y, b.w, b.h, 0, 0, canvas.width, canvas.height);

    let data;
    try {
      data = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch (err) {
      throw new Error('This video is DRM-protected, so its pixels cannot be read.');
    }
    if (S.prefs.contrast) enhance(data);
    ctx.putImageData(data, 0, 0);
    return canvas;
  }

  // Grayscale + auto-contrast; subtitles are usually high-contrast already,
  // this mostly kills gradients and JPEG mush behind the glyphs.
  function enhance(img) {
    const d = img.data;
    let min = 255, max = 0;
    const g = new Uint8ClampedArray(d.length / 4);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
      g[j] = y;
      if (y < min) min = y;
      if (y > max) max = y;
    }
    const span = Math.max(1, max - min);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) {
      const y = ((g[j] - min) * 255) / span;
      d[i] = d[i + 1] = d[i + 2] = y;
      d[i + 3] = 255;
    }
  }

  async function grab({ silent = false } = {}) {
    if (S.busy) return null;
    if (!S.video) { toast('No video found on this page.', true); return null; }
    S.busy = true;
    const btn = ui.bar.querySelector('[data-a="grab"]');
    const label = btn.textContent;
    btn.innerHTML = '<span class="spin"></span>';
    btn.disabled = true;
    try {
      const canvas = grabFrameBitmap();
      const dataUrl = canvas.toDataURL('image/png');
      const res = await RT.sendMessage({
        type: 'ocr',
        dataUrl,
        lang: S.prefs.lang || 'eng',
        psm: S.prefs.psm ?? 6,
      });
      if (!res?.ok) throw new Error(res?.error || 'OCR failed');
      const text = (res.text || '').trim();
      if (!text) { if (!silent) toast('No text found in that area.', true); return null; }
      S.lastText = text;
      setPanel(true);
      ui.out.textContent = text;
      if (S.prefs.autoCopy) await navigator.clipboard.writeText(text).catch(() => {});
      if (!silent) toast(S.prefs.autoCopy ? 'Text extracted and copied' : 'Text extracted');
      return text;
    } catch (err) {
      if (!silent) toast(err.message || String(err), true);
      return null;
    } finally {
      S.busy = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  }

  function toggleAuto(btn) {
    if (S.autoTimer) {
      clearInterval(S.autoTimer);
      S.autoTimer = null;
      btn.classList.remove('on');
      btn.textContent = 'Auto';
      toast('Auto-capture stopped');
      return;
    }
    btn.classList.add('on');
    btn.textContent = 'Auto •';
    toast('Auto-capture on — new subtitles are saved as they appear');
    S.autoTimer = setInterval(async () => {
      if (S.busy || S.video?.paused) return;
      const t = await grab({ silent: true });
      if (t && similarity(t, S.autoLast) < 0.85) {
        S.autoLast = t;
        saveCapture({ silent: true });
      }
    }, 1200);
  }

  function similarity(a, b) {
    if (!a || !b) return 0;
    if (a === b) return 1;
    const A = new Set(a.toLowerCase().split(/\s+/));
    const B = new Set(b.toLowerCase().split(/\s+/));
    let hit = 0;
    for (const w of A) if (B.has(w)) hit++;
    return hit / Math.max(A.size, B.size);
  }

  async function copyOut() {
    const text = ui.out.textContent.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied to clipboard');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.append(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast('Copied to clipboard');
    }
  }

  async function saveCapture({ silent = false } = {}) {
    const text = ui.out.textContent.trim();
    if (!text) { if (!silent) toast('Nothing to save yet.', true); return; }
    const time = S.video && isFinite(S.video.currentTime) ? S.video.currentTime : null;
    await RT.sendMessage({
      type: 'save-capture',
      capture: {
        text, time,
        source: A.id,
        sourceName: A.name || 'Page',
        title: A.title(),
        url: A.link(time),
        pageUrl: url(),
        createdAt: Date.now(),
      },
    });
    const { count } = await RT.sendMessage({ type: 'count' });
    ui.count.textContent = `${count} saved`;
    if (!silent) toast('Saved to library');
  }

  /* ---------------- activate / deactivate ---------------- */
  function activate() {
    if (S.active) return true;
    S.video = findVideo();
    if (!S.video) { ensureUi(); toast('No video found on this page.', true); return false; }
    ensureUi();
    S.active = true;
    host.dataset.active = '1';
    S.box = S.box || defaultBox();
    for (const el of [...ui.dims, ui.frame, ui.bar]) el.style.display = '';
    layout();
    RT.sendMessage({ type: 'count' }).then((r) => { if (r) ui.count.textContent = `${r.count} saved`; });
    if (S.prefs.autoPause && !S.video.paused) { try { S.video.pause(); } catch {} }
    addEventListener('scroll', layout, true);
    addEventListener('resize', layout);
    addEventListener('keydown', onKey, true);
    return true;
  }

  function deactivate() {
    if (!S.active) return;
    S.active = false;
    host.dataset.active = '0';
    if (S.autoTimer) { clearInterval(S.autoTimer); S.autoTimer = null; }
    for (const el of [...ui.dims, ui.frame, ui.bar, ui.hint]) el.style.display = 'none';
    setPanel(false);
    removeEventListener('scroll', layout, true);
    removeEventListener('resize', layout);
    removeEventListener('keydown', onKey, true);
  }

  function onKey(e) {
    if (e.key === 'Escape') { e.stopPropagation(); deactivate(); }
    else if (e.key === 'Enter' && !e.shiftKey && e.target === document.body) { e.preventDefault(); grab(); }
  }

  function ensureUi() {
    if (!host) build();
    ui.hint.style.display = '';
  }

  /* ---------------- messaging ---------------- */
  RT.onMessage.addListener((msg, _s, reply) => {
    if (msg.type === 'toggle-select') {
      S.active ? deactivate() : activate();
      reply({ ok: true, active: S.active });
    } else if (msg.type === 'grab-now') {
      (async () => {
        if (!S.active && !activate()) return reply({ ok: false, error: 'No video on this page' });
        const t = await grab();
        reply({ ok: !!t, text: t });
      })();
      return true;
    } else if (msg.type === 'has-video') {
      const v = findVideo();
      reply({ ok: true, hasVideo: !!v, site: A.name || 'This page', active: S.active });
    } else if (msg.type === 'prefs') {
      Object.assign(S.prefs, msg.prefs || {});
      reply({ ok: true });
    }
    return false;
  });
})();
