/* ==========================================================================
   ESCLD — online ballot (/escld/vote/#t=<personal token>)
   No account needed: the personal link is the key. Every check (link valid,
   vote open, one vote per link, valid answers) is made by the database in
   vote_cast (saas-setup/votes.sql). The token stays in the URL fragment, which
   browsers never send to servers.
   ========================================================================== */
(function () {
  'use strict';
  const N = window.Nova;
  const { esc, icon } = N;
  const app = document.getElementById('app');
  const token = new URLSearchParams(location.hash.slice(1)).get('t') || '';
  const S = { data: null, timer: null };

  const fmtWhen = (iso) => new Date(iso).toLocaleString(N.LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  function left(iso) {
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return 'closing now';
    const m = Math.floor(ms / 60000), d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    if (d) return `${d} day${d > 1 ? 's' : ''} ${h} h left`;
    if (h) return `${h} h ${m % 60} min left`;
    return `${Math.max(1, m)} min left`;
  }
  const ERR = {
    invalid_link: 'This voting link is not valid any more.',
    already_voted: 'A vote has already been cast with this link.',
    vote_closed: 'This vote is closed.',
    vote_not_open: 'This vote has not opened yet.',
    invalid_answers: 'One of your answers is not valid. Reload the page and try again.',
    too_many_answers: 'You chose more answers than allowed for one of the questions.',
    answer_required: 'Please answer every required question.',
  };
  const errText = (e) => { const m = String((e && e.message) || e || ''); const k = Object.keys(ERR).find((x) => m.includes(x)); return k ? ERR[k] : N.humanError(e); };

  function shell(inner) {
    app.innerHTML = `
      <div class="ballot">
        <header class="ballot-head"><span class="pbadge">E.</span><span><b>ESCLD</b><small class="mono">Secure online vote</small></span></header>
        ${inner}
        <footer class="ballot-foot">${icon('lock')}<span>This link is personal and secure. Please do not forward it: it can be used only once.</span></footer>
      </div>`;
  }
  function message(ic, title, html, extra) {
    shell(`<section class="card ballot-msg"><span class="blocked-ico">${icon(ic)}</span><h1>${esc(title)}</h1><p>${html}</p>${extra || ''}</section>`);
  }
  const answerText = (q, ids) => (ids && ids.length ? ids.map((id) => esc((q.answers.find((a) => a.id === id) || { text: '?' }).text)).join(', ') : '<span class="muted">Blank (abstention)</span>');
  const summary = (poll, answers) => `<dl class="ballot-summary">${poll.questions.map((q) => `<div><dt>${esc(q.text)}</dt><dd>${answerText(q, answers[q.id])}</dd></div>`).join('')}</dl>`;

  async function start() {
    if (N.MODE === 'off') return N.renderOff();
    if (!token) return message('link', 'Incomplete link', 'Please open the personal voting link you received, in full.');
    let data;
    try { data = await N.api.ballot(token); }
    catch (e) { return message('alert', 'Cannot connect', esc(N.humanError(e)), '<button class="btn btn-primary" type="button" onclick="location.reload()">Try again</button>'); }
    if (!data || data.error) return message('lock', 'This link is not valid', 'It may be incomplete, or it has been replaced by a newer link. Contact the organisers if you think this is a mistake.');
    S.data = data;
    draw();
  }

  function draw() {
    const { poll, voter, my_answers: mine } = S.data;
    document.title = `${poll.title} · ESCLD vote`;
    clearInterval(S.timer);
    if (voter.voted) {
      return message('check', 'Your vote has been recorded',
        `Thank you, ${esc(voter.name.split(' ')[0])}. Your vote on <b>${esc(poll.title)}</b> was recorded${voter.voted_at ? ' on ' + esc(fmtWhen(voter.voted_at)) : ''}. It cannot be changed.`,
        poll.anonymous ? `<p class="ballot-kind">${icon('lock')}Anonymous vote: your choices were recorded without your name.</p>` : (mine ? `<h2 class="group-title mono" style="margin-top:18px">Your vote</h2>${summary(poll, mine)}` : ''));
    }
    if (poll.status === 'closed') return message('lock', 'This vote is closed', `<b>${esc(poll.title)}</b> closed on ${esc(fmtWhen(poll.ends_at))}. It is no longer possible to vote.`);
    if (poll.status === 'scheduled') {
      message('clock', 'Voting has not opened yet', `<b>${esc(poll.title)}</b> opens on <b>${esc(fmtWhen(poll.starts_at))}</b>. Come back with this same link then.`, poll.notice ? `<div class="callout" style="margin-top:16px">${esc(poll.notice)}</div>` : '');
      S.timer = setInterval(() => { if (Date.now() >= new Date(poll.starts_at).getTime()) location.reload(); }, 20000);
      return;
    }
    drawBallot(poll, voter);
  }

  function drawBallot(poll, voter) {
    const n = poll.questions.length;
    shell(`
      <section class="card ballot-intro">
        <p class="mono muted">Online vote</p>
        <h1>${esc(poll.title)}</h1>
        <p class="ballot-meta">Voting as <b>${esc(voter.name)}</b>${voter.weight > 1 ? ` · your vote counts <b>${voter.weight}</b> times` : ''}</p>
        <p class="ballot-meta">${icon('clock')}Closes ${esc(fmtWhen(poll.ends_at))} · <span data-left>${esc(left(poll.ends_at))}</span></p>
        <p class="ballot-kind">${poll.anonymous ? `${icon('lock')}Anonymous vote: your choices are recorded without your name.` : `${icon('eye')}Named vote: the organisers will see your choices.`}</p>
        ${poll.notice ? `<div class="callout">${esc(poll.notice)}</div>` : ''}
      </section>
      <form class="ballot-form" novalidate>
        ${poll.questions.map((q, i) => `
          <fieldset class="card q-card" data-q="${esc(q.id)}">
            <legend><span class="mono muted">Question ${i + 1}${n > 1 ? ' of ' + n : ''}</span></legend>
            <h2>${esc(q.text)}</h2>
            <p class="q-rule">${q.max > 1 ? `Choose up to ${q.max} answers` : 'Choose one answer'}${q.allow_blank ? ' · or leave it blank to abstain' : ''}</p>
            <div class="opts">${q.answers.map((a) => `
              <label class="opt"><input type="${q.max > 1 ? 'checkbox' : 'radio'}" name="${esc(q.id)}" value="${esc(a.id)}"><span class="opt-mark">${icon('check')}</span><span class="opt-txt">${esc(a.text)}</span></label>`).join('')}
            </div>
            ${q.allow_blank && q.max === 1 ? `<button class="btn btn-quiet btn-sm" type="button" data-clear="${esc(q.id)}">Clear my choice</button>` : ''}
          </fieldset>`).join('')}
        <p class="form-error" role="alert" hidden></p>
        <button class="btn btn-primary ballot-submit" type="submit">Review my vote ${icon('arrow-right')}</button>
      </form>`);

    const form = app.querySelector('form');
    const err = form.querySelector('.form-error');
    const picked = (q) => [...form.querySelectorAll(`input[name="${CSS.escape(q.id)}"]:checked`)].map((x) => x.value);
    const limit = () => poll.questions.forEach((q) => {
      if (q.max <= 1) return;
      const boxes = [...form.querySelectorAll(`input[name="${CSS.escape(q.id)}"]`)];
      const full = boxes.filter((b) => b.checked).length >= q.max;
      boxes.forEach((b) => { b.disabled = full && !b.checked; b.closest('.opt').classList.toggle('is-off', b.disabled); });
    });
    form.addEventListener('change', () => { err.hidden = true; limit(); });
    form.addEventListener('click', (e) => {
      const c = e.target.closest('[data-clear]');
      if (c) form.querySelectorAll(`input[name="${CSS.escape(c.dataset.clear)}"]`).forEach((x) => { x.checked = false; });
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const answers = {};
      const missingQ = [];
      poll.questions.forEach((q, i) => { answers[q.id] = picked(q); if (!answers[q.id].length && !q.allow_blank) missingQ.push(i + 1); });
      if (missingQ.length) { err.textContent = `Please answer question${missingQ.length > 1 ? 's' : ''} ${missingQ.join(', ')}.`; err.hidden = false; err.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
      const res = await N.modal({
        title: 'Confirm your vote', kicker: poll.title, noFocus: true,
        body: `<p class="modal-text" style="margin-bottom:14px">Check your choices. <b>Once confirmed, your vote cannot be changed.</b></p>${summary(poll, answers)}`,
        cancel: 'Back to the ballot', submit: 'Confirm my vote',
        onSubmit: async () => { try { await N.api.cast(token, answers); } catch (ex) { throw new Error(errText(ex)); } return 'done'; },
      });
      if (res === 'done') {
        S.data.voter.voted = true;
        S.data.voter.voted_at = poll.anonymous ? null : new Date().toISOString();
        S.data.my_answers = poll.anonymous ? null : answers;
        window.scrollTo({ top: 0 });
        draw();
      }
    });

    S.timer = setInterval(() => {
      const el = app.querySelector('[data-left]');
      if (el) el.textContent = left(poll.ends_at);
      if (Date.now() >= new Date(poll.ends_at).getTime()) { clearInterval(S.timer); start(); }
    }, 30000);
  }

  start();
})();
