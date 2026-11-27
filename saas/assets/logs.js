/* ==========================================================================
   Nova — private workspace · activity log (/saas/logs/) — administrators only
   Entries are written by the database itself (saas-setup/logs.sql) and can
   only be read here: nobody can edit or delete them from the workspace.
   ========================================================================== */
(function () {
  'use strict';
  const N = window.Nova;
  const { esc, icon } = N;
  const app = document.getElementById('app');
  const PAGE = 300;
  const S = { me: null, logs: [], names: {}, more: false, q: '', scope: '', action: '', person: '', missing: false };

  const KIND = {
    note: 'the note', event: 'the event', link: 'the link', stat: 'the statistic', entry: 'the transaction',
    legal: 'the legal document', admin_doc: 'the administrative document', member: 'the directory entry', poll: 'the vote',
  };
  const FIELD = {
    title: 'title', content: 'text', category: 'category', pinned: 'pin', date: 'date', end_date: 'end date', start: 'start time', end: 'end time',
    place: 'place', description: 'notes', notes: 'notes', amount: 'amount', type: 'type', label: 'description', method: 'payment method',
    file: 'file', link: 'link', source: 'location', url: 'address', value: 'value', unit: 'unit', metric: 'metric', comment: 'comment',
    name: 'name', role: 'role', council: 'council', email: 'email', phone: 'phone', school: 'university', since: 'member since',
    linkedin: 'LinkedIn', exec: 'executive board', exec_order: 'board order',
  };
  const ACTIONS = [
    { value: '', label: 'All actions' },
    { value: 'sign_in', label: 'Sign-ins' },
    { value: 'create', label: 'Added' },
    { value: 'update', label: 'Edited' },
    { value: 'delete', label: 'Deleted' },
    { value: 'open_file', label: 'Documents opened' },
    { value: 'poll_close', label: 'Votes closed early' },
    { value: 'access', label: 'Access changes' },
  ];

  const nameOf = (email) => (email ? S.names[email] || email : 'System');
  const projName = (p) => (N.PROJECTS[p] ? N.PROJECTS[p].name : p);
  const personOf = (l) => (l.details && l.details.name ? `${l.details.name} (${l.target})` : l.target || '');
  const list = (arr) => (arr || []).map(projName).join(', ');

  /* Turns a log entry into a readable sentence. */
  function describe(l) {
    const d = l.details || {};
    const who = `<b>${esc(nameOf(l.actor))}</b>`;
    const what = `${KIND[l.kind] || 'an item'}${l.target ? ` “${esc(l.target)}”` : ''}`;
    const money = l.kind === 'entry' && d.amount != null ? `${d.type === 'in' ? '+' : '−'}${N.fmtMoney(d.amount)}` : '';
    switch (l.action) {
      case 'sign_in': return { ic: 'key', html: `${who} signed in` };
      case 'create': return { ic: 'plus', html: `${who} added ${what}`, extra: money };
      case 'update': return { ic: 'edit', html: `${who} edited ${what}`, extra: [d.changed && d.changed.length ? 'Changed: ' + d.changed.map((k) => FIELD[k] || k).join(', ') : '', money].filter(Boolean).join(' · ') };
      case 'delete': return { ic: 'trash', tone: 'danger', html: `${who} deleted ${what}`, extra: money };
      case 'open_file': return { ic: 'eye', html: `${who} opened ${what}` };
      case 'poll_close': return { ic: 'lock', html: `${who} closed ${what} before its planned end` };
      case 'access_add': return {
        ic: 'user-plus', html: `${who} granted access to <b>${esc(personOf(l))}</b>`,
        extra: [d.projects && d.projects.length ? 'Workspaces: ' + list(d.projects) : '', d.is_admin ? 'administrator' : ''].filter(Boolean).join(' · '),
      };
      case 'access_remove': return { ic: 'trash', tone: 'danger', html: `${who} removed <b>${esc(personOf(l))}</b> from the access list` };
      case 'access_change': {
        const parts = [];
        const before = d.projects_before || [], after = d.projects_after || [];
        after.filter((p) => !before.includes(p)).forEach((p) => parts.push(`opened ${projName(p)}`));
        before.filter((p) => !after.includes(p)).forEach((p) => parts.push(`closed ${projName(p)}`));
        if (d.admin_before !== d.admin_after) parts.push(d.admin_after ? 'made administrator' : 'administrator rights removed');
        if (d.active_before !== d.active_after) parts.push(d.active_after ? 'access reopened' : 'all access closed');
        if ((d.name_before || '') !== (d.name || '')) parts.push('name changed');
        return { ic: 'shield', tone: d.active_after === false && d.active_before ? 'danger' : '', html: `${who} changed the access of <b>${esc(personOf(l))}</b>`, extra: parts.join(' · ') };
      }
      default: return { ic: 'list', html: `${who} — ${esc(l.action)}` };
    }
  }
  const plain = (html) => { const t = document.createElement('div'); t.innerHTML = html; return t.textContent; };

  function dayLabel(iso) {
    const d = new Date(iso); d.setHours(0, 0, 0, 0);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((t - d) / 86400000);
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Yesterday';
    return N.fmtLong(new Date(iso));
  }
  const timeOf = (iso) => new Date(iso).toLocaleTimeString(N.LOCALE, { hour: '2-digit', minute: '2-digit' });

  /* ------------------------------------------------------------------ page */
  async function start() {
    const me = await N.boot({ admin: true });
    if (!me) return;
    S.me = me;
    app.innerHTML = `
      ${N.topbar({ me })}
      <main class="home">
        <p class="crumb mono">Nova <span>/</span> Activity log</p>
        <div class="page-head">
          <div>
            <h1 class="page-title">Activity log</h1>
            <p class="page-sub">Sign-ins, changes and access updates. Visible to administrators only; entries cannot be edited or deleted from the workspace.</p>
          </div>
          <div class="page-actions">
            <a class="btn" href="/saas/admin/">${icon('shield')}Manage access</a>
            <button class="btn" type="button" data-act="csv">${icon('download')}Export</button>
          </div>
        </div>
        <section class="card pad">
          <div class="toolbar">
            <label class="search">${icon('search')}<input type="search" data-search placeholder="Search the log" aria-label="Search the log"></label>
            <div class="seg" role="group" aria-label="Workspace">
              <button type="button" data-scope="" aria-pressed="true">All</button>
              ${N.PROJECT_IDS.map((p) => `<button type="button" data-scope="${p}" aria-pressed="false">${esc(N.PROJECTS[p].name)}</button>`).join('')}
              <button type="button" data-scope="_access" aria-pressed="false">Access</button>
            </div>
            <select class="chip" data-filter="action" aria-label="Action" style="padding-right:12px">${ACTIONS.map((a) => `<option value="${a.value}">${esc(a.label)}</option>`).join('')}</select>
            <select class="chip" data-filter="person" aria-label="Person" style="padding-right:12px"><option value="">Everyone</option></select>
          </div>
          <div id="log"><div class="empty empty--sm"><span class="spinner"></span></div></div>
        </section>
      </main>`;
    N.bindTopbar(app);
    app.querySelector('[data-search]').addEventListener('input', (e) => { S.q = e.target.value.trim().toLowerCase(); draw(); });
    app.querySelectorAll('[data-scope]').forEach((b) => b.addEventListener('click', () => {
      S.scope = b.dataset.scope;
      app.querySelectorAll('[data-scope]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    }));
    app.querySelectorAll('[data-filter]').forEach((s) => s.addEventListener('change', () => { S[s.dataset.filter] = s.value; draw(); }));
    app.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'more') loadMore(b);
      if (b.dataset.act === 'csv') exportCsv();
    });

    try { (await N.api.listMembers()).forEach((m) => { S.names[m.email] = m.full_name || m.email; }); } catch (e) { /* names are optional */ }
    try {
      S.logs = await N.api.listLogs(null, PAGE);
      S.more = S.logs.length === PAGE;
    } catch (e) {
      if (/activity_log|does not exist|could not find|PGRST205|42P01|schema cache/i.test(String(e && (e.message || e.code)))) S.missing = true;
      else N.toast(N.humanError(e), 'error');
    }
    fillPeople();
    draw();
  }

  function fillPeople() {
    const sel = app.querySelector('[data-filter="person"]');
    const emails = [...new Set(S.logs.map((l) => l.actor).filter(Boolean))].sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'en'));
    sel.innerHTML = '<option value="">Everyone</option>' + emails.map((m) => `<option value="${esc(m)}"${m === S.person ? ' selected' : ''}>${esc(nameOf(m))}</option>`).join('');
  }

  async function loadMore(btn) {
    btn.disabled = true; btn.classList.add('is-loading');
    try {
      const older = await N.api.listLogs(S.logs[S.logs.length - 1].at, PAGE);
      S.logs = S.logs.concat(older);
      S.more = older.length === PAGE;
      fillPeople();
    } catch (e) { N.toast(N.humanError(e), 'error'); }
    draw();
  }

  function filtered() {
    return S.logs.filter((l) => {
      if (S.scope === '_access' && l.project) return false;
      if (S.scope && S.scope !== '_access' && l.project !== S.scope) return false;
      if (S.action === 'access' ? !String(l.action).startsWith('access_') : S.action && l.action !== S.action) return false;
      if (S.person && l.actor !== S.person) return false;
      if (S.q) {
        const t = describe(l);
        if (!`${plain(t.html)} ${t.extra || ''} ${projName(l.project || '')}`.toLowerCase().includes(S.q)) return false;
      }
      return true;
    });
  }

  function draw() {
    const box = app.querySelector('#log');
    if (S.missing) {
      box.innerHTML = `<div class="empty">${icon('alert')}<b>The activity log is not set up yet</b><p>Run the saas-setup/logs.sql script once in Supabase (SQL Editor → New query → Run), then reload this page.</p></div>`;
      return;
    }
    if (!S.logs.length) { box.innerHTML = `<div class="empty">${icon('list')}<b>Nothing recorded yet</b><p>Sign-ins, changes and access updates will appear here as soon as they happen.</p></div>`; return; }
    const rows = filtered();
    if (!rows.length) { box.innerHTML = `<div class="empty empty--sm">${icon('search')}<b>No entries for this selection</b><p>Change the filters${S.more ? ' or load older entries' : ''}.</p></div>${moreBtn()}`; return; }
    let html = '', day = '';
    rows.forEach((l) => {
      const dl = dayLabel(l.at);
      if (dl !== day) { html += `${day ? '</div>' : ''}<h2 class="log-day mono">${esc(dl)}</h2><div class="log-list">`; day = dl; }
      const t = describe(l);
      const P = N.PROJECTS[l.project];
      html += `
        <div class="log-row">
          <time class="log-time" datetime="${esc(l.at)}" title="${esc(new Date(l.at).toLocaleString(N.LOCALE))}">${esc(timeOf(l.at))}</time>
          <span class="log-ico${t.tone ? ' ' + t.tone : ''}">${icon(t.ic)}</span>
          <p class="log-text">${t.html}${t.extra ? `<small>${esc(t.extra)}</small>` : ''}</p>
          ${P ? `<span class="badge"><i class="dot" style="--c:${P.color}"></i>${esc(P.name)}</span>` : (String(l.action).startsWith('access_') ? '<span class="badge">Access</span>' : '<span></span>')}
        </div>`;
    });
    box.innerHTML = html + '</div>' + moreBtn();
  }
  const moreBtn = () => (S.more ? `<div class="log-more"><button class="btn" type="button" data-act="more">Load older entries</button></div>` : '');

  function exportCsv() {
    const rows = filtered();
    if (!rows.length) return N.toast('Nothing to export for this selection.', 'error');
    const pad = (n) => String(n).padStart(2, '0');
    const day = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    N.download(`activity-log-${N.isoDay()}.csv`, N.csv(rows, [
      { label: 'Date', get: (l) => day(l.at) },
      { label: 'Time', get: (l) => timeOf(l.at) },
      { label: 'Person', get: (l) => nameOf(l.actor) },
      { label: 'Email', key: 'actor' },
      { label: 'Action', get: (l) => plain(describe(l).html) },
      { label: 'Details', get: (l) => describe(l).extra || '' },
      { label: 'Workspace', get: (l) => (l.project ? projName(l.project) : '') },
    ]), 'text/csv;charset=utf-8');
  }

  start();
})();
