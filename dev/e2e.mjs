/* Real-browser end-to-end test.
 *
 *   npm run test:e2e            headless
 *   HEADED=1 npm run test:e2e   watch it happen
 *
 * Loads the actual unpacked extension into Chrome, opens a page with a real
 * <video>, drives the selection overlay, and asserts that OCR text comes back
 * and that exports download. Requires a local Chrome (see README).
 */
import puppeteer from 'puppeteer';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXT = path.join(ROOT, 'ext');
const PORT = 8099;
const HEADED = !!process.env.HEADED;

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  if (cond) { pass++; console.log('  PASS ' + name); }
  else { fail++; console.log('  FAIL ' + name + (extra ? ' — ' + extra : '')); }
};

/* ---- tiny static server for the fixture ---- */
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
function serve() {
  return new Promise((res) => {
    const s = http.createServer((req, rq) => {
      const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
      if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) {
        rq.writeHead(404); return rq.end('nope');
      }
      rq.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
      fs.createReadStream(p).pipe(rq);
    });
    s.listen(PORT, '0.0.0.0', () => res(s));
  });
}

function findChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const guesses = [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  ];
  for (const g of guesses) if (fs.existsSync(g)) return g;
  try { return puppeteer.executablePath(); } catch { return null; }
}

const main = async () => {
  const server = await serve();
  const exe = findChrome();
  if (!exe || !fs.existsSync(exe)) {
    console.error('\nNo Chrome found. Install one, or set CHROME_PATH=/path/to/chrome');
    console.error('e.g.  npx puppeteer browsers install chrome\n');
    server.close();
    process.exit(2);
  }
  console.log('Chrome:', exe, HEADED ? '(headed)' : '(headless)');

  const downloadDir = fs.mkdtempSync('/tmp/vtx-dl-');
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: HEADED ? false : 'new',
    args: [
      `--disable-extensions-except=${EXT}`,
      `--load-extension=${EXT}`,
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });

  try {
    /* ---- 1. the extension registered a service worker ---- */
    let sw = browser.targets().find((t) => t.type() === 'service_worker');
    if (!sw) sw = await browser.waitForTarget((t) => t.type() === 'service_worker', { timeout: 20000 });
    const extId = new URL(sw.url()).host;
    ok(!!extId, 'extension loaded (service worker running), id=' + extId);

    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

    await page.goto(`http://localhost:${PORT}/dev/fixture.html`, { waitUntil: 'load' });
    await page.evaluate(() => window.__fixtureReady);
    const vinfo = await page.evaluate(() => {
      const v = document.querySelector('video');
      return { w: v.videoWidth, h: v.videoHeight, playing: !v.paused };
    });
    ok(vinfo.w === 1280 && vinfo.h === 720, `real video present ${vinfo.w}x${vinfo.h}`);

    /* ---- 2. content script injected and finds the video ---- */
    const probe = await page.evaluate(async () => {
      const r = await chrome.runtime.sendMessage({ type: 'has-video' }).catch(() => null);
      return r;
    }).catch(() => null);

    // content script talks over chrome.tabs; instead assert its overlay appears.
    await page.keyboard.down('Alt');
    await page.keyboard.press('KeyS');
    await page.keyboard.up('Alt');
    await new Promise((r) => setTimeout(r, 800));

    const overlay = await page.evaluate(() => {
      const h = document.querySelector('.vtx-host');
      if (!h || !h.shadowRoot) return null;
      const sr = h.shadowRoot;
      const frame = sr.querySelector('.frame');
      const bar = sr.querySelector('.bar');
      return {
        active: h.dataset.active,
        frame: frame ? frame.getBoundingClientRect().width : 0,
        buttons: [...sr.querySelectorAll('.bar button')].map((b) => b.textContent.trim()),
        barVisible: !!bar,
      };
    });
    ok(!!overlay, 'overlay shadow root created');
    ok(overlay && overlay.active === '1', 'Alt+S activated selection mode');
    ok(overlay && overlay.frame > 50, 'selection box rendered, w=' + (overlay && Math.round(overlay.frame)));
    ok(overlay && overlay.buttons.includes('Grab text'), 'toolbar buttons: ' + (overlay ? overlay.buttons.join(', ') : ''));

    /* ---- 3. real OCR through the real background + offscreen doc ---- */
    console.log('  ... running OCR (first call loads WASM, may take ~20s)');
    const t0 = Date.now();
    const text = await page.evaluate(async () => {
      const sr = document.querySelector('.vtx-host').shadowRoot;
      sr.querySelector('[data-a="grab"]').click();
      const out = sr.querySelector('.out');
      for (let i = 0; i < 120; i++) {
        await new Promise((r) => setTimeout(r, 500));
        if (out.textContent.trim()) return out.textContent.trim();
      }
      return '';
    });
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    ok(!!text, `OCR returned text in ${secs}s`);
    console.log('       -> ' + JSON.stringify(text));

    const expected = await page.evaluate(() => window.__fixtureLines);
    const norm = (s) => s.toLowerCase().replace(/[^a-z0-9 ]/g, '');
    const hit = expected.some((line) => {
      const words = norm(line).split(' ').filter((w) => w.length > 3);
      const got = norm(text);
      return words.filter((w) => got.includes(w)).length >= Math.ceil(words.length * 0.6);
    });
    ok(hit, 'recognized text matches a burned-in subtitle line');

    /* ---- 4. library round-trip ---- */
    await page.evaluate(() => {
      document.querySelector('.vtx-host').shadowRoot.querySelector('[data-a="save"]').click();
    });
    await new Promise((r) => setTimeout(r, 600));

    const libPage = await browser.newPage();
    await libPage.goto(`chrome-extension://${extId}/pages/library.html`, { waitUntil: 'load' });
    await new Promise((r) => setTimeout(r, 700));
    const items = await libPage.$$eval('.item .text', (n) => n.map((e) => e.textContent.trim()));
    ok(items.length >= 1, `capture saved and listed in library (${items.length})`);

    /* ---- 5. exports actually download ---- */
    const client = await libPage.createCDPSession();
    await client.send('Page.setDownloadBehavior', { behavior: 'allow', downloadPath: downloadDir });
    for (const fmt of ['txt', 'srt', 'docx']) {
      await libPage.select('#format', fmt);
      await libPage.click('#export');
      let found = null;
      for (let i = 0; i < 30 && !found; i++) {
        await new Promise((r) => setTimeout(r, 300));
        found = fs.readdirSync(downloadDir).find((f) => f.endsWith('.' + fmt));
      }
      const size = found ? fs.statSync(path.join(downloadDir, found)).size : 0;
      ok(!!found && size > 0, `export .${fmt} downloaded` + (found ? ` (${found}, ${size}b)` : ''));
    }

    /* ---- 6. no console errors ---- */
    const real = errors.filter((e) => !/favicon|ERR_FILE_NOT_FOUND/i.test(e));
    ok(real.length === 0, 'no page errors', real.slice(0, 3).join(' | '));

    if (HEADED) { console.log('\n  headed mode — pausing 20s so you can look'); await new Promise((r) => setTimeout(r, 20000)); }
  } finally {
    await browser.close();
    server.close();
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
};

main().catch((e) => { console.error('\nharness error:', e); process.exit(1); });
