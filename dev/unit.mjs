/* Logic tests that need no browser:  npm test
 * Covers the parts that silently corrupt output if they regress —
 * cue timing, the hand-rolled DOCX/ZIP writer, geometry, OCR cleanup, adapters.
 */
import { FORMATS, toSrt, toDocx, toCsv } from '../ext/lib/formats.js';
import { getAdapter } from '../ext/lib/sites.js';
import zlib from 'zlib';

let pass = 0, fail = 0;
const ok = (c, n, extra = '') => {
  if (c) { pass++; console.log('  PASS ' + n); }
  else { fail++; console.log('  FAIL ' + n + (extra ? ' — ' + extra : '')); }
};
const group = (n) => console.log('\n' + n);

/* ---------- cue timing ---------- */
group('SRT / VTT cue timing');
const parseCues = (srt) =>
  [...srt.matchAll(/(\d\d:\d\d:\d\d,\d\d\d) --> (\d\d:\d\d:\d\d,\d\d\d)/g)].map((m) =>
    [m[1], m[2]].map((t) => {
      const [h, mi, rest] = t.split(':');
      const [s, ms] = rest.split(',');
      return +h * 3600 + +mi * 60 + +s + +ms / 1000;
    })
  );
const validCues = (caps) => {
  const cs = parseCues(toSrt(caps));
  for (let i = 0; i < cs.length; i++) {
    if (cs[i][1] <= cs[i][0]) return 'cue ' + (i + 1) + ' has non-positive duration';
    if (i && cs[i][0] < cs[i - 1][1] - 1e-9) return 'cue ' + (i + 1) + ' overlaps previous';
  }
  return null;
};
for (const [name, caps] of [
  ['normal spacing', [{ text: 'a', time: 1 }, { text: 'b', time: 6 }, { text: 'c', time: 20 }]],
  ['rapid 0.5s apart', [{ text: 'a', time: 1 }, { text: 'b', time: 1.5 }, { text: 'c', time: 2 }]],
  ['very rapid 0.1s apart', [{ text: 'a', time: 1 }, { text: 'b', time: 1.1 }, { text: 'c', time: 1.2 }]],
  ['identical timestamps', [{ text: 'a', time: 5 }, { text: 'b', time: 5 }]],
  ['unsorted input', [{ text: 'c', time: 30 }, { text: 'a', time: 1 }, { text: 'b', time: 10 }]],
  ['no timestamps', [{ text: 'a', time: null }, { text: 'b', time: null }]],
]) {
  const err = validCues(caps);
  ok(!err, name, err || '');
}

/* ---------- DOCX / ZIP ---------- */
group('DOCX writer');
const caps = [
  { id: '1', text: 'Hello world', time: 3.25, title: 'Test Video', url: 'https://youtu.be/x' },
  { id: '2', text: 'Two\nlines', time: 9.5, title: 'Test Video' },
  { id: '3', text: 'Escapes & <tags> "quotes" ünïcode 日本語 ✓', time: 30, title: 'Test Video' },
];
const docx = toDocx(caps);
ok(docx[0] === 0x50 && docx[1] === 0x4b, 'ZIP magic bytes PK');

// Parse the central directory and verify every entry's CRC32 + size.
function readZip(buf) {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('no EOCD');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = [];
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('bad central header');
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true);
    const off = dv.getUint32(p + 42, true);
    const name = Buffer.from(buf.subarray(p + 46, p + 46 + nlen)).toString();
    const lnlen = dv.getUint16(off + 26, true);
    const elen = dv.getUint16(off + 28, true);
    const start = off + 30 + lnlen + elen;
    out.push({ name, crc, size, data: buf.subarray(start, start + size) });
    p += 46 + nlen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return out;
}
const entries = readZip(docx);
ok(entries.length === 3, 'three parts: ' + entries.map((e) => e.name).join(', '));
let crcOk = true, sizeOk = true;
for (const e of entries) {
  if ((zlib.crc32 ? zlib.crc32(e.data) : crc32fallback(e.data)) !== e.crc) crcOk = false;
  if (e.data.length !== e.size) sizeOk = false;
}
function crc32fallback(b) {
  let c = ~0;
  for (let i = 0; i < b.length; i++) {
    c ^= b[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}
ok(crcOk, 'CRC32 of every entry matches zlib');
ok(sizeOk, 'declared sizes match actual bytes');
const docXml = Buffer.from(entries.find((e) => e.name === 'word/document.xml').data).toString('utf8');
ok(docXml.includes('&amp;') && docXml.includes('&lt;tags&gt;'), 'XML special chars escaped');
ok(docXml.includes('日本語') && docXml.includes('✓'), 'unicode preserved');
ok(!/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(docXml), 'no unescaped raw ampersands');

// big export must survive base64 chunking (background sends a data: URL)
const many = Array.from({ length: 2000 }, (_, i) => ({ id: '' + i, text: 'Line ' + i + ' ünïcode ✓', time: i, title: 'Big' }));
const big = toDocx(many);
const b64 = Buffer.from(big).toString('base64');
ok(big.length > 0x8000, 'big export exceeds 32KB chunk boundary (' + big.length + 'b)');
ok(Buffer.compare(Buffer.from(b64, 'base64'), Buffer.from(big)) === 0, 'base64 round-trip is byte-identical');

/* ---------- other formats ---------- */
group('Format writers');
for (const [k, f] of Object.entries(FORMATS)) {
  const out = f.build(caps, { timestamps: true });
  ok(out && out.length > 0, `${k} produces output (${out.length}${f.binary ? ' bytes' : ' chars'})`);
}
ok(toCsv(caps).split('\r\n')[0] === '"index","time_seconds","timestamp","text","source","url"', 'CSV header');
ok(/""quotes""/.test(toCsv(caps)), 'CSV escapes embedded quotes');

/* ---------- geometry ---------- */
group('Selection geometry (letterboxed 1920x1080 in 1280x900)');
const R = (() => {
  const r = { left: 100, top: 50, width: 1280, height: 900 }, vw = 1920, vh = 1080;
  const s = Math.min(r.width / vw, r.height / vh);
  const w = vw * s, h = vh * s;
  return { x: r.left + (r.width - w) / 2, y: r.top + (r.height - h) / 2, w, h, vw, vh };
})();
const toScreen = (b) => ({ left: R.x + b.x * (R.w / R.vw), top: R.y + b.y * (R.h / R.vh), width: b.w * (R.w / R.vw), height: b.h * (R.h / R.vh) });
const toVideoPx = (rect) => {
  const sx = R.vw / R.w, sy = R.vh / R.h;
  let x = (rect.left - R.x) * sx, y = (rect.top - R.y) * sy, w = rect.width * sx, h = rect.height * sy;
  const MIN = 8;
  w = Math.max(MIN, Math.min(w, R.vw)); h = Math.max(MIN, Math.min(h, R.vh));
  x = Math.max(0, Math.min(x, R.vw - w)); y = Math.max(0, Math.min(y, R.vh - h));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h) };
};
const box = { x: 115, y: 734, w: 1690, h: 281 };
ok(JSON.stringify(toVideoPx(toScreen(box))) === JSON.stringify(box), 'screen<->video round-trip is exact');
for (const [n, rect] of [
  ['off bottom-right', { left: 99999, top: 99999, width: 500, height: 500 }],
  ['off top-left', { left: -9999, top: -9999, width: 500, height: 500 }],
  ['larger than frame', { left: -500, top: -500, width: 99999, height: 99999 }],
]) {
  const b = toVideoPx(rect);
  ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= R.vw && b.y + b.h <= R.vh && b.w >= 8 && b.h >= 8,
    'clamped inside frame: ' + n, JSON.stringify(b));
}
const dragged = toVideoPx({ left: 99999, top: 99999, width: 400, height: 120 });
ok(Math.abs(dragged.w - 400 * (R.vw / R.w)) < 2, 'box keeps its size when dragged off-edge');

/* ---------- OCR cleanup ---------- */
group('OCR cleanup + dedup');
const cleanup = (raw) =>
  String(raw || '').split('\n').map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && l.length >= 2 && (l.match(/[\p{L}\p{N}]/gu) || []).length / l.length > 0.4)
    .join('\n').replace(/[ \t]+([,.!?;:])/g, '$1').trim();
for (const [n, i, e] of [
  ['collapses whitespace', 'Hello   there  friend', 'Hello there friend'],
  ['drops symbol noise', 'Real line\n|||~~~---\n***', 'Real line'],
  ['drops 1-char lines', 'Good\na\nAlso good', 'Good\nAlso good'],
  ['fixes space before punctuation', 'Wait , what ?', 'Wait, what?'],
  ['empty stays empty', '  \n\n ', ''],
  ['keeps numbers', 'Up by 42 percent in 2026', 'Up by 42 percent in 2026'],
]) ok(cleanup(i) === e, n, JSON.stringify(cleanup(i)));

const similarity = (a, b) => {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const A = new Set(a.toLowerCase().split(/\s+/)), B = new Set(b.toLowerCase().split(/\s+/));
  let h = 0; for (const w of A) if (B.has(w)) h++;
  return h / Math.max(A.size, B.size);
};
ok(similarity('same text', 'same text') >= 0.85, 'identical frames deduped');
ok(similarity('hello world', 'totally different words') < 0.85, 'different subtitles both kept');

/* ---------- site adapters ---------- */
group('Site adapters');
for (const [host, expect] of [
  ['www.youtube.com', 'YouTube'], ['m.youtube.com', 'YouTube'], ['youtu.be', 'YouTube'],
  ['www.facebook.com', 'Facebook'], ['fb.watch', 'Facebook'], ['www.instagram.com', 'Instagram'],
  ['www.tiktok.com', 'TikTok'], ['twitter.com', 'X / Twitter'], ['x.com', 'X / Twitter'],
  ['vimeo.com', 'Vimeo'], ['www.twitch.tv', 'Twitch'], ['www.netflix.com', 'Netflix'],
  ['example.com', 'This page'], ['notyoutube.com.evil.io', 'This page'],
]) ok(getAdapter(host).name === expect, `${host} -> ${getAdapter(host).name}`);
ok(getAdapter('www.netflix.com').drm === true, 'Netflix flagged as DRM');

/* ---------- offline OCR wiring ----------
 * Regression guard for: "Failed to execute 'importScripts' on
 * 'WorkerGlobalScope'". Tesseract defaults to spawning its worker from a
 * blob: URL, which then importScripts() a chrome-extension:// path — MV3
 * blocks that cross-scheme load. Also verifies every asset the worker can
 * reach for is vendored, so it never silently falls back to the CDN.
 */
group('Offline OCR wiring');
const fsx = await import('fs');
const offscreen = fsx.readFileSync(new URL('../ext/pages/offscreen.js', import.meta.url), 'utf8');
ok(/workerBlobURL\s*:\s*false/.test(offscreen), 'workerBlobURL disabled (blob worker cannot importScripts extension URLs)');
for (const key of ['workerPath', 'corePath', 'langPath']) {
  ok(new RegExp(key + '\\s*:\\s*U\\(').test(offscreen), `${key} pinned to an extension URL`);
}

const vendor = fsx.readdirSync(new URL('../ext/vendor', import.meta.url));
// The worker picks a core variant at runtime based on SIMD support and
// lstmOnly; any of the four may be requested.
for (const core of [
  'tesseract-core.wasm.js', 'tesseract-core-simd.wasm.js',
  'tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js',
]) ok(vendor.includes(core), 'vendored core variant ' + core);
ok(vendor.includes('worker.min.js'), 'vendored worker.min.js');
ok(vendor.includes('tesseract.min.js'), 'vendored tesseract.min.js');
ok(fsx.existsSync(new URL('../ext/vendor/lang/eng.traineddata.gz', import.meta.url)),
  'vendored eng.traineddata.gz (gzip:true expects the .gz name)');

const mani = JSON.parse(fsx.readFileSync(new URL('../ext/manifest.json', import.meta.url), 'utf8'));
ok(/wasm-unsafe-eval/.test(mani.content_security_policy?.extension_pages || ''),
  "CSP allows 'wasm-unsafe-eval' (MV3 blocks WebAssembly.instantiate otherwise)");
// vendor/* must NOT be web-accessible: the OCR chain is entirely same-origin
// (offscreen page -> worker -> importScripts -> fetch), so exposing it to every
// page would only hand sites a fingerprinting signal.
const war = mani.web_accessible_resources?.[0]?.resources || [];
ok(!war.includes('vendor/*'), 'vendor/* is NOT needlessly web-accessible');
ok(!mani.host_permissions,
  'no broad host_permissions (activeTab + content_scripts cover every entry point)');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
