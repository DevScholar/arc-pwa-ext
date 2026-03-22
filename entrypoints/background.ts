/**
 * Background service worker.
 *
 * Architecture (same as archiveweb.page):
 *   The MV3 background SW handles `fetch` events for chrome-extension:// URLs,
 *   serving archived files from in-memory sessions.  Because files are served at
 *   'self' origin (chrome-extension://<id>/arc-pwa/<id>/...) the manifest CSP
 *   allows them with `script-src 'self'` — no unsafe-inline required.
 */

// ── MIME types ────────────────────────────────────────────────────────────────
const MIME: Record<string, string> = {
  html: 'text/html', htm: 'text/html',
  css: 'text/css',
  js: 'application/javascript', mjs: 'application/javascript',
  json: 'application/json',
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', ico: 'image/x-icon',
  woff: 'font/woff', woff2: 'font/woff2', ttf: 'font/ttf', otf: 'font/otf',
  mp4: 'video/mp4', webm: 'video/webm',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
  txt: 'text/plain', xml: 'application/xml',
  webmanifest: 'application/manifest+json',
  wasm: 'application/wasm',
};
function mimeOf(p: string) { return MIME[p.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream'; }

function normAbs(path: string): string {
  return '/' + path.replace(/^\/+/, '').split('/').reduce((a: string[], s) => {
    if (s === '..') a.pop(); else if (s && s !== '.') a.push(s);
    return a;
  }, []).join('/');
}

function resolveFile(files: Map<string, Uint8Array>, raw: string): string | null {
  const p = normAbs(raw);
  if (files.has(p)) return p;
  const idx = p.replace(/\/$/, '') + '/index.html';
  if (files.has(idx)) return idx;
  if (!p.match(/\.[^/]*$/)) { const h = p + '.html'; if (files.has(h)) return h; }
  return files.has('/index.html') ? '/index.html' : null;
}

function base64ToU8(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

// ── Session storage ───────────────────────────────────────────────────────────
const sessions = new Map<string, Map<string, Uint8Array>>();

// ── Background entry point ────────────────────────────────────────────────────
export default defineBackground(() => {
  // Activate immediately and claim all extension pages so fetch events fire.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sw = self as any;
  sw.addEventListener('install',  ()  => { console.log('[arc-pwa] SW install'); sw.skipWaiting(); });
  sw.addEventListener('activate', (e: any) => { console.log('[arc-pwa] SW activate'); e.waitUntil(sw.clients.claim()); });
  sw.addEventListener('fetch', handleFetch);

  console.log('[arc-pwa] background listeners registered');

  setupRules();
  browser.runtime.onInstalled.addListener(setupRules);
  if (browser.downloads?.onCreated) browser.downloads.onCreated.addListener(handleDownload);
  browser.runtime.onMessage.addListener(handleMessage);
});

// ── Fetch handler ─────────────────────────────────────────────────────────────
function handleFetch(event: any) {
  const url = new URL(event.request.url);
  const m = url.pathname.match(/^\/arc-pwa\/([^/]+)(\/.*)?$/);
  if (!m) return;
  console.log('[arc-pwa] fetch', url.pathname);
  event.respondWith(serveFile(m[1], m[2] || '/'));
}

async function serveFile(sessionId: string, filePath: string): Promise<Response> {
  const session = sessions.get(sessionId);
  if (!session) return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Session expired</title>
    <style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f9f9f9}
    .box{text-align:center;max-width:360px;padding:2rem;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.12)}
    h2{margin:0 0 .5rem;color:#c0392b}p{color:#555;line-height:1.5;margin:.5rem 0}</style></head>
    <body><div class="box"><h2>Session expired</h2>
    <p>The extension was updated or restarted and the archive was unloaded from memory.</p>
    <p>Please close this tab and open the archive again.</p></div></body></html>`,
    { status: 410, headers: { 'Content-Type': 'text/html' } },
  );
  const resolved = resolveFile(session, filePath);
  if (!resolved) return new Response(`Not found: ${filePath}`, { status: 404, headers: { 'Content-Type': 'text/plain' } });
  return new Response(session.get(resolved)!, { status: 200, headers: { 'Content-Type': mimeOf(resolved) } });
}

// ── Message handler ───────────────────────────────────────────────────────────
function handleMessage(message: unknown, _sender: browser.runtime.MessageSender, sendResponse: (r: unknown) => void): boolean {
  const msg = message as Record<string, unknown>;

  if (msg.type === 'unregisterSession') {
    sessions.delete(msg.sessionId as string);
    sendResponse({ ok: true });
    return true;
  }

  if (msg.type === 'registerSession') {
    const sessionId = msg.sessionId as string;
    const entries = msg.files as Array<[string, string]>;
    const map = new Map<string, Uint8Array>();
    for (const [path, b64] of entries) map.set(path, base64ToU8(b64));
    sessions.set(sessionId, map);
    console.log('[arc-pwa] registered session', sessionId, 'files:', map.size);
    sendResponse({ ok: true });
    return true;
  }

  return false;
}

// ── DNR rule ──────────────────────────────────────────────────────────────────
async function setupRules() {
  const viewerUrl = browser.runtime.getURL('/viewer.html');
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [1],
    addRules: [{
      id: 1, priority: 1,
      action: { type: 'redirect' as browser.declarativeNetRequest.RuleActionType, redirect: { regexSubstitution: viewerUrl + '?src=\\0' } },
      condition: { regexFilter: '^https?://.*\\.pwa\\.zip(?:[?#].*)?$', resourceTypes: ['main_frame' as browser.declarativeNetRequest.ResourceType] },
    }],
  });
}

// ── Download fallback ─────────────────────────────────────────────────────────
async function handleDownload(item: browser.downloads.DownloadItem) {
  const url = (item as any).url as string;
  if (!url || !url.split('?')[0].endsWith('.pwa.zip') || url.startsWith('blob:') || url.startsWith('data:')) return;
  try { await browser.downloads.cancel(item.id); await browser.downloads.erase({ id: item.id }); } catch { /* ok */ }
  const viewerUrl = browser.runtime.getURL('/viewer.html') + '?src=' + encodeURIComponent(url);
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab?.id != null) await browser.tabs.update(tab.id, { url: viewerUrl });
  else await browser.tabs.create({ url: viewerUrl });
}
