/* ==========================================================================
   Nova — private workspace · project workspace (/saas-auralys/, /saas-escld/)
   Sidebar = the project's pages; top bar = switching workspace.
   ========================================================================== */
(function () {
  'use strict';
  const N = window.Nova;
  const { esc, icon, fmtDate, fmtMoney, fmtNum } = N;
  const PID = document.body.dataset.project;
  const P = N.PROJECTS[PID];

  const PAGES = {
    overview: { slug: 'overview', label: 'Overview', icon: 'grid', group: 'Workspace' },
    calendar: { slug: 'calendar', label: 'Calendar', icon: 'calendar', group: 'Workspace', kind: 'event' },
    notes: { slug: 'notes', label: 'Notes', icon: 'note', group: 'Workspace', kind: 'note' },
    links: { slug: 'links', label: 'Useful links', icon: 'link', group: 'Workspace', kind: 'link' },
    directory: { slug: 'directory', label: 'Directory', icon: 'users', group: 'Workspace', kind: 'member' },
    stats: { slug: 'statistics', label: 'Statistics', icon: 'chart', group: 'Tracking', kind: 'stat' },
    accounting: { slug: 'accounting', label: 'Accounting', icon: 'wallet', group: 'Tracking', kind: 'entry' },
    admin_docs: { slug: 'administrative', label: 'Administrative documents', short: 'Administrative', icon: 'folder', group: 'Documents', kind: 'admin_doc' },
    legal: { slug: 'legal', label: 'Legal documents', short: 'Legal', icon: 'scale', group: 'Documents', kind: 'legal' },
  };

  /* Suggested categories (any other value can be typed). */
  const DEFAULTS = {
    legal: {
      auralys: ['Articles of association', 'Shareholders’ agreement', 'Contract', 'Terms / T&Cs', 'GDPR / data', 'Intellectual property', 'Minutes', 'Other'],
      escld: ['Articles of association', 'Internal rules', 'Charter', 'Agreement / partnership', 'Contract', 'GDPR / data', 'Intellectual property', 'Other'],
    },
    admin_doc: ['Minutes', 'Meeting notes', 'Declaration / receipt', 'Certificate', 'Insurance', 'Bank', 'Grant', 'Letter', 'Other'],
    entry: {
      auralys: ['Contribution', 'Sales', 'Grant / prize', 'Hosting & tools', 'Marketing', 'Design', 'Legal', 'Bank fees', 'Other'],
      escld: ['Membership fees', 'Grants', 'Donations', 'Partnerships', 'Events', 'Venue & logistics', 'Communication', 'Insurance', 'Bank fees', 'Other'],
    },
    link: ['Tools', 'Legal', 'Administration', 'Communication', 'Product', 'Finance'],
    note: ['Meeting notes', 'Ideas', 'To-do', 'Contacts', 'Other'],
    council: ['Board', 'Law & Institutions', 'Diplomacy & International Relations', 'Europe & Fundamental Rights', 'Communication', 'Partnerships'],
    role: ['President', 'Vice-President', 'Secretary General', 'Treasurer', 'Council lead', 'Team lead', 'Member'],
  };
  const EVENT_TYPES = [
    { value: 'Meeting', color: '#4f6bd8' },
    { value: 'Deadline', color: '#cf4436' },
    { value: 'Event', color: '#23874b' },
    { value: 'Training', color: '#b77a10' },
    { value: 'Other', color: '#7d7d78' },
  ];
  /* Events saved before the English version used French type names. */
  const LEGACY_TYPES = { 'Réunion': 'Meeting', 'Échéance': 'Deadline', 'Évènement': 'Event', 'Formation': 'Training', 'Autre': 'Other' };
  const evType = (c) => LEGACY_TYPES[c] || c || 'Other';
  const evColor = (c) => (EVENT_TYPES.find((t) => t.value === evType(c)) || EVENT_TYPES[4]).color;
  const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  const S = { me: null, items: [], loadedAt: 0, page: 'overview', ui: {} };

  /* ================================================================== data */
  const flat = (i) => Object.assign({}, i.data, { id: i.id, _by: i.created_by, _at: i.created_at, _upd: i.updated_at });
  const rows = (kind) => S.items.filter((i) => i.kind === kind).map(flat);
  const raw = (id) => S.items.find((i) => i.id === id);
  const today = () => N.isoDay();
  const uniq = (arr) => [...new Set(arr.filter(Boolean))];
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many || one + 's'}`;
  const matches = (o, q, keys) => !q || keys.some((k) => String(o[k] || '').toLowerCase().includes(q));
  const signed = (e) => (e.type === 'in' ? 1 : -1) * (Number(e.amount) || 0);
  const monthKey = (s) => String(s || '').slice(0, 7);
  const catsFor = (kind, field, defaults) => uniq([...(defaults || []), ...rows(kind).map((r) => r[field])]);
  const money0 = (n) => (Number(n) % 1 ? fmtMoney(n) : N.fmtMoney0(n));

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
  /* Drops technical fields (_by, id…) before saving. */
  const clean = (o) => { const out = {}; Object.keys(o).forEach((k) => { if (k !== 'id' && k[0] !== '_') out[k] = o[k]; }); return out; };

  async function askDelete(id, what) {
    const ok = await N.confirm({ title: `Delete ${what}?`, text: 'This cannot be undone, for the whole team.', submit: 'Delete' });
    if (!ok) return false;
    try { await remove(id); N.toast('Deleted.'); afterChange(); return true; }
    catch (e) { N.toast(N.humanError(e), 'error'); return false; }
  }

  function afterChange() { updateCounts(); route(); }

  /* ================================================================= shell */
  async function start() {
    if (!P) return N.renderOff();
    const me = await N.boot({ project: PID });
    if (!me) return;
    S.me = me;
    document.title = `${P.name} · Workspace`;
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
        <aside class="card side" id="side" aria-label="Pages of the ${esc(P.name)} workspace">
          <div class="side-head"><span class="pbadge">${esc(P.mark)}</span><div><b>${esc(P.name)}</b><small>${esc(P.tagline)}</small></div></div>
          ${groups.map((g) => `
            <p class="side-label mono">${esc(g.name)}</p>
            <nav class="side-nav">${g.pages.map((k) => `<a class="side-item" href="#${PAGES[k].slug}" data-page="${k}">${icon(PAGES[k].icon)}<span>${esc(PAGES[k].short || PAGES[k].label)}</span><em class="side-count" data-count="${k}"></em></a>`).join('')}</nav>`).join('')}
          <div class="side-foot"><a class="side-item" href="/saas/">${icon('home')}<span>Home</span></a></div>
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
    const slug = decodeURIComponent(location.hash.replace(/^#/, '')) || 'overview';
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

  /* ============================================================= templates */
  function head(title, sub, actions) {
    return `<p class="crumb mono">${esc(P.name)} <span>/</span> ${esc(title)}</p>
      <div class="page-head"><div><h1 class="page-title">${esc(title)}</h1>${sub ? `<p class="page-sub">${sub}</p>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div>`;
  }
  const addBtn = (label, act) => `<button class="btn btn-primary" type="button" data-act="${act || 'add'}">${icon('plus')}${esc(label)}</button>`;
  const empty = (ic, title, text, btn) => `<div class="empty">${icon(ic)}<b>${esc(title)}</b><p>${esc(text)}</p>${btn || ''}</div>`;
  const actions = (id, extra) => `<div class="row-actions">${extra || ''}<button class="icon-btn" type="button" data-act="edit" data-id="${id}" title="Edit" aria-label="Edit">${icon('edit')}</button><button class="icon-btn danger" type="button" data-act="del" data-id="${id}" title="Delete" aria-label="Delete">${icon('trash')}</button></div>`;
  function searchBox(value, ph) { return `<label class="search">${icon('search')}<input type="search" data-search value="${esc(value || '')}" placeholder="${esc(ph || 'Search')}" aria-label="Search"></label>`; }
  function chips(list, current, attr) {
    return `<div class="chips" role="group">${[['', 'All']].concat(list.map((c) => [c, c])).map(([v, l]) => `<button class="chip" type="button" data-${attr}="${esc(v)}" aria-pressed="${String((current || '') === v)}">${esc(l)}</button>`).join('')}</div>`;
  }
  function relDay(s) {
    const d = N.parseDay(s); const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((d - t) / 86400000);
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    if (diff > 1 && diff < 7) return `in ${diff} days`;
    if (diff === -1) return 'yesterday';
    return fmtDate(s, { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function dateBox(s) {
    const d = N.parseDay(s);
    return `<span class="datebox${s === today() ? ' datebox--today' : ''}"><b>${d.getDate()}</b><span>${MONTHS_SHORT[d.getMonth()]}</span></span>`;
  }
  const timeRange = (e) => (e.start ? e.start + (e.end ? '–' + e.end : '') : 'All day');
  /* Content added by others: show the name part of the email. */
  const by = (email) => (email ? (email === S.me.email ? 'you' : email.split('@')[0]) : '');

  /* ===================================================== charts (no library) */
  function niceStep(rawStep) {
    if (rawStep <= 0) return 1;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rawStep) || 10 * mag;
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
  /* Income = filled dots going up; expenses = hollow dots going down. */
  function dotChart(months, maxDots, width) {
    maxDots = maxDots || 7;
    const max = Math.max(0, ...months.map((m) => Math.max(m.inc, m.out)));
    const unit = niceStep(max / maxDots);
    const sp = 11, r = 3.8, W = width || 720, colW = W / months.length, top = 22;
    const H = top + sp * (maxDots * 2 + 1) + 22, base = top + sp * (maxDots + 0.5);
    let svg = `<svg class="dots" viewBox="0 0 ${W} ${H}" role="img" aria-label="Income and expenses over the last ${months.length} months">`;
    svg += `<line class="d-base" x1="0" x2="${W}" y1="${base}" y2="${base}"/>`;
    months.forEach((m, i) => {
      const cx = i * colW + colW / 2;
      const nIn = m.inc > 0 ? Math.max(1, Math.round(m.inc / unit)) : 0;
      const nOut = m.out > 0 ? Math.max(1, Math.round(m.out / unit)) : 0;
      if (m.now) svg += `<g class="d-now"><line x1="${cx}" x2="${cx}" y1="${top - 4}" y2="${H - 18}"/><rect x="${cx - 34}" y="0" width="68" height="15" rx="7.5"/><text x="${cx}" y="10.5" text-anchor="middle">THIS MONTH</text></g>`;
      svg += `<g class="d-col"><title>${esc(`${m.label} ${m.year} — income ${fmtMoney(m.inc)} · expenses ${fmtMoney(m.out)}`)}</title><rect class="d-hit" x="${i * colW}" y="${top}" width="${colW}" height="${H - top - 18}"/>`;
      for (let k = 0; k < Math.min(nIn, maxDots); k++) svg += `<circle class="d-in" cx="${cx}" cy="${base - sp * (k + 1)}" r="${r}"/>`;
      for (let k = 0; k < Math.min(nOut, maxDots); k++) svg += `<circle class="d-out" cx="${cx}" cy="${base + sp * (k + 1)}" r="${r - 0.6}"/>`;
      svg += '</g>';
      svg += `<text class="d-lbl" x="${cx}" y="${H - 4}" text-anchor="middle">${esc(m.label)}</text>`;
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

  /* ========================================================= domain helpers */
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
    if (m.delta == null) return '<span class="badge">1 value</span>';
    if (m.delta === 0) return '<span class="badge">stable</span>';
    const up = m.delta > 0;
    const txt = m.pct != null ? `${up ? '+' : ''}${fmtNum(m.pct.toFixed(1))}%` : `${up ? '+' : ''}${fmtNum(m.delta)}`;
    return `<span class="badge ${up ? 'badge--hl' : 'badge--danger'}">${icon(up ? 'trend-up' : 'trend-down')}${esc(txt)}</span>`;
  }

  /* ================================================================ OVERVIEW */
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
    const recentRaw = S.items.filter((i) => ['note', 'link', 'stat', 'legal', 'admin_doc', 'member', 'entry'].includes(i.kind))
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 5);
    const pageOf = { note: 'notes', link: 'links', stat: 'stats', legal: 'legal', admin_doc: 'admin_docs', member: 'directory', entry: 'accounting' };
    const kindLabel = { note: 'Note', link: 'Link', stat: 'Statistic', legal: 'Legal', admin_doc: 'Administrative', member: 'Member', entry: 'Accounting' };
    const titleOf = (i) => (i.kind === 'note' ? noteTitle(i.data) : i.data.title || i.data.name || i.data.label || i.data.metric || '—');
    const subOf = (i) => {
      const d = i.data;
      if (i.kind === 'note') return d.category || noteExcerpt(d, 80);
      if (i.kind === 'stat') return `${fmtNum(d.value)} ${d.unit || ''} · ${fmtDate(d.date)}`;
      if (i.kind === 'entry') return `${d.type === 'in' ? '+' : '−'}${fmtMoney(d.amount)} · ${fmtDate(d.date)}`;
      if (i.kind === 'link') return N.domainOf(d.url);
      if (i.kind === 'member') return d.role || '';
      return d.category || '';
    };
    const nDocs = docsKinds.reduce((s, k) => s + rows(k).length, 0);

    view.innerHTML = `
      ${head('Overview', esc(N.fmtLong()))}
      <div class="stack">
        <section class="card hero">
          <div class="card-head">
            <h2 class="card-title">Cash</h2>
            <span class="legend mono"><span><i></i>Income</span><span><i class="o"></i>Expenses</span></span>
            <span class="grow"></span>
            <a class="card-link" href="#accounting">Open accounting ${icon('arrow-right')}</a>
          </div>
          <div class="hero-grid">
            <div>
              <div class="hero-big" title="${esc(fmtMoney(bal))}">${esc(N.fmtMoney0(bal))}</div>
              <p class="hero-note">${net === 0 ? '<span class="badge">No movement this month</span>' : `<span class="badge ${net > 0 ? 'badge--hl' : 'badge--danger'}">${net > 0 ? '+' : '−'}${esc(fmtMoney(Math.abs(net)))}</span> this month`}<br>balance as of ${esc(fmtDate(today(), { day: 'numeric', month: 'long' }))}, ${plural(entries.length, 'transaction')}</p>
              <dl class="hero-lines">
                <div><dt>Income this month</dt><dd>${esc(fmtMoney(cur.inc))}</dd></div>
                <div><dt>Expenses this month</dt><dd>${esc(fmtMoney(cur.out))}</dd></div>
                <div><dt>${P.pages.includes('directory') ? 'Members' : 'Documents'}</dt><dd>${P.pages.includes('directory') ? rows('member').length : nDocs}</dd></div>
              </dl>
            </div>
            <div>
              ${entries.length ? chart.svg + `<div class="chart-foot mono"><span>Last 12 months</span><span>1 dot ≈ ${esc(money0(chart.unit))}</span></div>` : empty('wallet', 'No transactions yet', 'Add your income and expenses in Accounting to see the trend here.', '<a class="btn" href="#accounting">Open accounting</a>')}
            </div>
          </div>
          ${soon ? `
            <div class="alert">
              <span class="alert-ico">${icon('calendar')}</span>
              <p><b>${esc(soon.title)}</b> ${esc(relDay(soon.date))} — ${esc(fmtDate(soon.date, { weekday: 'long', day: 'numeric', month: 'long' }))}${soon.start ? ', ' + esc(timeRange(soon)) : ''}${soon.place ? ' · ' + esc(soon.place) : ''}</p>
              <button class="btn btn-primary btn-sm" type="button" data-act="open-ev" data-id="${soon.id}">See details</button>
              <a class="btn btn-quiet btn-sm" href="#calendar">Calendar ${icon('arrow-right')}</a>
            </div>` : ''}
        </section>

        <div class="cols">
          <section class="card pad">
            <div class="card-head"><h2 class="card-title">Upcoming <span class="badge">${up.length}</span></h2><a class="card-link" href="#calendar">Calendar ${icon('arrow-right')}</a></div>
            ${up.length ? `<div class="rows">${up.slice(0, 5).map((e) => `
              <div class="row">
                ${dateBox(e.date)}
                <button class="row-main" type="button" data-act="open-ev" data-id="${e.id}"><b>${esc(e.title)}</b><small>${esc(relDay(e.date))} · ${esc(timeRange(e))}${e.place ? ' · ' + esc(e.place) : ''}</small></button>
                <span class="badge" style="--c:${evColor(e.category)}"><i class="dot"></i>${esc(evType(e.category))}</span>
              </div>`).join('')}</div>` : empty('calendar', 'Nothing planned', 'The next calendar events will show up here.', '<a class="btn" href="#calendar">Add an event</a>').replace('class="empty"', 'class="empty empty--sm"')}
          </section>
          <section class="card pad">
            <div class="card-head"><h2 class="card-title">Recently added</h2></div>
            ${recentRaw.length ? `<div class="stack-list">${recentRaw.map((i) => `
              <a class="mini" href="#${PAGES[pageOf[i.kind]] ? PAGES[pageOf[i.kind]].slug : 'overview'}">
                <span class="mini-top mono">${icon(PAGES[pageOf[i.kind]] ? PAGES[pageOf[i.kind]].icon : 'file')}${esc(kindLabel[i.kind])}<span class="grow"></span><span>${esc(N.ago(i.created_at))}</span></span>
                <b>${esc(titleOf(i))}</b>
                <small>${esc(subOf(i))}${i.created_by ? ' · by ' + esc(by(i.created_by)) : ''}</small>
              </a>`).join('')}</div>` : empty('file', 'Still empty', 'What the team adds will show up here.').replace('class="empty"', 'class="empty empty--sm"')}
          </section>
        </div>

        <section class="card pad">
          <div class="card-head"><h2 class="card-title">Metrics</h2><a class="card-link" href="#statistics">Statistics ${icon('arrow-right')}</a></div>
          ${metrics.length ? `<div class="mgrid" style="margin:0">${metrics.map((m) => metricCard(m)).join('')}</div>` : empty('chart', 'No metrics', 'Add figures (users, followers, members…) with their date and source.', '<a class="btn" href="#statistics">Add a statistic</a>').replace('class="empty"', 'class="empty empty--sm"')}
        </section>
      </div>`;
    view.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'open-ev') openEvent(b.dataset.id);
      if (b.dataset.act === 'metric') { S.ui.stats = Object.assign(S.ui.stats || { q: '' }, { metric: b.dataset.metric }); location.hash = 'statistics'; }
    };
  }

  function metricCard(m, pressed) {
    return `
      <button class="mcard" type="button" data-act="metric" data-metric="${esc(m.name)}"${pressed != null ? ` aria-pressed="${pressed}"` : ''}>
        <span class="mcard-top"><span class="mono">${esc(m.name)}</span>${trendBadge(m)}</span>
        <span class="mcard-val">${esc(fmtNum(m.last.value))}<small>${esc(m.unit)}</small></span>
        ${sparkline(m.list.map((x) => Number(x.value) || 0))}
        <span class="mcard-foot"><span>${esc(fmtDate(m.last.date))}</span><span>${plural(m.list.length, 'record')}</span></span>
      </button>`;
  }

  /* =================================================================== NOTES */
  const noteTitle = (n) => (n.title || '').trim() || String(n.content || '').trim().split('\n')[0].slice(0, 80) || 'Untitled note';
  function noteExcerpt(n, max) {
    let text = String(n.content || '').trim();
    if (!(n.title || '').trim()) text = text.split('\n').slice(1).join('\n').trim(); // first line is already the title
    return max && text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
  }

  function editNote(item) {
    const fields = [
      { name: 'title', label: 'Title', span: 2, placeholder: 'E.g. Board meeting — 12 December' },
      { name: 'content', label: 'Note', type: 'textarea', required: true, span: 2, rows: 14, placeholder: 'Write here: ideas, meeting notes, to-do list…' },
      { name: 'category', label: 'Label', list: catsFor('note', 'category', DEFAULTS.note), placeholder: 'E.g. Meeting notes, Ideas, To-do' },
      { name: 'pinned', label: 'Pin to the top', type: 'checkbox', hint: 'Pinned notes stay above the others.' },
    ];
    return N.formModal({
      title: item ? 'Edit note' : 'New note', kicker: P.name, fields, values: item, wide: true,
      submit: item ? 'Save' : 'Add',
      extra: item ? `<button type="button" class="btn btn-quiet-danger" data-del>${icon('trash')}Delete</button>` : '',
      onOpen: (form, close) => { const d = form.querySelector('[data-del]'); if (d) d.addEventListener('click', () => close('delete')); },
      onSubmit: async (v) => {
        item ? await update(item.id, Object.assign(clean(item), v)) : await create('note', v);
        return 'saved';
      },
    }).then((res) => {
      if (res === 'delete') return askDelete(item.id, 'this note');
      if (res === 'saved') { N.toast(item ? 'Note saved.' : 'Note added.'); afterChange(); }
    });
  }

  function pageNotes(view) {
    const ui = (S.ui.notes = S.ui.notes || { q: '', cat: '' });
    const all = rows('note');
    const cats = uniq(all.map((n) => n.category)).sort((a, b) => a.localeCompare(b, 'en'));
    if (ui.cat && !cats.includes(ui.cat)) ui.cat = '';
    view.innerHTML = `
      ${head('Notes', `${plural(all.length, 'note')} · shared with the ${esc(P.name)} team`, addBtn('New note'))}
      ${all.length ? `<div class="toolbar">${searchBox(ui.q, 'Search notes')}${cats.length ? chips(cats, ui.cat, 'cat') : ''}</div>` : ''}
      <div data-results></div>`;
    const card = (n) => `
      <article class="ncard${n.pinned ? ' is-pinned' : ''}">
        <button class="ncard-pin" type="button" data-act="pin" data-id="${n.id}" aria-pressed="${!!n.pinned}" title="${n.pinned ? 'Unpin' : 'Pin to the top'}" aria-label="${n.pinned ? 'Unpin' : 'Pin to the top'}">${icon('tack')}</button>
        <button class="ncard-body" type="button" data-act="open" data-id="${n.id}">
          <b>${esc(noteTitle(n))}</b>
          ${noteExcerpt(n) ? `<p>${esc(noteExcerpt(n, 700))}</p>` : ''}
        </button>
        <footer class="ncard-foot">${n.category ? `<span class="badge">${esc(n.category)}</span>` : ''}<span class="grow"></span><span>${esc(N.ago(n._upd || n._at))}${n._by ? ' · ' + esc(by(n._by)) : ''}</span></footer>
      </article>`;
    const draw = () => {
      const q = ui.q.toLowerCase();
      const list = all.filter((n) => (!ui.cat || n.category === ui.cat) && matches(n, q, ['title', 'content', 'category']))
        .sort((a, b) => String(b._upd || b._at).localeCompare(String(a._upd || a._at)));
      const pinned = list.filter((n) => n.pinned), others = list.filter((n) => !n.pinned);
      const box = view.querySelector('[data-results]');
      if (!all.length) { box.innerHTML = `<div class="card">${empty('note', 'No notes yet', 'Write down ideas, meeting notes, to-do lists or anything the team should keep at hand. Notes are visible to everyone who has access to this workspace.', addBtn('Write the first note'))}</div>`; return; }
      if (!list.length) { box.innerHTML = `<div class="card">${empty('search', 'No results', 'Try another keyword.')}</div>`; return; }
      box.innerHTML = (pinned.length ? `<section class="group"><h2 class="group-title mono">Pinned <span>${pinned.length}</span></h2><div class="ngrid">${pinned.map(card).join('')}</div></section>` : '') +
        (others.length ? `<section class="group">${pinned.length ? `<h2 class="group-title mono">Others <span>${others.length}</span></h2>` : ''}<div class="ngrid">${others.map(card).join('')}</div></section>` : '');
    };
    draw();
    view.oninput = (e) => { if (e.target.matches('[data-search]')) { ui.q = e.target.value; draw(); } };
    view.onclick = async (e) => {
      const c = e.target.closest('[data-cat]');
      if (c) { ui.cat = c.dataset.cat; view.querySelectorAll('[data-cat]').forEach((x) => x.setAttribute('aria-pressed', String(x === c))); draw(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const n = b.dataset.id ? rows('note').find((x) => x.id === b.dataset.id) : null;
      if (b.dataset.act === 'add') editNote();
      if (b.dataset.act === 'open' && n) editNote(n);
      if (b.dataset.act === 'pin' && n) {
        b.disabled = true;
        try { await update(n.id, Object.assign(clean(n), { pinned: !n.pinned })); N.toast(n.pinned ? 'Note unpinned.' : 'Note pinned.'); afterChange(); }
        catch (ex) { b.disabled = false; N.toast(N.humanError(ex), 'error'); }
      }
    };
  }

  /* ============================================================ USEFUL LINKS */
  function linkFields() {
    return [
      { name: 'title', label: 'Title', required: true, span: 2, placeholder: 'E.g. Supabase dashboard' },
      { name: 'url', label: 'Address', required: true, span: 2, placeholder: 'https://…', inputmode: 'url' },
      { name: 'category', label: 'Category', list: catsFor('link', 'category', DEFAULTS.link), placeholder: 'E.g. Tools' },
      { name: 'description', label: 'Description', placeholder: 'What is this link for?' },
    ];
  }
  function editLink(item) {
    return N.formModal({
      title: item ? 'Edit link' : 'Add a link', kicker: P.name, fields: linkFields(), values: item,
      submit: item ? 'Save' : 'Add',
      onSubmit: async (v) => {
        v.url = N.safeUrl(v.url);
        if (!v.url) throw new Error('Invalid address.');
        item ? await update(item.id, Object.assign(clean(item), v)) : await create('link', v);
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Link updated.' : 'Link added.'); afterChange(); } });
  }

  function pageLinks(view) {
    const ui = (S.ui.links = S.ui.links || { q: '', cat: '' });
    const all = rows('link');
    const cats = uniq(all.map((l) => l.category || 'General')).sort((a, b) => a.localeCompare(b, 'en'));
    if (ui.cat && !cats.includes(ui.cat)) ui.cat = '';
    view.innerHTML = `
      ${head('Useful links', plural(all.length, 'link'), addBtn('Add a link'))}
      ${all.length ? `<div class="toolbar">${searchBox(ui.q, 'Search links')}${cats.length > 1 ? chips(cats, ui.cat, 'cat') : ''}</div>` : ''}
      <div data-results></div>`;
    const draw = () => {
      const q = ui.q.toLowerCase();
      const list = all.filter((l) => (!ui.cat || (l.category || 'General') === ui.cat) && matches(l, q, ['title', 'url', 'description', 'category']))
        .sort((a, b) => a.title.localeCompare(b.title, 'en'));
      const box = view.querySelector('[data-results]');
      if (!all.length) { box.innerHTML = `<div class="card">${empty('link', 'No links yet', 'Gather here the websites, tools and resources the team uses often.', addBtn('Add the first link'))}</div>`; return; }
      if (!list.length) { box.innerHTML = `<div class="card">${empty('search', 'No results', 'Try another keyword.')}</div>`; return; }
      const groups = uniq(list.map((l) => l.category || 'General')).sort((a, b) => a.localeCompare(b, 'en'));
      box.innerHTML = groups.map((g) => {
        const items = list.filter((l) => (l.category || 'General') === g);
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
      if (b.dataset.act === 'del') askDelete(b.dataset.id, 'this link');
    };
  }

  /* ============================================================== STATISTICS */
  function editStat(item, preset) {
    const fields = [
      { name: 'metric', label: 'Metric', required: true, span: 2, list: uniq(rows('stat').map((s) => s.metric)), placeholder: 'E.g. Active users, Instagram followers…' },
      { name: 'value', label: 'Value', type: 'number', step: 'any', required: true },
      { name: 'unit', label: 'Unit', list: uniq(rows('stat').map((s) => s.unit)), placeholder: 'E.g. users, %, €' },
      { name: 'date', label: 'Date of the figure', type: 'date', required: true, value: today() },
      { name: 'source', label: 'Source', placeholder: 'Link to the original page', inputmode: 'url' },
      { name: 'comment', label: 'Comment', type: 'textarea', span: 2, placeholder: 'Context, reason for a rise or a drop…' },
    ];
    return N.formModal({
      title: item ? 'Edit statistic' : 'Add a statistic', kicker: P.name, fields, values: item || preset,
      submit: item ? 'Save' : 'Add',
      onSubmit: async (v) => {
        v.source = v.source ? N.safeUrl(v.source) : '';
        item ? await update(item.id, Object.assign(clean(item), v)) : await create('stat', v);
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Statistic updated.' : 'Statistic added.'); afterChange(); } });
  }

  function pageStats(view) {
    const ui = (S.ui.stats = S.ui.stats || { metric: '', q: '' });
    const ms = metricsSummary();
    if (ui.metric && !ms.find((m) => m.name === ui.metric)) ui.metric = '';
    const all = rows('stat');
    view.innerHTML = `
      ${head('Statistics', `${plural(ms.length, 'metric')} · ${plural(all.length, 'record')}`, `${all.length ? `<button class="btn" type="button" data-act="csv">${icon('download')}Export</button>` : ''}${addBtn('Add a statistic')}`)}
      ${ms.length ? `<div class="mgrid">${ms.map((m) => metricCard(m, ui.metric === m.name)).join('')}</div>` : ''}
      <section class="card pad">
        ${all.length ? `<div class="card-head"><h2 class="card-title">History${ui.metric ? ` · ${esc(ui.metric)} <button class="btn btn-quiet btn-sm" type="button" data-act="clear">${icon('x')}Show all</button>` : ''}</h2>${searchBox(ui.q, 'Search comments')}</div>` : ''}
        <div data-results></div>
      </section>`;
    const draw = () => {
      const q = ui.q.toLowerCase();
      const list = all.filter((s) => (!ui.metric || s.metric === ui.metric) && matches(s, q, ['metric', 'comment', 'source', 'unit']))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      const box = view.querySelector('[data-results]');
      if (!all.length) { box.innerHTML = empty('chart', 'No statistics', 'Record here the figures found online or tracked by the team, with their date, source and a comment.', addBtn('Add the first statistic')); return; }
      if (!list.length) { box.innerHTML = empty('search', 'No results', 'Try another keyword.').replace('class="empty"', 'class="empty empty--sm"'); return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Metric</th><th class="r">Value</th><th>Source</th><th>Comment</th><th></th></tr></thead>
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
      if (a === 'del') askDelete(b.dataset.id, 'this record');
      if (a === 'csv') N.download(`${PID}-statistics-${today()}.csv`, N.csv(all.sort((x, y) => String(y.date).localeCompare(String(x.date))), [
        { label: 'Date', key: 'date' }, { label: 'Metric', key: 'metric' }, { label: 'Value', key: 'value' }, { label: 'Unit', key: 'unit' }, { label: 'Source', key: 'source' }, { label: 'Comment', key: 'comment' },
      ]), 'text/csv;charset=utf-8');
    };
  }

  /* ================================================================ CALENDAR */
  function editEvent(item, presetDate) {
    const fields = [
      { name: 'title', label: 'Title', required: true, span: 2, placeholder: 'E.g. Board meeting' },
      { name: 'date', label: 'Date', type: 'date', required: true, value: presetDate || today() },
      { name: 'end_date', label: 'End date', type: 'date', hint: 'For a multi-day event' },
      { name: 'start', label: 'Start time', type: 'time' },
      { name: 'end', label: 'End time', type: 'time' },
      { name: 'category', label: 'Type', type: 'select', options: EVENT_TYPES.map((t) => t.value), value: 'Meeting' },
      { name: 'place', label: 'Place', placeholder: 'Address or video link' },
      { name: 'description', label: 'Notes', type: 'textarea', span: 2, placeholder: 'Agenda, participants…' },
    ];
    const values = item ? Object.assign({}, item, { category: evType(item.category) }) : null;
    return N.formModal({
      title: item ? 'Edit event' : 'New event', kicker: P.name, fields, values,
      submit: item ? 'Save' : 'Add',
      onSubmit: async (v) => {
        if (v.end_date && v.end_date < v.date) throw new Error('The end date is before the start date.');
        if (v.end_date === v.date) v.end_date = '';
        item ? await update(item.id, Object.assign(clean(item), v)) : await create('event', v);
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Event updated.' : 'Event added.'); afterChange(); } });
  }

  async function openEvent(id) {
    const e = rows('event').find((x) => x.id === id);
    if (!e) return;
    const isUrl = /^https?:\/\//i.test(e.place || '');
    const when = e.end_date
      ? `From ${fmtDate(e.date, { weekday: 'long', day: 'numeric', month: 'long' })} to ${fmtDate(e.end_date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`
      : fmtDate(e.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    const res = await N.modal({
      title: e.title, kicker: evType(e.category), small: true, noFocus: true,
      body: `<div class="ev-detail">
        <div class="ev-line">${icon('calendar')}<span>${esc(when)}</span></div>
        <div class="ev-line">${icon('clock')}<span>${esc(timeRange(e))}</span></div>
        ${e.place ? `<div class="ev-line">${icon('pin')}<span>${isUrl ? `<a class="src" style="font-size:13px" href="${esc(N.safeUrl(e.place))}" target="_blank" rel="noopener noreferrer">${esc(N.domainOf(e.place))}${icon('arrow-up-right')}</a>` : esc(e.place)}</span></div>` : ''}
        ${e.description ? `<div class="ev-notes">${esc(e.description)}</div>` : ''}
        <p class="muted" style="font-size:12px">Added ${esc(N.ago(e._at))}${e._by ? ' by ' + esc(by(e._by)) : ''}</p>
      </div>`,
      extra: `<button type="button" class="btn btn-quiet-danger" data-del>${icon('trash')}Delete</button>`,
      cancel: 'Close', submit: 'Edit',
      onSubmit: () => 'edit',
      onOpen: (form, close) => form.querySelector('[data-del]').addEventListener('click', () => close('delete')),
    });
    if (res === 'edit') editEvent(e);
    if (res === 'delete') askDelete(e.id, 'this event');
  }

  /* On a phone: tapping a day that has events lists them first. */
  async function openDay(day, list) {
    const res = await N.modal({
      title: fmtDate(day, { weekday: 'long', day: 'numeric', month: 'long' }), kicker: 'Calendar', small: true, noFocus: true,
      body: `<div class="rows">${list.map((e) => `
        <div class="row" style="grid-template-columns:auto minmax(0,1fr)">
          <span class="ev-dot" style="--c:${evColor(e.category)}"></span>
          <button class="row-main" type="button" data-open="${e.id}"><b>${esc(e.title)}</b><small>${esc(timeRange(e))}${e.place ? ' · ' + esc(e.place) : ''}</small></button>
        </div>`).join('')}</div>`,
      cancel: 'Close', submit: 'Add an event',
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
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nova//Private workspace//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${escT(P.name)}`];
    rows('event').forEach((e) => {
      lines.push('BEGIN:VEVENT', `UID:${e.id}@nova-workspace`, `DTSTAMP:${stamp}`);
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
      if (e.category) lines.push(`CATEGORIES:${escT(evType(e.category))}`);
      lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    N.download(`${PID}-calendar.ics`, lines.join('\r\n'), 'text/calendar;charset=utf-8');
  }

  function pageCalendar(view) {
    const t = new Date();
    const ui = (S.ui.cal = S.ui.cal || { y: t.getFullYear(), m: t.getMonth(), mode: 'month', past: false });
    const evs = rows('event');
    const up = upcoming();
    const monthName = new Date(ui.y, ui.m, 1).toLocaleDateString(N.LOCALE, { month: 'long', year: 'numeric' });
    view.innerHTML = `
      ${head('Calendar', `${plural(up.length, 'upcoming event')}`, `${evs.length ? `<button class="btn" type="button" data-act="ics" title="File to import into Apple Calendar, Google Calendar, Outlook…">${icon('download')}Export (.ics)</button>` : ''}${addBtn('New event')}`)}
      <div class="cols cols--side">
        <section class="card pad">
          <div class="cal-bar">
            <button class="icon-btn" type="button" data-act="prev" aria-label="Previous month">${icon('chevron-left')}</button>
            <h2 class="cal-month" aria-live="polite">${esc(ui.mode === 'month' ? monthName : 'All events')}</h2>
            <button class="icon-btn" type="button" data-act="next" aria-label="Next month">${icon('chevron-right')}</button>
            <button class="btn btn-sm" type="button" data-act="today">Today</button>
            <span class="grow"></span>
            <div class="seg" role="group" aria-label="View">
              <button type="button" data-mode="month" aria-pressed="${ui.mode === 'month'}">${icon('calendar')}Month</button>
              <button type="button" data-mode="list" aria-pressed="${ui.mode === 'list'}">${icon('list')}List</button>
            </div>
          </div>
          ${ui.mode === 'month' ? monthGrid(ui, evs) : listView(ui, evs)}
        </section>
        <aside class="card pad">
          <div class="card-head"><h2 class="card-title">Upcoming</h2></div>
          ${up.length ? `<div class="rows">${up.slice(0, 8).map((e) => `
            <div class="row" style="grid-template-columns:auto minmax(0,1fr)">
              ${dateBox(e.date)}
              <button class="row-main" type="button" data-act="open" data-id="${e.id}"><b>${esc(e.title)}</b><small><i class="dot" style="--c:${evColor(e.category)};margin-right:6px"></i>${esc(relDay(e.date))} · ${esc(timeRange(e))}</small></button>
            </div>`).join('')}</div>` : `<div class="empty empty--sm">${icon('calendar')}<b>Nothing planned</b><p>Click a day to add an event.</p></div>`}
        </aside>
      </div>`;
    if (ui.mode === 'list') view.querySelectorAll('[data-act=prev],[data-act=next],[data-act=today]').forEach((b) => { b.hidden = true; });
    view.onclick = (e) => {
      const md = e.target.closest('[data-mode]');
      if (md) { ui.mode = md.dataset.mode; route(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
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
    };
  }

  function monthGrid(ui, evs) {
    const first = new Date(ui.y, ui.m, 1);
    const offset = (first.getDay() + 6) % 7; // Monday = 0
    const start = new Date(ui.y, ui.m, 1 - offset);
    const daysInMonth = new Date(ui.y, ui.m + 1, 0).getDate();
    const weeks = Math.ceil((offset + daysInMonth) / 7);
    const t = today();
    let html = '<div class="cal-grid">' + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < weeks * 7; i++) {
      const d = new Date(start); d.setDate(start.getDate() + i);
      const iso = N.isoDay(d);
      const list = eventsOn(iso, evs);
      const cls = ['cal-day', d.getMonth() !== ui.m ? 'is-other' : '', iso === t ? 'is-today' : '', i % 7 >= 5 ? 'is-weekend' : ''].filter(Boolean).join(' ');
      html += `<div class="${cls}" data-act="day" data-day="${iso}" role="button" tabindex="0" aria-label="${esc(fmtDate(iso, { weekday: 'long', day: 'numeric', month: 'long' }))}${list.length ? ', ' + plural(list.length, 'event') : ''} — add">
        <span class="cal-num">${d.getDate()}</span>
        ${list.slice(0, 3).map((e) => `<button class="cal-ev" type="button" data-act="open" data-id="${e.id}" style="--c:${evColor(e.category)}" title="${esc(e.title)}">${e.start && e.date === iso ? `<time>${esc(e.start)}</time>` : ''}<span>${esc(e.title)}</span></button>`).join('')}
        ${list.length > 3 ? `<span class="cal-more">+${list.length - 3} more</span>` : ''}
      </div>`;
    }
    return html + '</div>';
  }

  function listView(ui, evs) {
    const t = today();
    const list = evs.filter((e) => ui.past || (e.end_date || e.date) >= t).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || '')));
    const toggle = `<button class="btn btn-quiet btn-sm" type="button" data-act="past">${ui.past ? 'Hide' : 'Show'} past events</button>`;
    if (!list.length) return `<div class="empty empty--sm">${icon('calendar')}<b>No events</b>${evs.length ? toggle : ''}</div>`;
    const months = uniq(list.map((e) => monthKey(e.date)));
    return months.map((mk) => {
      const [y, m] = mk.split('-').map(Number);
      return `<h3 class="group-title mono" style="margin-top:18px">${esc(new Date(y, m - 1, 1).toLocaleDateString(N.LOCALE, { month: 'long', year: 'numeric' }))}</h3>
        <div class="rows">${list.filter((e) => monthKey(e.date) === mk).map((e) => `
          <div class="row"${(e.end_date || e.date) < t ? ' style="opacity:.55"' : ''}>
            ${dateBox(e.date)}
            <button class="row-main" type="button" data-act="open" data-id="${e.id}"><b>${esc(e.title)}</b><small>${esc(timeRange(e))}${e.place ? ' · ' + esc(e.place) : ''}${e.end_date ? ' · until ' + esc(fmtDate(e.end_date, { day: 'numeric', month: 'short' })) : ''}</small></button>
            <span class="badge" style="--c:${evColor(e.category)}"><i class="dot"></i>${esc(evType(e.category))}</span>
          </div>`).join('')}</div>`;
    }).join('') + `<div style="margin-top:14px">${toggle}</div>`;
  }

  /* =============================================================== DOCUMENTS */
  const DOC_META = {
    legal: { title: 'Legal documents', one: 'legal document', icon: 'scale', intro: 'Articles of association, contracts, terms, intellectual property… Files are stored privately; you can also point to a private GitHub repository or a Drive.' },
    admin_doc: { title: 'Administrative documents', one: 'administrative document', icon: 'folder', intro: 'Minutes, meeting notes, certificates, letters… Uploaded file or external link (GitHub, Drive…).' },
  };
  function fileBadge(d) {
    if (d.file) {
      const ext = (d.file.name.split('.').pop() || '').slice(0, 4).toUpperCase();
      return `<span class="ftype">${esc(ext || 'FILE')}</span>`;
    }
    return `<span class="ftype">${icon(/github\.com/i.test(d.link || '') ? 'globe' : 'link')}</span>`;
  }

  function editDoc(kind, item) {
    const defaults = kind === 'legal' ? DEFAULTS.legal[PID] || DEFAULTS.legal.escld : DEFAULTS.admin_doc;
    const fields = [
      { name: 'title', label: 'Document title', required: true, span: 2, placeholder: kind === 'legal' ? 'E.g. Updated articles of association' : 'E.g. General assembly minutes' },
      { name: 'category', label: 'Category', list: catsFor(kind, 'category', defaults), placeholder: 'Choose or type' },
      { name: 'date', label: 'Document date', type: 'date', value: today() },
      { name: 'source', label: 'Where is the document?', type: 'segment', span: 2, value: item ? (item.file ? 'file' : 'link') : 'file', options: [{ value: 'file', label: 'Upload a file', icon: 'upload' }, { value: 'link', label: 'External link', icon: 'link' }] },
      { name: 'file', label: 'File', type: 'file', span: 2, showIf: 'source=file', optional: false, current: item && item.file ? `${item.file.name} (${N.fmtSize(item.file.size)})` : '', hint: 'PDF, Word, image… 50 MB maximum. Private storage, visible only to members of this workspace.' },
      { name: 'link', label: 'Link', span: 2, showIf: 'source=link', optional: false, placeholder: 'https://github.com/… or https://drive.google.com/…', inputmode: 'url', hint: 'GitHub (private repository), Google Drive, Dropbox, OneDrive…' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2, placeholder: 'Version, signatories, where the original is kept…' },
    ];
    return N.formModal({
      title: item ? 'Edit document' : 'Add a document', kicker: DOC_META[kind].title, fields, values: item,
      submit: item ? 'Save' : 'Add',
      onSubmit: async (v) => {
        const data = Object.assign(item ? clean(item) : {}, { title: v.title, category: v.category, date: v.date, notes: v.notes, source: v.source });
        const oldPath = item && item.file ? item.file.path : null;
        if (v.source === 'file') {
          if (v.file) {
            if (v.file.size > 50 * 1048576) throw new Error('File too large (50 MB maximum).');
            const path = await N.api.upload(PID, kind, v.file);
            data.file = { path, name: v.file.name, size: v.file.size, type: v.file.type };
          } else if (!oldPath) throw new Error('Choose a file to upload.');
          delete data.link;
        } else {
          data.link = N.safeUrl(v.link);
          if (!data.link) throw new Error('Enter a valid link.');
          delete data.file;
        }
        item ? await update(item.id, data) : await create(kind, data);
        if (oldPath && (!data.file || data.file.path !== oldPath)) N.api.removeFile(oldPath).catch(() => {});
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Document updated.' : 'Document added.'); afterChange(); } });
  }

  function pageDocs(view, kind) {
    const meta = DOC_META[kind];
    const key = 'docs-' + kind;
    const ui = (S.ui[key] = S.ui[key] || { q: '', cat: '' });
    const all = rows(kind);
    const cats = uniq(all.map((d) => d.category || 'Uncategorised')).sort((a, b) => a.localeCompare(b, 'en'));
    if (ui.cat && !cats.includes(ui.cat)) ui.cat = '';
    view.innerHTML = `
      ${head(meta.title, plural(all.length, 'document'), addBtn('Add a document'))}
      <section class="card pad">
        ${all.length ? `<div class="toolbar">${searchBox(ui.q, 'Search documents')}${cats.length > 1 ? chips(cats, ui.cat, 'cat') : ''}</div>` : ''}
        <div data-results></div>
      </section>`;
    const draw = () => {
      const q = ui.q.toLowerCase();
      const list = all.filter((d) => (!ui.cat || (d.category || 'Uncategorised') === ui.cat) && matches(d, q, ['title', 'category', 'notes']))
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || a.title.localeCompare(b.title, 'en'));
      const box = view.querySelector('[data-results]');
      if (!all.length) { box.innerHTML = empty(meta.icon, `No ${meta.one} yet`, meta.intro, addBtn('Add the first document')); return; }
      if (!list.length) { box.innerHTML = empty('search', 'No results', 'Try another keyword.').replace('class="empty"', 'class="empty empty--sm"'); return; }
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Document</th><th>Category</th><th>Date</th><th>Location</th><th>Added</th><th></th></tr></thead>
        <tbody>${list.map((d) => `<tr>
          <td><div class="cell-main">${fileBadge(d)}<span><b>${esc(d.title)}</b>${d.notes ? `<small>${esc(d.notes)}</small>` : ''}</span></div></td>
          <td>${d.category ? `<span class="badge">${esc(d.category)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="nowrap">${d.date ? esc(fmtDate(d.date)) : '<span class="muted">—</span>'}</td>
          <td class="nowrap muted">${d.file ? `File · ${esc(N.fmtSize(d.file.size))}` : esc(N.domainOf(d.link))}</td>
          <td class="nowrap muted">${esc(N.ago(d._at))}${d._by ? `<br><small>by ${esc(by(d._by))}</small>` : ''}</td>
          <td class="r">${actions(d.id, `<button class="btn btn-sm" type="button" data-act="open" data-id="${d.id}">${icon(d.file ? 'eye' : 'arrow-up-right')}Open</button>`)}</td>
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
      if (b.dataset.act === 'del' && d) askDelete(d.id, 'this document');
      if (b.dataset.act === 'open' && d) { N.api.logOpen(PID, kind, d.title); d.file ? N.openFile(d.file.path) : N.openLink(d.link); }
    };
  }

  /* ============================================================== ACCOUNTING */
  function editEntry(item) {
    const fields = [
      { name: 'type', label: 'Transaction type', type: 'segment', span: 2, value: 'out', options: [{ value: 'out', label: 'Expense', icon: 'trend-down' }, { value: 'in', label: 'Income', icon: 'trend-up' }] },
      { name: 'label', label: 'Description', required: true, span: 2, placeholder: 'E.g. Server hosting — November' },
      { name: 'amount', label: 'Amount (€)', type: 'number', step: '0.01', min: '0', required: true, placeholder: '0.00' },
      { name: 'date', label: 'Date', type: 'date', required: true, value: today() },
      { name: 'category', label: 'Category', list: catsFor('entry', 'category', DEFAULTS.entry[PID] || DEFAULTS.entry.escld), placeholder: 'Choose or type' },
      { name: 'method', label: 'Payment method', type: 'select', value: 'Bank transfer', options: ['Bank transfer', 'Card', 'Direct debit', 'Cheque', 'Cash', 'Online payment', 'Other'] },
      { name: 'file', label: 'Receipt', type: 'file', span: 2, current: item && item.file ? `${item.file.name} (${N.fmtSize(item.file.size)})` : '', hint: 'Invoice, receipt, ticket… (PDF or photo)' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 },
    ];
    return N.formModal({
      title: item ? 'Edit transaction' : 'New transaction', kicker: 'Accounting', fields, values: item,
      submit: item ? 'Save' : 'Add',
      onSubmit: async (v) => {
        if (!(v.amount > 0)) throw new Error('The amount must be greater than zero.');
        const data = Object.assign(item ? clean(item) : {}, { type: v.type, label: v.label, amount: Math.round(v.amount * 100) / 100, date: v.date, category: v.category, method: v.method, notes: v.notes });
        const oldPath = item && item.file ? item.file.path : null;
        if (v.file) {
          const path = await N.api.upload(PID, 'entry', v.file);
          data.file = { path, name: v.file.name, size: v.file.size, type: v.file.type };
        }
        item ? await update(item.id, data) : await create('entry', data);
        if (oldPath && data.file && data.file.path !== oldPath) N.api.removeFile(oldPath).catch(() => {});
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Transaction updated.' : 'Transaction added.'); afterChange(); } });
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
    const periodLabel = ui.period === 'all' ? 'since the start' : ui.period === 'year' ? `in ${ui.year}` : 'this month';
    const cats = uniq(period.map((e) => e.category || 'Uncategorised')).sort((a, b) => a.localeCompare(b, 'en'));
    if (ui.cat && !cats.includes(ui.cat)) ui.cat = '';

    view.innerHTML = `
      ${head('Accounting', `Current balance: <b style="color:var(--ink)">${esc(fmtMoney(bal))}</b>`, `${all.length ? `<button class="btn" type="button" data-act="csv">${icon('download')}Export</button>` : ''}${addBtn('New transaction')}`)}
      <div class="stack">
        <div class="toolbar" style="margin:0">
          <div class="seg" role="group" aria-label="Period">
            <button type="button" data-period="month" aria-pressed="${ui.period === 'month'}">This month</button>
            <button type="button" data-period="year" aria-pressed="${ui.period === 'year'}">Year</button>
            <button type="button" data-period="all" aria-pressed="${ui.period === 'all'}">All</button>
          </div>
          ${ui.period === 'year' ? `<div class="seg" role="group" aria-label="Year">${years.map((y) => `<button type="button" data-year="${y}" aria-pressed="${String(ui.year) === y}">${y}</button>`).join('')}</div>` : ''}
        </div>
        <div class="kpis">
          <div class="card kpi"><p class="kpi-label mono">${icon('wallet')}Balance</p><p class="kpi-value ${bal < 0 ? 'neg' : ''}">${esc(fmtMoney(bal))}</p><p class="kpi-foot">all transactions</p></div>
          <div class="card kpi"><p class="kpi-label mono">${icon('trend-up')}Income</p><p class="kpi-value pos">${esc(fmtMoney(inc))}</p><p class="kpi-foot">${esc(periodLabel)}</p></div>
          <div class="card kpi"><p class="kpi-label mono">${icon('trend-down')}Expenses</p><p class="kpi-value">${esc(fmtMoney(out))}</p><p class="kpi-foot">${esc(periodLabel)}</p></div>
          <div class="card kpi"><p class="kpi-label mono">${icon('chart')}Net result</p><p class="kpi-value ${inc - out < 0 ? 'neg' : 'pos'}">${inc - out > 0 ? '+' : ''}${esc(fmtMoney(inc - out))}</p><p class="kpi-foot">${plural(period.length, 'transaction')}</p></div>
        </div>
        ${all.length ? `
          <section class="card pad">
            <div class="card-head"><h2 class="card-title">Last 12 months</h2><span class="legend mono"><span><i></i>Income</span><span><i class="o"></i>Expenses</span></span></div>
            ${chart.svg}
            <div class="chart-foot mono"><span>Hover over a column for details</span><span>1 dot ≈ ${esc(money0(chart.unit))}</span></div>
          </section>` : ''}
        <section class="card pad">
          ${all.length ? `<div class="toolbar">
            ${searchBox(ui.q, 'Search transactions')}
            <div class="seg" role="group" aria-label="Type">
              <button type="button" data-type="" aria-pressed="${ui.type === ''}">All</button>
              <button type="button" data-type="in" aria-pressed="${ui.type === 'in'}">Income</button>
              <button type="button" data-type="out" aria-pressed="${ui.type === 'out'}">Expenses</button>
            </div>
            ${cats.length > 1 ? `<select class="chip" data-catsel aria-label="Category" style="padding-right:12px"><option value="">All categories</option>${cats.map((c) => `<option${c === ui.cat ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select>` : ''}
          </div>` : ''}
          <div data-results></div>
        </section>
      </div>`;

    const draw = () => {
      const q = ui.q.toLowerCase();
      const list = period.filter((e) => (!ui.type || e.type === ui.type) && (!ui.cat || (e.category || 'Uncategorised') === ui.cat) && matches(e, q, ['label', 'category', 'notes', 'method']))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b._at).localeCompare(String(a._at)));
      const box = view.querySelector('[data-results]');
      if (!all.length) { box.innerHTML = empty('wallet', 'No transactions', 'Record income and expenses with their receipts. The balance and charts update automatically.', addBtn('Add the first transaction')); return; }
      if (!list.length) { box.innerHTML = empty('search', 'No transactions for this selection', 'Change the period or the filters.').replace('class="empty"', 'class="empty empty--sm"'); return; }
      const total = list.reduce((s, e) => s + signed(e), 0);
      box.innerHTML = `<div class="table-wrap"><table class="table">
        <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Method</th><th class="r">Amount</th><th></th></tr></thead>
        <tbody>${list.map((e) => `<tr>
          <td class="nowrap">${esc(fmtDate(e.date))}</td>
          <td><div class="cell-main" style="min-width:180px"><span><b>${esc(e.label)}</b>${e.notes ? `<small>${esc(e.notes)}</small>` : ''}</span></div></td>
          <td>${e.category ? `<span class="badge">${esc(e.category)}</span>` : '<span class="muted">—</span>'}</td>
          <td class="nowrap muted">${esc(e.method || '')}</td>
          <td class="r"><span class="amount ${e.type === 'in' ? 'in' : ''}">${e.type === 'in' ? '+' : '−'}${esc(fmtMoney(e.amount))}</span></td>
          <td class="r">${actions(e.id, e.file ? `<button class="icon-btn" type="button" data-act="file" data-id="${e.id}" title="View the receipt" aria-label="View the receipt">${icon('file')}</button>` : '')}</td>
        </tr>`).join('')}</tbody>
        <tfoot><tr><td colspan="4">Selection total · ${plural(list.length, 'transaction')}</td><td class="r"><span class="amount ${total >= 0 ? 'in' : ''}">${total >= 0 ? '+' : '−'}${esc(fmtMoney(Math.abs(total)))}</span></td><td></td></tr></tfoot>
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
      if (b.dataset.act === 'del' && it) askDelete(it.id, 'this transaction');
      if (b.dataset.act === 'file' && it && it.file) { N.api.logOpen(PID, 'entry', `Receipt — ${it.label}`); N.openFile(it.file.path); }
      if (b.dataset.act === 'csv') N.download(`${PID}-accounting-${today()}.csv`, N.csv(all.slice().sort((a, c) => String(a.date).localeCompare(String(c.date))), [
        { label: 'Date', key: 'date' }, { label: 'Type', get: (r) => (r.type === 'in' ? 'Income' : 'Expense') }, { label: 'Description', key: 'label' },
        { label: 'Category', key: 'category' }, { label: 'Payment method', key: 'method' },
        { label: 'Amount (€)', get: (r) => signed(r).toFixed(2) }, { label: 'Receipt', get: (r) => (r.file ? r.file.name : '') }, { label: 'Notes', key: 'notes' },
      ]), 'text/csv;charset=utf-8');
    };
  }

  /* =============================================================== DIRECTORY */
  function editMember(item) {
    const fields = [
      { name: 'name', label: 'First and last name', required: true, span: 2 },
      { name: 'role', label: 'Role', list: catsFor('member', 'role', DEFAULTS.role), placeholder: 'E.g. Member, Treasurer…' },
      { name: 'council', label: 'Council / team', list: catsFor('member', 'council', DEFAULTS.council), placeholder: 'Choose or type' },
      { name: 'email', label: 'Email', type: 'email', autocomplete: 'off' },
      { name: 'phone', label: 'Phone', type: 'tel' },
      { name: 'school', label: 'University / city' },
      { name: 'since', label: 'Member since', type: 'date' },
      { name: 'linkedin', label: 'LinkedIn profile', span: 2, placeholder: 'https://www.linkedin.com/in/…', inputmode: 'url' },
      { name: 'exec', label: 'Executive board member', type: 'checkbox', span: 2, hint: 'Also appears in the "Executive board" tab.' },
      { name: 'exec_order', label: 'Order on the board', type: 'number', min: 1, showIf: 'exec=on', hint: '1 = shown first' },
      { name: 'notes', label: 'Notes', type: 'textarea', span: 2, rows: 2 },
    ];
    return N.formModal({
      title: item ? 'Edit member' : 'Add a member', kicker: 'Directory', fields, values: item,
      submit: item ? 'Save' : 'Add',
      onSubmit: async (v) => {
        v.linkedin = v.linkedin ? N.safeUrl(v.linkedin) : '';
        if (!v.exec) v.exec_order = null;
        item ? await update(item.id, Object.assign(clean(item), v)) : await create('member', v);
      },
    }).then((ok) => { if (ok) { N.toast(item ? 'Profile updated.' : 'Member added.'); afterChange(); } });
  }

  function pageDirectory(view) {
    const ui = (S.ui.dir = S.ui.dir || { tab: 'all', q: '', council: '' });
    const all = rows('member').sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const exec = all.filter((m) => m.exec).sort((a, b) => (a.exec_order || 99) - (b.exec_order || 99) || a.name.localeCompare(b.name, 'en'));
    const councils = uniq(all.map((m) => m.council)).sort((a, b) => a.localeCompare(b, 'en'));
    if (ui.council && !councils.includes(ui.council)) ui.council = '';
    view.innerHTML = `
      ${head('Directory', `${plural(all.length, 'member')} · ${exec.length} on the executive board`, `${all.length ? `<button class="btn" type="button" data-act="csv">${icon('download')}Export</button>` : ''}${addBtn('Add a member')}`)}
      <div class="toolbar">
        <div class="seg" role="group" aria-label="View">
          <button type="button" data-tab="all" aria-pressed="${ui.tab === 'all'}">${icon('users')}All members <em>${all.length}</em></button>
          <button type="button" data-tab="exec" aria-pressed="${ui.tab === 'exec'}">${icon('star')}Executive board <em>${exec.length}</em></button>
        </div>
        ${all.length ? searchBox(ui.q, 'Search members') : ''}
      </div>
      ${ui.tab === 'all' && councils.length > 1 ? `<div class="toolbar">${chips(councils, ui.council, 'council')}</div>` : ''}
      <div data-results></div>`;
    const draw = () => {
      const q = ui.q.toLowerCase();
      const keys = ['name', 'role', 'council', 'email', 'school', 'phone'];
      const box = view.querySelector('[data-results]');
      if (!all.length) { box.innerHTML = `<div class="card">${empty('users', 'The directory is empty', 'Add the association’s members with their role, council and contact details. Tick "executive board" for board members.', addBtn('Add the first member'))}</div>`; return; }
      if (ui.tab === 'exec') {
        const list = exec.filter((m) => matches(m, q, keys));
        if (!exec.length) { box.innerHTML = `<div class="card">${empty('star', 'Nobody on the executive board', 'Open a member’s profile and tick "Executive board member".')}</div>`; return; }
        if (!list.length) { box.innerHTML = `<div class="card">${empty('search', 'No results', 'Try another name.')}</div>`; return; }
        box.innerHTML = `<div class="pgrid">${list.map((m) => `
          <article class="pcard">
            <span class="avatar avatar--lg">${esc(N.initials(m.name))}</span>
            <h3>${esc(m.name)}</h3>
            <p class="role">${esc(m.role || 'Executive board')}</p>
            <small>${esc([m.council !== 'Board' && m.council !== 'Bureau' ? m.council : '', m.school].filter(Boolean).join(' · '))}</small>
            <div class="pcard-links">
              ${m.email ? `<a class="btn btn-sm" href="mailto:${esc(m.email)}">${icon('mail')}Email</a>` : ''}
              ${m.phone ? `<a class="btn btn-sm" href="tel:${esc(m.phone.replace(/\s+/g, ''))}">${icon('phone')}Call</a>` : ''}
              ${m.linkedin ? `<a class="btn btn-sm" href="${esc(N.safeUrl(m.linkedin))}" target="_blank" rel="noopener noreferrer">in</a>` : ''}
            </div>
            ${actions(m.id)}
          </article>`).join('')}</div>`;
        return;
      }
      const list = all.filter((m) => (!ui.council || m.council === ui.council) && matches(m, q, keys));
      if (!list.length) { box.innerHTML = `<div class="card">${empty('search', 'No results', 'Try another name or filter.')}</div>`; return; }
      box.innerHTML = `<section class="card pad"><div class="table-wrap"><table class="table">
        <thead><tr><th>Member</th><th>Council / team</th><th>Contact</th><th>University / city</th><th>Since</th><th></th></tr></thead>
        <tbody>${list.map((m) => `<tr>
          <td><div class="who"><span class="avatar avatar--sm">${esc(N.initials(m.name))}</span><span><b>${esc(m.name)}${m.exec ? `<svg class="exec-star" viewBox="0 0 24 24" aria-label="Executive board"><path d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.5-5.1-2.7-5 2.7.9-5.5-4-4 5.6-.8Z"/></svg>` : ''}</b><small>${esc(m.role || 'Member')}</small></span></div></td>
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
      if (b.dataset.act === 'del' && m) askDelete(m.id, `${m.name}’s profile`);
      if (b.dataset.act === 'csv') N.download(`${PID}-directory-${today()}.csv`, N.csv(all, [
        { label: 'Name', key: 'name' }, { label: 'Role', key: 'role' }, { label: 'Council / team', key: 'council' }, { label: 'Executive board', get: (r) => (r.exec ? 'Yes' : '') },
        { label: 'Email', key: 'email' }, { label: 'Phone', key: 'phone' }, { label: 'University / city', key: 'school' }, { label: 'Member since', key: 'since' }, { label: 'LinkedIn', key: 'linkedin' }, { label: 'Notes', key: 'notes' },
      ]), 'text/csv;charset=utf-8');
    };
  }

  const RENDER = {
    overview: pageOverview,
    calendar: pageCalendar,
    notes: pageNotes,
    links: pageLinks,
    directory: pageDirectory,
    stats: pageStats,
    accounting: pageAccounting,
    legal: (v) => pageDocs(v, 'legal'),
    admin_docs: (v) => pageDocs(v, 'admin_doc'),
  };

  /* Keyboard: Enter on a calendar day = add an event. */
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('.cal-day')) { e.preventDefault(); e.target.click(); }
  });

  start();
})();
