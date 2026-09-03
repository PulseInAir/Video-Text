# Video Text — overlay text extractor for Chrome

A Chrome (MV3) extension that lets you **select text burned into a video** — subtitles, slides,
code on screen, memes — and pull it out as real, copyable text. Inspired by
[Selectext](https://selectext.app/tutorial?n=1).

Everything runs **locally**. Frames never leave the browser: OCR is a bundled WebAssembly build of
Tesseract, and the English language data ships inside the extension. No API keys, no network calls.

---

## Install (unpacked)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. **Load unpacked** → select the [`ext/`](ext) folder

## Use

| Action | How |
| --- | --- |
| Start selecting | Toolbar icon → **Select text**, or <kbd>Alt</kbd>+<kbd>S</kbd>, or right-click a video |
| Grab the current frame | **Grab text**, or <kbd>Alt</kbd>+<kbd>G</kbd> |
| Adjust the box | Drag inside to move, corners to resize, drag on the dimmed area to redraw |
| Exit | <kbd>Esc</kbd> or **Done** |

The overlay opens with the box pre-placed over the usual subtitle strip. Press **Grab**, and the
recognized text appears in a panel you can edit, copy, or save to the library.

**Auto** mode polls the video while it plays and saves each new subtitle automatically, skipping
near-duplicate frames — that's how you build a full transcript to export as `.srt`.

## Export formats

`.txt` · `.srt` · `.vtt` · `.docx` · `.md` · `.csv` · `.json` · `.html`

Export the whole library or a filtered subset from the **Library** page. SRT/VTT cues are derived
from each capture's video timestamp and are guaranteed non-overlapping with positive duration.
The `.docx` writer is a dependency-free OOXML packager (verified valid with Word's schema layout).

## Supported sites

YouTube, Facebook, Instagram, TikTok, X/Twitter, Vimeo, Twitch, Reddit, LinkedIn, Coursera, Udemy —
plus **any page with an HTML5 `<video>`**, via a generic fallback adapter. Per-site adapters know
how to find the right player, read a clean title, and build a timestamped permalink (e.g.
`youtu.be/ID?t=42`).

> **DRM note:** Netflix, Prime Video and Disney+ render through a protected pipeline that returns
> blank pixels to *any* extension. That's a browser-level restriction, not a bug — the extension
> detects it and says so rather than silently producing empty text.

## Settings

Pause-on-select, auto-copy, OCR language, page-segmentation mode (block / single line / scattered),
contrast boost, and upscale factor (1–4×). Upscaling plus the contrast pass measurably improves
accuracy on compressed video.

## Layout

```
ext/
  manifest.json          MV3 manifest
  background.js          service worker: OCR proxy, library, exports
  content/content.js     selection overlay, frame capture, cropping
  pages/                 popup · library · options · offscreen OCR host
  lib/formats.js         all export writers incl. zero-dep DOCX/ZIP
  lib/sites.js           per-site adapters
  vendor/                Tesseract WASM core, worker, eng traineddata
dev/harness.html         standalone overlay preview (no extension install)
```

OCR runs in an **offscreen document** because MV3 service workers can't reliably host the
WASM worker; the background script proxies recognition requests to it.

## Development

```bash
npm install
npm test                         # 53 logic assertions, no browser needed
npm run test:e2e                 # real Chrome + real <video> + real OCR
npm run dev                      # then open /dev/harness.html to preview the overlay
```

See **[TESTING.md](TESTING.md)** for the full strategy, including the manual
site sweep and the two known-tricky paths (fullscreen and SPA navigation).

### Verified

- OCR pipeline against the vendored core + language data (95% confidence on clean subtitles;
  the contrast pass corrects real misreads such as `heed` → `need`)
- Selection geometry: letterbox-aware screen↔video-pixel mapping, exact round-trip, clamping
- SRT/VTT cue timing: rapid, identical, and unsorted timestamps all yield valid non-overlapping cues
- DOCX/ZIP output: CRC32 and entry sizes checked against `zlib`, XML well-formedness, Unicode
  preservation, and a 580 KB export surviving base64 transfer byte-for-byte
- Background message flow: save, list, update, delete, clear, export, filename sanitizing, errors
