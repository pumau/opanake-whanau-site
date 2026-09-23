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
