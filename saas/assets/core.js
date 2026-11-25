/* ==========================================================================
   Nova — private workspace · shared core
   Data (Supabase online, or local demo), session and UI components.
   ========================================================================== */
(function () {
  'use strict';

  const CFG = Object.assign({ supabaseUrl: '', supabaseAnonKey: '', bucket: 'nova-docs' }, window.NOVA_CONFIG || {});
  const PROJECTS = window.NOVA_PROJECTS || {};
  const PROJECT_IDS = Object.keys(PROJECTS);
  const host = location.hostname;
  const LOCAL = ['localhost', '127.0.0.1', '[::1]', '::1'].includes(host) || /\.(localhost|test)$/.test(host);
  const MODE = CFG.supabaseUrl && CFG.supabaseAnonKey ? 'live' : LOCAL ? 'demo' : 'off';
  const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.118.0/dist/umd/supabase.min.js';
  const LOCALE = 'en-GB';

  /* ---------------------------------------------------------------- helpers */
  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const safeName = (n) => String(n || 'file').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\-]+/g, '_').slice(-120);

  function safeUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (/^[a-z][a-z0-9+.-]*:/i.test(u)) return ''; // javascript:, data:… rejected
    return 'https://' + u.replace(/^\/+/, '');
  }
  function domainOf(u) {
    try { return new URL(safeUrl(u)).hostname.replace(/^www\./, ''); } catch (e) { return ''; }
  }

  const pad = (n) => String(n).padStart(2, '0');
  const isoDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  function parseDay(s) {
    if (!s) return null;
    const [y, m, d] = String(s).slice(0, 10).split('-').map(Number);
    if (!y) return null;
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function fmtDate(s, opts) {
    const d = s instanceof Date ? s : parseDay(s);
    return d ? d.toLocaleDateString(LOCALE, opts || { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  }
  const fmtLong = (d = new Date()) => d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const EUR = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR' });
  const EUR0 = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const NUM = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 2 });
  const fmtMoney = (n) => EUR.format(Number(n) || 0);
  const fmtMoney0 = (n) => EUR0.format(Number(n) || 0);
  const fmtNum = (n) => NUM.format(Number(n) || 0);
  function fmtSize(b) {
    b = Number(b) || 0;
    if (b < 1024) return b + ' B';
    if (b < 1048576) return Math.round(b / 1024) + ' KB';
    return (b / 1048576).toFixed(1) + ' MB';
  }
  function ago(ts) {
    if (!ts) return '';
    const s = (Date.now() - new Date(ts).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
    return fmtDate(new Date(ts));
  }
  function initials(name, email) {
    const src = String(name || email || '?').trim();
    const parts = src.split(/[\s.@_-]+/).filter(Boolean);
    return ((parts[0] || '?')[0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
  }
  const firstName = (me) => (me && me.full_name ? me.full_name.split(' ')[0] : '');
  const canAccess = (me, p) => !!(me && me.active && (me.is_admin || (me.projects || []).includes(p)));

  function humanError(e) {
    const m = String((e && (e.message || e.error_description || e.msg)) || e || '');
    if (/Invalid login credentials/i.test(m)) return 'Incorrect email or password.';
    if (/already registered|already been registered|User already exists/i.test(m)) return 'An account already exists for this address: use "Sign in".';
    if (/Database error saving new user|non autoris|not authori[sz]ed|Signups not allowed/i.test(m)) return 'This address has not been granted access yet. Ask an administrator.';
    if (/Email not confirmed/i.test(m)) return 'Email address not confirmed. Check your inbox.';
    if (/Password should|weak password|at least/i.test(m)) return 'Password too weak: at least 8 characters.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Too many attempts. Try again in a few minutes.';
    if (/row-level security|permission denied|violates/i.test(m)) return 'Your account is not allowed to do this.';
    if (/too large|maximum allowed size|Payload/i.test(m)) return 'File too large (50 MB maximum).';
    if (/Failed to fetch|NetworkError|Load failed|Could not load/i.test(m)) return 'Cannot connect. Check your network and try again.';
    return m || 'Something went wrong.';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load: ' + src));
      document.head.appendChild(s);
    });
  }

  /* ======================================================== data: Supabase */
  let sbClient = null;
  async function sb() {
    if (sbClient) return sbClient;
    if (!window.supabase) await loadScript(SUPABASE_JS);
    sbClient = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'nova-space-auth' },
    });
    return sbClient;
  }
  const must = ({ data, error }) => { if (error) throw error; return data; };

  const live = {
    async session() { const c = await sb(); return must(await c.auth.getSession()).session; },
    async signIn(email, password) { const c = await sb(); return must(await c.auth.signInWithPassword({ email, password })).session; },
    async signUp(email, password) { const c = await sb(); return must(await c.auth.signUp({ email, password })).session; },
    async signOut() { const c = await sb(); await c.auth.signOut(); },
    async resetPassword(email) {
      const c = await sb();
      must(await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/saas/?recovery=1' }));
    },
    async setPassword(password) { const c = await sb(); must(await c.auth.updateUser({ password })); },
    onRecovery(cb) { sb().then((c) => c.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY') cb(); })); },
    async me() {
      const c = await sb();
      const s = await this.session();
      if (!s) return null;
      return must(await c.from('members').select('*').eq('email', s.user.email.toLowerCase()).maybeSingle());
    },
    async touch() { const c = await sb(); await c.rpc('touch_member'); },
    async listItems(project) {
      const c = await sb();
      const step = 1000;
      let all = [];
      for (let from = 0; ; from += step) {
        const rows = must(await c.from('items').select('*').eq('project', project).order('created_at', { ascending: true }).range(from, from + step - 1));
        all = all.concat(rows);
        if (rows.length < step) break;
      }
      return all;
    },
    async createItem(project, kind, data) { const c = await sb(); return must(await c.from('items').insert({ project, kind, data }).select().single()); },
    async updateItem(id, data) { const c = await sb(); return must(await c.from('items').update({ data }).eq('id', id).select().single()); },
    async removeItem(id) { const c = await sb(); must(await c.from('items').delete().eq('id', id)); },
    async upload(project, kind, file) {
      const c = await sb();
      const path = `${project}/${kind}/${uid()}-${safeName(file.name)}`;
      must(await c.storage.from(CFG.bucket).upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false }));
      return path;
    },
    async fileUrl(path) { const c = await sb(); return must(await c.storage.from(CFG.bucket).createSignedUrl(path, 300)).signedUrl; },
    async removeFile(path) { const c = await sb(); await c.storage.from(CFG.bucket).remove([path]); },
    async listMembers() { const c = await sb(); return must(await c.from('members').select('*').order('created_at', { ascending: true })); },
    async addMember(row) { const c = await sb(); return must(await c.from('members').insert(row).select().single()); },
    async updateMember(email, patch) { const c = await sb(); return must(await c.from('members').update(patch).eq('email', email).select().single()); },
    async removeMember(email) { const c = await sb(); must(await c.from('members').delete().eq('email', email)); },
  };

  /* ====================================================== data: local demo */
  const DEMO_KEY = 'nova-space-demo-v2';
  let demoMem = null;
  function demoState() {
    if (demoMem) return demoMem;
    try {
      const s = JSON.parse(localStorage.getItem(DEMO_KEY) || 'null');
      if (s && s.v === 2) return (demoMem = s);
    } catch (e) { /* storage unavailable */ }
    demoMem = demoSeed();
    demoSave();
    return demoMem;
  }
  function demoSave() { try { localStorage.setItem(DEMO_KEY, JSON.stringify(demoMem)); } catch (e) { /* full or blocked: keep in memory */ } }
  const demoMember = (email) => demoState().members.find((m) => m.email === email) || null;
  const demoMe = () => { const s = demoState(); return s.session ? demoMember(s.session) : null; };
  const demoCan = (p) => canAccess(demoMe(), p);
  const deny = () => { throw new Error('new row violates row-level security policy'); };
  const demoAdmin = () => { const m = demoMe(); if (!(m && m.active && m.is_admin)) deny(); };
  const fileToDataUrl = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });

  const demo = {
    async session() { const s = demoState(); return s.session ? { user: { email: s.session } } : null; },
    async signIn(email, password) {
      await sleep(300);
      const m = demoMember(email.trim().toLowerCase());
      if (!m || !password) throw new Error('Invalid login credentials');
      demoState().session = m.email; demoSave();
      return { user: { email: m.email } };
    },
    async signUp(email, password) {
      await sleep(300);
      const m = demoMember(email.trim().toLowerCase());
      if (!m || !m.active) throw new Error('Database error saving new user');
      if (!password) throw new Error('Password should be at least 8 characters');
      demoState().session = m.email; demoSave();
      return { user: { email: m.email } };
    },
    async signOut() { demoState().session = null; demoSave(); },
    async resetPassword() { await sleep(300); },
    async setPassword() { await sleep(300); },
    onRecovery() {},
    async me() { const m = demoMe(); return m ? clone(m) : null; },
    async touch() { const m = demoMe(); if (m) { m.last_seen = new Date().toISOString(); demoSave(); } },
    async listItems(project) { await sleep(150); return demoCan(project) ? clone(demoState().items.filter((i) => i.project === project)) : []; },
    async createItem(project, kind, data) {
      if (!demoCan(project)) deny();
      const now = new Date().toISOString();
      const row = { id: uid(), project, kind, data, created_by: demoState().session, created_at: now, updated_at: now };
      demoState().items.push(row); demoSave();
      return clone(row);
    },
    async updateItem(id, data) {
      const it = demoState().items.find((i) => i.id === id);
      if (!it || !demoCan(it.project)) deny();
      it.data = data; it.updated_at = new Date().toISOString(); demoSave();
      return clone(it);
    },
    async removeItem(id) {
      const s = demoState();
      const it = s.items.find((i) => i.id === id);
      if (!it || !demoCan(it.project)) deny();
      s.items = s.items.filter((i) => i.id !== id); demoSave();
    },
    async upload(project, kind, file) {
      if (!demoCan(project)) deny();
      if (file.size > 1.5 * 1048576) throw new Error('In demo mode, files are limited to 1.5 MB (50 MB online).');
      const path = `${project}/${kind}/${uid()}-${safeName(file.name)}`;
      demoState().files[path] = await fileToDataUrl(file); demoSave();
      return path;
    },
    async fileUrl(path) {
      const d = demoState().files[path];
      if (!d) throw new Error('File not found (the demo sample documents have no real file).');
      const blob = await (await fetch(d)).blob();
      return URL.createObjectURL(blob);
    },
    async removeFile(path) { delete demoState().files[path]; demoSave(); },
    async listMembers() { demoAdmin(); return clone(demoState().members); },
    async addMember(row) {
      demoAdmin();
      if (demoMember(row.email)) throw new Error('This address is already on the list.');
      const m = Object.assign({ full_name: '', is_admin: false, projects: [], active: true, created_at: new Date().toISOString(), last_seen: null }, row);
      demoState().members.push(m); demoSave();
      return clone(m);
    },
    async updateMember(email, patch) { demoAdmin(); const m = demoMember(email); if (!m) deny(); Object.assign(m, patch); demoSave(); return clone(m); },
    async removeMember(email) { demoAdmin(); const s = demoState(); s.members = s.members.filter((m) => m.email !== email); demoSave(); },
  };

  /* Sample data, for the local demo only. */
  function demoSeed() {
    const t = new Date();
    const day = (n) => { const d = new Date(t); d.setDate(d.getDate() + n); return isoDay(d); };
    const mon = (m, d) => { const x = new Date(t.getFullYear(), t.getMonth() + m, Math.min(d, 28)); return isoDay(x > t ? t : x); };
    const stamp = new Date().toISOString();
    const items = [];
    const add = (project, kind, data, by) => items.push({ id: uid(), project, kind, data, created_by: by || 'admin@demo.local', created_at: stamp, updated_at: stamp });

    /* ---- Auralys */
    [
      ['Auralys — app', 'https://auralys.app', 'Product', 'Public version of the app.'],
      ['Auralys blog', 'https://blog.auralys.app', 'Product', 'Articles, announcements and release notes.'],
      ['GitHub', 'https://github.com', 'Tools', 'Source code and deployments.'],
      ['Supabase', 'https://supabase.com/dashboard', 'Tools', 'Database and accounts.'],
      ['INPI — trademarks', 'https://www.inpi.fr', 'Legal', 'Trademark filing follow-up.'],
      ['CNIL — GDPR', 'https://www.cnil.fr', 'Legal', 'Personal data obligations.'],
    ].forEach(([title, url, category, description]) => add('auralys', 'link', { title, url, category, description }));
    [180, 260, 410, 590, 760, 940].forEach((v, i) => add('auralys', 'stat', { metric: 'Active users', value: v, unit: 'users', date: mon(i - 5, 28), source: 'https://auralys.app', comment: i === 5 ? 'Peak after the Instagram campaign.' : '' }));
    [1200, 1650, 2300, 3100].forEach((v, i) => add('auralys', 'stat', { metric: 'Reviews posted', value: v, unit: 'reviews', date: mon(i - 3, 27), source: '', comment: '' }));
    [4.4, 4.5, 4.7].forEach((v, i) => add('auralys', 'stat', { metric: 'Average rating', value: v, unit: '/ 5', date: mon(i - 2, 20), source: '', comment: i === 2 ? 'After the ranking redesign.' : '' }));
    add('auralys', 'event', { title: 'Product sync', date: day(1), start: '10:00', end: '11:00', place: 'Video call', category: 'Meeting', description: 'Review of beta feedback.' });
    add('auralys', 'event', { title: 'Beta 1.9 release', date: day(6), category: 'Deadline', description: '' });
    add('auralys', 'event', { title: 'Community listening night', date: day(12), start: '19:30', end: '22:30', place: 'Paris', category: 'Event', description: '' });
    add('auralys', 'event', { title: 'Domain name renewal', date: day(24), category: 'Deadline', description: '' });
    add('auralys', 'legal', { title: 'Terms of use', category: 'Terms / T&Cs', date: mon(-2, 3), source: 'link', link: 'https://auralys.app', notes: 'Version 1.2' });
    add('auralys', 'legal', { title: 'Privacy policy', category: 'GDPR / data', date: mon(-2, 3), source: 'link', link: 'https://auralys.app', notes: '' });
    add('auralys', 'legal', { title: 'Trademark filing certificate', category: 'Intellectual property', date: mon(-7, 14), source: 'link', link: 'https://www.inpi.fr', notes: 'Paper original at the head office.' });
    add('auralys', 'entry', { type: 'in', label: 'Initial contribution', amount: 2500, date: mon(-8, 2), category: 'Contribution', method: 'Bank transfer', notes: '' });
    for (let i = -8; i <= 0; i++) add('auralys', 'entry', { type: 'out', label: 'Server hosting', amount: 24.9, date: mon(i, 5), category: 'Hosting & tools', method: 'Card', notes: '' });
    add('auralys', 'entry', { type: 'out', label: 'INPI trademark filing', amount: 190, date: mon(-7, 14), category: 'Legal', method: 'Card', notes: '' });
    add('auralys', 'entry', { type: 'out', label: 'Instagram campaign', amount: 320, date: mon(-1, 9), category: 'Marketing', method: 'Card', notes: '' });
    add('auralys', 'entry', { type: 'in', label: 'Student competition prize', amount: 800, date: mon(-3, 18), category: 'Grant / prize', method: 'Bank transfer', notes: '' });
    add('auralys', 'entry', { type: 'out', label: 'auralys.app domain name', amount: 15, date: mon(-4, 2), category: 'Hosting & tools', method: 'Card', notes: '' });

    /* ---- ESCLD */
    [
      ['escld.eu', 'https://escld.eu', 'Communication', 'Official website.'],
      ['ESCLD on LinkedIn', 'https://www.linkedin.com/company/escld/', 'Communication', 'Company page.'],
      ['Instagram', 'https://instagram.com/escld.eu', 'Communication', ''],
      ['Le Compte Asso', 'https://lecompteasso.associations.gouv.fr', 'Administration', 'Grant applications.'],
      ['Service-Public — associations', 'https://www.service-public.fr/associations', 'Administration', 'Association procedures.'],
      ['Journal officiel — associations', 'https://www.journal-officiel.gouv.fr/pages/associations-recherche/', 'Legal', 'Publication of the declaration.'],
    ].forEach(([title, url, category, description]) => add('escld', 'link', { title, url, category, description }));
    [
      ['Camille Laurent', 'President', 'Board', true, 1],
      ['Hugo Martin', 'Vice-President', 'Board', true, 2],
      ['Inès Bernard', 'Secretary General', 'Board', true, 3],
      ['Lucas Petit', 'Treasurer', 'Board', true, 4],
      ['Sofia Rossi', 'Council lead', 'Law & Institutions', false, 0],
      ['Jonas Weber', 'Council lead', 'Diplomacy & International Relations', false, 0],
      ['Léa Dubois', 'Council lead', 'Europe & Fundamental Rights', false, 0],
      ['Mathis Leroy', 'Member', 'Law & Institutions', false, 0],
      ['Clara Moreau', 'Member', 'Diplomacy & International Relations', false, 0],
      ['Elena García', 'Member', 'Europe & Fundamental Rights', false, 0],
    ].forEach(([name, role, council, exec, order], i) => add('escld', 'member', {
      name, role, council, exec, exec_order: order || null, school: ['Paris', 'Lyon', 'Brussels', 'Strasbourg', 'Milan', 'Berlin'][i % 6],
      email: name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(' ', '.') + '@example.eu', phone: '', since: mon(-14 + i, 10), linkedin: '', notes: '',
    }));
    [42, 51, 63, 70, 78, 86].forEach((v, i) => add('escld', 'stat', { metric: 'Members', value: v, unit: 'members', date: mon(i - 5, 28), source: '', comment: i === 3 ? 'Start of the academic year.' : '' }));
    [600, 820, 1150].forEach((v, i) => add('escld', 'stat', { metric: 'LinkedIn followers', value: v, unit: 'followers', date: mon(i - 2, 26), source: 'https://www.linkedin.com/company/escld/', comment: '' }));
    add('escld', 'event', { title: 'Board meeting', date: day(2), start: '18:30', end: '19:30', place: 'Video call', category: 'Meeting', description: 'Agenda: budget, partnerships.' });
    add('escld', 'event', { title: 'General assembly', date: day(9), start: '14:00', end: '17:00', place: 'Main hall', category: 'Event', description: '' });
    add('escld', 'event', { title: 'Grant application deadline', date: day(15), category: 'Deadline', description: '' });
    add('escld', 'event', { title: 'Conference: Europe and the rule of law', date: day(20), start: '18:00', end: '20:00', place: 'Lecture hall B', category: 'Event', description: '' });
    add('escld', 'admin_doc', { title: 'Prefecture declaration receipt', category: 'Declaration / receipt', date: mon(-11, 8), source: 'link', link: 'https://www.service-public.fr/associations', notes: '' });
    add('escld', 'admin_doc', { title: 'Minutes of the founding assembly', category: 'Minutes', date: mon(-12, 2), source: 'link', link: 'https://escld.eu', notes: '' });
    add('escld', 'admin_doc', { title: 'Insurance certificate', category: 'Insurance', date: mon(-2, 1), source: 'link', link: 'https://escld.eu', notes: 'Valid until 31/12.' });
    add('escld', 'legal', { title: 'Articles of association', category: 'Articles of association', date: mon(-12, 2), source: 'link', link: 'https://escld.eu', notes: 'Filed version.' });
    add('escld', 'legal', { title: 'Internal rules', category: 'Internal rules', date: mon(-10, 15), source: 'link', link: 'https://escld.eu', notes: '' });
    add('escld', 'legal', { title: 'Partnership agreement — faculty', category: 'Agreement / partnership', date: mon(-3, 22), source: 'link', link: 'https://escld.eu', notes: '' });
    add('escld', 'entry', { type: 'in', label: 'Membership fees — autumn', amount: 680, date: mon(-2, 15), category: 'Membership fees', method: 'Bank transfer', notes: '' });
    add('escld', 'entry', { type: 'in', label: 'Faculty grant', amount: 1200, date: mon(-1, 20), category: 'Grants', method: 'Bank transfer', notes: '' });
    add('escld', 'entry', { type: 'out', label: 'Liability insurance', amount: 145, date: mon(-2, 1), category: 'Insurance', method: 'Direct debit', notes: '' });
    add('escld', 'entry', { type: 'out', label: 'Conference posters printing', amount: 86.4, date: mon(-1, 3), category: 'Communication', method: 'Card', notes: '' });
    add('escld', 'entry', { type: 'out', label: 'Room hire', amount: 250, date: mon(0, 4), category: 'Venue & logistics', method: 'Bank transfer', notes: '' });
    add('escld', 'entry', { type: 'in', label: 'Membership fees — this month', amount: 140, date: mon(0, 10), category: 'Membership fees', method: 'Cash', notes: '' });

    return {
      v: 2,
      session: null,
      files: {},
      items,
      members: [
        { email: 'admin@demo.local', full_name: 'Alex Demo', is_admin: true, projects: ['auralys', 'escld'], active: true, created_at: stamp, last_seen: null },
        { email: 'auralys@demo.local', full_name: 'Auralys Member', is_admin: false, projects: ['auralys'], active: true, created_at: stamp, last_seen: null },
        { email: 'escld@demo.local', full_name: 'ESCLD Member', is_admin: false, projects: ['escld'], active: true, created_at: stamp, last_seen: null },
        { email: 'former@demo.local', full_name: 'Former member', is_admin: false, projects: ['escld'], active: false, created_at: stamp, last_seen: null },
      ],
    };
  }

  const api = MODE === 'live' ? live : demo;

  /* ================================================================== icons */
  const ICONS = {
    home: '<path d="M3.5 10.5 12 3.5l8.5 7"/><path d="M5.5 9v11h13V9"/><path d="M10 20v-5h4v5"/>',
    grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.8"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.8"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.8"/>',
    link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
    chart: '<path d="M4 20h16"/><path d="M6.5 16v-4"/><path d="M11 16V7"/><path d="M15.5 16v-6"/><path d="M20 16V4"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
    scale: '<path d="M12 4v16M8 20h8M5 7h14"/><path d="M5 7 2.5 13a2.5 2.5 0 0 0 5 0Z"/><path d="M19 7l-2.5 6a2.5 2.5 0 0 0 5 0Z"/>',
    folder: '<path d="M3.5 7.5a2 2 0 0 1 2-2h3.8l2 2h7.2a2 2 0 0 1 2 2v8.5a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2Z"/>',
    wallet: '<path d="M19 7.5V6a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2H18a2 2 0 0 0 2-2v-2.5"/><path d="M20.5 9.5H16a2.5 2.5 0 0 0 0 5h4.5Z"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.2A6.5 6.5 0 0 1 21.5 20"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
    edit: '<path d="M4 20h4L19 9a2.83 2.83 0 0 0-4-4L4 16Z"/><path d="m13.5 6.5 4 4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6"/><path d="M6 7l1 13h10l1-13"/><path d="M9 7V4h6v3"/>',
    external: '<path d="M14 4h6v6M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
    download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
    upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    'chevron-left': '<path d="m15 6-6 6 6 6"/>',
    'chevron-right': '<path d="m9 6 6 6-6 6"/>',
    'chevron-down': '<path d="m6 9 6 6 6-6"/>',
    logout: '<path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3"/><path d="M10 17l-5-5 5-5M5 12h11"/>',
    key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16.5 6.5l2.5 2.5M14.5 8.5l2 2"/>',
    shield: '<path d="M12 3 4.5 6v6c0 4.4 3.2 8.1 7.5 9 4.3-.9 7.5-4.6 7.5-9V6Z"/><path d="m9 12 2 2 4-4"/>',
    lock: '<rect x="4.5" y="10" width="15" height="10.5" rx="2.5"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
    check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
    alert: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v5.5M12 16.5v.01"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
    pin: '<path d="M12 21s6.5-5.8 6.5-11.5a6.5 6.5 0 0 0-13 0C5.5 15.2 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.3"/>',
    file: '<path d="M14 3.5H6.5a1 1 0 0 0-1 1v15a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V8Z"/><path d="M14 3.5V8h4.5M9 13h6M9 16.5h4"/>',
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01"/>',
    mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2.5"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/>',
    phone: '<path d="M6 4h3l1.8 4.5-2.3 1.4a10.5 10.5 0 0 0 5.6 5.6l1.4-2.3L20 15v3a1.5 1.5 0 0 1-1.6 1.5A15.5 15.5 0 0 1 4.5 5.6 1.5 1.5 0 0 1 6 4Z"/>',
    star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.5-5.1-2.7-5 2.7.9-5.5-4-4 5.6-.8Z"/>',
    copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5"/>',
    'user-plus': '<circle cx="9" cy="8" r="3.8"/><path d="M2.5 20.5a6.5 6.5 0 0 1 13 0"/><path d="M19 8v6M16 11h6"/>',
    'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
    'arrow-up-right': '<path d="M7 17 17 7M8.5 7H17v8.5"/>',
    'trend-up': '<path d="m3.5 16.5 5.5-5.5 4 4 7.5-7.5"/><path d="M15 7.5h5.5V13"/>',
    'trend-down': '<path d="m3.5 7.5 5.5 5.5 4-4 7.5 7.5"/><path d="M15 16.5h5.5V11"/>',
    refresh: '<path d="M19.5 11a7.5 7.5 0 0 0-13.6-4.2L4.5 8.5"/><path d="M4.5 4.5v4h4"/><path d="M4.5 13a7.5 7.5 0 0 0 13.6 4.2l1.4-1.7"/><path d="M19.5 19.5v-4h-4"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.8"/>',
    globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.6 3.5 5.4 3.5 8.5s-1 5.9-3.5 8.5c-2.5-2.6-3.5-5.4-3.5-8.5s1-5.9 3.5-8.5Z"/>',
  };
  const icon = (name, cls) => `<svg class="i${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name] || ''}</svg>`;
  const MARK = '<svg class="nova-mark" viewBox="-196 0 392 281" aria-hidden="true"><path d="M0 0 196 196 111 281 0 170-111 281-196 196Z"/></svg>';

  /* ================================================================== forms */
  let fieldSeq = 0;
  function fieldHtml(f, v) {
    const id = 'f' + ++fieldSeq;
    const val = v != null ? v : f.value != null ? f.value : '';
    const span = f.span === 2 ? ' span-2' : '';
    const show = f.showIf ? ` data-show-if="${esc(f.showIf)}"` : '';
    const opt = f.required || ['checkbox', 'segment', 'select'].includes(f.type) || f.optional === false ? '' : '<em>optional</em>';
    const hint = f.hint ? `<small class="hint">${esc(f.hint)}</small>` : '';
    const attrs = (f.required ? ' required' : '') + (f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '') +
      (f.step ? ` step="${esc(f.step)}"` : '') + (f.min != null ? ` min="${esc(f.min)}"` : '') + (f.inputmode ? ` inputmode="${f.inputmode}"` : '') +
      (f.autocomplete ? ` autocomplete="${f.autocomplete}"` : ' autocomplete="off"');
    let input;
    switch (f.type) {
      case 'checkbox':
        return `<label class="check${span}"${show}><input type="checkbox" name="${f.name}"${val ? ' checked' : ''}><span class="check-box">${icon('check')}</span><span>${esc(f.label)}${f.hint ? `<small class="hint">${esc(f.hint)}</small>` : ''}</span></label>`;
      case 'segment':
        input = `<div class="segctl" role="radiogroup" aria-label="${esc(f.label)}">${f.options.map((o) => `<label><input type="radio" name="${f.name}" value="${esc(o.value)}"${String(o.value) === String(val) ? ' checked' : ''}><span>${o.icon ? icon(o.icon) : ''}${esc(o.label)}</span></label>`).join('')}</div>`;
        return `<div class="field${span}"${show}><span class="label">${esc(f.label)}</span>${input}${hint}</div>`;
      case 'textarea':
        input = `<textarea id="${id}" name="${f.name}" rows="${f.rows || 3}"${attrs}>${esc(val)}</textarea>`;
        break;
      case 'select': {
        /* keep a saved value that is no longer in the list (e.g. older entries) */
        const values = f.options.map((o) => String(typeof o === 'object' ? o.value : o));
        const opts = val !== '' && !values.includes(String(val)) ? [val].concat(f.options) : f.options;
        input = `<select id="${id}" name="${f.name}"${attrs}>${opts.map((o) => {
          const ov = typeof o === 'object' ? o.value : o; const ol = typeof o === 'object' ? o.label : o;
          return `<option value="${esc(ov)}"${String(ov) === String(val) ? ' selected' : ''}>${esc(ol)}</option>`;
        }).join('')}</select>`;
        break;
      }
      case 'file':
        input = `<label class="drop" for="${id}">${icon('upload')}<span class="drop-txt">${f.current ? `Current file: <b>${esc(f.current)}</b><br><small>Choose another file to replace it</small>` : 'Choose a file <small>or drop it here</small>'}</span><input id="${id}" type="file" name="${f.name}"${f.accept ? ` accept="${esc(f.accept)}"` : ''}></label>`;
        break;
      default: {
        const list = f.list && f.list.length ? ` list="${id}-l"` : '';
        input = `<input id="${id}" name="${f.name}" type="${f.type || 'text'}" value="${esc(val)}"${attrs}${list}>` +
          (list ? `<datalist id="${id}-l">${f.list.map((o) => `<option value="${esc(o)}"></option>`).join('')}</datalist>` : '');
      }
    }
    return `<div class="field${span}"${show}><label for="${id}">${esc(f.label)}${opt}</label>${input}${hint}</div>`;
  }

  function readForm(form, spec) {
    const out = {};
    spec.forEach((f) => {
      const el = form.elements[f.name];
      if (!el) return;
      if (f.type === 'checkbox') out[f.name] = el.checked;
      else if (f.type === 'file') out[f.name] = (el.files && el.files[0]) || null;
      else if (f.type === 'number') out[f.name] = el.value === '' ? null : Number(el.value);
      else out[f.name] = String(el.value || '').trim();
    });
    return out;
  }

  function wireShowIf(form) {
    const blocks = [...form.querySelectorAll('[data-show-if]')];
    if (!blocks.length) return;
    const valueOf = (name) => {
      const el = form.elements[name];
      if (!el) return '';
      if (el.type === 'checkbox') return el.checked ? 'on' : '';
      return el.value;
    };
    const update = () => blocks.forEach((b) => {
      const [name, want] = b.dataset.showIf.split('=');
      const on = valueOf(name) === want;
      b.hidden = !on;
      b.querySelectorAll('input,select,textarea').forEach((i) => { i.disabled = !on; });
    });
    form.addEventListener('change', update);
    update();
  }

  function wireDrops(form) {
    form.querySelectorAll('.drop').forEach((drop) => {
      const input = drop.querySelector('input[type=file]');
      const txt = drop.querySelector('.drop-txt');
      const show = () => { const f = input.files && input.files[0]; if (f) { txt.innerHTML = `<b>${esc(f.name)}</b><br><small>${fmtSize(f.size)}</small>`; drop.classList.add('has-file'); } };
      input.addEventListener('change', show);
      ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('is-over'); }));
      ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('is-over')));
      drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files.length) { input.files = e.dataTransfer.files; show(); } });
    });
  }

  /* ================================================================= modals */
  function modal(o) {
    return new Promise((resolve) => {
      const dlg = document.createElement('dialog');
      dlg.className = 'modal' + (o.wide ? ' modal--wide' : '') + (o.small ? ' modal--small' : '');
      dlg.innerHTML = `
        <form class="modal-box" novalidate>
          <header class="modal-head">
            <div>${o.kicker ? `<p class="mono modal-kicker">${esc(o.kicker)}</p>` : ''}<h2>${esc(o.title)}</h2>${o.subtitle ? `<p class="modal-sub">${esc(o.subtitle)}</p>` : ''}</div>
            <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x')}</button>
          </header>
          <div class="modal-body">${o.body || ''}</div>
          <p class="form-error" role="alert" hidden></p>
          <footer class="modal-foot">
            ${o.extra || ''}<span class="grow"></span>
            ${o.cancel === false ? '' : `<button type="button" class="btn" data-close>${esc(o.cancel || 'Cancel')}</button>`}
            ${o.submit === false ? '' : `<button type="submit" class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}">${esc(o.submit || 'Save')}</button>`}
          </footer>
        </form>`;
      document.body.appendChild(dlg);
      const form = dlg.querySelector('form');
      const err = dlg.querySelector('.form-error');
      let done = false;
      const close = (val) => {
        if (done) return; done = true;
        dlg.classList.add('is-closing');
        setTimeout(() => { if (dlg.open) dlg.close(); dlg.remove(); }, 160);
        resolve(val);
      };
      let downTarget = null;
      dlg.addEventListener('mousedown', (e) => { downTarget = e.target; });
      dlg.addEventListener('click', (e) => {
        if (e.target.closest('[data-close]')) close(null);
        else if (e.target === dlg && downTarget === dlg) close(null);
      });
      dlg.addEventListener('cancel', (e) => { e.preventDefault(); close(null); });
      wireShowIf(form);
      wireDrops(form);
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const btn = form.querySelector('[type=submit]');
        if (btn) { btn.disabled = true; btn.classList.add('is-loading'); }
        err.hidden = true;
        try {
          const res = o.onSubmit ? await o.onSubmit(o.fields ? readForm(form, o.fields) : form, form) : true;
          close(res === undefined ? true : res);
        } catch (ex) {
          err.textContent = humanError(ex);
          err.hidden = false;
          if (btn) { btn.disabled = false; btn.classList.remove('is-loading'); }
        }
      });
      if (o.onOpen) o.onOpen(form, close);
      dlg.showModal();
      if (!o.noFocus) {
        const first = form.querySelector('.modal-body input:not([type=hidden]):not([type=radio]):not([type=checkbox]):not([type=file]):not(:disabled), .modal-body select, .modal-body textarea');
        if (first) first.focus();
      }
    });
  }

  function formModal(o) {
    return modal(Object.assign({}, o, {
      body: (o.intro || '') + `<div class="form-grid">${o.fields.map((f) => fieldHtml(f, o.values ? o.values[f.name] : undefined)).join('')}</div>`,
    }));
  }

  function confirmBox(o) {
    return modal({ title: o.title, body: `<p class="modal-text">${esc(o.text || '')}</p>`, submit: o.submit || 'Confirm', danger: o.danger !== false, small: true, noFocus: true });
  }

  function toast(msg, kind) {
    let box = document.querySelector('.toasts');
    if (!box) {
      box = document.createElement('div');
      box.className = 'toasts';
      box.setAttribute('role', 'status');
      box.setAttribute('aria-live', 'polite');
      document.body.appendChild(box);
    }
    const t = document.createElement('div');
    t.className = 'toast' + (kind ? ' toast--' + kind : '');
    t.innerHTML = `${icon(kind === 'error' ? 'alert' : 'check')}<span>${esc(msg)}</span>`;
    box.appendChild(t);
    setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 300); }, kind === 'error' ? 5200 : 2800);
  }

  /* Opens a private file in a new tab (temporary 5-minute link). */
  async function openFile(path) {
    const w = window.open('about:blank', '_blank');
    try {
      const url = await api.fileUrl(path);
      if (w) { w.opener = null; w.location.href = url; } else location.href = url;
    } catch (e) {
      if (w) w.close();
      toast(humanError(e), 'error');
    }
  }
  function openLink(url) {
    const u = safeUrl(url);
    if (!u) return;
    const w = window.open(u, '_blank', 'noopener,noreferrer');
    if (w) w.opener = null;
  }

  function csv(rows, cols) {
    const cell = (v) => { const s = String(v == null ? '' : v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    return '﻿' + [cols.map((c) => cell(c.label)).join(',')].concat(rows.map((r) => cols.map((c) => cell(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(','))).join('\r\n');
  }
  function download(name, content, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([content], { type: type || 'text/plain;charset=utf-8' }));
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  /* ================================================================ top bar */
  function topbar(o) {
    const me = o.me;
    const mine = PROJECT_IDS.filter((p) => canAccess(me, p));
    const inProject = o.current && PROJECTS[o.current];
    const tabs = inProject && mine.length > 1
      ? `<nav class="tb-projects" aria-label="Switch workspace">${mine.map((p) => `<a class="tb-proj" href="${PROJECTS[p].path}"${p === o.current ? ' aria-current="page"' : ''} style="--pc:${PROJECTS[p].color}"><i></i>${esc(PROJECTS[p].name)}</a>`).join('')}</nav>`
      : '';
    return `
      <header class="topbar">
        ${o.menuButton ? `<button class="icon-btn tb-menu" type="button" data-action="side" aria-label="Show pages">${icon('menu')}</button>` : ''}
        <a class="tb-brand" href="/saas/" aria-label="Workspace home">${MARK}<span>Nova</span></a>
        ${tabs}
        <span class="grow"></span>
        ${MODE === 'demo' ? '<span class="badge badge--demo" title="Sample data stored in this browser only">Local demo</span>' : ''}
        <div class="tb-user">
          <button class="tb-user-btn" type="button" aria-haspopup="true" aria-expanded="false">
            <span class="avatar">${esc(initials(me.full_name, me.email))}</span>
            <span class="tb-user-txt"><b>${esc(me.full_name || me.email)}</b><small>${me.is_admin ? 'Administrator' : 'Member'}</small></span>
            ${icon('chevron-down')}
          </button>
          <div class="menu" hidden>
            <div class="menu-head"><b>${esc(me.full_name || '—')}</b><span>${esc(me.email)}</span></div>
            <a href="/saas/">${icon('home')}Home</a>
            ${me.is_admin ? `<a href="/saas/admin/">${icon('shield')}Manage access</a>` : ''}
            <button type="button" data-action="password">${icon('key')}Change my password</button>
            <hr>
            <button type="button" data-action="logout">${icon('logout')}Sign out</button>
          </div>
        </div>
      </header>`;
  }

  function bindTopbar(root) {
    const btn = root.querySelector('.tb-user-btn');
    const menu = root.querySelector('.tb-user .menu');
    if (!btn || !menu) return;
    const set = (open) => { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    btn.addEventListener('click', (e) => { e.stopPropagation(); set(menu.hidden); });
    document.addEventListener('click', (e) => { if (!menu.hidden && !e.target.closest('.tb-user')) set(false); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { set(false); btn.focus(); } });
    menu.addEventListener('click', async (e) => {
      const a = e.target.closest('[data-action]');
      if (!a) return;
      set(false);
      if (a.dataset.action === 'logout') { await api.signOut(); location.href = '/saas/'; }
      if (a.dataset.action === 'password') changePassword();
    });
  }

  function changePassword() {
    const fields = [
      { name: 'password', label: 'New password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters.' },
      { name: 'confirm', label: 'Confirm password', type: 'password', required: true, autocomplete: 'new-password' },
    ];
    return formModal({
      title: 'Change my password', fields, submit: 'Update', small: true,
      onSubmit: async (v) => {
        if (v.password.length < 8) throw new Error('The password must be at least 8 characters long.');
        if (v.password !== v.confirm) throw new Error('The two passwords do not match.');
        await api.setPassword(v.password);
        toast('Password updated.');
      },
    });
  }

  /* ========================================================= access screens */
  function screen(html) {
    const app = document.getElementById('app');
    app.innerHTML = `<div class="screen">${html}</div>`;
    return app;
  }
  function renderOff() {
    document.title = 'Page not found';
    document.body.dataset.project = 'nova';
    screen('<div class="notfound"><p class="mono">404</p><h1>Page not found</h1></div>');
  }
  function renderBlocked(kind, me, project) {
    const msg = {
      closed: ['Access closed', 'Your access to the workspace has been closed or has not been opened yet. Contact an administrator if you think this is a mistake.'],
      project: ['Workspace not available', `You do not have access to the ${project && PROJECTS[project] ? PROJECTS[project].name : ''} workspace. An administrator can open it for you.`],
      admin: ['Administrators only', 'This page is used to manage access. It is reserved for administrators.'],
    }[kind];
    document.body.dataset.project = 'nova';
    const app = screen(`
      <div class="card blocked">
        <span class="blocked-ico">${icon('lock')}</span>
        <h1>${esc(msg[0])}</h1>
        <p>${esc(msg[1])}</p>
        <div class="blocked-actions">
          ${kind !== 'closed' ? '<a class="btn btn-primary" href="/saas/">Back to home</a>' : ''}
          <button class="btn" type="button" data-logout>${icon('logout')}Sign out</button>
        </div>
      </div>`);
    app.querySelector('[data-logout]').addEventListener('click', async () => { await api.signOut(); location.href = '/saas/'; });
  }

  function renderError(e) {
    document.body.dataset.project = 'nova';
    const app = screen(`<div class="card blocked"><span class="blocked-ico">${icon('alert')}</span><h1>Cannot connect</h1><p>${esc(humanError(e))}</p><div class="blocked-actions"><button class="btn btn-primary" type="button" data-retry>Try again</button></div></div>`);
    app.querySelector('[data-retry]').addEventListener('click', () => location.reload());
  }

  /* Checks the session then the permissions; returns the member, or null if the page was replaced. */
  async function boot(opts) {
    opts = opts || {};
    if (MODE === 'off') { renderOff(); return null; }
    let session, me;
    try {
      session = await api.session();
      if (!session) { location.replace('/saas/?next=' + encodeURIComponent(location.pathname + location.hash)); return null; }
      me = await api.me();
    } catch (e) { renderError(e); return null; }
    if (!me || !me.active) { renderBlocked('closed', me); return null; }
    if (opts.project && !canAccess(me, opts.project)) { renderBlocked('project', me, opts.project); return null; }
    if (opts.admin && !me.is_admin) { renderBlocked('admin', me); return null; }
    api.touch().catch(() => {});
    return me;
  }

  window.Nova = {
    CFG, PROJECTS, PROJECT_IDS, MODE, LOCALE, api, MARK,
    uid, esc, cap, safeUrl, domainOf, isoDay, parseDay, fmtDate, fmtLong, fmtMoney, fmtMoney0, fmtNum, fmtSize, ago, initials, firstName, canAccess, humanError,
    icon, fieldHtml, readForm, modal, formModal, confirm: confirmBox, toast, openFile, openLink, csv, download,
    topbar, bindTopbar, changePassword, boot, renderOff, renderBlocked, renderError, screen,
  };
})();
