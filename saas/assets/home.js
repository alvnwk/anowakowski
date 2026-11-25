/* ==========================================================================
   Nova — espace privé · connexion et page d'accueil (/saas/)
   ========================================================================== */
(function () {
  'use strict';
  const N = window.Nova;
  const { esc, icon } = N;
  const app = document.getElementById('app');
  const params = new URLSearchParams(location.search);

  /* N'accepte qu'une redirection vers une page de l'espace. */
  function safeNext(v) {
    if (!v) return '';
    return /^\/saas(-[a-z0-9]+)?(\/[a-z0-9/-]*)?(#[\w-]*)?$/i.test(v) ? v : '';
  }

  async function start() {
    if (N.MODE === 'off') return N.renderOff();
    let recoveryShown = false;
    N.api.onRecovery(() => { if (!recoveryShown) { recoveryShown = true; showRecovery(); } });
    let session = null;
    try { session = await N.api.session(); } catch (e) { return showAuth('signin', N.humanError(e)); }
    if (recoveryShown) return;
    if (params.has('recovery') && session) { recoveryShown = true; return showRecovery(); }
    if (!session) return showAuth('signin');
    return enter();
  }

  async function enter() {
    let me;
    try { me = await N.api.me(); } catch (e) { return N.renderError(e); }
    if (!me || !me.active) return N.renderBlocked('closed', me);
    const next = safeNext(params.get('next'));
    if (next) { location.replace(next); return; }
    history.replaceState(null, '', '/saas/');
    showHome(me);
  }

  /* ----------------------------------------------------------- connexion */
  const TEXT = {
    signin: { title: 'Connexion', sub: 'Accès réservé aux membres autorisés.', btn: 'Se connecter' },
    signup: { title: 'Première connexion', sub: 'Saisissez l’adresse email à laquelle votre accès a été ouvert, puis choisissez votre mot de passe.', btn: 'Créer mon mot de passe' },
    forgot: { title: 'Mot de passe oublié', sub: 'Indiquez votre adresse : vous recevrez un lien pour choisir un nouveau mot de passe.', btn: 'Envoyer le lien' },
  };

  function showAuth(mode, message, ok) {
    document.title = 'Connexion';
    const t = TEXT[mode];
    const lastEmail = app.querySelector('input[name=email]')?.value || '';
    app.innerHTML = `
      <main class="auth">
        <div class="card auth-card">
          <div class="auth-brand">${N.MARK}<span class="mono">Espace privé</span></div>
          <h1>${esc(t.title)}</h1>
          <p class="auth-sub">${esc(t.sub)}</p>
          <form novalidate>
            ${message ? `<p class="auth-msg ${ok ? 'ok' : 'err'}" role="alert">${esc(message)}</p>` : ''}
            <div class="field"><label for="a-email">Adresse email</label><input id="a-email" name="email" type="email" autocomplete="username" required value="${esc(lastEmail)}" placeholder="prenom@exemple.com"></div>
            ${mode !== 'forgot' ? `<div class="field"><label for="a-pass">${mode === 'signup' ? 'Choisissez un mot de passe' : 'Mot de passe'}</label><input id="a-pass" name="password" type="password" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" required minlength="${mode === 'signup' ? 8 : 1}"${mode === 'signup' ? ' placeholder="8 caractères minimum"' : ''}></div>` : ''}
            ${mode === 'signup' ? '<div class="field"><label for="a-pass2">Confirmez le mot de passe</label><input id="a-pass2" name="password2" type="password" autocomplete="new-password" required></div>' : ''}
            <button class="btn btn-primary" type="submit">${esc(t.btn)}</button>
          </form>
          <div class="auth-links">
            ${mode === 'signin' ? '<button type="button" data-mode="signup">Première connexion ?</button><button type="button" data-mode="forgot">Mot de passe oublié</button>' : '<button type="button" data-mode="signin">← Retour à la connexion</button>'}
          </div>
          ${N.MODE === 'demo' ? `<div class="demo-note"><b>Mode démo</b> — Supabase n’est pas encore configuré : les données sont fictives et restent dans ce navigateur. Comptes de test (n’importe quel mot de passe) : <code>admin@demo.local</code> (tous les espaces), <code>auralys@demo.local</code>, <code>escld@demo.local</code>. <button type="button" data-demo>Remplir avec le compte admin</button></div>` : ''}
        </div>
      </main>`;
    const form = app.querySelector('form');
    const focusEl = form.querySelector(lastEmail ? 'input[name=password]' : 'input[name=email]') || form.querySelector('input');
    focusEl && focusEl.focus();
    app.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => showAuth(b.dataset.mode)));
    const demoBtn = app.querySelector('[data-demo]');
    if (demoBtn) demoBtn.addEventListener('click', () => { form.email.value = 'admin@demo.local'; if (form.password) form.password.value = 'demo'; form.requestSubmit(); });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const email = form.email.value.trim().toLowerCase();
      const btn = form.querySelector('[type=submit]');
      btn.disabled = true; btn.classList.add('is-loading');
      try {
        if (mode === 'signin') {
          await N.api.signIn(email, form.password.value);
          return enter();
        }
        if (mode === 'signup') {
          if (form.password.value.length < 8) throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
          if (form.password.value !== form.password2.value) throw new Error('Les deux mots de passe ne correspondent pas.');
          const session = await N.api.signUp(email, form.password.value);
          if (session) return enter();
          return showAuth('signin', 'Compte créé. Confirmez votre adresse grâce au lien reçu par email, puis connectez-vous.', true);
        }
        if (mode === 'forgot') {
          await N.api.resetPassword(email);
          return showAuth('signin', 'Si cette adresse a un accès, un lien de réinitialisation vient de lui être envoyé.', true);
        }
      } catch (ex) {
        btn.disabled = false; btn.classList.remove('is-loading');
        let p = form.querySelector('.auth-msg');
        if (!p) { p = document.createElement('p'); p.setAttribute('role', 'alert'); form.prepend(p); }
        p.className = 'auth-msg err';
        p.textContent = N.humanError(ex);
      }
    });
  }

  function showRecovery() {
    document.title = 'Nouveau mot de passe';
    app.innerHTML = `
      <main class="auth">
        <div class="card auth-card">
          <div class="auth-brand">${N.MARK}<span class="mono">Espace privé</span></div>
          <h1>Nouveau mot de passe</h1>
          <p class="auth-sub">Choisissez votre nouveau mot de passe.</p>
          <form novalidate>
            <div class="field"><label for="r1">Nouveau mot de passe</label><input id="r1" name="p1" type="password" autocomplete="new-password" minlength="8" required placeholder="8 caractères minimum"></div>
            <div class="field"><label for="r2">Confirmez</label><input id="r2" name="p2" type="password" autocomplete="new-password" required></div>
            <button class="btn btn-primary" type="submit">Enregistrer</button>
          </form>
        </div>
      </main>`;
    const form = app.querySelector('form');
    form.p1.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = form.querySelector('[type=submit]');
      const fail = (m) => { let p = form.querySelector('.auth-msg'); if (!p) { p = document.createElement('p'); p.className = 'auth-msg err'; form.prepend(p); } p.textContent = m; };
      if (form.p1.value.length < 8) return fail('Le mot de passe doit contenir au moins 8 caractères.');
      if (form.p1.value !== form.p2.value) return fail('Les deux mots de passe ne correspondent pas.');
      btn.disabled = true; btn.classList.add('is-loading');
      try { await N.api.setPassword(form.p1.value); N.toast('Mot de passe mis à jour.'); enter(); }
      catch (ex) { btn.disabled = false; btn.classList.remove('is-loading'); fail(N.humanError(ex)); }
    });
  }

  /* ------------------------------------------------------------- accueil */
  function showHome(me) {
    document.title = 'Espace privé';
    const mine = N.PROJECT_IDS.filter((p) => N.canAccess(me, p));
    const hour = new Date().getHours();
    const hello = hour >= 18 || hour < 5 ? 'Bonsoir' : 'Bonjour';
    const name = N.firstName(me);
    app.innerHTML = `
      ${N.topbar({ me })}
      <main class="home">
        <p class="crumb mono">Nova <span>/</span> Accueil</p>
        <h1 class="hello">${hello}${name ? ', ' + esc(name) : ''}.</h1>
        <p class="page-sub" id="clock">${esc(N.fmtLong())}</p>

        <h2 class="section-label mono">${mine.length > 1 ? 'Choisissez un espace' : 'Votre espace'}</h2>
        ${mine.length ? `<div class="proj-grid">${mine.map((p, i) => projCard(N.PROJECTS[p], i)).join('')}</div>` : `
          <div class="card empty">${icon('lock')}<b>Aucun espace ouvert pour l’instant</b><p>Votre compte est actif, mais aucun espace projet ne vous a encore été attribué. Un administrateur peut vous en ouvrir l’accès.</p></div>`}

        ${me.is_admin ? `
          <h2 class="section-label mono">Administration</h2>
          <div class="home-tools">
            <a class="card tool" href="/saas/admin/"><span class="tool-ico">${icon('shield')}</span><span><b>Gérer les accès</b><small>Ouvrir ou fermer l’accès de chaque membre, espace par espace</small></span>${icon('arrow-right')}</a>
          </div>` : ''}
      </main>`;
    N.bindTopbar(app);
    tickClock();
    mine.forEach(fillProject);
  }

  function projCard(P, i) {
    return `
      <a class="proj-card" data-p="${P.id}" href="${P.path}">
        <div class="proj-top"><span class="proj-badge">${esc(P.mark)}</span><span class="mono">Espace ${String(i + 1).padStart(2, '0')}</span></div>
        <h3>${esc(P.name)}</h3>
        <p>${esc(P.tagline)}</p>
        <ul class="proj-meta" data-meta="${P.id}"><li>${icon('clock')}Chargement…</li></ul>
        <span class="proj-go">Ouvrir l’espace ${icon('arrow-right')}</span>
      </a>`;
  }

  async function fillProject(pid) {
    const box = app.querySelector(`[data-meta="${pid}"]`);
    try {
      const items = await N.api.listItems(pid);
      const today = N.isoDay();
      const next = items.filter((i) => i.kind === 'event' && (i.data.end_date || i.data.date) >= today)
        .sort((a, b) => (a.data.date + (a.data.start || '')).localeCompare(b.data.date + (b.data.start || '')))[0];
      const bal = items.filter((i) => i.kind === 'entry').reduce((s, i) => s + (i.data.type === 'in' ? 1 : -1) * (Number(i.data.amount) || 0), 0);
      const docs = items.filter((i) => i.kind === 'legal' || i.kind === 'admin_doc').length;
      const lines = [];
      lines.push(next ? `${icon('calendar')}${esc(next.data.title)} · ${esc(relDay(next.data.date))}` : `${icon('calendar')}Aucun évènement à venir`);
      lines.push(`${icon('wallet')}Solde : ${esc(N.fmtMoney(bal))}`);
      lines.push(`${icon('file')}${docs} document${docs > 1 ? 's' : ''}`);
      box.innerHTML = lines.map((l) => `<li>${l}</li>`).join('');
    } catch (e) {
      box.innerHTML = `<li>${icon('alert')}Résumé indisponible</li>`;
    }
  }

  function relDay(s) {
    const d = N.parseDay(s);
    const t = new Date(); t.setHours(0, 0, 0, 0);
    const diff = Math.round((d - t) / 86400000);
    if (diff <= 0) return 'aujourd’hui';
    if (diff === 1) return 'demain';
    if (diff < 7) return `dans ${diff} jours`;
    return N.fmtDate(s, { day: 'numeric', month: 'short' });
  }

  function tickClock() {
    const el = document.getElementById('clock');
    if (!el) return;
    const draw = () => {
      const d = new Date();
      el.textContent = `${N.fmtLong(d)} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    };
    draw();
    setInterval(draw, 15000);
  }

  start();
})();
