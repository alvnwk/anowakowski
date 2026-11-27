/* ==========================================================================
   Nova — private workspace · configuration
   --------------------------------------------------------------------------
   1. Paste your Supabase project URL and public key here
      (Supabase → Project Settings → API). See saas-setup/GUIDE.md.
   2. While these two values are empty:
        - locally (localhost), the workspace runs in DEMO MODE, with sample
          data stored in your browser only;
        - online, the pages just show "Page not found".
   The "anon / publishable" key is meant to be public: the database security
   rules (supabase.sql) are what protect the data.
   ========================================================================== */

window.NOVA_CONFIG = {
  supabaseUrl: 'https://xshaiasakylgyzqqhqmk.supabase.co',
  supabaseAnonKey: 'sb_publishable_OuxUyaXxQEuNl9UyX8o_iA_Dil0eEQe',
  bucket: 'nova-docs',  // private file storage
};

/* Project workspaces. To add one: an entry here + a folder
   /saas-<id>/index.html (copy of /saas-auralys/index.html). */
window.NOVA_PROJECTS = {
  auralys: {
    id: 'auralys',
    name: 'Auralys',
    mark: 'A',
    tagline: 'Music social network',
    path: '/saas-auralys/',
    color: '#6d45d9',
    pages: ['overview', 'calendar', 'notes', 'links', 'stats', 'accounting', 'legal'],
  },
  escld: {
    id: 'escld',
    name: 'ESCLD',
    mark: 'E.',
    tagline: 'Law · Diplomacy · Europe',
    path: '/saas-escld/',
    color: '#1b2a45',
    pages: ['overview', 'calendar', 'notes', 'links', 'directory', 'votes', 'stats', 'accounting', 'admin_docs', 'legal'],
  },
};
