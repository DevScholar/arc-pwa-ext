# ArcPWA Extension

⚠️ This project is inAlpha stage. Expect breaking changes.

Browser extension for opening `.pwa.zip` archives directly in the browser.

Built with [WXT](https://wxt.dev) · MV3 · Chrome / Edge / Firefox

## How it works

1. **URL interception** — A `declarativeNetRequest` rule redirects any navigation to a `*.pwa.zip` URL to the built-in viewer page.
2. **Local file picker** — The popup lets you open a local `.pwa.zip` file via drag-and-drop or a file input.
3. **Viewer page** — `viewer.html` registers the `arc-pwa` Service Worker at the extension root scope, then mounts an `<arc-pwa>` element pointing at the archive URL or blob.

```
Browser navigates to https://example.com/app.pwa.zip
         │
         ▼ declarativeNetRequest (background.ts)
         │
         └─► chrome-extension://.../viewer.html?src=https://example.com/app.pwa.zip
                   │
                   ▼ viewer/main.ts
                   │  configure({ swUrl: '/arc-pwa-sw.js' })
                   │  <arc-pwa archive="https://...app.pwa.zip">
                   │
                   └─► arc-pwa-sw.js (Service Worker, extension-root scope)
                             └─► intercepts /__arc_pwa__/{id}/* → serves files from zip
```

## Setup

**1. Build `arc-pwa` first** (the SW is copied from its dist):

```bash
cd ../arc-pwa
npm install
npm run build
```

**2. Install and prepare the extension:**

```bash
cd ../arc-pwa-ext
npm install       # also runs wxt prepare and copies arc-pwa-sw.js
```

## Development

```bash
npm run dev        # opens Chrome with extension loaded (hot-reload)
npm run dev:firefox
```

## Build

```bash
npm run build          # outputs to .output/chrome-mv3/
npm run build:firefox  # outputs to .output/firefox-mv3/
npm run zip            # creates a .zip ready for the Chrome Web Store
```

## Install unpacked (manual)

1. Run `npm run build`
2. Open Chrome → `chrome://extensions` → Enable **Developer mode**
3. Click **Load unpacked** → select `.output/chrome-mv3/`

## Features

| Feature | Details |
|---|---|
| URL navigation interception | Redirects `http(s)://*.pwa.zip` navigations to viewer |
| Local file opening | Popup with drag-and-drop or file picker (≤ ~10 MB) |
| Multiple simultaneous archives | Each viewer tab is fully isolated |
| SPA routing | Viewer inherits arc-pwa's SPA fallback to `/index.html` |

## Popup

Click the extension icon to:
- Enter a `.pwa.zip` URL to open it
- Drop or pick a local `.pwa.zip` file

## Permissions

| Permission | Reason |
|---|---|
| `declarativeNetRequest` | Intercept `.pwa.zip` navigation and redirect to viewer |
| `storage` | Temporarily hold local file data between popup and viewer tab |
| `host_permissions: <all_urls>` | Match `.pwa.zip` URLs on any domain |

## Architecture notes

- `arc-pwa-sw.js` lives at the extension root so its SW scope covers all extension pages.
- `configure({ swUrl: '/arc-pwa-sw.js' })` is called before any `<arc-pwa>` element connects.
- Local files are stored in `browser.storage.session` (in-memory, cleared on browser close) and cleaned up immediately after the viewer reads them.
- Dynamic DNR rules are registered on `onInstalled` so they survive background SW restarts.

## Browser support

- Chrome / Edge 88+ (MV3 + `declarativeNetRequest`)
- Firefox 121+ (MV3)
