// Adds a "Copy link" button beside links to documents on other websites
// (PDFs, Word and Excel files), so readers can copy the address and paste it
// into their own browser instead of clicking through.
(function () {
  const DOC = /\.(pdf|docx?|xlsx?|pptx?)$/i;

  function isExternalDoc(a) {
    try {
      const u = new URL(a.href, window.location.href);
      return /^https?:$/.test(u.protocol) && u.host !== window.location.host && DOC.test(u.pathname);
    } catch (e) { return false; }
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* try the older way */ }
    try {
      const t = document.createElement('textarea');
      t.value = text; t.setAttribute('readonly', ''); t.style.position = 'fixed'; t.style.opacity = '0';
      document.body.appendChild(t); t.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(t);
      return ok;
    } catch (e) { return false; }
  }

  function addButton(a) {
    if (a.getAttribute('data-copy-added')) return;
    a.setAttribute('data-copy-added', '1');
    const card = a.classList.contains('link-card');
    const wrap = document.createElement(card ? 'div' : 'span');
    wrap.className = card ? 'doc-link-card' : 'doc-link';
    a.parentNode.insertBefore(wrap, a);
    wrap.appendChild(a);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'copy-link-btn';
    btn.textContent = 'Copy link';
    btn.title = 'Copy this link, then paste it into your browser';
    wrap.appendChild(btn);

    let timer = null;
    btn.addEventListener('click', async () => {
      const ok = await copyText(a.href);
      const old = wrap.querySelector('.copy-link-field');
      if (old) old.remove();
      if (ok) {
        btn.textContent = 'Copied. Paste it into your browser';
        btn.classList.add('copied');
      } else {
        // Copying isn't allowed here: show the address ready to select.
        btn.textContent = 'Copy the link below';
        const f = document.createElement('input');
        f.type = 'text'; f.readOnly = true; f.value = a.href; f.className = 'copy-link-field';
        f.setAttribute('aria-label', 'Link to copy');
        wrap.appendChild(f); f.focus(); f.select();
      }
      clearTimeout(timer);
      timer = setTimeout(() => { btn.textContent = 'Copy link'; btn.classList.remove('copied'); }, 4000);
    });
  }

  function run() { document.querySelectorAll('a[href]').forEach((a) => { if (isExternalDoc(a)) addButton(a); }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
