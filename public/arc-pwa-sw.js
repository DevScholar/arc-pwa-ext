const sw = self;
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".cjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".mp3": "audio/mpeg",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml",
  ".wasm": "application/wasm",
  ".pdf": "application/pdf",
  ".map": "application/json"
};
function getMimeType(path) {
  var _a, _b;
  const ext = ((_b = (_a = path.match(/\.[^./]+$/)) == null ? void 0 : _a[0]) == null ? void 0 : _b.toLowerCase()) ?? "";
  return MIME_TYPES[ext] ?? "application/octet-stream";
}
const instances = /* @__PURE__ */ new Map();
const _prefix = (() => {
  const scopePath = new URL(sw.registration.scope).pathname;
  return scopePath + "__arc_pwa__/";
})();
sw.addEventListener("install", () => {
  sw.skipWaiting();
});
sw.addEventListener("activate", (event) => {
  event.waitUntil(sw.clients.claim());
});
sw.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  const prefix = _prefix;
  if (!url.pathname.startsWith(prefix)) return;
  const rest = url.pathname.slice(prefix.length);
  const slashIdx = rest.indexOf("/");
  let instanceId;
  let filePath;
  if (slashIdx === -1) {
    instanceId = rest;
    filePath = "/index.html";
  } else {
    instanceId = rest.slice(0, slashIdx);
    filePath = rest.slice(slashIdx) || "/index.html";
  }
  event.respondWith(serveFile(instanceId, filePath));
});
async function serveFile(instanceId, path) {
  const files = instances.get(instanceId);
  if (!files) {
    return new Response(`ArcPWA: instance "${instanceId}" not found`, { status: 404 });
  }
  const data = resolveFile(files, path);
  if (!data) {
    return new Response(`ArcPWA: file not found: ${path}`, { status: 404 });
  }
  return new Response(data, {
    status: 200,
    headers: { "Content-Type": getMimeType(path) }
  });
}
function resolveFile(files, path) {
  let data = files.get(path);
  if (data) return data;
  const withIndex = path.replace(/\/?$/, "/index.html");
  data = files.get(withIndex);
  if (data) return data;
  if (!path.includes(".")) {
    data = files.get(path + ".html");
    if (data) return data;
  }
  return files.get("/index.html");
}
sw.addEventListener("message", (event) => {
  const { type, instanceId } = event.data;
  const port = event.ports[0];
  switch (type) {
    case "REGISTER_INSTANCE": {
      const entries = event.data["entries"];
      instances.set(instanceId, new Map(entries));
      port == null ? void 0 : port.postMessage({ ok: true });
      break;
    }
    case "WRITE_FILE": {
      const path = event.data["path"];
      const data = event.data["data"];
      const map = instances.get(instanceId);
      if (map) {
        if (data === null) {
          map.delete(path);
        } else {
          map.set(path, data);
        }
      }
      port == null ? void 0 : port.postMessage({ ok: true });
      break;
    }
    case "UNREGISTER_INSTANCE": {
      instances.delete(instanceId);
      port == null ? void 0 : port.postMessage({ ok: true });
      break;
    }
    default:
      port == null ? void 0 : port.postMessage({ ok: false, error: `Unknown message type: ${type}` });
  }
});
//# sourceMappingURL=arc-pwa-sw.js.map
