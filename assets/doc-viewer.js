// Shared view-only document viewer (used by the forum; the Archive has its
// own copy of the same code). Opens a PDF, image, text, Word or Excel file
// from private storage in a full-screen overlay, with no download button.
// This stops casual saving. Anything a person can see on screen can still be
// screenshotted, so only attach what members are fine to read.
// Needs the page to have `sb` (the Supabase client) and assets/styles.css.
const MIME = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', txt: 'text/plain' };
const PDFJS = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/';
let viewerUrl = null;
let pdfLoading = null;
const MAMMOTH = 'https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.4.2/mammoth.browser.min.js';
const SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
const scriptLoads = {};
function loadScript(url) {
  if (!scriptLoads[url]) {
    scriptLoads[url] = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = url;
      el.onload = resolve;
      el.onerror = () => { delete scriptLoads[url]; reject(new Error('script failed to load')); };
      document.head.appendChild(el);
    });
  }
  return scriptLoads[url];
}

function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve();
  if (!pdfLoading) {
    pdfLoading = new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = PDFJS + 'pdf.min.js';
      el.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS + 'pdf.worker.min.js'; resolve(); };
      el.onerror = () => { pdfLoading = null; reject(new Error('pdf.js failed to load')); };
      document.head.appendChild(el);
    });
  }
  return pdfLoading;
}

function closeViewer() {
  const v = document.getElementById('doc-viewer');
  v.classList.add('hidden');
  document.getElementById('doc-viewer-body').innerHTML = '';
  if (viewerUrl) { URL.revokeObjectURL(viewerUrl); viewerUrl = null; }
  document.body.style.overflow = '';
}

async function openViewer(bucket, path, title) {
  const v = document.getElementById('doc-viewer');
  const body = document.getElementById('doc-viewer-body');
  document.getElementById('doc-viewer-title').textContent = title || 'Document';
  body.innerHTML = '<p class="viewer-msg">Opening document...</p>';
  v.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  const ext = (path.split('.').pop() || '').toLowerCase();
  try {
    const { data, error } = await sb.storage.from(bucket).download(path);
    if (error || !data) throw error || new Error('no file');
    if (ext === 'pdf') {
      await loadPdfJs();
      const pdf = await window.pdfjsLib.getDocument({ data: await data.arrayBuffer() }).promise;
      body.innerHTML = '';
      const width = Math.min(body.clientWidth - 24, 980);
      const ratio = window.devicePixelRatio || 1;
      const io = new IntersectionObserver((entries) => {
        entries.forEach(async (en) => {
          if (!en.isIntersecting) return;
          const c = en.target; io.unobserve(c);
          const page = await pdf.getPage(Number(c.dataset.page));
          const base = page.getViewport({ scale: 1 });
          const vp = page.getViewport({ scale: (width / base.width) * ratio });
          c.width = vp.width; c.height = vp.height;
          await page.render({ canvasContext: c.getContext('2d'), viewport: vp }).promise;
        });
      }, { root: body, rootMargin: '600px 0px' });
      for (let i = 1; i <= pdf.numPages; i++) {
        const first = await pdf.getPage(i);
        const b = first.getViewport({ scale: 1 });
        const c = document.createElement('canvas');
        c.className = 'viewer-page'; c.dataset.page = i;
        c.style.width = width + 'px'; c.style.aspectRatio = b.width + ' / ' + b.height;
        body.appendChild(c); io.observe(c);
      }
    } else if (ext === 'docx') {
      await loadScript(MAMMOTH);
      const result = await window.mammoth.convertToHtml({ arrayBuffer: await data.arrayBuffer() });
      body.innerHTML = '';
      const doc = document.createElement('div');
      doc.className = 'viewer-doc';
      doc.innerHTML = result.value || '<p>This document appears to be empty.</p>';
      body.appendChild(doc);
    } else if (ext === 'xlsx' || ext === 'xls' || ext === 'csv') {
      await loadScript(SHEETJS);
      const wb = window.XLSX.read(await data.arrayBuffer(), { type: 'array' });
      body.innerHTML = '';
      wb.SheetNames.forEach((name) => {
        const doc = document.createElement('div');
        doc.className = 'viewer-doc';
        const h = document.createElement('h3');
        h.textContent = name;
        doc.appendChild(h);
        const holder = document.createElement('div');
        holder.innerHTML = window.XLSX.utils.sheet_to_html(wb.Sheets[name], { header: '', footer: '' });
        doc.appendChild(holder);
        body.appendChild(doc);
      });
    } else if (ext === 'txt') {
      body.innerHTML = '';
      const pre = document.createElement('pre');
      pre.className = 'viewer-text';
      pre.textContent = await data.text();
      body.appendChild(pre);
    } else if (!/^(jpe?g|png|gif|webp)$/.test(ext)) {
      body.innerHTML = '<p class="viewer-msg">This type of file can\'t be shown on screen. Ask an admin to upload it again as a PDF.</p>';
    } else {
      viewerUrl = URL.createObjectURL(new Blob([data], { type: MIME[ext] || 'image/jpeg' }));
      body.innerHTML = '';
      const img = document.createElement('img');
      img.className = 'viewer-img'; img.src = viewerUrl; img.alt = title || ''; img.draggable = false;
      body.appendChild(img);
    }
  } catch (err) {
    body.innerHTML = '<p class="viewer-msg">Sorry, this document could not be opened right now. Please try again.</p>';
  }
}

function ensureViewerShell() {
  if (document.getElementById('doc-viewer')) return;
  const v = document.createElement('div');
  v.id = 'doc-viewer';
  v.className = 'viewer hidden';
  v.setAttribute('role', 'dialog');
  v.setAttribute('aria-modal', 'true');
  v.setAttribute('aria-label', 'Document viewer');
  v.innerHTML = '<div class="viewer-bar"><div id="doc-viewer-title" class="viewer-title"></div><div class="viewer-note">View only</div><button type="button" class="btn btn-outline viewer-close" id="doc-viewer-close">Close</button></div><div id="doc-viewer-body" class="viewer-body"></div>';
  document.body.appendChild(v);
  document.getElementById('doc-viewer-close').addEventListener('click', closeViewer);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeViewer(); });
  // Block right-click and drag on the open document (casual saving only).
  v.addEventListener('contextmenu', (e) => e.preventDefault());
}

function openDocViewer(bucket, path, title) {
  ensureViewerShell();
  return openViewer(bucket, path, title);
}
