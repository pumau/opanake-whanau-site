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
