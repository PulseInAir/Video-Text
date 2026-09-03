/* Offscreen document: owns the Tesseract worker. Service workers can't run
   the WASM/blob-worker setup reliably, so OCR lives here and the background
   proxies requests. Everything is bundled locally — no network calls. */

const U = (p) => chrome.runtime.getURL(p);
const workers = new Map(); // lang -> Promise<worker>

async function getWorker(lang = 'eng') {
  if (workers.has(lang)) return workers.get(lang);
  const p = (async () => {
    const w = await Tesseract.createWorker(lang, 1, {
      workerPath: U('vendor/worker.min.js'),
      corePath: U('vendor/'),
      langPath: U('vendor/lang'),
      gzip: true,
      cacheMethod: 'none',
      logger: () => {},
    });
    return w;
  })();
  workers.set(lang, p);
  try {
    return await p;
  } catch (e) {
    workers.delete(lang);
    throw e;
  }
}

// Tidy raw OCR output: drop noise lines, fix spacing, join wrapped lines.
function cleanup(raw) {
  const lines = String(raw || '')
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => {
      if (!l) return false;
      if (l.length < 2) return false;
      const letters = (l.match(/[\p{L}\p{N}]/gu) || []).length;
      return letters / l.length > 0.4; // drop lines that are mostly symbols
    });
  return lines.join('\n').replace(/[ \t]+([,.!?;:])/g, '$1').trim();
}

async function runOcr({ dataUrl, lang = 'eng', psm = 6 }) {
  const worker = await getWorker(lang);
  await worker.setParameters({
    tessedit_pageseg_mode: String(psm),
    preserve_interword_spaces: '1',
  });
  const { data } = await worker.recognize(dataUrl);
  return {
    text: cleanup(data.text),
    confidence: data.confidence,
    words: (data.words || []).map((w) => ({ text: w.text, conf: w.confidence })),
  };
}

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  if (msg?.target !== 'offscreen') return false;
  if (msg.type === 'ocr') {
    runOcr(msg)
      .then((r) => reply({ ok: true, ...r }))
      .catch((e) => reply({ ok: false, error: e?.message || String(e) }));
    return true;
  }
  if (msg.type === 'ping') {
    reply({ ok: true });
    return false;
  }
  return false;
});
