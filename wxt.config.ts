import { defineConfig } from 'wxt';

export default defineConfig({
  extensionApi: 'chrome',
  browser: 'edge',
  runner: {
    binaries: {
      edge: 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    },
  },
  manifest: {
    name: 'ArcPWA Viewer',
    description: 'Open .pwa.zip archives directly in the browser',
    version: '0.0.1',
    permissions: ['declarativeNetRequest', 'storage', 'downloads'],
    host_permissions: ['<all_urls>'],
  },
});
