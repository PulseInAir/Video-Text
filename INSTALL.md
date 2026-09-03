# Installing Video Text in Chrome

The extension lives on GitHub, so the first job is getting it onto **your**
computer. Then Chrome loads it from a folder.

Total time: about a minute.

---

## Step 1 — Download

Click this link (or paste it into your address bar):

**https://github.com/PulseInAir/Video-Text/raw/arena/01a067a1-video-text/video-text-extension.zip**

That downloads `video-text-extension.zip` (~16 MB) to your Downloads folder.

<sub>It's large because the entire OCR engine and English language model are
bundled inside, so the extension never needs the internet.</sub>

## Step 2 — Unzip it

- **Windows** — right-click the file → **Extract All…** → **Extract**
- **Mac** — double-click the file

You'll get a folder named `video-text-extension`.

**Open that folder and confirm you can see `manifest.json` inside it.** This is
the single most common thing to get wrong — Chrome needs the folder that
*directly* contains `manifest.json`.

> On Windows, "Extract All" sometimes creates
> `video-text-extension\video-text-extension\`. If so, the **inner** one is
> the folder you want.

Move the folder somewhere permanent — Documents is fine. **Don't delete it
after installing:** Chrome loads the extension from this folder every time it
starts, so if it disappears the extension breaks.

## Step 3 — Open Chrome's extensions page

Type `chrome://extensions` in the address bar and press Enter.

(Edge: `edge://extensions` · Brave: `brave://extensions` · Opera: `opera://extensions`)

## Step 4 — Turn on Developer mode

Flip the **Developer mode** switch in the **top-right** corner. Three new
buttons appear below the search bar.

## Step 5 — Load unpacked

Click **Load unpacked** (top-left). A file picker opens.

Navigate to your unzipped `video-text-extension` folder, **select the folder
itself — a single click to highlight it, then "Select Folder" / "Open".**
Don't double-click into it and pick a file.

**Video Text** now appears as a card on the page. ✅

## Step 6 — Pin it to the toolbar

Click the **puzzle-piece icon** in Chrome's toolbar, find **Video Text**, and
click the **pin** next to it so its icon stays visible.

---

## Use it

1. Open any video — YouTube, TikTok, X, Instagram, a lecture page
2. Press **`Alt`+`S`** (or click the Video Text icon → **Select text**)
3. A box appears over the video — drag it over the text you want
4. Click **Grab text**

The first grab takes a few seconds while the OCR engine loads; the rest are
quick. Everything runs on your machine — no account, no API key, and no video
frame ever leaves your browser.

---

## Alternative: install with git

If you'd rather clone than download:

```bash
git clone https://github.com/PulseInAir/Video-Text.git
cd Video-Text
git checkout arena/01a067a1-video-text
```

Then at Step 5 select the **`ext`** folder inside the clone.

---

## Troubleshooting

**"Manifest file is missing or unreadable"**
You picked the wrong folder. Go back and choose the folder that has
`manifest.json` sitting directly inside it — usually the inner folder if
unzipping created two levels.

**I don't see "Load unpacked"**
Developer mode isn't on. It's the toggle in the top-right of
`chrome://extensions`.

**"This extension may have been corrupted"**
A partial unzip. Delete the folder, unzip the download again, and reload.

**The icon is there, but nothing happens on a page**
Two usual causes: (1) Chrome blocks extensions on its own pages — `chrome://`,
the Web Store — so try a normal website; (2) tabs opened *before* you installed
need a refresh.

**"No video found on this page"**
Press play first, then `Alt`+`S`. Some sites don't create the player until
playback starts.

**Netflix / Prime Video / Disney+ produce nothing**
Expected. DRM playback hands back blank pixels to *any* extension — a
browser-level protection that nothing can bypass. The extension says so instead
of silently saving empty text.

**`Alt`+`S` does nothing**
Another extension may have taken the shortcut. Rebind it at
`chrome://extensions/shortcuts`.

**The extracted text is wrong or garbled**
OCR struggles with small or heavily compressed text. Open the extension's
**Settings** and raise **Upscale** to 3–4×, set **Layout** to *Single line* for
one-line subtitles, and leave **Contrast boost** on. Drawing a tighter box
around just the text helps most of all.

**A warning about developer-mode extensions**
Chrome shows this for anything not installed from the Web Store. It's generic,
not specific to this code — which runs entirely locally and is fully readable
in the `ext/` folder.

---

## Updating

Download and unzip the new version over the old folder, then click the
**↻ reload** icon on the extension's card at `chrome://extensions`.

## Uninstalling

Click **Remove** on the card at `chrome://extensions`. Saved captures live in
local browser storage and are removed with it.
