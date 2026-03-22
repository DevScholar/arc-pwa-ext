const urlInput = document.getElementById('url-input') as HTMLInputElement;
const openUrlBtn = document.getElementById('open-url-btn') as HTMLButtonElement;
const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const statusEl = document.getElementById('status') as HTMLDivElement;

function openUrl(raw: string) {
  let url = raw.trim();
  if (!url) return;
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  const viewerUrl = browser.runtime.getURL('/viewer.html') + '?src=' + encodeURIComponent(url);
  browser.tabs.create({ url: viewerUrl });
  window.close();
}

async function openFile(file: File) {
  setStatus('Reading file…');
  openUrlBtn.disabled = true;
  try {
    const buffer = await file.arrayBuffer();
    const id = crypto.randomUUID();
    // Store in session storage — accessible to the viewer tab (same extension origin)
    await browser.storage.session.set({
      [`arc_pwa_${id}`]: Array.from(new Uint8Array(buffer)),
    });
    const viewerUrl = browser.runtime.getURL('/viewer.html') + '?local=' + id;
    browser.tabs.create({ url: viewerUrl });
    window.close();
  } catch (err) {
    setStatus('Error: file may be too large (session storage limit ~10 MB).', true);
    openUrlBtn.disabled = false;
  }
}

function setStatus(msg: string, isError = false) {
  statusEl.textContent = msg;
  statusEl.className = isError ? 'error' : '';
}

// URL input
openUrlBtn.addEventListener('click', () => openUrl(urlInput.value));
urlInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') openUrl(urlInput.value);
});

// File input via click
dropZone.addEventListener('click', () => fileInput.click());
fileInput.addEventListener('change', () => {
  const file = fileInput.files?.[0];
  if (file) openFile(file);
});

// Drag and drop
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('drag-over');
});
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  const file = e.dataTransfer?.files[0];
  if (file) openFile(file);
});
