# Testing guide

Three levels, cheapest first. Run the top two on every change; do the manual
pass before shipping.

| | Command | Needs Chrome? | Time |
| --- | --- | --- | --- |
| Logic suite | `npm test` | no | <1s |
| Real-browser e2e | `npm run test:e2e` | yes | ~40s |
| Manual site sweep | see below | yes | ~10 min |

---

## 1. Logic suite — `npm test`

53 assertions over the parts that corrupt output silently if they break: cue
timing, the hand-rolled DOCX/ZIP writer (CRC32 checked against `zlib`),
letterbox geometry, OCR cleanup, and site adapters. No browser required.

## 2. Real-browser e2e — `npm run test:e2e`

Launches actual Chrome with the unpacked extension loaded, opens a page with a
**real `<video>`**, and drives the whole pipeline.

```bash
npx puppeteer browsers install chrome   # once, if you have no local Chrome
npm run test:e2e
HEADED=1 npm run test:e2e               # watch it happen
CHROME_PATH=/path/to/chrome npm run test:e2e
```

It asserts the extension's service worker starts, `Alt+S` opens the overlay
shadow root, the selection box and toolbar render, **real OCR returns text
matching the burned-in subtitle**, the capture saves to the library, `.txt`
`.srt` `.docx` actually download, and no console errors fire.

The fixture (`dev/fixture.html`) paints subtitle frames to a canvas and pipes
them through `captureStream()` into a genuine `<video>` element — real
`videoWidth`, real `currentTime`, real playback, no media file or network
needed. That matters because the content script's frame-grab path
(`drawImage(video)` → crop → `getImageData`) only exists on a true video
element; a mocked object wouldn't exercise it.

> Chrome extensions can't load in old headless mode. The harness uses
> `headless: 'new'`, which supports them.

## 3. Manual sweep

Load `ext/` via `chrome://extensions` → Developer mode → Load unpacked, then
walk this list. These are the cases automation can't reach — real players,
real DRM, real SPA navigation.

**Per site** (YouTube, Facebook, Instagram, TikTok, X, Vimeo, Twitch, Reddit,
LinkedIn, plus one random blog with a `<video>`):

- [ ] `Alt+S` — overlay appears, box lands on the subtitle strip, video pauses
- [ ] Drag inside to move, corners to resize, drag the dim area to redraw
- [ ] **Grab text** returns the on-screen text; edit it in the panel
- [ ] **Save capture** → appears in Library with the right title and timestamp
- [ ] The Library "open source" link jumps back to the right moment
      (YouTube should give `youtu.be/ID?t=42`)
- [ ] `Esc` exits cleanly and the page is left interactive

**Known-tricky paths — check these deliberately:**

- [ ] **Fullscreen.** Enter fullscreen, then `Alt+S`. The overlay is
      `position: fixed` on `document.body`; in fullscreen the browser only
      paints the fullscreen element's subtree, so it can vanish. If so, the
      fix is re-parenting the host into `document.fullscreenElement` on
      `fullscreenchange`.
- [ ] **SPA navigation.** On YouTube click through to another video *without a
      reload*; on TikTok scroll to the next clip. The player element gets
      swapped, so a cached `S.video` reference goes stale. Re-run `Alt+S` — if
      it grabs the old frame or errors, add a re-detect on navigation.
- [ ] **Theatre / miniplayer / rotated phone-shaped TikTok video** — verifies
      the letterbox math against non-16:9 layouts.
- [ ] **Auto mode** during fast dialogue — confirm near-duplicate frames are
      skipped rather than saved dozens of times.
- [ ] **DRM** (Netflix / Prime / Disney+) — must show
      *"This video is DRM-protected…"*, not a blank capture.
- [ ] **Blocked pages** — on `chrome://extensions` or the Web Store the popup
      should explain it can't run there instead of appearing broken.
- [ ] Export each of the 8 formats once; open the `.docx` in Word/LibreOffice
      and the `.srt` in VLC to confirm they're accepted by real consumers.

## Interpreting OCR quality

Recognition is imperfect on compressed video — that's inherent, not a bug.
If output is poor, in Settings try: raise **upscale** to 3–4×, switch
**layout** to *Single line* for one-line subtitles or *Scattered* for slides,
and keep **contrast boost** on (it measurably fixes misreads, e.g.
`heed` → `need`). Drawing a tighter box around just the text also helps a lot.
