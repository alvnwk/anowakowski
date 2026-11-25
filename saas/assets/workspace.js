/* ==========================================================================
   Nova — espace privé · espace projet (/saas-auralys/, /saas-escld/)
   Barre latérale = pages du projet ; barre haute = changement d'espace.
   ========================================================================== */
(function () {
  'use strict';
  const N = window.Nova;
  const { esc, icon, fmtDate, fmtMoney, fmtNum } = N;
  const PID = document.body.dataset.project;
  const P = N.PROJECTS[PID];

  const PAGES = {
    overview: { slug: 'apercu', label: 'Vue d’ensemble', icon: 'grid', group: 'Espace' },
    calendar: { slug: 'calendrier', label: 'Calendrier', icon: 'calendar', group: 'Espace', kind: 'event' },
    links: { slug: 'liens', label: 'Liens utiles', icon: 'link', group: 'Espace', kind: 'link' },
    directory: { slug: 'repertoire', label: 'Répertoire', icon: 'users', group: 'Espace', kind: 'member' },
    stats: { slug: 'statistiques', label: 'Statistiques', icon: 'chart', group: 'Suivi', kind: 'stat' },
    accounting: { slug: 'comptabilite', label: 'Comptabilité', icon: 'wallet', group: 'Suivi', kind: 'entry' },
    admin_docs: { slug: 'administratif', label: 'Documents administratifs', short: 'Administratif', icon: 'folder', group: 'Documents', kind: 'admin_doc' },
    legal: { slug: 'juridique', label: 'Documents juridiques', short: 'Juridique', icon: 'scale', group: 'Documents', kind: 'legal' },
  };

  /* Catégories proposées (on peut toujours en saisir d'autres). */
  const DEFAULTS = {
    legal: {
      auralys: ['Statuts', 'Pacte d’associés', 'Contrat', 'CGU / CGV', 'RGPD / données', 'Propriété intellectuelle', 'Procès-verbal', 'Autre'],
      escld: ['Statuts', 'Règlement intérieur', 'Charte', 'Convention / partenariat', 'Contrat', 'RGPD / données', 'Propriété intellectuelle', 'Autre'],
    },
    admin_doc: ['Procès-verbal', 'Compte rendu de réunion', 'Déclaration / récépissé', 'Attestation', 'Assurance', 'Banque', 'Subvention', 'Courrier', 'Autre'],
    entry: {
      auralys: ['Apport', 'Ventes', 'Subvention / prix', 'Hébergement & outils', 'Marketing', 'Design', 'Juridique', 'Frais bancaires', 'Autre'],
      escld: ['Cotisations', 'Subventions', 'Dons', 'Partenariats', 'Évènements', 'Salle & logistique', 'Communication', 'Assurance', 'Frais bancaires', 'Autre'],
    },
    link: ['Outils', 'Juridique', 'Administratif', 'Communication', 'Produit', 'Finances'],
    council: ['Bureau', 'Law & Institutions', 'Diplomacy & International Relations', 'Europe & Fundamental Rights', 'Communication', 'Partenariats'],
    role: ['Président·e', 'Vice-président·e', 'Secrétaire général·e', 'Trésorier·ère', 'Responsable de conseil', 'Responsable de pôle', 'Membre'],
  };
  const EVENT_TYPES = [
    { value: 'Réunion', color: '#4f6bd8' },
    { value: 'Échéance', color: '#cf4436' },
    { value: 'Évènement', color: '#23874b' },
    { value: 'Formation', color: '#b77a10' },
    { value: 'Autre', color: '#7d7d78' },
  ];
  const evColor = (c) => (EVENT_TYPES.find((t) => t.value === c) || EVENT_TYPES[4]).color;
  const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

  const S = { me: null, items: [], loadedAt: 0, page: 'overview', ui: {} };

  /* ================================================================ données */
  const flat = (i) => Object.assign({}, i.data, { id: i.id, _by: i.created_by, _at: i.created_at, _upd: i.updated_at });
  const rows = (kind) => S.items.filter((i) => i.kind === kind).map(flat);
  const raw = (id) => S.items.find((i) => i.id === id);
  const today = () => N.isoDay();
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  const plural = (n, one, many) => `${n} ${n > 1 ? many || one + 's' : one}`;
  const matches = (o, q, keys) => !q || keys.some((k) => String(o[k] || '').toLowerCase().includes(q));
  const signed = (e) => (e.type === 'in' ? 1 : -1) * (Number(e.amount) || 0);
  const monthKey = (s) => String(s || '').slice(0, 7);
  const catsFor = (kind, field, defaults) => uniq([...(defaults || []), ...rows(kind).map((r) => r[field])]);

  async function create(kind, data) { const row = await N.api.createItem(PID, kind, data); S.items.push(row); return row; }
  async function update(id, data) {
    const row = await N.api.updateItem(id, data);
    const i = S.items.findIndex((x) => x.id === id);
    if (i >= 0) S.items[i] = row;
    return row;
  }
  async function remove(id) {
    const it = raw(id);
    await N.api.removeItem(id);
    if (it && it.data && it.data.file && it.data.file.path) N.api.removeFile(it.data.file.path).catch(() => {});
    S.items = S.items.filter((x) => x.id !== id);
  }
  /* Enlève les champs techniques (_by, id…) avant d'enregistrer. */
  const clean = (o) => { const out = {}; Object.keys(o).forEach((k) => { if (k !== 'id' && k[0] !== '_') out[k] = o[k]; }); return out; };

  async function askDelete(id, what) {
    const ok = await N.confirm({ title: `Supprimer ${what} ?`, text: 'Cette action est définitive pour toute l’équipe.', submit: 'Supprimer' });
    if (!ok) return false;
    try { await remove(id); N.toast('Supprimé.'); afterChange(); return true; }
    catch (e) { N.toast(N.humanError(e), 'error'); return false; }
  }

  function afterChange() { updateCounts(); route(); }

  /* ================================================================ coque */
  async function start() {
    if (!P) return N.renderOff();
    const me = await N.boot({ project: PID });
    if (!me) return;
    S.me = me;
    document.title = `${P.name} · Espace`;
    renderShell();
    await reload(true);
    window.addEventListener('hashchange', () => { closeSide(); route(); document.getElementById('main').focus({ preventScroll: true }); window.scrollTo({ top: 0 }); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - S.loadedAt > 60000) reload(); });
  }

  async function reload(first) {
    try { S.items = await N.api.listItems(PID); S.loadedAt = Date.now(); }
    catch (e) { N.toast(N.humanError(e), 'error'); }
    updateCounts();
    if (first || !document.querySelector('dialog[open]')) route();
  }

  function renderShell() {
    const groups = [];
    P.pages.forEach((k) => { const g = PAGES[k].group; let grp = groups.find((x) => x.name === g); if (!grp) groups.push((grp = { name: g, pages: [] })); grp.pages.push(k); });
    const app = document.getElementById('app');
    app.innerHTML = `
      ${N.topbar({ me: S.me, current: PID, menuButton: true })}
      <div class="layout">
        <aside class="card side" id="side" aria-label="Pages de l’espace ${esc(P.name)}">
          <div class="side-head"><span class="pbadge">${esc(P.mark)}</span><div><b>${esc(P.name)}</b><small>${esc(P.tagline)}</small></div></div>
          ${groups.map((g) => `
            <p class="side-label mono">${esc(g.name)}</p>
            <nav class="side-nav">${g.pages.map((k) => `<a class="side-item" href="#${PAGES[k].slug}" data-page="${k}">${icon(PAGES[k].icon)}<span>${esc(PAGES[k].short || PAGES[k].label)}</span><em class="side-count" data-count="${k}"></em></a>`).join('')}</nav>`).join('')}
          <div class="side-foot"><a class="side-item" href="/saas/">${icon('home')}<span>Accueil</span></a></div>
        </aside>
        <main class="main" id="main" tabindex="-1"><div id="view"><div class="boot" style="min-height:50vh"><span class="spinner"></span></div></div></main>
      </div>`;
    N.bindTopbar(app);
    app.querySelector('[data-action="side"]').addEventListener('click', () => document.body.classList.toggle('side-open'));
    document.addEventListener('click', (e) => { if (document.body.classList.contains('side-open') && !e.target.closest('#side') && !e.target.closest('[data-action="side"]')) closeSide(); });
  }
  const closeSide = () => document.body.classList.remove('side-open');

  function updateCounts() {
    document.querySelectorAll('[data-count]').forEach((el) => {
      const k = el.dataset.count;
      if (k === 'calendar') { const n = upcoming().length; el.textContent = n || ''; return; }
      const kind = PAGES[k].kind;
      el.textContent = kind ? rows(kind).length || '' : '';
    });
  }

  function route() {
    const slug = decodeURIComponent(location.hash.replace(/^#/, '')) || 'apercu';
    const key = P.pages.find((k) => PAGES[k].slug === slug) || 'overview';
    S.page = key;
    document.querySelectorAll('.side-item[data-page]').forEach((a) => {
      const on = a.dataset.page === key;
      a.classList.toggle('is-active', on);
      on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current');
    });
    document.title = `${PAGES[key].label} · ${P.name}`;
    const view = document.getElementById('view');
    view.onclick = null; view.oninput = null; view.onchange = null;
    RENDER[key](view);
  }

  /* ============================================================ gabarits */
  function head(title, sub, actions) {
    return `<p class="crumb mono">${esc(P.name)} <span>/</span> ${esc(title)}</p>
      <div class="page-head"><div><h1 class="page-title">${esc(title)}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
  }
  const addBtn = (label, act) => `<button class="btn btn-primary" type="button" data-act="${act || 'add'}">${icon('plus')}${esc(label)}</button>`;
  const empty = (ic, title, text, btn) => `<div class="empty">${icon(ic)}<b>${esc(title)}</b><p>${esc(text)}</p>${btn || ''}</div>`;
  const actions = (id, extra) => `<div class="row-actions">${extra || ''}<button class="icon-btn" type="button" data-act="edit" data-id="${id}" title="Modifier" aria-label="Modifier">${icon('edit')}</button><button class="icon-btn danger" type="button" data-act="del" data-id="${id}" title="Supprimer" aria-label="Supprimer">${icon('trash')}</button></div>`;
  function searchBox(value, ph) { return `<label class="search">${icon('search')}<input type="search" data-search value="${esc(value || '')}" placeholder="${esc(ph || 'Rechercher')}" aria-label="Rechercher"></label>`; }
  function chips(list, current, attr) {
    return `<div class="chips" role="group">${[['', 'Tout']].concat(list.map((c) => [c, c])).map(([v, l]) => `<button class="chip" type="button" data-${attr}="${esc(v)}" aria-pressed="${String((current || '') === v)}">${esc(l)}</button>`).join('')}</div>`;
  }
  function relDay(s) {
    const d = N.parseDay(s); const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((d - t) / 86400000);
    if (diff === 0) return 'aujourd’hui';
    if (diff === 1) return 'demain';
    if (diff > 1 && diff < 7) return `dans ${diff} jours`;
    if (diff === -1) return 'hier';
    return fmtDate(s, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function dateBox(s) {
    const d = N.parseDay(s);
    return `<span class="datebox${s === today() ? ' datebox--today' : ''}"><b>${d.getDate()}</b><span>${MONTHS_SHORT[d.getMonth()]}</span></span>`;
  }
  const timeRange = (e) => (e.start ? e.start + (e.end ? '–' + e.end : '') : 'Journée');
  /* Contenus ajoutés par d'autres : on affiche le prénom si connu. */
  const by = (email) => (email ? (email === S.me.email ? 'vous' : email.split('@')[0]) : '');

  /* ============================================== graphiques (sans librairie) */
  function niceStep(raw) {
    if (raw <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) || 10 * mag;
  }
  function lastMonths(n) {
    const t = new Date(); const out = [];
    for (let i = n - 1; i >= 0; i--) { const d = new Date(t.getFullYear(), t.getMonth() - i, 1); out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: MONTHS_SHORT[d.getMonth()], year: d.getFullYear(), now: i === 0 }); }
    return out;
  }
  function monthlyFlows(entries, n) {
    const months = lastMonths(n);
    months.forEach((m) => { m.inc = 0; m.out = 0; });
    entries.forEach((e) => { const m = months.find((x) => x.key === monthKey(e.date)); if (m) e.type === 'in' ? (m.inc += +e.amount || 0) : (m.out += +e.amount || 0); });
    return months;
  }
  /* Recettes = points pleins vers le haut ; dépenses = points creux vers le bas. */
  function dotChart(months, maxDots, width) {
    maxDots = maxDots || 7;
    const max = Math.max(0, ...months.map((m) => Math.max(m.inc, m.out)));
    const unit = niceStep(max / maxDots);
    const sp = 11, r = 3.8, W = width || 720, colW = W / months.length, top = 22;
    const H = top + sp * (maxDots * 2 + 1) + 22, base = top + sp * (maxDots + 0.5);
    let svg = `<svg class="dots" viewBox="0 0 ${W} ${H}" role="img" aria-label="Recettes et dépenses des ${months.length} derniers mois">`;
    svg += `<line class="d-base" x1="0" x2="${W}" y1="${base}" y2="${base}"/>`;
    months.forEach((m, i) => {
      const cx = i * colW + colW / 2;
      const nIn = m.inc > 0 ? Math.max(1, Math.round(m.inc / unit)) : 0;
      const nOut = m.out > 0 ? Math.max(1, Math.round(m.out / unit)) : 0;
      if (m.now) svg += `<g class="d-now"><line x1="${cx}" x2="${cx}" y1="${top - 4}" y2="${H - 18}"/><rect x="${cx - 26}" y="0" width="52" height="15" rx="7.5"/><text x="${cx}" y="10.5" text-anchor="middle">CE MOIS</text></g>`;
      svg += `<g class="d-col"><title>${esc(`${m.label} ${m.year} — recettes ${fmtMoney(m.inc)} · dépenses ${fmtMoney(m.out)}`)}</title><rect class="d-hit" x="${i * colW}" y="${top}" width="${colW}" height="${H - top - 18}"/>`;
      for (let k = 0; k < Math.min(nIn, maxDots); k++) svg += `<circle class="d-in" cx="${cx}" cy="${base - sp * (k + 1)}" r="${r}"/>`;
      for (let k = 0; k < Math.min(nOut, maxDots); k++) svg += `<circle class="d-out" cx="${cx}" cy="${base + sp * (k + 1)}" r="${r - 0.6}"/>`;
      svg += '</g>';
      svg += `<text class="d-lbl" x="${cx}" y="${H - 4}" text-anchor="middle">${esc(m.label.replace('.', ''))}</text>`;
    });
    return { svg: svg + '</svg>', unit };
  }
  function sparkline(values) {
    if (values.length < 2) return '';
    const W = 200, H = 40, pad = 4;
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const pts = values.map((v, i) => [pad + (i * (W - pad * 2)) / (values.length - 1), H - pad - ((v - min) / span) * (H - pad * 2)]);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><polyline points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}" vector-effect="non-scaling-stroke"/>${pts.map((p, i) => `<circle class="${i === pts.length - 1 ? 'last' : ''}" cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.6" vector-effect="non-scaling-stroke"/>`).join('')}</svg>`;
  }

  /* ========================================================== utilitaires métier */
  function upcoming() {
    const t = today();
    return rows('event').filter((e) => (e.end_date || e.date) >= t).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
  }
  function metricsSummary() {
    const groups = {};
    rows('stat').forEach((s) => { (groups[s.metric] = groups[s.metric] || []).push(s); });
    return Object.keys(groups).map((name) => {
      const list = groups[name].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a._at).localeCompare(String(b._at)));
      const last = list[list.length - 1], prev = list[list.length - 2];
      const delta = prev ? last.value - prev.value : null;
      const pct = prev && prev.value ? (delta / Math.abs(prev.value)) * 100 : null;
      return { name, list, last, prev, delta, pct, unit: last.unit || '' };
    }).sort((a, b) => String(b.last.date).localeCompare(String(a.last.date)));
  }
  function trendBadge(m) {
    if (m.delta == null) return '<span class="badge">1 valeur</span>';
    if (m.delta === 0) return '<span class="badge">stable</span>';
    const up = m.delta > 0;
    const txt = m.pct != null ? `${up ? '+' : ''}${fmtNum(m.pct.toFixed(1))} %` : `${up ? '+' : ''}${fmtNum(m.delta)}`;
    return `<span class="badge ${up ? 'badge--hl' : 'badge--danger'}">${icon(up ? 'trend-up' : 'trend-down')}${esc(txt)}</span>`;
  }

  /* ============================================================ VUE D'ENSEMBLE */
  function pageOverview(view) {
    const entries = rows('entry');
    const bal = entries.reduce((s, e) => s + signed(e), 0);
    const months = monthlyFlows(entries, 12);
    const cur = months[months.length - 1];
    const net = cur.inc - cur.out;
    const chart = dotChart(months);
    const up = upcoming();
    const soon = up.find((e) => (N.parseDay(e.date) - N.parseDay(today())) / 86400000 <= 7);
    const metrics = metricsSummary().slice(0, 4);
    const docsKinds = ['legal', 'admin_doc'].filter((k) => P.pages.includes(k === 'legal' ? 'legal' : 'admin_docs'));
    const recentRaw = S.items.filter((i) => ['link', 'stat', 'legal', 'admin_doc', 'member', 'entry'].includes(i.kind))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
    const pageOf = { link: 'links', stat: 'stats', legal: 'legal', admin_doc: 'admin_docs', member: 'directory', entry: 'accounting' };
    const kindLabel = { link: 'Lien', stat: 'Statistique', legal: 'Juridique', admin_doc: 'Administratif', member: 'Membre', entry: 'Comptabilité' };
    const titleOf = (i) => i.data.title || i.data.name || i.data.label || i.data.metric || '—';
    const subOf = (i) => {
      const d = i.data;
      if (i.kind === 'stat') return `${fmtNum(d.value)} ${d.unit || ''} · ${fmtDate(d.date)}`;
      if (i.kind === 'entry') return `${d.type === 'in' ? '+' : '−'}${fmtMoney(d.amount)} · ${fmtDate(d.date)}`;
      if (i.kind === 'link') return N.domainOf(d.url);
      if (i.kind === 'member') return d.role || '';
      return d.category || '';
    };
    const nDocs = docsKinds.reduce((s, k) => s + rows(k).length, 0);

    view.innerHTML = `
      ${head('Vue d’ensemble', esc(N.fmtLong()))}
      <div class="stack">
        <section class="card hero">
          <div class="card-head">
            <h2 class="card-title">Trésorerie</h2>
            <span class="legend mono"><span><i></i>Recettes</span><span><i class="o"></i>Dépenses</span></span>
            <span class="grow"></span>
            <a class="card-link" href="#comptabilite">Ouvrir la comptabilité ${icon('arrow-right')}</a>
          </div>
          <div class="hero-grid">
            <div>
              <div class="hero-big" title="${esc(fmtMoney(bal))}">${esc(new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(bal))}</div>
              <p class="hero-note">${net === 0 ? '<span class="badge">Aucun mouvement ce mois-ci</span>' : `<span class="badge ${net > 0 ? 'badge--hl' : 'badge--danger'}">${net > 0 ? '+' : '−'}${esc(fmtMoney(Math.abs(net)))}</span> ce mois-ci`}<br>solde au ${esc(fmtDate(today(), { day: 'numeric', month: 'long' }))}, ${plural(entries.length, 'opération')}</p>
              <dl class="hero-lines">
                <div><dt>Recettes du mois</dt><dd>${esc(fmtMoney(cur.inc))}</dd></div>
                <div><dt>Dépenses du mois</dt><dd>${esc(fmtMoney(cur.out))}</dd></div>
                <div><dt>${P.pages.includes('directory') ? 'Membres' : 'Documents'}</dt><dd>${P.pages.includes('directory') ? rows('member').length : nDocs}</dd></div>
              </dl>
            </div>
            <div>
              ${entries.length ? chart.svg + `<div class="chart-foot mono"><span>12 derniers mois</span><span>1 point ≈ ${esc(fmtMoney(chart.unit).replace(/,00\s?€$/, ' €'))}</span></div>` : empty('wallet', 'Pas encore d’opérations', 'Ajoutez vos recettes et dépenses dans la comptabilité pour voir l’évolution ici.', '<a class="btn" href="#comptabilite">Ouvrir la comptabilité</a>')}
            </div>
          </div>
          ${soon ? `
            <div class="alert">
              <span class="alert-ico">${icon('calendar')}</span>
              <p><b>${esc(soon.title)}</b> ${esc(relDay(soon.date))} — ${esc(fmtDate(soon.date, { weekday: 'long', day: 'numeric', month: 'long' }))}${soon.start ? ', ' + esc(timeRange(soon)) : ''}${soon.place ? ' · ' + esc(soon.place) : ''}</p>
              <button class="btn btn-primary btn-sm" type="button" data-act="open-ev" data-id="${soon.id}">Voir le détail</button>
              <a class="btn btn-quiet btn-sm" href="#calendrier">Calendrier ${icon('arrow-right')}</a>
            </div>` : ''}
        </section>

        <div class="cols">
          <section class="card pad">
            <div class="card-head"><h2 class="card-title">À venir <span class="badge">${up.length}</span></h2><a class="card-link" href="#calendrier">Calendrier ${icon('arrow-right')}</a></div>
            ${up.length ? `<div class="rows">${up.slice(0, 5).map((e) => `
              <div class="row">
                ${dateBox(e.date)}
                <button class="row-main" type="button" data-act="open-ev" data-id="${e.id}" style="text-align:left"><b>${esc(e.title)}</b><small>${esc(relDay(e.date))} · ${esc(timeRange(e))}${e.place ? ' · ' + esc(e.place) : ''}</small></button>
                <span class="badge" style="--c:${evColor(e.category)}"><i class="dot"></i>${esc(e.category || 'Autre')}</span>
              </div>`).join('')}</div>` : empty('calendar', 'Rien de prévu', 'Les prochains évènements du calendrier apparaîtront ici.', '<a class="btn" href="#calendrier">Ajouter un évènement</a>').replace('class="empty"', 'class="empty empty--sm"')}
          </section>
          <section class="card pad">
            <div class="card-head"><h2 class="card-title">Ajouts récents</h2></div>
            ${recentRaw.length ? `<div class="stack-list">${recentRaw.map((i) => `
              <a class="mini" href="#${PAGES[pageOf[i.kind]] ? PAGES[pageOf[i.kind]].slug : 'apercu'}">
                <span class="mini-top mono">${icon(PAGES[pageOf[i.kind]] ? PAGES[pageOf[i.kind]].icon : 'file')}${esc(kindLabel[i.kind])}<span class="grow"></span><span>${esc(N.ago(i.created_at))}</span></span>
                <b>${esc(titleOf(i))}</b>
                <small>${esc(subOf(i))}${i.created_by ? ' · par ' + esc(by(i.created_by)) : ''}</small>
              </a>`).join('')}</div>` : empty('file', 'Encore vide', 'Ce que l’équipe ajoute apparaîtra ici.').replace('class="empty"', 'class="empty empty--sm"')}
          </section>
        </div>

        <section class="card pad">
          <div class="card-head"><h2 class="card-title">Indicateurs</h2><a class="card-link" href="#statistiques">Statistiques ${icon('arrow-right')}</a></div>
          ${metrics.length ? `<div class="mgrid" style="margin:0">${metrics.map(metricCard).join('')}</div>` : empty('chart', 'Aucun indicateur', 'Ajoutez des chiffres (utilisateurs, abonnés, membres…) avec leur date et leur source.', '<a class="btn" href="#statistiques">Ajouter une statistique</a>').replace('class="empty"', 'class="empty empty--sm"')}
        </section>
      </div>`;
    view.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'open-ev') openEvent(b.dataset.id);
      if (b.dataset.act === 'metric') { S.ui.stats = Object.assign(S.ui.stats || { q: '' }, { metric: b.dataset.metric }); location.hash = 'statistiques'; }
    };
  }

  function metricCard(m, pressed) {
    return `
      <button class="mcard" type="button" data-act="metric" data-metric="${esc(m.name)}"${pressed != null ? ` aria-pressed="${pressed}"` : ''}>
        <span class="mcard-top"><span class="mono">${esc(m.name)}</span>${trendBadge(m)}</span>
        <span class="mcard-val">${esc(fmtNum(m.last.value))}<small>${esc(m.unit)}</small></span>
        ${sparkline(m.list.map((x) => Number(x.value) || 0))}
        <span class="mcard-foot"><span>${esc(fmtDate(m.last.date))}</span><span>${plural(m.list.length, 'relevé')}</span></span>
      </button>`;
  }

  /* ============================================================ LIENS UTILES */
  function linkFields() {
    return [
      { name: 'title', label: 'Titre', required: true, span: 2, placeholder: 'Ex. Tableau de bord Supabase' },
      { name: 'url', label: 'Adresse', required: true, span: 2, placeholder: 'https://…', inputmode: 'url' },
      { name: 'category', label: 'Catégorie', list: catsFor('link', 'category', DEFAULTS.link), placeholder: 'Ex. Outils' },
      { name: 'description', label: 'Description', placeholder: 'À quoi sert ce lien ?' },
    ];
  }
  function editLink(item) {
    return N.formModal({
      title: item ? 'Modifier le lien' : 'Ajouter un lien', kicker: P.name, fields: linkFields(), values: item,
      submit: item ? 'Enregistrer' : 'Ajouter',
      onSubmit: async (v) => {
        v.url = N.safeUrl(v.url);
        if (!v.url) throw new Error('Adresse invalide.');
        item ? await update(item.id, Object.assign(clean(item), v)) : await create('link', v);
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Lien mis à jour.' : 'Lien ajouté.'); afterChange(); } });
  }

  function pageLinks(view) {
    const ui = (S.ui.links = S.ui.links || { q: '', cat: '' });
    const all = rows('link');
    const cats = uniq(all.map((l) => l.category || 'Général')).sort((a, b) => a.localeCompare(b, 'fr'));
    if (ui.cat && !cats.includes(ui.cat)) ui.cat = '';
    view.innerHTML = `
      ${head('Liens utiles', plural(all.length, 'lien'), addBtn('Ajouter un lien'))}
      ${all.length ? `<div class="toolbar">${searchBox(ui.q, 'Rechercher un lien')}${cats.length > 1 ? chips(cats, ui.cat, 'cat') : ''}</div>` : ''}
      <div data-results></div>`;
    const draw = () => {
      const q = ui.q.toLowerCase();
      const list = all.filter((l) => (!ui.cat || (l.category || 'Général') === ui.cat) && matches(l, q, ['title', 'url', 'description', 'category']))
        .sort((a, b) => a.title.localeCompare(b.title, 'fr'));
      const box = view.querySelector('[data-results]');
      if (!all.length) { box.innerHTML = `<div class="card">${empty('link', 'Aucun lien pour l’instant', 'Rassemblez ici les sites, outils et ressources que l’équipe utilise souvent.', addBtn('Ajouter le premier lien'))}</div>`; return; }
      if (!list.length) { box.innerHTML = `<div class="card">${empty('search', 'Aucun résultat', 'Essayez un autre mot-clé.')}</div>`; return; }
      const groups = uniq(list.map((l) => l.category || 'Général')).sort((a, b) => a.localeCompare(b, 'fr'));
      box.innerHTML = groups.map((g) => {
        const items = list.filter((l) => (l.category || 'Général') === g);
        return `<section class="group"><h2 class="group-title mono">${esc(g)} <span>${items.length}</span></h2><div class="lgrid">${items.map((l) => `
          <article class="lcard">
            <a class="lcard-main" href="${esc(N.safeUrl(l.url))}" target="_blank" rel="noopener noreferrer">
              <span class="lcard-ico">${esc((l.title || '?').trim()[0])}</span>
              <span class="lcard-txt"><b>${esc(l.title)}</b><small>${esc(N.domainOf(l.url))}</small></span>
              ${icon('arrow-up-right')}
            </a>
            ${l.description ? `<p>${esc(l.description)}</p>` : ''}
            ${actions(l.id)}
          </article>`).join('')}</div></section>`;
      }).join('');
    };
    draw();
    view.oninput = (e) => { if (e.target.matches('[data-search]')) { ui.q = e.target.value; draw(); } };
    view.onclick = (e) => {
      const c = e.target.closest('[data-cat]');
      if (c) { ui.cat = c.dataset.cat; view.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === c))); draw(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'add') editLink();
      if (b.dataset.act === 'edit') editLink(rows('link').find((x) => x.id === b.dataset.id));
      if (b.dataset.act === 'del') askDelete(b.dataset.id, 'ce lien');
    };
  }

  /* ============================================================ STATISTIQUES */
  function editStat(item, preset) {
    const fields = [
      { name: 'metric', label: 'Indicateur', required: true, span: 2, list: uniq(rows('stat').map((s) => s.metric)), placeholder: 'Ex. Utilisateurs actifs, abonnés Instagram…' },
      { name: 'value', label: 'Valeur', type: 'number', step: 'any', required: true },
      { name: 'unit', label: 'Unité', list: uniq(rows('stat').map((s) => s.unit)), placeholder: 'Ex. utilisateurs, %, €' },
      { name: 'date', label: 'Date du relevé', type: 'date', required: true, value: today() },
      { name: 'source', label: 'Source', placeholder: 'Lien vers la page d’origine', inputmode: 'url' },
      { name: 'comment', label: 'Commentaire', type: 'textarea', span: 2, placeholder: 'Contexte, explication d’une hausse ou d’une baisse…' },
    ];
    return N.formModal({
      title: item ? 'Modifier la statistique' : 'Ajouter une statistique', kicker: P.name, fields, values: item || preset,
      submit: item ? 'Enregistrer' : 'Ajouter',
      onSubmit: async (v) => {
        v.source = v.source ? N.safeUrl(v.source) : '';
        item ? await update(item.id, Object.assign(clean(item), v)) : await create('stat', v);
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Statistique mise à jour.' : 'Statistique ajoutée.'); afterChange(); } });
  }

  function pageStats(view) {
    const ui = (S.ui.stats = S.ui.stats || { metric: '', q: '' });
    const ms = metricsSummary();
    if (ui.metric && !ms.find((m) => m.name === ui.metric)) ui.metric = '';
    const all = rows('stat');
    view.innerHTML = `
      ${head('Statistiques', `${plural(ms.length, 'indicateur')} · ${plural(all.length, 'relevé')}`, `${all.length ? `<button class="btn" type="button" data-act="csv">${icon('download')}Exporter</button>` : ''}${addBtn('Ajouter une statistique')}`)}
      ${ms.length ? `<div class="mgrid">${ms.map((m) => metricCard(m, ui.metric === m.name)).join('')}</div>` : ''}
      <section class="card pad">
        ${all.length ? `<div class="card-head"><h2 class="card-title">Historique${ui.metric ? ` · ${esc(ui.metric)} <button class="btn btn-quiet btn-sm" type="button" data-act="clear">${icon('x')}Tout afficher</button>` : ''}</h2>${searchBox(ui.q, 'Rechercher dans les commentaires')}</div>` : ''}
        <div data-results></div>
      </section>`;
    const draw = () => {
      const q = ui.q.toLowerCase();
      const list = all.filter((s) => (!ui.metric || s.metric === ui.metric) && matches(s, q, ['metric', 'comment', 'source', 'unit']))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const box = view.querySelector('[data-results]');
      if (!all.length) { box.innerHTML = empty('chart', 'Aucune statistique', 'Notez ici les chiffres trouvés sur internet ou relevés par l’équipe, avec leur date, leur source et un commentaire.', addBtn('Ajouter la première statistique')); return; }
      if (!list.length) { box.innerHTML = empty('search', 'Aucun résultat', 'Essayez un autre mot-clé.').replace('class="empty"', 'class="empty empty--sm"'); return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Indicateur</th><th class="r">Valeur</th><th>Source</th><th>Commentaire</th><th></th></tr></thead>
        <tbody>${list.map((s) => `<tr>
          <td class="nowrap">${esc(fmtDate(s.date))}</td>
          <td class="nowrap"><b style="font-weight:500">${esc(s.metric)}</b></td>
          <td class="r nowrap num">${esc(fmtNum(s.value))} <span class="muted">${esc(s.unit || '')}</span></td>
          <td>${s.source ? `<a class="src" href="${esc(N.safeUrl(s.source))}" target="_blank" rel="noopener noreferrer">${esc(N.domainOf(s.source))}${icon('arrow-up-right')}</a>` : '<span class="muted">—</span>'}</td>
          <td><span class="comment">${esc(s.comment || '')}</span></td>
          <td class="r">${actions(s.id)}</td>
        </tr>`).join('')}</tbody></table></div>`;
    };
    draw();
    view.oninput = (e) => { if (e.target.matches('[data-search]')) { ui.q = e.target.value; draw(); } };
    view.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'metric') { ui.metric = ui.metric === b.dataset.metric ? '' : b.dataset.metric; route(); }
      if (a === 'clear') { ui.metric = ''; route(); }
      if (a === 'add') { const m = ui.metric && ms.find((x) => x.name === ui.metric); editStat(null, m ? { metric: m.name, unit: m.unit, date: today() } : null); }
      if (a === 'edit') editStat(rows('stat').find((x) => x.id === b.dataset.id));
      if (a === 'del') askDelete(b.dataset.id, 'ce relevé');
      if (a === 'csv') N.download(`${PID}-statistiques-${today()}.csv`, N.csv(all.sort((x, y) => String(y.date).localeCompare(String(x.date))), [
        { label: 'Date', key: 'date' }, { label: 'Indicateur', key: 'metric' }, { label: 'Valeur', get: (r) => String(r.value).replace('.', ',') }, { label: 'Unité', key: 'unit' }, { label: 'Source', key: 'source' }, { label: 'Commentaire', key: 'comment' },
      ]), 'text/csv;charset=utf-8');
    };
  }

  /* ============================================================== CALENDRIER */
  function editEvent(item, presetDate) {
    const fields = [
      { name: 'title', label: 'Titre', required: true, span: 2, placeholder: 'Ex. Réunion du bureau' },
      { name: 'date', label: 'Date', type: 'date', required: true, value: presetDate || today() },
      { name: 'end_date', label: 'Date de fin', type: 'date', hint: 'Pour un évènement sur plusieurs jours' },
      { name: 'start', label: 'Heure de début', type: 'time' },
      { name: 'end', label: 'Heure de fin', type: 'time' },
      { name: 'category', label: 'Type', type: 'select', options: EVENT_TYPES.map((t) => t.value), value: 'Réunion' },
      { name: 'place', label: 'Lieu', placeholder: 'Adresse ou lien de visio' },
      { name: 'description', label: 'Notes', type: 'textarea', span: 2, placeholder: 'Ordre du jour, participants…' },
    ];
    return N.formModal({
      title: item ? 'Modifier l’évènement' : 'Nouvel évènement', kicker: P.name, fields, values: item,
      submit: item ? 'Enregistrer' : 'Ajouter',
      onSubmit: async (v) => {
        if (v.end_date && v.end_date < v.date) throw new Error('La date de fin est avant la date de début.');
        if (v.end_date === v.date) v.end_date = '';
        item ? await update(item.id, Object.assign(clean(item), v)) : await create('event', v);
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Évènement mis à jour.' : 'Évènement ajouté.'); afterChange(); } });
  }

  async function openEvent(id) {
    const e = rows('event').find((x) => x.id === id);
    if (!e) return;
    const isUrl = /^https?:\/\//i.test(e.place || '');
    const when = e.end_date
      ? `Du ${fmtDate(e.date, { weekday: 'long', day: 'numeric', month: 'long' })} au ${fmtDate(e.end_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`
      : N.cap(fmtDate(e.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    const res = await N.modal({
      title: e.title, kicker: e.category || 'Évènement', small: true, noFocus: true,
      body: `<div class="ev-detail">
        <div class="ev-line">${icon('calendar')}<span>${esc(when)}</span></div>
        <div class="ev-line">${icon('clock')}<span>${esc(timeRange(e))}</span></div>
        ${e.place ? `<div class="ev-line">${icon('pin')}<span>${isUrl ? `<a class="src" style="font-size:13px" href="${esc(N.safeUrl(e.place))}" target="_blank" rel="noopener noreferrer">${esc(N.domainOf(e.place))}${icon('arrow-up-right')}</a>` : esc(e.place)}</span></div>` : ''}
        ${e.description ? `<div class="ev-notes">${esc(e.description)}</div>` : ''}
        <p class="muted" style="font-size:12px">Ajouté ${esc(N.ago(e._at))}${e._by ? ' par ' + esc(by(e._by)) : ''}</p>
      </div>`,
      extra: `<button type="button" class="btn btn-quiet-danger" data-del>${icon('trash')}Supprimer</button>`,
      cancel: 'Fermer', submit: 'Modifier',
      onSubmit: () => 'edit',
      onOpen: (form, close) => form.querySelector('[data-del]').addEventListener('click', () => close('delete')),
    });
    if (res === 'edit') editEvent(e);
    if (res === 'delete') askDelete(e.id, 'cet évènement');
  }

  /* Sur téléphone : toucher un jour qui a des évènements les liste d'abord. */
  async function openDay(day, list) {
    const res = await N.modal({
      title: N.cap(fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' })), kicker: 'Calendrier', small: true, noFocus: true,
      body: `<div class="rows">${list.map((e) => `
        <div class="row" style="grid-template-columns:auto minmax(0,1fr)">
          <span class="ev-dot" style="--c:${evColor(e.category)}"></span>
          <button class="row-main" type="button" data-open="${e.id}"><b>${esc(e.title)}</b><small>${esc(timeRange(e))}${e.place ? ' · ' + esc(e.place) : ''}</small></button>
        </div>`).join('')}</div>`,
      cancel: 'Fermer', submit: 'Ajouter un évènement',
      onSubmit: () => 'add',
      onOpen: (form, close) => form.addEventListener('click', (ev) => { const o = ev.target.closest('[data-open]'); if (o) close('open:' + o.dataset.open); }),
    });
    if (res === 'add') editEvent(null, day);
    else if (typeof res === 'string' && res.startsWith('open:')) openEvent(res.slice(5));
  }

  function eventsOn(day, list) {
    return list.filter((e) => e.date === day || (e.end_date && e.date <= day && e.end_date >= day))
      .sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  }

  function icsExport() {
    const pad = (n) => String(n).padStart(2, '0');
    const escT = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const d8 = (s) => String(s).replace(/-/g, '');
    const nextDay = (s) => { const d = N.parseDay(s); d.setDate(d.getDate() + 1); return N.isoDay(d); };
    const now = new Date();
    const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}00Z`;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nova//Espace prive//FR', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escT(P.name)}`];
    rows('event').forEach((e) => {
      lines.push('BEGIN:VEVENT', `UID:${e.id}@nova-espace`, `DTSTAMP:${stamp}`);
      if (e.start) {
        lines.push(`DTSTART:${d8(e.date)}T${e.start.replace(':', '')}00`);
        const endDay = e.end_date || e.date;
        lines.push(`DTEND:${d8(endDay)}T${(e.end || e.start).replace(':', '')}00`);
      } else {
        lines.push(`DTSTART;VALUE=DATE:${d8(e.date)}`, `DTEND;VALUE=DATE:${d8(nextDay(e.end_date || e.date))}`);
      }
      lines.push(`SUMMARY:${escT(e.title)}`);
      if (e.place) lines.push(`LOCATION:${escT(e.place)}`);
      if (e.description) lines.push(`DESCRIPTION:${escT(e.description)}`);
      if (e.category) lines.push(`CATEGORIES:${escT(e.category)}`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    N.download(`${PID}-calendrier.ics`, lines.join('\r\n'), 'text/calendar;charset=utf-8');
  }

  function pageCalendar(view) {
    const t = new Date();
    const ui = (S.ui.cal = S.ui.cal || { y: t.getFullYear(), m: t.getMonth(), mode: 'month', past: false });
    const evs = rows('event');
    const up = upcoming();
    const monthName = N.cap(new Date(ui.y, ui.m, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }));
    view.innerHTML = `
      ${head('Calendrier', `${plural(up.length, 'évènement')} à venir`, `${evs.length ? `<button class="btn" type="button" data-act="ics" title="Fichier à importer dans Apple Calendrier, Google Agenda, Outlook…">${icon('download')}Exporter (.ics)</button>` : ''}${addBtn('Nouvel évènement')}`)}
      <div class="cols cols--side">
        <section class="card pad">
          <div class="cal-bar">
            <button class="icon-btn" type="button" data-act="prev" aria-label="Mois précédent">${icon('chevron-left')}</button>
            <h2 class="cal-month" aria-live="polite">${esc(ui.mode === 'month' ? monthName : 'Tous les évènements')}</h2>
            <button class="icon-btn" type="button" data-act="next" aria-label="Mois suivant">${icon('chevron-right')}</button>
            <button class="btn btn-sm" type="button" data-act="today">Aujourd’hui</button>
            <span class="grow"></span>
            <div class="seg" role="group" aria-label="Affichage">
              <button type="button" data-mode="month" aria-pressed="${ui.mode === 'month'}">${icon('calendar')}Mois</button>
              <button type="button" data-mode="list" aria-pressed="${ui.mode === 'list'}">${icon('list')}Liste</button>
            </div>
          </div>
          ${ui.mode === 'month' ? monthGrid(ui, evs) : listView(ui, evs)}
        </section>
        <aside class="card pad">
          <div class="card-head"><h2 class="card-title">À venir</h2></div>
          ${up.length ? `<div class="rows">${up.slice(0, 8).map((e) => `
            <div class="row" style="grid-template-columns:auto minmax(0,1fr)">
              ${dateBox(e.date)}
              <button class="row-main" type="button" data-act="open" data-id="${e.id}" style="text-align:left"><b>${esc(e.title)}</b><small><i class="dot" style="--c:${evColor(e.category)};margin-right:6px"></i>${esc(relDay(e.date))} · ${esc(timeRange(e))}</small></button>
            </div>`).join('')}</div>` : `<div class="empty empty--sm">${icon('calendar')}<b>Rien de prévu</b><p>Cliquez sur un jour pour ajouter un évènement.</p></div>`}
        </aside>
      </div>`;
    if (ui.mode === 'list') view.querySelectorAll('[data-act=prev],[data-act=next],[data-act=today]').forEach((b) => { b.hidden = true; });
    view.onclick = (e) => {
      const md = e.target.closest('[data-mode]');
      if (md) { ui.mode = md.dataset.mode; route(); return; }
      const b = e.target.closest('[data-act]');
      if (b) {
        const a = b.dataset.act;
        if (a === 'prev' || a === 'next') { const d = new Date(ui.y, ui.m + (a === 'next' ? 1 : -1), 1); ui.y = d.getFullYear(); ui.m = d.getMonth(); route(); }
        if (a === 'today') { ui.y = t.getFullYear(); ui.m = t.getMonth(); route(); }
        if (a === 'add') editEvent();
        if (a === 'open') openEvent(b.dataset.id);
        if (a === 'ics') icsExport();
        if (a === 'past') { ui.past = !ui.past; route(); }
        if (a === 'day') {
          const list = eventsOn(b.dataset.day, rows('event'));
          if (list.length && window.matchMedia('(max-width: 640px)').matches) openDay(b.dataset.day, list);
          else editEvent(null, b.dataset.day);
        }
        return;
      }
    };
  }

  function monthGrid(ui, evs) {
    const first = new Date(ui.y, ui.m, 1);
    const offset = (first.getDay() + 6) % 7; // lundi = 0
    const start = new Date(ui.y, ui.m, 1 - offset);
    const daysInMonth = new Date(ui.y, ui.m + 1, 0).getDate();
    const weeks = Math.ceil((offset + daysInMonth) / 7);
    const t = today();
    let html = '<div class="cal-grid">' + ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = N.isoDay(d);
      const list = eventsOn(iso, evs);
      const cls = ['cal-day', d.getMonth() !== ui.m ? 'is-other' : '', iso === t ? 'is-today' : '', i % 7 >= 5 ? 'is-weekend' : ''].filter(Boolean).join(' ');
      html += `<div class="${cls}" data-act="day" data-day="${iso}" role="button" tabindex="0" aria-label="${esc(fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }))}${list.length ? ', ' + plural(list.length, 'évènement') : ''} — ajouter">
        <span class="cal-num">${d.getDate()}</span>
        ${list.slice(0, 3).map((e) => `<button class="cal-ev" type="button" data-act="open" data-id="${e.id}" style="--c:${evColor(e.category)}" title="${esc(e.title)}">${e.start && e.date === iso ? `<time>${esc(e.start)}</time>` : ''}<span>${esc(e.title)}</span></button>`).join('')}
        ${list.length > 3 ? `<span class="cal-more">+${list.length - 3} autre${list.length - 3 > 1 ? 's' : ''}</span>` : ''}
      </div>`;
    }
    return html + '</div>';
  }

  function listView(ui, evs) {
    const t = today();
    const list = evs.filter((e) => ui.past || (e.end_date || e.date) >= t).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
    const toggle = `<button class="btn btn-quiet btn-sm" type="button" data-act="past">${ui.past ? 'Masquer' : 'Afficher'} les évènements passés</button>`;
    if (!list.length) return `<div class="empty empty--sm">${icon('calendar')}<b>Aucun évènement</b>${evs.length ? toggle : ''}</div>`;
    const months = uniq(list.map((e) => monthKey(e.date)));
    return months.map((mk) => {
      const [y, m] = mk.split('-').map(Number);
      return `<h3 class="group-title mono" style="margin-top:18px">${esc(N.cap(new Date(y, m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })))}</h3>
        <div class="rows">${list.filter((e) => monthKey(e.date) === mk).map((e) => `
          <div class="row"${(e.end_date || e.date) < t ? ' style="opacity:.55"' : ''}>
            ${dateBox(e.date)}
            <button class="row-main" type="button" data-act="open" data-id="${e.id}" style="text-align:left"><b>${esc(e.title)}</b><small>${esc(timeRange(e))}${e.place ? ' · ' + esc(e.place) : ''}${e.end_date ? ' · jusqu’au ' + esc(fmtDate(e.end_date, { day: 'numeric', month: 'short' })) : ''}</small></button>
            <span class="badge" style="--c:${evColor(e.category)}"><i class="dot"></i>${esc(e.category || 'Autre')}</span>
          </div>`).join('')}</div>`;
    }).join('') + `<div style="margin-top:14px">${toggle}</div>`;
  }

  /* ============================================================== DOCUMENTS */
  const DOC_META = {
    legal: { title: 'Documents juridiques', one: 'document juridique', icon: 'scale', intro: 'Statuts, contrats, CGU, propriété intellectuelle… Les fichiers sont stockés de façon privée ; vous pouvez aussi pointer vers un dépôt GitHub privé ou un Drive.' },
    admin_doc: { title: 'Documents administratifs', one: 'document administratif', icon: 'folder', intro: 'Procès-verbaux, comptes rendus, attestations, courriers… Fichier téléversé ou lien externe (GitHub, Drive…).' },
  };
  function fileBadge(d) {
    if (d.file) {
      const ext = (d.file.name.split('.').pop() || '').slice(0, 4).toUpperCase();
      return `<span class="ftype">${esc(ext || 'FIC')}</span>`;
    }
    return `<span class="ftype">${icon(/github\.com/i.test(d.link || '') ? 'globe' : 'link')}</span>`;
  }

  function editDoc(kind, item) {
    const defaults = kind === 'legal' ? DEFAULTS.legal[PID] || DEFAULTS.legal.escld : DEFAULTS.admin_doc;
    const fields = [
      { name: 'title', label: 'Titre du document', required: true, span: 2, placeholder: kind === 'legal' ? 'Ex. Statuts mis à jour' : 'Ex. PV de l’assemblée générale' },
      { name: 'category', label: 'Catégorie', list: catsFor(kind, 'category', defaults), placeholder: 'Choisir ou saisir' },
      { name: 'date', label: 'Date du document', type: 'date', value: today() },
      { name: 'source', label: 'Où se trouve le document ?', type: 'segment', span: 2, value: item ? (item.file ? 'file' : 'link') : 'file', options: [{ value: 'file', label: 'Téléverser un fichier', icon: 'upload' }, { value: 'link', label: 'Lien externe', icon: 'link' }] },
      { name: 'file', label: 'Fichier', type: 'file', span: 2, showIf: 'source=file', optional: false, current: item && item.file ? `${item.file.name} (${N.fmtSize(item.file.size)})` : '', hint: 'PDF, Word, image… 50 Mo maximum. Stockage privé, visible uniquement par les membres de cet espace.' },
      { name: 'link', label: 'Lien', span: 2, showIf: 'source=link', optional: false, placeholder: 'https://github.com/… ou https://drive.google.com/…', inputmode: 'url', hint: 'GitHub (dépôt privé), Google Drive, Dropbox, OneDrive…' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2, placeholder: 'Version, signataires, où se trouve l’original…' },
    ];
    return N.formModal({
      title: item ? 'Modifier le document' : 'Ajouter un document', kicker: DOC_META[kind].title, fields, values: item,
      submit: item ? 'Enregistrer' : 'Ajouter',
      onSubmit: async (v) => {
        const data = Object.assign(item ? clean(item) : {}, { title: v.title, category: v.category, date: v.date, notes: v.notes, source: v.source });
        const oldPath = item && item.file ? item.file.path : null;
        if (v.source === 'file') {
          if (v.file) {
            if (v.file.size > 50 * 1048576) throw new Error('Fichier trop volumineux (50 Mo maximum).');
            const path = await N.api.upload(PID, kind, v.file);
            data.file = { path, name: v.file.name, size: v.file.size, type: v.file.type };
          } else if (!oldPath) throw new Error('Choisissez un fichier à téléverser.');
          delete data.link;
        } else {
          data.link = N.safeUrl(v.link);
          if (!data.link) throw new Error('Indiquez un lien valide.');
          delete data.file;
        }
        item ? await update(item.id, data) : await create(kind, data);
        if (oldPath && (!data.file || data.file.path !== oldPath)) N.api.removeFile(oldPath).catch(() => {});
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Document mis à jour.' : 'Document ajouté.'); afterChange(); } });
  }

  function pageDocs(view, kind) {
    const meta = DOC_META[kind];
    const key = 'docs-' + kind;
    const ui = (S.ui[key] = S.ui[key] || { q: '', cat: '' });
    const all = rows(kind);
    const cats = uniq(all.map((d) => d.category || 'Sans catégorie')).sort((a, b) => a.localeCompare(b, 'fr'));
    if (ui.cat && !cats.includes(ui.cat)) ui.cat = '';
    view.innerHTML = `
      ${head(meta.title, plural(all.length, 'document'), addBtn('Ajouter un document'))}
      <section class="card pad">
        ${all.length ? `<div class="toolbar">${searchBox(ui.q, 'Rechercher un document')}${cats.length > 1 ? chips(cats, ui.cat, 'cat') : ''}</div>` : ''}
        <div data-results></div>
      </section>`;
    const draw = () => {
      const q = ui.q.toLowerCase();
      const list = all.filter((d) => (!ui.cat || (d.category || 'Sans catégorie') === ui.cat) && matches(d, q, ['title', 'category', 'notes']))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || a.title.localeCompare(b.title, 'fr'));
      const box = view.querySelector('[data-results]');
      if (!all.length) { box.innerHTML = empty(meta.icon, `Aucun ${meta.one}`, meta.intro, addBtn('Ajouter le premier document')); return; }
      if (!list.length) { box.innerHTML = empty('search', 'Aucun résultat', 'Essayez un autre mot-clé.').replace('class="empty"', 'class="empty empty--sm"'); return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Document</th><th>Catégorie</th><th>Date</th><th>Emplacement</th><th>Ajouté</th><th></th></tr></thead>
        <tbody>${list.map((d) => `<tr>
          <td><div class="cell-main">${fileBadge(d)}<span><b>${esc(d.title)}</b>${d.notes ? `<small>${esc(d.notes)}</small>` : ''}</span></div></td>
          <td>${d.category ? `<span class="badge">${esc(d.category)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="nowrap">${d.date ? esc(fmtDate(d.date)) : '<span class="muted">—</span>'}</td>
          <td class="nowrap muted">${d.file ? `Fichier · ${esc(N.fmtSize(d.file.size))}` : esc(N.domainOf(d.link))}</td>
          <td class="nowrap muted">${esc(N.ago(d._at))}${d._by ? `<br><small>par ${esc(by(d._by))}</small>` : ''}</td>
          <td class="r">${actions(d.id, `<button class="btn btn-sm" type="button" data-act="open" data-id="${d.id}">${icon(d.file ? 'eye' : 'arrow-up-right')}Ouvrir</button>`)}</td>
        </tr>`).join('')}</tbody></table></div>`;
    };
    draw();
    view.oninput = (e) => { if (e.target.matches('[data-search]')) { ui.q = e.target.value; draw(); } };
    view.onclick = (e) => {
      const c = e.target.closest('[data-cat]');
      if (c) { ui.cat = c.dataset.cat; view.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === c))); draw(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const d = b.dataset.id ? rows(kind).find((x) => x.id === b.dataset.id) : null;
      if (b.dataset.act === 'add') editDoc(kind);
      if (b.dataset.act === 'edit' && d) editDoc(kind, d);
      if (b.dataset.act === 'del' && d) askDelete(d.id, 'ce document');
      if (b.dataset.act === 'open' && d) { d.file ? N.openFile(d.file.path) : N.openLink(d.link); }
    };
  }

  /* ============================================================ COMPTABILITÉ */
  function editEntry(item) {
    const fields = [
      { name: 'type', label: 'Type d’opération', type: 'segment', span: 2, value: 'out', options: [{ value: 'out', label: 'Dépense', icon: 'trend-down' }, { value: 'in', label: 'Recette', icon: 'trend-up' }] },
      { name: 'label', label: 'Libellé', required: true, span: 2, placeholder: 'Ex. Hébergement serveur — novembre' },
      { name: 'amount', label: 'Montant (€)', type: 'number', step: '0.01', min: '0', required: true, placeholder: '0,00' },
      { name: 'date', label: 'Date', type: 'date', required: true, value: today() },
      { name: 'category', label: 'Catégorie', list: catsFor('entry', 'category', DEFAULTS.entry[PID] || DEFAULTS.entry.escld), placeholder: 'Choisir ou saisir' },
      { name: 'method', label: 'Moyen de paiement', type: 'select', value: 'Virement', options: ['Virement', 'Carte bancaire', 'Prélèvement', 'Chèque', 'Espèces', 'Paiement en ligne', 'Autre'] },
      { name: 'file', label: 'Justificatif', type: 'file', span: 2, current: item && item.file ? `${item.file.name} (${N.fmtSize(item.file.size)})` : '', hint: 'Facture, reçu, ticket… (PDF ou photo)' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 },
    ];
    return N.formModal({
      title: item ? 'Modifier l’opération' : 'Nouvelle opération', kicker: 'Comptabilité', fields, values: item,
      submit: item ? 'Enregistrer' : 'Ajouter',
      onSubmit: async (v) => {
        if (!(v.amount > 0)) throw new Error('Le montant doit être supérieur à zéro.');
        const data = Object.assign(item ? clean(item) : {}, { type: v.type, label: v.label, amount: Math.round(v.amount * 100) / 100, date: v.date, category: v.category, method: v.method, notes: v.notes });
        const oldPath = item && item.file ? item.file.path : null;
        if (v.file) {
          const path = await N.api.upload(PID, 'entry', v.file);
          data.file = { path, name: v.file.name, size: v.file.size, type: v.file.type };
        }
        item ? await update(item.id, data) : await create('entry', data);
        if (oldPath && data.file && data.file.path !== oldPath) N.api.removeFile(oldPath).catch(() => {});
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Opération mise à jour.' : 'Opération ajoutée.'); afterChange(); } });
  }

  function pageAccounting(view) {
    const t = new Date();
    const ui = (S.ui.acc = S.ui.acc || { period: 'year', year: t.getFullYear(), type: '', q: '', cat: '' });
    const all = rows('entry');
    const years = uniq(all.map((e) => String(e.date).slice(0, 4)).concat(String(t.getFullYear()))).sort().reverse();
    const inPeriod = (e) => ui.period === 'all' || (ui.period === 'year' ? String(e.date).startsWith(String(ui.year)) : monthKey(e.date) === N.isoDay(t).slice(0, 7));
    const period = all.filter(inPeriod);
    const inc = period.filter((e) => e.type === 'in').reduce((s, e) => s + (+e.amount || 0), 0);
    const out = period.filter((e) => e.type === 'out').reduce((s, e) => s + (+e.amount || 0), 0);
    const bal = all.reduce((s, e) => s + signed(e), 0);
    const chart = dotChart(monthlyFlows(all, 12), 6, 1100);
    const periodLabel = ui.period === 'all' ? 'depuis le début' : ui.period === 'year' ? `en ${ui.year}` : 'ce mois-ci';
    const cats = uniq(period.map((e) => e.category || 'Sans catégorie')).sort((a, b) => a.localeCompare(b, 'fr'));
    if (ui.cat && !cats.includes(ui.cat)) ui.cat = '';

    view.innerHTML = `
      ${head('Comptabilité', `Solde actuel : <b style="color:var(--ink)">${esc(fmtMoney(bal))}</b>`, `${all.length ? `<button class="btn" type="button" data-act="csv">${icon('download')}Exporter</button>` : ''}${addBtn('Nouvelle opération')}`)}
      <div class="stack">
        <div class="toolbar" style="margin:0">
          <div class="seg" role="group" aria-label="Période">
            <button type="button" data-period="month" aria-pressed="${ui.period === 'month'}">Ce mois</button>
            <button type="button" data-period="year" aria-pressed="${ui.period === 'year'}">Année</button>
            <button type="button" data-period="all" aria-pressed="${ui.period === 'all'}">Tout</button>
          </div>
          ${ui.period === 'year' ? `<div class="seg" role="group" aria-label="Année">${years.map((y) => `<button type="button" data-year="${y}" aria-pressed="${String(ui.year) === y}">${y}</button>`).join('')}</div>` : ''}
        </div>
        <div class="kpis">
          <div class="card kpi"><p class="kpi-label mono">${icon('wallet')}Solde</p><p class="kpi-value ${bal < 0 ? 'neg' : ''}">${esc(fmtMoney(bal))}</p><p class="kpi-foot">toutes opérations</p></div>
          <div class="card kpi"><p class="kpi-label mono">${icon('trend-up')}Recettes</p><p class="kpi-value pos">${esc(fmtMoney(inc))}</p><p class="kpi-foot">${esc(periodLabel)}</p></div>
          <div class="card kpi"><p class="kpi-label mono">${icon('trend-down')}Dépenses</p><p class="kpi-value">${esc(fmtMoney(out))}</p><p class="kpi-foot">${esc(periodLabel)}</p></div>
          <div class="card kpi"><p class="kpi-label mono">${icon('chart')}Résultat</p><p class="kpi-value ${inc - out < 0 ? 'neg' : 'pos'}">${inc - out > 0 ? '+' : ''}${esc(fmtMoney(inc - out))}</p><p class="kpi-foot">${plural(period.length, 'opération')}</p></div>
        </div>
        ${all.length ? `
          <section class="card pad">
            <div class="card-head"><h2 class="card-title">12 derniers mois</h2><span class="legend mono"><span><i></i>Recettes</span><span><i class="o"></i>Dépenses</span></span></div>
            ${chart.svg}
            <div class="chart-foot mono"><span>Survolez une colonne pour le détail</span><span>1 point ≈ ${esc(fmtMoney(chart.unit))}</span></div>
          </section>` : ''}
        <section class="card pad">
          ${all.length ? `<div class="toolbar">
            ${searchBox(ui.q, 'Rechercher une opération')}
            <div class="seg" role="group" aria-label="Type">
              <button type="button" data-type="" aria-pressed="${ui.type === ''}">Toutes</button>
              <button type="button" data-type="in" aria-pressed="${ui.type === 'in'}">Recettes</button>
              <button type="button" data-type="out" aria-pressed="${ui.type === 'out'}">Dépenses</button>
            </div>
            ${cats.length > 1 ? `<select class="chip" data-catsel aria-label="Catégorie" style="padding-right:12px"><option value="">Toutes catégories</option>${cats.map((c) => `<option${c === ui.cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
          </div>` : ''}
          <div data-results></div>
        </section>
      </div>`;

    const draw = () => {
      const q = ui.q.toLowerCase();
      const list = period.filter((e) => (!ui.type || e.type === ui.type) && (!ui.cat || (e.category || 'Sans catégorie') === ui.cat) && matches(e, q, ['label', 'category', 'notes', 'method']))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b._at).localeCompare(String(a._at)));
      const box = view.querySelector('[data-results]');
      if (!all.length) { box.innerHTML = empty('wallet', 'Aucune opération', 'Enregistrez les recettes et les dépenses, avec leur justificatif. Le solde et les graphiques se calculent tout seuls.', addBtn('Ajouter la première opération')); return; }
      if (!list.length) { box.innerHTML = empty('search', 'Aucune opération sur cette sélection', 'Changez la période ou les filtres.').replace('class="empty"', 'class="empty empty--sm"'); return; }
      const total = list.reduce((s, e) => s + signed(e), 0);
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Libellé</th><th>Catégorie</th><th>Moyen</th><th class="r">Montant</th><th></th></tr></thead>
        <tbody>${list.map((e) => `<tr>
          <td class="nowrap">${esc(fmtDate(e.date))}</td>
          <td><div class="cell-main" style="min-width:180px"><span><b>${esc(e.label)}</b>${e.notes ? `<small>${esc(e.notes)}</small>` : ''}</span></div></td>
          <td>${e.category ? `<span class="badge">${esc(e.category)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="nowrap muted">${esc(e.method || '')}</td>
          <td class="r"><span class="amount ${e.type === 'in' ? 'in' : ''}">${e.type === 'in' ? '+' : '−'}${esc(fmtMoney(e.amount))}</span></td>
          <td class="r">${actions(e.id, e.file ? `<button class="icon-btn" type="button" data-act="file" data-id="${e.id}" title="Voir le justificatif" aria-label="Voir le justificatif">${icon('file')}</button>` : '')}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">Total de la sélection · ${plural(list.length, 'opération')}</td><td class="r"><span class="amount ${total >= 0 ? 'in' : ''}">${total >= 0 ? '+' : '−'}${esc(fmtMoney(Math.abs(total)))}</span></td><td></td></tr></tfoot>
      </table></div>`;
    };
    draw();
    view.oninput = (e) => { if (e.target.matches('[data-search]')) { ui.q = e.target.value; draw(); } };
    view.onchange = (e) => { if (e.target.matches('[data-catsel]')) { ui.cat = e.target.value; draw(); } };
    view.onclick = (e) => {
      const p = e.target.closest('[data-period]'); if (p) { ui.period = p.dataset.period; route(); return; }
      const y = e.target.closest('[data-year]'); if (y) { ui.year = Number(y.dataset.year); route(); return; }
      const ty = e.target.closest('[data-type]'); if (ty) { ui.type = ty.dataset.type; view.querySelectorAll('[data-type]').forEach((x) => x.setAttribute('aria-pressed', String(x === ty))); draw(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const it = b.dataset.id ? rows('entry').find((x) => x.id === b.dataset.id) : null;
      if (b.dataset.act === 'add') editEntry();
      if (b.dataset.act === 'edit' && it) editEntry(it);
      if (b.dataset.act === 'del' && it) askDelete(it.id, 'cette opération');
      if (b.dataset.act === 'file' && it && it.file) N.openFile(it.file.path);
      if (b.dataset.act === 'csv') N.download(`${PID}-comptabilite-${today()}.csv`, N.csv(all.slice().sort((a, c) => String(a.date).localeCompare(String(c.date))), [
        { label: 'Date', key: 'date' }, { label: 'Type', get: (r) => (r.type === 'in' ? 'Recette' : 'Dépense') }, { label: 'Libellé', key: 'label' },
        { label: 'Catégorie', key: 'category' }, { label: 'Moyen de paiement', key: 'method' },
        { label: 'Montant (€)', get: (r) => (signed(r)).toFixed(2).replace('.', ',') }, { label: 'Justificatif', get: (r) => (r.file ? r.file.name : '') }, { label: 'Notes', key: 'notes' },
      ]), 'text/csv;charset=utf-8');
    };
  }

  /* ============================================================== RÉPERTOIRE */
  function editMember(item) {
    const fields = [
      { name: 'name', label: 'Prénom et nom', required: true, span: 2 },
      { name: 'role', label: 'Fonction', list: catsFor('member', 'role', DEFAULTS.role), placeholder: 'Ex. Membre, Trésorier·ère…' },
      { name: 'council', label: 'Conseil / pôle', list: catsFor('member', 'council', DEFAULTS.council), placeholder: 'Choisir ou saisir' },
      { name: 'email', label: 'Email', type: 'email', autocomplete: 'off' },
      { name: 'phone', label: 'Téléphone', type: 'tel' },
      { name: 'school', label: 'Université / ville' },
      { name: 'since', label: 'Membre depuis', type: 'date' },
      { name: 'linkedin', label: 'Profil LinkedIn', span: 2, placeholder: 'https://www.linkedin.com/in/…', inputmode: 'url' },
      { name: 'exec', label: 'Membre du bureau exécutif', type: 'checkbox', span: 2, hint: 'Apparaît aussi dans l’onglet « Bureau exécutif ».' },
      { name: 'exec_order', label: 'Ordre dans le bureau', type: 'number', min: 1, showIf: 'exec=on', hint: '1 = affiché en premier' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 },
    ];
    return N.formModal({
      title: item ? 'Modifier le membre' : 'Ajouter un membre', kicker: 'Répertoire', fields, values: item,
      submit: item ? 'Enregistrer' : 'Ajouter',
      onSubmit: async (v) => {
        v.linkedin = v.linkedin ? N.safeUrl(v.linkedin) : '';
        if (!v.exec) v.exec_order = null;
        item ? await update(item.id, Object.assign(clean(item), v)) : await create('member', v);
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Fiche mise à jour.' : 'Membre ajouté.'); afterChange(); } });
  }

  function pageDirectory(view) {
    const ui = (S.ui.dir = S.ui.dir || { tab: 'all', q: '', council: '' });
    const all = rows('member').sort((a, b) => a.name.localeCompare(b.name, 'fr'));
    const exec = all.filter((m) => m.exec).sort((a, b) => (a.exec_order || 99) - (b.exec_order || 99) || a.name.localeCompare(b.name, 'fr'));
    const councils = uniq(all.map((m) => m.council)).sort((a, b) => a.localeCompare(b, 'fr'));
    if (ui.council && !councils.includes(ui.council)) ui.council = '';
    view.innerHTML = `
      ${head('Répertoire', `${plural(all.length, 'membre')} · ${exec.length} au bureau exécutif`, `${all.length ? `<button class="btn" type="button" data-act="csv">${icon('download')}Exporter</button>` : ''}${addBtn('Ajouter un membre')}`)}
      <div class="toolbar">
        <div class="seg" role="group" aria-label="Vue">
          <button type="button" data-tab="all" aria-pressed="${ui.tab === 'all'}">${icon('users')}Tous les membres <em>${all.length}</em></button>
          <button type="button" data-tab="exec" aria-pressed="${ui.tab === 'exec'}">${icon('star')}Bureau exécutif <em>${exec.length}</em></button>
        </div>
        ${all.length ? searchBox(ui.q, 'Rechercher un membre') : ''}
      </div>
      ${ui.tab === 'all' && councils.length > 1 ? `<div class="toolbar">${chips(councils, ui.council, 'council')}</div>` : ''}
      <div data-results></div>`;
    const draw = () => {
      const q = ui.q.toLowerCase();
      const keys = ['name', 'role', 'council', 'email', 'school', 'phone'];
      const box = view.querySelector('[data-results]');
      if (!all.length) { box.innerHTML = `<div class="card">${empty('users', 'Le répertoire est vide', 'Ajoutez les membres de l’association avec leur fonction, leur conseil et leurs coordonnées. Cochez « bureau exécutif » pour les membres du bureau.', addBtn('Ajouter le premier membre'))}</div>`; return; }
      if (ui.tab === 'exec') {
        const list = exec.filter((m) => matches(m, q, keys));
        if (!exec.length) { box.innerHTML = `<div class="card">${empty('star', 'Aucun membre au bureau exécutif', 'Ouvrez la fiche d’un membre et cochez « Membre du bureau exécutif ».')}</div>`; return; }
        if (!list.length) { box.innerHTML = `<div class="card">${empty('search', 'Aucun résultat', 'Essayez un autre nom.')}</div>`; return; }
        box.innerHTML = `<div class="pgrid">${list.map((m) => `
          <article class="pcard">
            <span class="avatar avatar--lg">${esc(N.initials(m.name))}</span>
            <h3>${esc(m.name)}</h3>
            <p class="role">${esc(m.role || 'Bureau exécutif')}</p>
            <small>${esc([m.council !== 'Bureau' ? m.council : '', m.school].filter(Boolean).join(' · '))}</small>
            <div class="pcard-links">
              ${m.email ? `<a class="btn btn-sm" href="mailto:${esc(m.email)}">${icon('mail')}Email</a>` : ''}
              ${m.phone ? `<a class="btn btn-sm" href="tel:${esc(m.phone.replace(/\s+/g, ''))}">${icon('phone')}Appeler</a>` : ''}
              ${m.linkedin ? `<a class="btn btn-sm" href="${esc(N.safeUrl(m.linkedin))}" target="_blank" rel="noopener noreferrer">in</a>` : ''}
            </div>
            ${actions(m.id)}
          </article>`).join('')}</div>`;
        return;
      }
      const list = all.filter((m) => (!ui.council || m.council === ui.council) && matches(m, q, keys));
      if (!list.length) { box.innerHTML = `<div class="card">${empty('search', 'Aucun résultat', 'Essayez un autre nom ou un autre filtre.')}</div>`; return; }
      box.innerHTML = `<section class="card pad"><div class="table-wrap"><table class="table">
        <thead><tr><th>Membre</th><th>Conseil / pôle</th><th>Contact</th><th>Université / ville</th><th>Depuis</th><th></th></tr></thead>
        <tbody>${list.map((m) => `<tr>
          <td><div class="who"><span class="avatar avatar--sm">${esc(N.initials(m.name))}</span><span><b>${esc(m.name)}${m.exec ? `<svg class="exec-star" viewBox="0 0 24 24" aria-label="Bureau exécutif"><path d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.5-5.1-2.7-5 2.7.9-5.5-4-4 5.6-.8Z"/></svg>` : ''}</b><small>${esc(m.role || 'Membre')}</small></span></div></td>
          <td>${m.council ? `<span class="badge">${esc(m.council)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="nowrap">${m.email ? `<a class="src" href="mailto:${esc(m.email)}">${icon('mail')}${esc(m.email)}</a>` : ''}${m.phone ? `<br><a class="src" href="tel:${esc(m.phone.replace(/\s+/g, ''))}">${icon('phone')}${esc(m.phone)}</a>` : ''}${!m.email && !m.phone ? '<span class="muted">—</span>' : ''}</td>
          <td class="muted">${esc(m.school || '—')}</td>
          <td class="nowrap muted">${m.since ? esc(fmtDate(m.since, { month: 'short', year: 'numeric' })) : '—'}</td>
          <td class="r">${actions(m.id)}</td>
        </tr>`).join('')}</tbody></table></div></section>`;
    };
    draw();
    view.oninput = (e) => { if (e.target.matches('[data-search]')) { ui.q = e.target.value; draw(); } };
    view.onclick = (e) => {
      const tb = e.target.closest('[data-tab]'); if (tb) { ui.tab = tb.dataset.tab; route(); return; }
      const c = e.target.closest('[data-council]');
      if (c) { ui.council = c.dataset.council; view.querySelectorAll('[data-council]').forEach((x) => x.setAttribute('aria-pressed', String(x === c))); draw(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const m = b.dataset.id ? rows('member').find((x) => x.id === b.dataset.id) : null;
      if (b.dataset.act === 'add') editMember();
      if (b.dataset.act === 'edit' && m) editMember(m);
      if (b.dataset.act === 'del' && m) askDelete(m.id, `la fiche de ${m.name}`);
      if (b.dataset.act === 'csv') N.download(`${PID}-repertoire-${today()}.csv`, N.csv(all, [
        { label: 'Nom', key: 'name' }, { label: 'Fonction', key: 'role' }, { label: 'Conseil / pôle', key: 'council' }, { label: 'Bureau exécutif', get: (r) => (r.exec ? 'Oui' : '') },
        { label: 'Email', key: 'email' }, { label: 'Téléphone', key: 'phone' }, { label: 'Université / ville', key: 'school' }, { label: 'Membre depuis', key: 'since' }, { label: 'LinkedIn', key: 'linkedin' }, { label: 'Notes', key: 'notes' },
      ]), 'text/csv;charset=utf-8');
    };
  }

  const RENDER = {
    overview: pageOverview,
    calendar: pageCalendar,
    links: pageLinks,
    directory: pageDirectory,
    stats: pageStats,
    accounting: pageAccounting,
    legal: (v) => pageDocs(v, 'legal'),
    admin_docs: (v) => pageDocs(v, 'admin_doc'),
  };

  /* Clavier : Entrée sur une case du calendrier = ajouter un évènement. */
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.cal-day')) { e.preventDefault(); e.target.click(); }
  });

  start();
})();
