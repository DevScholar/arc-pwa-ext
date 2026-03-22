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
  console.log('[arc-pwa] fetch', url.pathname);
  const m = url.pathname.match(/^\/arc-pwa\/([^/]+)(\/.*)?$/);
  if (!m) return;
  event.respondWith(serveFile(m[1], m[2] || '/'));
}

async function serveFile(sessionId: string, filePath: string): Promise<Response> {
  console.log('[arc-pwa] serveFile', sessionId, filePath);
  const session = sessions.get(sessionId);
  if (!session) return new Response('Arc-PWA session not found — reload the viewer.', { status: 404, headers: { 'Content-Type': 'text/plain' } });
  const resolved = resolveFile(session, filePath);
  if (!resolved) return new Response(`Not found: ${filePath}`, { status: 404, headers: { 'Content-Type': 'text/plain' } });
  const data = session.get(resolved)!;
  const mime = mimeOf(resolved);
  console.log('[arc-pwa] →', resolved, data ? data.byteLength + ' bytes' : 'UNDEFINED', mime);
  if (data && data.byteLength > 0 && mime.startsWith('text/')) {
    console.log('[arc-pwa] preview:', JSON.stringify(new TextDecoder().decode(data.slice(0, 80))));
  }
  return new Response(data, { status: 200, headers: { 'Content-Type': mime } });
}

// ── Message handler ───────────────────────────────────────────────────────────
function handleMessage(message: unknown, _sender: browser.runtime.MessageSender, sendResponse: (r: unknown) => void): boolean {
  const msg = message as Record<string, unknown>;

  if (msg.type === 'registerSession') {
    const sessionId = msg.sessionId as string;
    const entries = msg.files as Array<[string, number[]]>;
    const map = new Map<string, Uint8Array>();
    for (const [path, arr] of entries) {
      const u8 = new Uint8Array(arr);
      console.log('[arc-pwa] file', path, u8.byteLength, 'bytes');
      map.set(path, u8);
    }
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
