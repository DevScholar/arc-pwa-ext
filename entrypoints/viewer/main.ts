/**
 * arc-pwa-ext viewer.
 *
 * Flow:
 *  1. Load and extract the .pwa.zip in memory.
 *  2. Register all files with the background service worker (which serves them
 *     at chrome-extension://<id>/arc-pwa/<sessionId>/<path>).
 *  3. Navigate an iframe to that URL.  Because scripts are at 'self' origin
 *     the manifest CSP allows them — no unsafe-inline needed.
 */
import { unzip } from 'fflate';

function u8ToBase64(u8: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk)
    binary += String.fromCharCode(...u8.subarray(i, i + chunk));
  return btoa(binary);
}
function base64ToU8(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
}

let activeSessionId: string | null = null;
window.addEventListener('beforeunload', () => {
  if (activeSessionId) browser.runtime.sendMessage({ type: 'unregisterSession', sessionId: activeSessionId });
});

async function main() {
  const params = new URLSearchParams(location.search);
  const src     = params.get('src');
  const localId = params.get('local');
  let zipData: Uint8Array;

  try {
    // 1. Load zip
    if (src) {
      document.title = decodeURIComponent(src.split('/').pop()?.split('?')[0] ?? 'archive.pwa.zip');
      setStatus('Fetching…');
      const res = await fetch(src);
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      zipData = new Uint8Array(await res.arrayBuffer());
    } else if (localId) {
      setStatus('Reading file…');
      const key = `arc_pwa_${localId}`;
      const store = await browser.storage.session.get(key) as Record<string, string>;
      const b64 = store[key];
      if (!b64) throw new Error('File data expired. Please try opening the file again.');
      await browser.storage.session.remove(key);
      zipData = base64ToU8(b64);
    } else {
      throw new Error('No archive specified.\nUse the extension popup or navigate to a .pwa.zip URL.');
    }

    // 2. Extract zip
    setStatus('Extracting…');
    const raw = await new Promise<Record<string, Uint8Array>>((resolve, reject) => {
      unzip(zipData!, (err, data) => (err ? reject(err) : resolve(data)));
    });

    const files: Array<[string, string]> = [];
    for (const [p, data] of Object.entries(raw)) {
      if (!p.endsWith('/')) files.push(['/' + p.replace(/^\/+/, ''), u8ToBase64(data)]);
    }

    // 3. Register session with background SW
    setStatus('Starting…');
    const sessionId = crypto.randomUUID();
    activeSessionId = sessionId;
    const resp = await browser.runtime.sendMessage({ type: 'registerSession', sessionId, files });
    console.log('[arc-pwa viewer] registerSession response:', resp);

    // 4. Open the archive in a sandboxed iframe at its chrome-extension:// URL.
    //    Scripts are at 'self' origin so the manifest CSP allows them.
    //    No allow-same-origin keeps the PWA away from chrome.* APIs.
    hideOverlay();

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:none;background:#fff;';
    iframe.setAttribute('sandbox', 'allow-scripts allow-forms allow-popups allow-modals allow-same-origin');
    iframe.src = browser.runtime.getURL(`/arc-pwa/${sessionId}/`);
    document.body.appendChild(iframe);

  } catch (err: unknown) {
    showError(err instanceof Error ? err.message : String(err));
  }
}

function setStatus(msg: string) {
  document.getElementById('overlay')!.removeAttribute('hidden');
  document.getElementById('overlay')!.className = '';
  document.getElementById('status-text')!.textContent = msg;
}
function hideOverlay() { document.getElementById('overlay')!.setAttribute('hidden', ''); }
function showError(msg: string) {
  const el = document.getElementById('overlay')!;
  el.removeAttribute('hidden'); el.className = 'error';
  el.textContent = msg;
}

main();
