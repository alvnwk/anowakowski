/* ==========================================================================
   Nova — espace privé · gestion des accès (/saas/admin/)
   Ouvrir / fermer l'accès d'une personne, espace par espace.
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
        <p class="crumb mono">Nova <span>/</span> Accès</p>
        <div class="page-head">
          <div>
            <h1 class="page-title">Gérer les accès</h1>
            <p class="page-sub">Ouvrez ou fermez l’accès de chaque personne, espace par espace. Les changements s’appliquent immédiatement.</p>
          </div>
          <div class="page-actions"><button class="btn btn-primary" type="button" data-act="add">${icon('user-plus')}Ajouter une personne</button></div>
        </div>
        <div class="stack">
          <section class="card pad">
            <div class="toolbar">
              <label class="search">${icon('search')}<input type="search" placeholder="Rechercher un nom ou un email" aria-label="Rechercher"></label>
              <div class="chips" role="group" aria-label="Filtrer">
                <button class="chip" data-filter="all" aria-pressed="true">Tout le monde</button>
                <button class="chip" data-filter="on" aria-pressed="false">Accès ouvert</button>
                <button class="chip" data-filter="off" aria-pressed="false">Accès fermé</button>
              </div>
            </div>
            <div id="list"><div class="empty empty--sm"><span class="spinner"></span></div></div>
          </section>
          <section class="card pad">
            <div class="card-head"><h2 class="card-title">${icon('key')}Comment donner un accès</h2></div>
            <ol class="steps3">
              <li><b>Ajoutez la personne</b>Son adresse email et les espaces auxquels elle a droit (Auralys, ESCLD ou les deux).</li>
              <li><b>Envoyez-lui le message</b>Bouton ${icon('copy')} : elle se rend sur la page de connexion, choisit « Première connexion » et crée son mot de passe.</li>
              <li><b>Fermez quand vous voulez</b>Désactivez un espace ou tout l’accès : la personne perd l’accès dès son prochain clic.</li>
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
    if (!S.members.length) { list.innerHTML = `<div class="empty">${icon('users')}<b>Personne pour l’instant</b><p>Ajoutez une première personne pour lui ouvrir l’accès.</p></div>`; return; }
    if (!rows.length) { list.innerHTML = `<div class="empty empty--sm">${icon('search')}<b>Aucun résultat</b></div>`; return; }
    list.innerHTML = `
      <div class="table-wrap"><table class="table">
        <thead><tr>
          <th>Personne</th>
          ${N.PROJECT_IDS.map((p) => `<th>${esc(N.PROJECTS[p].name)}</th>`).join('')}
          <th>Administrateur</th><th>Accès</th><th>Dernière connexion</th><th class="r"><span class="sr-only">Actions</span></th>
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
        <td><div class="who"><span class="avatar avatar--sm">${esc(N.initials(m.full_name, m.email))}</span><span><b>${esc(m.full_name || '—')}${self ? ' <span class="badge">Vous</span>' : ''}</b><small>${esc(m.email)}</small></span></div></td>
        ${N.PROJECT_IDS.map((p) => {
          const P = N.PROJECTS[p];
          const on = m.is_admin || (m.projects || []).includes(p);
          return `<td><span style="--pc:${P.color}">${sw('p:' + p, on, m.is_admin, m.is_admin ? 'Les administrateurs ont accès à tous les espaces' : `Accès à ${P.name}`, 'switch--proj')}</span></td>`;
        }).join('')}
        <td>${sw('is_admin', m.is_admin, self, self ? 'Vous ne pouvez pas retirer vos propres droits' : 'Administrateur : accès à tout et gestion des accès')}</td>
        <td>${sw('active', m.active, self, self ? 'Vous ne pouvez pas fermer votre propre accès' : 'Accès ouvert / fermé')}</td>
        <td class="muted nowrap">${m.last_seen ? esc(N.ago(m.last_seen)) : 'Jamais'}</td>
        <td class="r"><div class="row-actions" style="opacity:1;justify-content:flex-end">
          <button class="icon-btn" type="button" data-act="invite" data-email="${esc(m.email)}" title="Copier le message d’invitation" aria-label="Copier le message d’invitation">${icon('copy')}</button>
          <button class="icon-btn" type="button" data-act="edit" data-email="${esc(m.email)}" title="Modifier le nom" aria-label="Modifier">${icon('edit')}</button>
          ${self ? '' : `<button class="icon-btn danger" type="button" data-act="delete" data-email="${esc(m.email)}" title="Retirer de la liste" aria-label="Retirer">${icon('trash')}</button>`}
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
      msg = `Accès ${N.PROJECTS[p].name} ${on ? 'ouvert' : 'fermé'} pour ${label(m)}.`;
    } else if (f === 'is_admin') {
      patch = { is_admin: on };
      msg = on ? `${label(m)} est maintenant administrateur.` : `${label(m)} n’est plus administrateur.`;
    } else if (f === 'active') {
      patch = { active: on };
      msg = on ? `Accès ouvert pour ${label(m)}.` : `Accès fermé pour ${label(m)}.`;
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
      { name: 'email', label: 'Adresse email', type: 'email', required: true, span: 2, placeholder: 'prenom@exemple.com', hint: 'C’est avec cette adresse que la personne créera son mot de passe.' },
      { name: 'full_name', label: 'Prénom et nom', span: 2 },
      ...N.PROJECT_IDS.map((p) => ({ name: 'p_' + p, label: `Accès à l’espace ${N.PROJECTS[p].name}`, type: 'checkbox', span: 2 })),
      { name: 'is_admin', label: 'Administrateur', type: 'checkbox', span: 2, hint: 'Accès à tous les espaces et à cette page de gestion.' },
    ];
    N.formModal({
      title: 'Ajouter une personne', kicker: 'Accès', fields, submit: 'Ouvrir l’accès',
      onSubmit: async (v) => {
        const email = v.email.toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse email invalide.');
        if (find(email)) throw new Error('Cette adresse figure déjà dans la liste.');
        const projects = N.PROJECT_IDS.filter((p) => v['p_' + p]);
        if (!projects.length && !v.is_admin) throw new Error('Cochez au moins un espace.');
        const row = await N.api.addMember({ email, full_name: v.full_name, projects, is_admin: v.is_admin, active: true });
        return row || { email, full_name: v.full_name, projects, is_admin: v.is_admin, active: true };
      },
    }).then((row) => {
      if (!row) return;
      S.members.push(row);
      draw();
      N.toast(`Accès ouvert pour ${label(row)}.`);
      showInvite(row);
    });
  }

  function editPerson(m) {
    N.formModal({
      title: 'Modifier', kicker: m.email, small: true,
      fields: [{ name: 'full_name', label: 'Prénom et nom', span: 2 }],
      values: { full_name: m.full_name },
      onSubmit: async (v) => { const u = await N.api.updateMember(m.email, { full_name: v.full_name }); Object.assign(m, u || { full_name: v.full_name }); },
    }).then((ok) => { if (ok) { draw(); N.toast('Modification enregistrée.'); } });
  }

  function inviteText(m) {
    const spaces = m.is_admin ? N.PROJECT_IDS.map((p) => N.PROJECTS[p].name) : (m.projects || []).map((p) => N.PROJECTS[p] ? N.PROJECTS[p].name : p);
    const hi = N.firstName(m) ? `Bonjour ${N.firstName(m)},` : 'Bonjour,';
    return `${hi}

Ton accès à l’espace privé Nova est ouvert${spaces.length ? ` (${spaces.join(', ')})` : ''}.

1. Va sur ${location.origin}/saas
2. Clique sur « Première connexion »
3. Saisis ton adresse (${m.email}) et choisis ton mot de passe.

Merci de ne pas partager ce lien.`;
  }

  function showInvite(m) {
    const text = inviteText(m);
    N.modal({
      title: 'Message à envoyer', kicker: label(m),
      subtitle: 'Copiez ce message et envoyez-le à la personne (email, messagerie…).',
      body: `<div class="invite">${esc(text)}</div>`,
      cancel: 'Fermer', submit: 'Copier le message', noFocus: true,
      onSubmit: async () => {
        try { await navigator.clipboard.writeText(text); }
        catch (e) {
          const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
          document.execCommand('copy'); ta.remove();
        }
        N.toast('Message copié.');
      },
    });
  }

  async function removePerson(m) {
    const ok = await N.confirm({
      title: `Retirer ${label(m)} ?`,
      text: 'La personne perd immédiatement l’accès à tous les espaces. Les contenus qu’elle a ajoutés sont conservés. Pour supprimer aussi son compte de connexion : Supabase → Authentication → Users.',
      submit: 'Retirer l’accès',
    });
    if (!ok) return;
    try {
      await N.api.removeMember(m.email);
      S.members = S.members.filter((x) => x.email !== m.email);
      draw();
      N.toast(`${label(m)} a été retiré.`);
    } catch (e) { N.toast(N.humanError(e), 'error'); }
  }

  start();
})();
