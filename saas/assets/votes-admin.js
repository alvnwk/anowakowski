/* ==========================================================================
   Nova — private workspace · ESCLD votes (administrators only)
   Page "Votes" of /saas-escld/: create a vote, send personal links, follow
   turnout, close it, read the results. The database rules are in
   saas-setup/votes.sql; the ballot page voters use is /escld/vote/.
   ========================================================================== */
(function () {
  'use strict';
  const N = window.Nova;
  const { esc, icon } = N;
  const VOTE_PATH = '/escld/vote/';
  const V = { loaded: false, missing: false, polls: [], voters: [], ballots: {}, fresh: {}, draft: null };
  let C = null; // workspace context

  /* ------------------------------------------------------------- helpers */
  const linkFor = (token) => `${location.origin}${VOTE_PATH}#t=${token}`;
  const fmtWhen = (iso) => new Date(iso).toLocaleString(N.LOCALE, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  function relTime(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    const a = Math.abs(ms) / 60000;
    const txt = a < 60 ? `${Math.max(1, Math.round(a))} min` : a < 2880 ? `${Math.round(a / 60)} h` : `${Math.round(a / 1440)} days`;
    return ms < 0 ? `${txt} ago` : `in ${txt}`;
  }
  const pad = (n) => String(n).padStart(2, '0');
  const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const fromLocalInput = (s) => (s ? new Date(s) : null);
  const votersOf = (id) => V.voters.filter((v) => v.poll_id === id);
  const missing = (e) => /polls|poll_voters|does not exist|could not find|PGRST205|42P01|schema cache/i.test(String(e && (e.message || e.code)));
  function turnout(id) {
    const vs = votersOf(id), done = vs.filter((v) => v.voted);
    const w = vs.reduce((s, v) => s + (v.weight || 1), 0), wd = done.reduce((s, v) => s + (v.weight || 1), 0);
    return { n: vs.length, voted: done.length, w, wd, pct: vs.length ? Math.round((done.length / vs.length) * 100) : 0 };
  }
  function statusBadge(p) {
    const st = N.pollStatus(p);
    if (st === 'open') return `<span class="badge badge--ok"><i class="dot" style="--c:var(--ok)"></i>Open</span>`;
    if (st === 'scheduled') return `<span class="badge badge--warn">${icon('clock')}Scheduled</span>`;
    return `<span class="badge">${icon('lock')}Closed</span>`;
  }
  function whenLine(p) {
    const st = N.pollStatus(p);
    if (st === 'open') return `Closes ${fmtWhen(p.ends_at)} · ${relTime(p.ends_at)}`;
    if (st === 'scheduled') return `Opens ${fmtWhen(p.starts_at)} · ${relTime(p.starts_at)}`;
    return `Closed ${fmtWhen(p.closed_at || p.ends_at)}${p.closed_at ? ' (closed early)' : ''}`;
  }
  const kindBadge = (p) => `<span class="badge">${icon(p.anonymous ? 'lock' : 'eye')}${p.anonymous ? 'Anonymous' : 'Named'}</span>`;
  function mailto(v, link, p) {
    const first = (v.name || '').split(' ')[0];
    const when = N.pollStatus(p) === 'scheduled' ? `Voting opens on ${fmtWhen(p.starts_at)} and closes on ${fmtWhen(p.ends_at)}.` : `Voting closes on ${fmtWhen(p.ends_at)}.`;
    const body = `Hello ${first},\n\nYou are invited to take part in the following ESCLD vote: "${p.title}".\n${when}\n\nYour personal voting link:\n${link}\n\nThis link is personal: please do not forward it. It can be used only once.\n\nESCLD`;
    return `mailto:${v.email || ''}?subject=${encodeURIComponent('ESCLD vote: ' + p.title)}&body=${encodeURIComponent(body)}`;
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); }
    catch (e) { const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  }
  function protectFreshLinks() {
    window.onbeforeunload = Object.keys(V.fresh).length ? (e) => { e.preventDefault(); e.returnValue = ''; return ''; } : null;
  }

  async function load() {
    const r = await N.api.listPolls();
    V.polls = r.polls; V.voters = r.voters; V.loaded = true;
  }

  /* ----------------------------------------------------------- entry point */
  async function render(view, ctx) {
    C = ctx;
    const sub = ctx.sub();
    if (!V.loaded && !V.missing) {
      view.innerHTML = ctx.head('Votes') + '<div class="card"><div class="empty empty--sm"><span class="spinner"></span></div></div>';
      try { await load(); }
      catch (e) { if (missing(e)) V.missing = true; else { N.toast(N.humanError(e), 'error'); return; } }
      if (ctx.S.page !== 'votes' || ctx.sub() !== sub) return;
    }
    view.onclick = null; view.oninput = null; view.onchange = null;
    if (V.missing) {
      view.innerHTML = ctx.head('Votes') + `<div class="card">${ctx.empty('alert', 'Votes are not set up yet', 'Run saas-setup/votes.sql once in Supabase (SQL Editor → New query → Run), then reload this page.')}</div>`;
      return;
    }
    if (sub === 'new') return renderNew(view);
    if (sub) {
      const p = V.polls.find((x) => x.id === sub);
      if (p) return renderPoll(view, p);
    }
    renderList(view);
  }

  /* ================================================================== LIST */
  function renderList(view) {
    const groups = { open: [], scheduled: [], closed: [] };
    V.polls.forEach((p) => groups[N.pollStatus(p)].push(p));
    const card = (p) => {
      const t = turnout(p.id);
      return `
        <a class="card vcard" href="#votes/${p.id}">
          <span class="vcard-top">${statusBadge(p)}${kindBadge(p)}<span class="grow"></span><span class="muted">${C.plural(p.questions.length, 'question')}</span></span>
          <b class="vcard-title">${esc(p.title)}</b>
          <span class="muted vcard-when">${esc(whenLine(p))}</span>
          <span class="bar" aria-hidden="true"><i style="width:${t.pct}%"></i></span>
          <span class="vcard-foot"><b>${t.voted}</b> / ${t.n} voted${t.w !== t.n ? ` · ${t.wd} / ${t.w} votes` : ''}</span>
        </a>`;
    };
    const section = (title, list) => (list.length ? `<section class="group"><h2 class="group-title mono">${title} <span>${list.length}</span></h2><div class="vgrid">${list.map(card).join('')}</div></section>` : '');
    view.innerHTML = `
      ${C.head('Votes', 'Secure online votes. Only administrators can see this page.', C.addBtn('New vote'))}
      ${V.polls.length ? section('Open', groups.open) + section('Scheduled', groups.scheduled) + section('Closed', groups.closed)
        : `<div class="card">${C.empty('vote', 'No votes yet', 'Create a vote, choose who may vote, and send each person their own personal voting link. Voters do not need an account.', C.addBtn('Create the first vote'))}</div>`}`;
    view.onclick = (e) => { if (e.target.closest('[data-act="add"]')) C.go('votes/new'); };
  }

  /* =============================================================== BUILDER */
  let seq = 0;
  const newQuestion = () => ({ key: ++seq, text: '', max: 1, allow_blank: true, answers: [{ key: ++seq, text: '' }, { key: ++seq, text: '' }] });
  const DURATIONS = [
    ['3600000', '1 hour'], ['10800000', '3 hours'], ['86400000', '1 day'], ['172800000', '2 days'], ['259200000', '3 days'],
    ['604800000', '1 week'], ['1209600000', '2 weeks'], ['custom', 'Custom end'],
  ];
  function freshDraft() {
    const start = new Date(Date.now() + 3600000); start.setMinutes(0, 0, 0);
    return { title: '', notice: '', anonymous: false, startMode: 'now', start: toLocalInput(start), duration: '86400000', end: toLocalInput(new Date(Date.now() + 86400000)), questions: [newQuestion()], voters: [], dirQ: '' };
  }
  const draftStart = (d) => (d.startMode === 'now' ? new Date() : fromLocalInput(d.start));
  function syncEnd(d) {
    if (d.duration === 'custom') return;
    const s = draftStart(d);
    if (s && !isNaN(s)) d.end = toLocalInput(new Date(s.getTime() + Number(d.duration)));
  }

  function renderNew(view) {
    const d = (V.draft = V.draft || freshDraft());
    const members = C.rows('member').slice().sort((a, b) => a.name.localeCompare(b.name, 'en'));
    const chosen = new Set(d.voters.filter((v) => v.memberId).map((v) => v.memberId));
    const dq = d.dirQ.toLowerCase();
    const listed = members.filter((m) => !dq || `${m.name} ${m.email || ''} ${m.role || ''} ${m.council || ''}`.toLowerCase().includes(dq));
    const totalW = d.voters.reduce((s, v) => s + (Number(v.weight) || 1), 0);
    const s = draftStart(d), e = fromLocalInput(d.end);
    const schedule = s && e && !isNaN(s) && !isNaN(e) ? `${d.startMode === 'now' ? 'Voting opens as soon as you create the vote' : `Voting opens on ${fmtWhen(s.toISOString())}`} and closes on <b>${esc(fmtWhen(e.toISOString()))}</b>.` : 'Choose the start and end of the vote.';

    view.innerHTML = `
      <p class="crumb mono">ESCLD <span>/</span> <a href="#votes">Votes</a> <span>/</span> New vote</p>
      <div class="page-head"><div><h1 class="page-title">New vote</h1><p class="page-sub">Set the questions, the voters and the schedule. You will then get one personal link per voter.</p></div></div>
      <div class="stack builder">
        <section class="card pad">
          <div class="card-head"><h2 class="card-title">${icon('vote')}The vote</h2></div>
          <div class="form-grid">
            <div class="field span-2"><label for="b-title">Title</label><input id="b-title" data-f="title" value="${esc(d.title)}" placeholder="E.g. Election of the executive board 2027" maxlength="200"></div>
            <div class="field span-2"><label for="b-notice">Message for all voters <em>optional</em></label><textarea id="b-notice" data-f="notice" rows="2" placeholder="E.g. A minimum of 3/5 of the votes cast is required to be elected in the first round.">${esc(d.notice)}</textarea><small class="hint">Shown at the top of the ballot to every voter.</small></div>
            <label class="check span-2"><input type="checkbox" data-f="anonymous"${d.anonymous ? ' checked' : ''}><span class="check-box">${icon('check')}</span><span>Anonymous vote<small class="hint">Ballots are stored without any link to the voter: you will see who voted, but not what each person chose. Cannot be changed once voting has started.</small></span></label>
          </div>
        </section>

        <section class="card pad">
          <div class="card-head"><h2 class="card-title">${icon('calendar')}Schedule</h2></div>
          <div class="form-grid">
            <div class="field"><span class="label">Start</span>
              <div class="segctl" role="radiogroup" aria-label="Start">
                <label><input type="radio" name="b-start" data-f="startMode" value="now"${d.startMode === 'now' ? ' checked' : ''}><span>Now</span></label>
                <label><input type="radio" name="b-start" data-f="startMode" value="later"${d.startMode === 'later' ? ' checked' : ''}><span>Later</span></label>
              </div>
            </div>
            <div class="field"${d.startMode === 'now' ? ' hidden' : ''}><label for="b-sdate">Opening date and time</label><input id="b-sdate" type="datetime-local" data-f="start" value="${esc(d.start)}"></div>
            <div class="field"><label for="b-dur">Duration</label><select id="b-dur" data-f="duration">${DURATIONS.map(([v, l]) => `<option value="${v}"${d.duration === v ? ' selected' : ''}>${l}</option>`).join('')}</select></div>
            <div class="field"><label for="b-edate">Closing date and time</label><input id="b-edate" type="datetime-local" data-f="end" value="${esc(d.end)}"></div>
          </div>
          <p class="sched-line" data-schedule>${schedule}</p>
          <small class="hint">You can close the vote earlier, or push back its end, from the vote page.</small>
        </section>

        <section class="card pad">
          <div class="card-head"><h2 class="card-title">${icon('list')}Questions <span class="badge">${d.questions.length}</span></h2></div>
          <div class="qlist">
            ${d.questions.map((q, i) => `
              <div class="qblock">
                <div class="qblock-head"><span class="mono">Question ${i + 1}</span><span class="grow"></span>
                  <button class="btn btn-quiet btn-sm" type="button" data-act="yesno" data-q="${i}">Yes · No</button>
                  ${d.questions.length > 1 ? `<button class="icon-btn danger" type="button" data-act="del-q" data-q="${i}" aria-label="Remove question ${i + 1}" title="Remove this question">${icon('trash')}</button>` : ''}
                </div>
                <div class="field"><input data-q="${i}" data-f="qtext" value="${esc(q.text)}" placeholder="E.g. Who should be the next President?" aria-label="Question ${i + 1}" maxlength="300"></div>
                <div class="answers">
                  ${q.answers.map((a, j) => `
                    <div class="ans-row">
                      <span class="ans-mark">${q.max > 1 ? '' : ''}</span>
                      <div class="field"><input data-q="${i}" data-a="${j}" data-f="answer" value="${esc(a.text)}" placeholder="Answer ${j + 1}" aria-label="Question ${i + 1}, answer ${j + 1}" maxlength="200"></div>
                      ${q.answers.length > 2 ? `<button class="icon-btn danger" type="button" data-act="del-a" data-q="${i}" data-a="${j}" aria-label="Remove answer ${j + 1}">${icon('x')}</button>` : '<span style="width:34px"></span>'}
                    </div>`).join('')}
                  <button class="btn btn-quiet btn-sm" type="button" data-act="add-a" data-q="${i}">${icon('plus')}Add an answer</button>
                </div>
                <div class="qblock-opts">
                  <div class="field"><label for="b-max-${i}">Answers each voter may choose</label><input id="b-max-${i}" type="number" min="1" max="${q.answers.length}" data-q="${i}" data-f="max" value="${q.max}"></div>
                  <label class="check"><input type="checkbox" data-q="${i}" data-f="blank"${q.allow_blank ? ' checked' : ''}><span class="check-box">${icon('check')}</span><span>Allow a blank vote<small class="hint">The voter may skip this question (counted as an abstention).</small></span></label>
                </div>
              </div>`).join('')}
          </div>
          <button class="btn" type="button" data-act="add-q">${icon('plus')}Add a question</button>
        </section>

        <section class="card pad">
          <div class="card-head"><h2 class="card-title">${icon('users')}Voters <span class="badge">${d.voters.length}${totalW !== d.voters.length ? ` · ${totalW} votes` : ''}</span></h2></div>
          <p class="hint" style="margin:-6px 0 14px">Voters do not need an account. Each one receives a personal link that works only once. Set "Votes" above 1 for someone who holds proxies.</p>
          <div class="cols voters-cols">
            <div>
              <h3 class="group-title mono">From the directory</h3>
              ${members.length ? `
                <div class="toolbar" style="margin-bottom:10px">
                  <label class="search">${icon('search')}<input type="search" data-f="dirQ" value="${esc(d.dirQ)}" placeholder="Search the directory" aria-label="Search the directory"></label>
                </div>
                <div class="chips" style="margin-bottom:10px">
                  <button class="chip" type="button" data-act="pick-all">Everyone</button>
                  <button class="chip" type="button" data-act="pick-exec">Executive board</button>
                  <button class="chip" type="button" data-act="pick-none">Clear</button>
                </div>
                <div class="pick-list">${listed.map((m) => `
                  <label class="pick${chosen.has(m.id) ? ' is-on' : ''}"><input type="checkbox" data-act="pick" data-id="${m.id}"${chosen.has(m.id) ? ' checked' : ''}><span class="check-box">${icon('check')}</span>
                    <span class="pick-txt"><b>${esc(m.name)}</b><small>${esc([m.role, m.email || 'no email'].filter(Boolean).join(' · '))}</small></span></label>`).join('') || '<p class="muted" style="padding:10px">No match.</p>'}</div>`
                : '<p class="muted">The directory is empty. Add people below, or fill the directory first.</p>'}
              <h3 class="group-title mono" style="margin-top:18px">Someone else</h3>
              <div class="add-person">
                <div class="field"><input data-new="name" placeholder="First and last name" aria-label="Name"></div>
                <div class="field"><input data-new="email" type="email" placeholder="Email (optional)" aria-label="Email"></div>
                <button class="btn" type="button" data-act="add-person">${icon('plus')}Add</button>
              </div>
            </div>
            <div>
              <h3 class="group-title mono">Selected voters</h3>
              ${d.voters.length ? `<div class="table-wrap"><table class="table">
                <thead><tr><th>Name</th><th style="width:96px">Votes</th><th></th></tr></thead>
                <tbody>${d.voters.map((v, i) => `<tr>
                  <td><b style="font-weight:500">${esc(v.name)}</b><br><small class="muted">${esc(v.email || 'no email: you will copy the link')}</small></td>
                  <td><div class="field"><input type="number" min="1" max="100" data-v="${i}" data-f="weight" value="${v.weight}" aria-label="Votes for ${esc(v.name)}"></div></td>
                  <td class="r"><button class="icon-btn danger" type="button" data-act="del-v" data-v="${i}" aria-label="Remove ${esc(v.name)}">${icon('x')}</button></td>
                </tr>`).join('')}</tbody></table></div>` : '<div class="empty empty--sm" style="padding:24px 8px">' + icon('users') + '<b>No voters yet</b><p>Tick people in the directory or add someone.</p></div>'}
            </div>
          </div>
        </section>

        <p class="form-error" role="alert" data-err hidden></p>
        <div class="builder-foot">
          <a class="btn" href="#votes">Cancel</a>
          <button class="btn btn-primary" type="button" data-act="create">${icon('key')}Create the vote and get the links</button>
        </div>
      </div>`;

    const rerender = () => { const y = window.scrollY; renderNew(view); window.scrollTo(0, y); };
    const schedLine = () => {
      const s2 = draftStart(d), e2 = fromLocalInput(d.end), box = view.querySelector('[data-schedule]');
      if (box) box.innerHTML = s2 && e2 && !isNaN(s2) && !isNaN(e2) ? `${d.startMode === 'now' ? 'Voting opens as soon as you create the vote' : `Voting opens on ${esc(fmtWhen(s2.toISOString()))}`} and closes on <b>${esc(fmtWhen(e2.toISOString()))}</b>.` : 'Choose the start and end of the vote.';
    };

    view.oninput = (ev) => {
      const t = ev.target, f = t.dataset.f;
      if (!f) return;
      if (f === 'title' || f === 'notice') d[f] = t.value;
      else if (f === 'dirQ') { d.dirQ = t.value; const pos = t.selectionStart; rerender(); const n = view.querySelector('[data-f="dirQ"]'); if (n) { n.focus(); n.setSelectionRange(pos, pos); } }
      else if (f === 'qtext') d.questions[t.dataset.q].text = t.value;
      else if (f === 'answer') d.questions[t.dataset.q].answers[t.dataset.a].text = t.value;
      else if (f === 'max') d.questions[t.dataset.q].max = Math.max(1, Math.min(d.questions[t.dataset.q].answers.length, parseInt(t.value, 10) || 1));
      else if (f === 'weight') d.voters[t.dataset.v].weight = Math.max(1, Math.min(100, parseInt(t.value, 10) || 1));
      else if (f === 'start') { d.start = t.value; syncEnd(d); const en = view.querySelector('[data-f="end"]'); if (en) en.value = d.end; schedLine(); }
      else if (f === 'end') { d.end = t.value; d.duration = 'custom'; const du = view.querySelector('[data-f="duration"]'); if (du) du.value = 'custom'; schedLine(); }
    };
    view.onchange = (ev) => {
      const t = ev.target, f = t.dataset.f;
      if (f === 'anonymous') d.anonymous = t.checked;
      else if (f === 'blank') d.questions[t.dataset.q].allow_blank = t.checked;
      else if (f === 'startMode') { d.startMode = t.value; syncEnd(d); rerender(); }
      else if (f === 'duration') { d.duration = t.value; syncEnd(d); rerender(); }
      else if (f === 'max' || f === 'weight') rerender();
      else if (t.dataset.act === 'pick') {
        const m = members.find((x) => x.id === t.dataset.id);
        if (t.checked && m) d.voters.push({ key: 'm:' + m.id, memberId: m.id, name: m.name, email: m.email || '', weight: 1 });
        else d.voters = d.voters.filter((v) => v.memberId !== t.dataset.id);
        rerender();
      }
    };
    view.onclick = async (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b || b.dataset.act === 'pick') return;
      const a = b.dataset.act, qi = Number(b.dataset.q);
      const addMembers = (list) => list.forEach((m) => { if (!d.voters.some((v) => v.memberId === m.id)) d.voters.push({ key: 'm:' + m.id, memberId: m.id, name: m.name, email: m.email || '', weight: 1 }); });
      if (a === 'add-q') { d.questions.push(newQuestion()); rerender(); }
      if (a === 'del-q') { d.questions.splice(qi, 1); rerender(); }
      if (a === 'add-a') { d.questions[qi].answers.push({ key: ++seq, text: '' }); rerender(); const ins = view.querySelectorAll(`[data-q="${qi}"][data-f="answer"]`); if (ins.length) ins[ins.length - 1].focus(); }
      if (a === 'del-a') { const q = d.questions[qi]; q.answers.splice(Number(b.dataset.a), 1); q.max = Math.min(q.max, q.answers.length); rerender(); }
      if (a === 'yesno') { const q = d.questions[qi]; q.answers = [{ key: ++seq, text: 'Yes' }, { key: ++seq, text: 'No' }]; q.max = 1; rerender(); }
      if (a === 'pick-all') { addMembers(members); rerender(); }
      if (a === 'pick-exec') { addMembers(members.filter((m) => m.exec)); rerender(); }
      if (a === 'pick-none') { d.voters = d.voters.filter((v) => !v.memberId); rerender(); }
      if (a === 'del-v') { d.voters.splice(Number(b.dataset.v), 1); rerender(); }
      if (a === 'add-person') {
        const name = view.querySelector('[data-new="name"]').value.trim();
        const email = view.querySelector('[data-new="email"]').value.trim().toLowerCase();
        if (!name) return N.toast('Enter the person’s name.', 'error');
        if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return N.toast('Invalid email address.', 'error');
        d.voters.push({ key: 'x:' + ++seq, name, email, weight: 1 });
        rerender();
      }
      if (a === 'create') createVote(view, b);
    };
  }

  function validate(d) {
    const errs = [];
    if (!d.title.trim()) errs.push('Give the vote a title.');
    const qs = d.questions.map((q, i) => {
      const answers = q.answers.map((a) => a.text.trim()).filter(Boolean);
      if (!q.text.trim()) errs.push(`Question ${i + 1} has no text.`);
      if (answers.length < 2) errs.push(`Question ${i + 1} needs at least two answers.`);
      if (new Set(answers.map((x) => x.toLowerCase())).size !== answers.length) errs.push(`Question ${i + 1} has the same answer twice.`);
      return {
        id: 'q' + (i + 1), text: q.text.trim(), max: Math.max(1, Math.min(q.max, answers.length || 1)), allow_blank: !!q.allow_blank,
        answers: answers.map((t, j) => ({ id: 'a' + (j + 1), text: t })),
      };
    });
    if (!d.voters.length) errs.push('Add at least one voter.');
    const s = draftStart(d), e = fromLocalInput(d.end);
    if (d.startMode === 'later' && (!s || isNaN(s))) errs.push('Choose the opening date and time.');
    else if (d.startMode === 'later' && s.getTime() < Date.now() - 60000) errs.push('The opening date is in the past: choose "Now" or a later time.');
    if (!e || isNaN(e)) errs.push('Choose the closing date and time.');
    else if (e.getTime() <= Date.now() + 60000) errs.push('The closing time must be in the future.');
    else if (s && !isNaN(s) && e <= s) errs.push('The closing time must be after the opening time.');
    return { errs, qs, s, e };
  }

  async function createVote(view, btn) {
    const d = V.draft;
    const { errs, qs, s, e } = validate(d);
    const box = view.querySelector('[data-err]');
    if (errs.length) { box.innerHTML = errs.map(esc).join('<br>'); box.hidden = false; box.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
    box.hidden = true;
    btn.disabled = true; btn.classList.add('is-loading');
    try {
      const people = d.voters.map((v) => ({ v, id: crypto.randomUUID(), token: N.newToken() }));
      const hashes = await Promise.all(people.map((x) => N.sha256hex(x.token)));
      const poll = { title: d.title.trim(), notice: d.notice.trim() || null, anonymous: d.anonymous, questions: qs, ends_at: e.toISOString() };
      if (d.startMode === 'later') poll.starts_at = s.toISOString();
      const res = await N.api.createPoll(poll, people.map((x, i) => ({ id: x.id, name: x.v.name, email: x.v.email || null, weight: Number(x.v.weight) || 1, token_hash: hashes[i] })));
      V.polls.unshift(res.poll);
      V.voters.push(...res.voters);
      V.fresh[res.poll.id] = people.map((x) => ({ id: x.id, name: x.v.name, email: x.v.email, link: linkFor(x.token) }));
      protectFreshLinks();
      V.draft = null;
      N.toast('Vote created. Send each person their link now.');
      C.go('votes/' + res.poll.id);
    } catch (ex) {
      btn.disabled = false; btn.classList.remove('is-loading');
      box.textContent = N.humanError(ex); box.hidden = false;
    }
  }

  /* ============================================================ VOTE PAGE */
  function tally(p, ballots) {
    return p.questions.map((q) => {
      const counts = {}; q.answers.forEach((a) => { counts[a.id] = 0; });
      let blank = 0, cast = 0;
      ballots.forEach((b) => {
        const ids = (b.answers || {})[q.id] || [];
        cast += b.weight || 1;
        if (!ids.length) blank += b.weight || 1;
        ids.forEach((id) => { if (id in counts) counts[id] += b.weight || 1; });
      });
      return { q, counts, blank, cast };
    });
  }
  const answerText = (q, ids) => (ids && ids.length ? ids.map((id) => (q.answers.find((a) => a.id === id) || { text: '?' }).text).join(', ') : 'Blank');

  function resultsHtml(p, ballots) {
    const t = turnout(p.id);
    const res = tally(p, ballots);
    const blocks = res.map(({ q, counts, blank, cast }, i) => {
      const rowsSorted = q.answers.map((a) => ({ a, n: counts[a.id] })).sort((x, y) => y.n - x.n);
      const top = rowsSorted[0] && rowsSorted[0].n > 0 ? rowsSorted[0].n : -1;
      const tie = rowsSorted.filter((r) => r.n === top).length > 1;
      const pc = (n) => (cast ? Math.round((n / cast) * 1000) / 10 : 0);
      return `
        <div class="res-q">
          <p class="mono muted">Question ${i + 1}${q.max > 1 ? ` · up to ${q.max} answers` : ''}</p>
          <h3>${esc(q.text)}</h3>
          ${rowsSorted.map((r) => `
            <div class="res-row${r.n === top ? ' is-top' : ''}">
              <span class="res-label">${esc(r.a.text)}${r.n === top ? ` <span class="badge badge--hl">${tie ? 'Tie' : 'Most votes'}</span>` : ''}</span>
              <span class="bar"><i style="width:${pc(r.n)}%"></i></span>
              <span class="res-num"><b>${r.n}</b> <small>${pc(r.n)}%</small></span>
            </div>`).join('')}
          ${q.allow_blank || blank ? `<div class="res-row is-blank"><span class="res-label">Blank / abstention</span><span class="bar"><i style="width:${pc(blank)}%"></i></span><span class="res-num"><b>${blank}</b> <small>${pc(blank)}%</small></span></div>` : ''}
          <p class="hint">${cast} vote${cast === 1 ? '' : 's'} cast on this question. Percentages are out of all votes cast${q.max > 1 ? '; each voter could choose several answers, so they can add up to more than 100%' : ''}.</p>
        </div>`;
    }).join('');
    let individual = '';
    if (!p.anonymous) {
      const byVoter = {}; ballots.forEach((b) => { if (b.voter_id) byVoter[b.voter_id] = b; });
      individual = `
        <h3 class="group-title mono" style="margin-top:26px">Individual votes</h3>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Voter</th><th>Votes</th>${p.questions.map((q, i) => `<th title="${esc(q.text)}">Q${i + 1}</th>`).join('')}<th>Voted</th></tr></thead>
          <tbody>${votersOf(p.id).map((v) => { const b = byVoter[v.id]; return `<tr${b ? '' : ' class="is-off"'}>
            <td><b style="font-weight:500">${esc(v.name)}</b></td><td>${v.weight}</td>
            ${p.questions.map((q) => `<td>${b ? esc(answerText(q, b.answers[q.id])) : '<span class="muted">—</span>'}</td>`).join('')}
            <td class="nowrap muted">${b && b.cast_at ? esc(fmtWhen(b.cast_at)) : b ? 'Yes' : 'Did not vote'}</td></tr>`; }).join('')}</tbody>
        </table></div>`;
    }
    return `
      <div class="res-summary"><span><b>${ballots.length}</b> ballot${ballots.length === 1 ? '' : 's'}</span><span><b>${t.voted}</b> / ${t.n} voters (${t.pct}%)</span>${t.w !== t.n ? `<span><b>${t.wd}</b> / ${t.w} votes</span>` : ''}${p.anonymous ? `<span>${icon('lock')}Anonymous: choices are not linked to voters</span>` : ''}</div>
      ${blocks}${individual}
      <div class="res-actions"><button class="btn" type="button" data-act="csv-results">${icon('download')}Export results</button>${p.anonymous ? '' : `<button class="btn" type="button" data-act="csv-votes">${icon('download')}Export individual votes</button>`}</div>`;
  }

  function renderPoll(view, p) {
    const st = N.pollStatus(p);
    const vs = votersOf(p.id);
    const t = turnout(p.id);
    const fresh = V.fresh[p.id];
    const ballots = V.ballots[p.id];
    if (st === 'closed' && !ballots) {
      N.api.listBallots(p.id).then((b) => { V.ballots[p.id] = b; if (C.S.page === 'votes' && C.sub() === p.id) renderPoll(view, p); })
        .catch((e) => N.toast(N.humanError(e), 'error'));
    }
    const actionsHtml = [
      `<button class="btn" type="button" data-act="edit-text">${icon('edit')}Edit text</button>`,
      st !== 'closed' ? `<button class="btn" type="button" data-act="edit-end">${icon('clock')}Change end</button>` : '',
      st === 'open' ? `<button class="btn btn-primary" type="button" data-act="close">${icon('lock')}Close now</button>` : '',
      st !== 'open' ? `<button class="btn btn-quiet-danger" type="button" data-act="delete">${icon('trash')}Delete</button>` : '',
    ].join('');

    view.innerHTML = `
      <p class="crumb mono">ESCLD <span>/</span> <a href="#votes">Votes</a> <span>/</span> ${esc(p.title)}</p>
      <div class="page-head">
        <div><h1 class="page-title">${esc(p.title)}</h1><p class="page-sub vote-sub">${statusBadge(p)}${kindBadge(p)}<span>${esc(whenLine(p))}</span></p></div>
        <div class="page-actions">${actionsHtml}</div>
      </div>
      <div class="stack">
        ${fresh ? `
          <section class="card pad fresh">
            <div class="card-head"><h2 class="card-title">${icon('key')}Personal voting links <span class="badge badge--warn">Shown only once</span></h2></div>
            <p class="fresh-txt">Send each person their own link now. <b>Email</b> opens your mail app with a ready-to-send message. For security these links are not stored anywhere: after you leave or reload this page you can only generate new ones (the old link then stops working).</p>
            <div class="table-wrap"><table class="table">
              <thead><tr><th>Voter</th><th>Personal link</th><th></th></tr></thead>
              <tbody>${fresh.map((f, i) => `<tr>
                <td><b style="font-weight:500">${esc(f.name)}</b><br><small class="muted">${esc(f.email || 'no email')}</small></td>
                <td><code class="link-code" title="${esc(f.link)}">${esc(f.link)}</code></td>
                <td class="r nowrap"><button class="btn btn-sm" type="button" data-act="copy-link" data-i="${i}">${icon('copy')}Copy</button>${f.email ? ` <a class="btn btn-sm" href="${esc(mailto(f, f.link, p))}">${icon('mail')}Email</a>` : ''}</td>
              </tr>`).join('')}</tbody></table></div>
            <div class="res-actions">
              <button class="btn" type="button" data-act="copy-all">${icon('copy')}Copy all</button>
              <button class="btn" type="button" data-act="csv-links">${icon('download')}Download (CSV)</button>
              <span class="grow"></span>
              <button class="btn btn-primary" type="button" data-act="links-done">${icon('check')}I have sent them</button>
            </div>
          </section>` : ''}

        <div class="cols">
          <section class="card pad">
            <div class="card-head"><h2 class="card-title">${icon('chart')}Results</h2></div>
            ${st !== 'closed' ? `
              <div class="locked">${icon('lock')}<div><b>Results are sealed until the vote closes</b><p>${st === 'open' ? `They will be available on ${esc(fmtWhen(p.ends_at))}, or as soon as you close the vote.` : 'The vote has not started yet.'} Nobody, administrators included, can read the ballots before then.</p></div></div>
              <h3 class="group-title mono" style="margin-top:20px">Questions</h3>
              ${p.questions.map((q, i) => `<div class="qpreview"><b>${i + 1}. ${esc(q.text)}</b><small class="muted">${q.max > 1 ? `Up to ${q.max} answers` : 'One answer'}${q.allow_blank ? ' · blank allowed' : ''}</small><ul>${q.answers.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ul></div>`).join('')}`
              : ballots ? resultsHtml(p, ballots) : '<div class="empty empty--sm"><span class="spinner"></span></div>'}
          </section>

          <div class="stack">
            ${p.notice ? `<section class="card pad"><p class="mono muted" style="margin-bottom:8px">Message for voters</p><div class="callout">${esc(p.notice)}</div></section>` : ''}
            <section class="card pad">
              <div class="card-head"><h2 class="card-title">${icon('users')}Voters</h2>
                <span class="grow"></span>
                <button class="icon-btn" type="button" data-act="refresh" title="Refresh" aria-label="Refresh">${icon('refresh')}</button>
                ${st !== 'closed' ? `<button class="btn btn-sm" type="button" data-act="add-voter">${icon('user-plus')}Add</button>` : ''}
              </div>
              <div class="turnout"><b>${t.voted}</b><span>/ ${t.n} voted</span>${t.w !== t.n ? `<small>${t.wd} / ${t.w} votes</small>` : ''}</div>
              <span class="bar" aria-hidden="true"><i style="width:${t.pct}%"></i></span>
              <div class="rows" style="margin-top:10px">${vs.map((v) => `
                <div class="row voter-row">
                  <span class="avatar avatar--sm">${esc(N.initials(v.name))}</span>
                  <span class="row-main"><b>${esc(v.name)}${v.weight > 1 ? ` <span class="badge">×${v.weight}</span>` : ''}</b><small>${esc(v.email || 'no email')}</small></span>
                  <span class="voter-state">
                    ${v.voted ? `<span class="badge badge--ok">${icon('check')}Voted${v.voted_at ? ' · ' + esc(new Date(v.voted_at).toLocaleString(N.LOCALE, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })) : ''}</span>` : '<span class="badge">Not yet</span>'}
                    ${!v.voted && st !== 'closed' ? `<button class="icon-btn" type="button" data-act="relink" data-id="${v.id}" title="New personal link" aria-label="New link for ${esc(v.name)}">${icon('refresh')}</button><button class="icon-btn danger" type="button" data-act="del-voter" data-id="${v.id}" title="Remove" aria-label="Remove ${esc(v.name)}">${icon('trash')}</button>` : ''}
                  </span>
                </div>`).join('')}</div>
            </section>
            <section class="card pad">
              <div class="card-head"><h2 class="card-title">${icon('shield')}How it is secured</h2></div>
              <ul class="sec-list">
                <li>Each voter has a personal link with a 256-bit secret. Only its fingerprint is stored, so nobody can retrieve it later.</li>
                <li>A link works once, only between the opening and the closing time. All checks are made by the database.</li>
                <li>${p.anonymous ? 'Anonymous: ballots carry no name and no time. You see who voted, never what they chose.' : 'Named: once closed, you see each person’s choices.'}</li>
                <li>Ballots cannot be changed or deleted, and stay sealed until the vote closes.</li>
              </ul>
            </section>
          </div>
        </div>
      </div>`;

    view.onclick = async (ev) => {
      const b = ev.target.closest('[data-act]');
      if (!b) return;
      const a = b.dataset.act;
      if (a === 'copy-link') { await copy(fresh[Number(b.dataset.i)].link); N.toast('Link copied.'); }
      if (a === 'copy-all') { await copy(fresh.map((f) => `${f.name}${f.email ? ' <' + f.email + '>' : ''}: ${f.link}`).join('\n')); N.toast('All links copied.'); }
      if (a === 'csv-links') N.download(`vote-links-${N.isoDay()}.csv`, N.csv(fresh, [{ label: 'Name', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Personal link', key: 'link' }]), 'text/csv;charset=utf-8');
      if (a === 'links-done') {
        const ok = await N.confirm({ title: 'Hide the links?', text: 'They will not be shown again. You can still generate a new link for anyone who has not voted yet.', submit: 'Hide the links', danger: false });
        if (ok) { delete V.fresh[p.id]; protectFreshLinks(); renderPoll(view, p); }
      }
      if (a === 'refresh') { b.disabled = true; try { await load(); if (V.ballots[p.id] && N.pollStatus(p) === 'closed') delete V.ballots[p.id]; } catch (e) { N.toast(N.humanError(e), 'error'); } const np = V.polls.find((x) => x.id === p.id); if (np) renderPoll(view, np); else C.go('votes'); }
      if (a === 'edit-text') editText(view, p);
      if (a === 'edit-end') editEnd(view, p);
      if (a === 'close') closeNow(view, p);
      if (a === 'delete') removePoll(p);
      if (a === 'add-voter') addVoter(view, p);
      if (a === 'relink') relink(view, p, V.voters.find((x) => x.id === b.dataset.id));
      if (a === 'del-voter') removeVoter(view, p, V.voters.find((x) => x.id === b.dataset.id));
      if (a === 'csv-results') exportResults(p);
      if (a === 'csv-votes') exportVotes(p);
    };
  }

  const replacePoll = (np) => { const i = V.polls.findIndex((x) => x.id === np.id); if (i >= 0) V.polls[i] = np; return np; };

  function editText(view, p) {
    N.formModal({
      title: 'Edit the text', kicker: 'Vote', values: p,
      fields: [
        { name: 'title', label: 'Title', required: true, span: 2 },
        { name: 'notice', label: 'Message for all voters', type: 'textarea', span: 2, rows: 3 },
      ],
      onSubmit: async (v) => replacePoll(await N.api.updatePoll(p.id, { title: v.title, notice: v.notice || null })),
    }).then((np) => { if (np && np.id) { N.toast('Saved.'); renderPoll(view, np); } });
  }

  function editEnd(view, p) {
    N.formModal({
      title: 'Change the closing time', kicker: p.title, small: true,
      values: { end: toLocalInput(new Date(p.ends_at)) },
      fields: [{ name: 'end', label: 'Closing date and time', type: 'datetime-local', required: true, span: 2, hint: `Currently: ${fmtWhen(p.ends_at)}` }],
      onSubmit: async (v) => {
        const e = fromLocalInput(v.end);
        if (!e || isNaN(e)) throw new Error('Choose a date and time.');
        if (e.getTime() <= Date.now()) throw new Error('The closing time must be in the future. To end the vote now, use "Close now".');
        if (e <= new Date(p.starts_at)) throw new Error('The closing time must be after the opening time.');
        return replacePoll(await N.api.updatePoll(p.id, { ends_at: e.toISOString() }));
      },
    }).then((np) => { if (np && np.id) { N.toast('Closing time updated.'); renderPoll(view, np); } });
  }

  async function closeNow(view, p) {
    const ok = await N.confirm({ title: 'Close the vote now?', text: 'Nobody will be able to vote any more and the results become available immediately. This cannot be undone.', submit: 'Close the vote' });
    if (!ok) return;
    try {
      replacePoll(await N.api.updatePoll(p.id, { closed_at: new Date().toISOString() }));
      delete V.ballots[p.id];
      await load().catch(() => {});
      const np = V.polls.find((x) => x.id === p.id) || p;
      N.toast('Vote closed.');
      renderPoll(view, np);
    } catch (e) { N.toast(N.humanError(e), 'error'); }
  }

  async function removePoll(p) {
    const t = turnout(p.id);
    const ok = await N.confirm({ title: `Delete “${p.title}”?`, text: t.voted ? `The vote, its ${t.voted} ballot(s) and its results will be permanently deleted. This cannot be undone.` : 'The vote and its voter list will be permanently deleted.', submit: 'Delete the vote' });
    if (!ok) return;
    try {
      await N.api.deletePoll(p.id);
      V.polls = V.polls.filter((x) => x.id !== p.id);
      V.voters = V.voters.filter((x) => x.poll_id !== p.id);
      delete V.fresh[p.id]; protectFreshLinks();
      N.toast('Vote deleted.');
      C.go('votes');
    } catch (e) { N.toast(N.humanError(e), 'error'); }
  }

  function showLink(p, v, link) {
    N.modal({
      title: `Link for ${v.name}`, kicker: p.title, small: true, noFocus: true,
      body: `<p class="modal-text" style="margin-bottom:12px">Send this personal link to ${esc(v.name)}. It is shown only now and works once.</p>
             <code class="link-code link-code--block">${esc(link)}</code>
             ${v.email ? `<p style="margin-top:12px"><a class="btn btn-sm" href="${esc(mailto(v, link, p))}">${icon('mail')}Open an email to ${esc(v.email)}</a></p>` : ''}`,
      cancel: 'Close', submit: 'Copy the link',
      onSubmit: async () => { await copy(link); N.toast('Link copied.'); return false; },
    });
  }

  async function relink(view, p, v) {
    if (!v) return;
    const ok = await N.confirm({ title: `New link for ${v.name}?`, text: 'Their previous link will stop working immediately.', submit: 'Generate a new link', danger: false });
    if (!ok) return;
    try {
      const token = N.newToken();
      const nv = await N.api.updateVoter(v.id, { token_hash: await N.sha256hex(token) });
      Object.assign(v, nv);
      showLink(p, v, linkFor(token));
    } catch (e) { N.toast(N.humanError(e), 'error'); }
  }

  async function removeVoter(view, p, v) {
    if (!v) return;
    const ok = await N.confirm({ title: `Remove ${v.name}?`, text: 'Their link stops working and they will no longer be able to vote.', submit: 'Remove' });
    if (!ok) return;
    try {
      await N.api.removeVoter(v.id);
      V.voters = V.voters.filter((x) => x.id !== v.id);
      if (V.fresh[p.id]) V.fresh[p.id] = V.fresh[p.id].filter((f) => f.id !== v.id);
      N.toast('Voter removed.');
      renderPoll(view, p);
    } catch (e) { N.toast(N.humanError(e), 'error'); }
  }

  function addVoter(view, p) {
    N.formModal({
      title: 'Add a voter', kicker: p.title, small: true,
      fields: [
        { name: 'name', label: 'First and last name', required: true, span: 2 },
        { name: 'email', label: 'Email', type: 'email', span: 2 },
        { name: 'weight', label: 'Votes', type: 'number', min: 1, value: 1, span: 2, hint: 'More than 1 for someone holding proxies.' },
      ],
      onSubmit: async (v) => {
        const token = N.newToken();
        const [nv] = await N.api.addVoters(p.id, [{ id: crypto.randomUUID(), name: v.name, email: v.email ? v.email.toLowerCase() : null, weight: Math.max(1, Math.min(100, v.weight || 1)), token_hash: await N.sha256hex(token) }]);
        V.voters.push(nv);
        return { nv, link: linkFor(token) };
      },
    }).then((r) => { if (r && r.nv) { renderPoll(view, p); showLink(p, r.nv, r.link); } });
  }

  function exportResults(p) {
    const rowsOut = [];
    tally(p, V.ballots[p.id] || []).forEach(({ q, counts, blank, cast }, i) => {
      q.answers.forEach((a) => rowsOut.push({ q: `Q${i + 1}. ${q.text}`, a: a.text, n: counts[a.id], pct: cast ? ((counts[a.id] / cast) * 100).toFixed(1) : '0.0' }));
      rowsOut.push({ q: `Q${i + 1}. ${q.text}`, a: 'Blank / abstention', n: blank, pct: cast ? ((blank / cast) * 100).toFixed(1) : '0.0' });
    });
    N.download(`vote-results-${N.isoDay()}.csv`, N.csv(rowsOut, [{ label: 'Question', key: 'q' }, { label: 'Answer', key: 'a' }, { label: 'Votes', key: 'n' }, { label: 'Percent', key: 'pct' }]), 'text/csv;charset=utf-8');
  }
  function exportVotes(p) {
    const byVoter = {}; (V.ballots[p.id] || []).forEach((b) => { if (b.voter_id) byVoter[b.voter_id] = b; });
    const cols = [{ label: 'Voter', key: 'name' }, { label: 'Email', key: 'email' }, { label: 'Votes', key: 'weight' }]
      .concat(p.questions.map((q, i) => ({ label: `Q${i + 1}. ${q.text}`, get: (v) => (byVoter[v.id] ? answerText(q, byVoter[v.id].answers[q.id]) : 'Did not vote') })))
      .concat([{ label: 'Voted at', get: (v) => (byVoter[v.id] && byVoter[v.id].cast_at ? fmtWhen(byVoter[v.id].cast_at) : '') }]);
    N.download(`vote-individual-${N.isoDay()}.csv`, N.csv(votersOf(p.id), cols), 'text/csv;charset=utf-8');
  }

  window.NovaExtraPages = window.NovaExtraPages || {};
  window.NovaExtraPages.votes = {
    meta: { slug: 'votes', label: 'Votes', icon: 'vote', group: 'Governance', admin: true },
    render,
  };
})();
