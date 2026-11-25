/* ==========================================================================
   Nova — espace privé · configuration
   --------------------------------------------------------------------------
   1. Collez ici l'URL et la clé publique de votre projet Supabase
      (Supabase → Project Settings → API). Voir saas-setup/GUIDE.md.
   2. Tant que ces deux valeurs sont vides :
        - en local (localhost), l'espace tourne en MODE DÉMO, avec des données
          fictives enregistrées dans votre navigateur ;
        - en ligne, les pages affichent un simple « Page introuvable ».
   La clé « anon / publishable » est faite pour être publique : ce sont les
   règles de sécurité de la base (supabase.sql) qui protègent les données.
   ========================================================================== */

window.NOVA_CONFIG = {
  supabaseUrl: 'https://xshaiasakylgyzqqhqmk.supabase.co',      // ex. 'https://abcdefghijkl.supabase.co'
  supabaseAnonKey: 'sb_publishable_OuxUyaXxQEuNl9UyX8o_iA_Dil0eEQe',  // ex. 'eyJhbGciOi…' ou 'sb_publishable_…'
  bucket: 'nova-docs',  // espace de stockage privé des fichiers
};

/* Les espaces projets. Pour en ajouter un : une entrée ici + un dossier
   /saas-<id>/index.html (copie de /saas-auralys/index.html). */
window.NOVA_PROJECTS = {
  auralys: {
    id: 'auralys',
    name: 'Auralys',
    mark: 'A',
    tagline: 'Réseau social musical',
    path: '/saas-auralys/',
    color: '#6d45d9',
    pages: ['overview', 'calendar', 'links', 'stats', 'accounting', 'legal'],
  },
  escld: {
    id: 'escld',
    name: 'ESCLD',
    mark: 'E.',
    tagline: 'Law · Diplomacy · Europe',
    path: '/saas-escld/',
    color: '#1b2a45',
    pages: ['overview', 'calendar', 'links', 'directory', 'stats', 'accounting', 'admin_docs', 'legal'],
  },
};
