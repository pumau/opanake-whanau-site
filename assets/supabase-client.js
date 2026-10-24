// Ōpanake 1C South 6B whānau site — Supabase connection
//
// These are the PUBLIC project URL and publishable ("anon") key — safe to
// ship in browser code. Real access control lives in Supabase's row-level
// security rules (set up by opanake-database-setup.sql), not in secrecy of
// this key.
const SUPABASE_URL = 'https://sorqsioximbkkztzqqfq.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_-e8DtpgVZAmJo_ISWYQsRA_CQJw24KP';

// `supabase` here is the global from the CDN script tag loaded before this
// file. We name our client `sb` so we don't shadow that global.
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Toggles the header's "Register / Login" pill vs. the profile avatar
// depending on whether someone is signed in. Call on every page.
async function initNav() {
  const { data: { session } } = await sb.auth.getSession();
  const pill = document.querySelector('[data-nav="login-pill"]');
  const avatar = document.querySelector('[data-nav="profile-icon"]');
  const registerLink = document.querySelector('[data-nav="register-link"]');
  // Signed-in members don't need any Register link, on any page.
  if (registerLink) registerLink.classList.toggle('hidden', !!session);
  if (session) {
    if (pill) pill.classList.add('hidden');
    if (avatar) avatar.style.display = 'flex';
  } else {
    if (pill) pill.classList.remove('hidden');
    if (avatar) avatar.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', initNav);

// Full member-status check — not just "signed in", but "signed in AND
// approved". This site is private: real content only ever renders for an
// approved member (or an admin, who is always approved too). Every page
// that shows whānau content should gate on `approved`, not just `session`.
async function getMemberStatus() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return { session: null, approved: false, isAdmin: false, profile: null };
  const { data: profile } = await sb
    .from('profiles')
    .select('status, role, full_name, branch_id')
    .eq('id', session.user.id)
    .single();
  const approved = !!profile && profile.status === 'approved';
  const isAdmin = !!profile && profile.role === 'admin';
  return { session, approved, isAdmin, profile: profile || null };
}

// Shared "members only" gate. Call this near the top of a page's script,
// before loading any real content. It shows a friendly message (different
// wording for signed-out vs. pending) and returns whether the visitor is
// an approved member — only then should the caller reveal #page-content
// and load the page's real data.
async function initAccessGate() {
  const status = await getMemberStatus();
  if (status.approved) return status;

  const gate = document.getElementById('access-gate');
  if (gate) {
    const titleEl = document.getElementById('access-gate-title');
    const textEl = document.getElementById('access-gate-text');
    const btnEl = document.getElementById('access-gate-btn');
    if (status.session) {
      if (titleEl) titleEl.textContent = 'Waiting on approval';
      if (textEl) textEl.textContent = "An admin needs to approve your account before you can see this page — you'll get access as soon as that happens.";
      if (btnEl) { btnEl.textContent = 'View my profile'; btnEl.href = 'profile.html'; }
    } else {
      if (titleEl) titleEl.textContent = 'Members only';
      if (textEl) textEl.textContent = 'This site is for registered, approved whānau members only. Register or log in to continue.';
      if (btnEl) { btnEl.textContent = 'Register / log in'; btnEl.href = 'register.html'; }
    }
    gate.classList.remove('hidden');
  }
  return status;
}

// Storage keys only allow plain characters. Spaces, macrons (ā, ē, ī, ō, ū)
// and other symbols in a file name cause an "Invalid key" error on upload,
// so every upload builds its storage path from this cleaned-up name. The
// original name is not needed afterwards (the document's Title is what
// people see).
function safeFileName(name) {
  const cleaned = String(name || 'file')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'file';
}

// Branches are named for the sibling and carry their birth year in brackets,
// e.g. "Pua Howearth (1924)". The site lists them oldest first by that year;
// any without a year in the name keep their usual order after the dated ones.
function branchYear(name) {
  const m = /\((\d{4})\)/.exec(String(name || ''));
  return m ? parseInt(m[1], 10) : null;
}

function sortBranchesByYear(list) {
  return (list || []).map((b, i) => ({ b, i, y: branchYear(b.name) }))
    .sort((a, c) => {
      if (a.y !== null && c.y !== null) return a.y - c.y || a.i - c.i;
      if (a.y !== null) return -1;
      if (c.y !== null) return 1;
      return a.i - c.i;
    })
    .map((x) => x.b);
}

// Forum word filter. Asks the database (update #14) whether a draft is fine
// to post. If the update has not been run yet, or the check can't be reached,
// it lets the post through (the database still enforces the rule once live).
const FORUM_REWORD_MESSAGE =
  "A few of the words in that don't fit our kōrerorero guidelines. Please reword it and try again. Ideas and connection are always welcome here.";

async function forumTextOk(text) {
  try {
    const { data, error } = await sb.rpc('forum_text_ok', { t: text });
    if (error) return true;
    return data !== false;
  } catch (e) {
    return true;
  }
}

// The database refuses filtered posts with a "reword" message. Turn that,
// and any other error, into something friendly to show.
function forumErrorText(error, fallback) {
  const msg = (error && error.message) || '';
  if (/reword/i.test(msg)) return FORUM_REWORD_MESSAGE;
  return msg || fallback;
}

// ---- Forum documents (database update #18) ----------------------------------
// One document per post: PDF, Word, Excel or a picture, up to 15 MB. Members
// open it on screen (no download button). Files sit in the private
// "forum-files" bucket under the poster's own id.
const FORUM_FILE_MAX = 15 * 1024 * 1024;
const FORUM_FILE_TYPES = /\.(pdf|jpe?g|png|gif|webp|docx|xlsx|xls|csv)$/i;
const FORUM_FILE_ACCEPT = '.pdf,.docx,.xlsx,.xls,.csv,.jpg,.jpeg,.png,.gif,.webp';

// Returns a friendly message if the file can't be used, otherwise ''.
function forumFileProblem(file) {
  if (!file) return '';
  if (!FORUM_FILE_TYPES.test(file.name)) return 'That type of file can\'t be attached. Please use a PDF, Word, Excel or picture file.';
  if (file.size > FORUM_FILE_MAX) return 'That file is over 15 MB. Please attach a smaller one.';
  return '';
}

// Is the database ready for attachments (update #18 run)?
async function forumFilesReady() {
  try {
    const { error } = await sb.from('forum_posts').select('attachment_path').limit(1);
    return !error;
  } catch (e) {
    return false;
  }
}

// Uploads the file and returns { path, name } or { error }.
async function forumUploadFile(file, userId) {
  const path = `${userId}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await sb.storage.from('forum-files').upload(path, file);
  if (error) return { error: "Couldn't upload that file. Please try again." };
  return { path, name: file.name.slice(0, 200) };
}

// Removes an uploaded file that never made it onto a post. Best effort.
async function forumDiscardFile(path) {
  if (!path) return;
  try { await sb.storage.from('forum-files').remove([path]); } catch (e) { /* ignore */ }
}

// ---- How to pay (bank transfer) ---------------------------------------------
// Shown to signed-in, approved members only, next to their tickets or order.
const PAY_ACCOUNT_NAME = 'Embracing the Whenua';
const PAY_BANK = 'Kiwibank';
const PAY_ACCOUNT_NUMBER = '38-9000-0502730-17';

function payEsc(v) {
  const d = document.createElement('div');
  d.textContent = v == null ? '' : v;
  return d.innerHTML;
}

// amountText like "$20.00"; reference like "Jane Smith, Mystery raffle"
function payBoxHtml(amountText, reference) {
  const row = (label, value, copy) => `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; padding:7px 0; border-top:1px solid var(--border); font-size:13.5px; flex-wrap:wrap;">
      <span class="help-text" style="min-width:96px;">${label}</span>
      <span style="font-weight:600; flex:1; word-break:break-word;">${payEsc(value)}</span>
      ${copy ? `<button type="button" class="btn btn-outline" data-copy="${payEsc(value)}" style="padding:4px 12px; font-size:12px;">Copy</button>` : ''}
    </div>`;
  return `
    <div class="card" style="margin-top:14px; padding:16px 18px; border:1px solid var(--river); background: var(--river-soft);">
      <div style="font-weight:600; font-size:14px;">How to pay: ${payEsc(amountText)} by bank transfer</div>
      <div style="margin-top:8px;">
        ${row('Account name', PAY_ACCOUNT_NAME, false)}
        ${row(PAY_BANK, PAY_ACCOUNT_NUMBER, true)}
        ${row('Reference', reference, true)}
      </div>
      <p class="help-text" style="margin-top:8px;">Please use the reference so we can match your payment. We'll mark it as paid once it lands.</p>
    </div>`;
}

document.addEventListener('click', async (e) => {
  const btn = e.target.closest && e.target.closest('button[data-copy]');
  if (!btn) return;
  const text = btn.getAttribute('data-copy');
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = 'Copied';
  } catch (err) {
    btn.textContent = 'Select and copy';
  }
  setTimeout(() => { btn.textContent = 'Copy'; }, 1800);
});
