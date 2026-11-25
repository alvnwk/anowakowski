/* ==========================================================================
   Nova — private workspace · access management (/saas/admin/)
   Open / close a person's access, workspace by workspace.
   ========================================================================== */
(function () {
  'use strict';
  const N = window.Nova;
  const { esc, icon } = N;
  const app = document.getElementById('app');
  const S = { me: null, members: [], q: '', filter: 'all' };

  async function start() {
    const me = await N.boot({ admin: true });
    if (!me) return;
    S.me = me;
    app.innerHTML = `
      ${N.topbar({ me })}
      <main class="home">
        <p class="crumb mono">Nova <span>/</span> Access</p>
        <div class="page-head">
          <div>
            <h1 class="page-title">Manage access</h1>
            <p class="page-sub">Open or close each person's access, workspace by workspace. Changes apply immediately.</p>
          </div>
          <div class="page-actions"><a class="btn" href="/saas/logs/">${icon('list')}Activity log</a><button class="btn btn-primary" type="button" data-act="add">${icon('user-plus')}Add a person</button></div>
        </div>
        <div class="stack">
          <section class="card pad">
            <div class="toolbar">
              <label class="search">${icon('search')}<input type="search" placeholder="Search a name or email" aria-label="Search"></label>
              <div class="chips" role="group" aria-label="Filter">
                <button class="chip" data-filter="all" aria-pressed="true">Everyone</button>
                <button class="chip" data-filter="on" aria-pressed="false">Access open</button>
                <button class="chip" data-filter="off" aria-pressed="false">Access closed</button>
              </div>
            </div>
            <div id="list"><div class="empty empty--sm"><span class="spinner"></span></div></div>
          </section>
          <section class="card pad">
            <div class="card-head"><h2 class="card-title">${icon('key')}How to give access</h2></div>
            <ol class="steps3">
              <li><b>Add the person</b>Their email address and the workspaces they are allowed into (Auralys, ESCLD or both).</li>
              <li><b>Send them the message</b>Button ${icon('copy')}: they go to the sign-in page, choose "First sign-in" and create their password.</li>
              <li><b>Close it whenever you want</b>Switch off a workspace or all access: the person loses access on their next click.</li>
            </ol>
          </section>
        </div>
      </main>`;
    N.bindTopbar(app);
    app.querySelector('.search input').addEventListener('input', (e) => { S.q = e.target.value.trim().toLowerCase(); draw(); });
    app.querySelectorAll('[data-filter]').forEach((b) => b.addEventListener('click', () => {
      S.filter = b.dataset.filter;
      app.querySelectorAll('[data-filter]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      draw();
    }));
    app.addEventListener('click', onClick);
    app.addEventListener('change', onToggle);
    await load();
  }

  async function load() {
    try { S.members = await N.api.listMembers(); }
    catch (e) { N.toast(N.humanError(e), 'error'); S.members = []; }
    draw();
  }

  function draw() {
    const list = app.querySelector('#list');
    const rows = S.members.filter((m) => {
      if (S.filter === 'on' && !m.active) return false;
      if (S.filter === 'off' && m.active) return false;
      if (S.q && !(`${m.full_name || ''} ${m.email}`.toLowerCase().includes(S.q))) return false;
      return true;
    });
    if (!S.members.length) { list.innerHTML = `<div class="empty">${icon('users')}<b>Nobody yet</b><p>Add a first person to give them access.</p></div>`; return; }
    if (!rows.length) { list.innerHTML = `<div class="empty empty--sm">${icon('search')}<b>No results</b></div>`; return; }
    list.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Person</th>
          ${N.PROJECT_IDS.map((p) => `<th>${esc(N.PROJECTS[p].name)}</th>`).join('')}
          <th>Administrator</th><th>Access</th><th>Last sign-in</th><th class="r"><span class="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>${rows.map(row).join('')}</tbody>
      </table></div>`;
  }

  function row(m) {
    const self = m.email === S.me.email;
    const sw = (field, checked, disabled, title, extra) =>
      `<label class="switch${extra ? ' ' + extra : ''}" title="${esc(title)}"><input type="checkbox" data-field="${field}" data-email="${esc(m.email)}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''} aria-label="${esc(title)}"><i></i></label>`;
    return `
      <tr class="${m.active ? '' : 'is-off'}">
        <td><div class="who"><span class="avatar avatar--sm">${esc(N.initials(m.full_name, m.email))}</span><span><b>${esc(m.full_name || '—')}${self ? ' <span class="badge">You</span>' : ''}</b><small>${esc(m.email)}</small></span></div></td>
        ${N.PROJECT_IDS.map((p) => {
          const P = N.PROJECTS[p];
          const on = m.is_admin || (m.projects || []).includes(p);
          return `<td><span style="--pc:${P.color}">${sw('p:' + p, on, m.is_admin, m.is_admin ? 'Administrators have access to every workspace' : `Access to ${P.name}`, 'switch--proj')}</span></td>`;
        }).join('')}
        <td>${sw('is_admin', m.is_admin, self, self ? 'You cannot remove your own rights' : 'Administrator: access to everything and to access management')}</td>
        <td>${sw('active', m.active, self, self ? 'You cannot close your own access' : 'Access open / closed')}</td>
        <td class="muted nowrap">${m.last_seen ? esc(N.ago(m.last_seen)) : 'Never'}</td>
        <td class="r"><div class="row-actions" style="opacity:1;justify-content:flex-end">
          <button class="icon-btn" type="button" data-act="invite" data-email="${esc(m.email)}" title="Copy the invitation message" aria-label="Copy the invitation message">${icon('copy')}</button>
          <button class="icon-btn" type="button" data-act="edit" data-email="${esc(m.email)}" title="Edit the name" aria-label="Edit">${icon('edit')}</button>
          ${self ? '' : `<button class="icon-btn danger" type="button" data-act="delete" data-email="${esc(m.email)}" title="Remove from the list" aria-label="Remove">${icon('trash')}</button>`}
        </div></td>
      </tr>`;
  }

  const find = (email) => S.members.find((m) => m.email === email);
  const label = (m) => m.full_name || m.email;

  async function onToggle(e) {
    const input = e.target.closest('input[data-field]');
    if (!input) return;
    const m = find(input.dataset.email);
    if (!m) return;
    const f = input.dataset.field;
    const on = input.checked;
    let patch, msg;
    if (f.startsWith('p:')) {
      const p = f.slice(2);
      const set = new Set(m.projects || []);
      on ? set.add(p) : set.delete(p);
      patch = { projects: N.PROJECT_IDS.filter((x) => set.has(x)) };
      msg = `${N.PROJECTS[p].name} access ${on ? 'opened' : 'closed'} for ${label(m)}.`;
    } else if (f === 'is_admin') {
      patch = { is_admin: on };
      msg = on ? `${label(m)} is now an administrator.` : `${label(m)} is no longer an administrator.`;
    } else if (f === 'active') {
      patch = { active: on };
      msg = on ? `Access opened for ${label(m)}.` : `Access closed for ${label(m)}.`;
    }
    input.disabled = true;
    try {
      const updated = await N.api.updateMember(m.email, patch);
      Object.assign(m, updated || patch);
      N.toast(msg);
    } catch (ex) {
      input.checked = !on;
      N.toast(N.humanError(ex), 'error');
    }
    draw();
  }

  function onClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const m = b.dataset.email ? find(b.dataset.email) : null;
    if (b.dataset.act === 'add') addPerson();
    if (b.dataset.act === 'edit' && m) editPerson(m);
    if (b.dataset.act === 'invite' && m) showInvite(m);
    if (b.dataset.act === 'delete' && m) removePerson(m);
  }

  function addPerson() {
    const fields = [
      { name: 'email', label: 'Email address', type: 'email', required: true, span: 2, placeholder: 'name@example.com', hint: 'The person will create their password with this address.' },
      { name: 'full_name', label: 'First and last name', span: 2 },
      ...N.PROJECT_IDS.map((p) => ({ name: 'p_' + p, label: `Access to the ${N.PROJECTS[p].name} workspace`, type: 'checkbox', span: 2 })),
      { name: 'is_admin', label: 'Administrator', type: 'checkbox', span: 2, hint: 'Access to every workspace and to this management page.' },
    ];
    N.formModal({
      title: 'Add a person', kicker: 'Access', fields, submit: 'Grant access',
      onSubmit: async (v) => {
        const email = v.email.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Invalid email address.');
        if (find(email)) throw new Error('This address is already on the list.');
        const projects = N.PROJECT_IDS.filter((p) => v['p_' + p]);
        if (!projects.length && !v.is_admin) throw new Error('Tick at least one workspace.');
        const row = await N.api.addMember({ email, full_name: v.full_name, projects, is_admin: v.is_admin, active: true });
        return row || { email, full_name: v.full_name, projects, is_admin: v.is_admin, active: true };
      },
    }).then((row) => {
      if (!row) return;
      S.members.push(row);
      draw();
      N.toast(`Access granted to ${label(row)}.`);
      showInvite(row);
    });
  }

  function editPerson(m) {
    N.formModal({
      title: 'Edit', kicker: m.email, small: true,
      fields: [{ name: 'full_name', label: 'First and last name', span: 2 }],
      values: { full_name: m.full_name },
      onSubmit: async (v) => { const u = await N.api.updateMember(m.email, { full_name: v.full_name }); Object.assign(m, u || { full_name: v.full_name }); },
    }).then((ok) => { if (ok) { draw(); N.toast('Change saved.'); } });
  }

  function inviteText(m) {
    const spaces = m.is_admin ? N.PROJECT_IDS.map((p) => N.PROJECTS[p].name) : (m.projects || []).map((p) => N.PROJECTS[p] ? N.PROJECTS[p].name : p);
    const hi = N.firstName(m) ? `Hi ${N.firstName(m)},` : 'Hi,';
    return `${hi}

Your access to the Nova private workspace is now open${spaces.length ? ` (${spaces.join(', ')})` : ''}.

1. Go to ${location.origin}/saas
2. Click "First sign-in"
3. Enter your address (${m.email}) and choose your password.

Please do not share this link.`;
  }

  function showInvite(m) {
    const text = inviteText(m);
    N.modal({
      title: 'Message to send', kicker: label(m),
      subtitle: 'Copy this message and send it to the person (email, chat…).',
      body: `<div class="invite">${esc(text)}</div>`,
      cancel: 'Close', submit: 'Copy the message', noFocus: true,
      onSubmit: async () => {
        try { await navigator.clipboard.writeText(text); }
        catch (e) {
          const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); ta.remove();
        }
        N.toast('Message copied.');
      },
    });
  }

  async function removePerson(m) {
    const ok = await N.confirm({
      title: `Remove ${label(m)}?`,
      text: 'The person immediately loses access to every workspace. The content they added is kept. To also delete their sign-in account: Supabase → Authentication → Users.',
      submit: 'Remove access',
    });
    if (!ok) return;
    try {
      await N.api.removeMember(m.email);
      S.members = S.members.filter((x) => x.email !== m.email);
      draw();
      N.toast(`${label(m)} has been removed.`);
    } catch (e) { N.toast(N.humanError(e), 'error'); }
  }

  start();
})();
