/* ==========================================================================
   NOVA CORPORATE — Site
   ========================================================================== */
(function siteProgram() {
  'use strict';

  var root = document.documentElement;
  var site = document.getElementById('site');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(pointer: fine)').matches;
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#%&/<>{}=+*';

  /* ------------------------------------------------------------ reveal */
  var revealed = false;
  function reveal(fromIntro) {
    if (revealed) return;
    revealed = true;
    site.inert = false;
    if (fromIntro) window.scrollTo(0, 0);
    root.classList.add('is-site');
    startMark();
    observeReveals();
  }
  window.Nova = { reveal: function () { reveal(true); } };

  if (root.classList.contains('is-site')) {
    document.addEventListener('DOMContentLoaded', function () { reveal(false); });
    if (document.readyState !== 'loading') reveal(false);
  } else {
    site.inert = true;
  }

  /* ------------------------------------------------------ small things */
  var year = document.getElementById('year');
  if (year) year.textContent = new Date().getFullYear();

  var clock = document.getElementById('clock');
  function tickClock() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    clock.textContent = 'Local ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  if (clock) { tickClock(); setInterval(tickClock, 1000); }

  var replay = document.getElementById('replay');
  if (replay) replay.addEventListener('click', function (e) {
    e.preventDefault();
    history.replaceState(null, '', location.pathname);
    location.reload();
  });

  var nav = document.querySelector('.nav');
  var onScroll = function () { nav.classList.toggle('is-scrolled', window.scrollY > 40); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var track = document.querySelector('.marquee-track');
  if (track) track.innerHTML += track.innerHTML;

  /* ------------------------------------------------------------ cursor */
  if (fine && !reduce) {
    root.classList.add('has-cursor');
    var cur = document.querySelector('.cursor');
    var dot = cur.querySelector('.cursor-dot'), ring = cur.querySelector('.cursor-ring');
    var mx = -100, my = -100, rx = -100, ry = -100;
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
    }, { passive: true });
    document.addEventListener('pointerover', function (e) {
      var hot = e.target.closest && e.target.closest('a, button, .v');
      cur.classList.toggle('is-hot', !!hot);
    });
    (function follow() {
      rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
      requestAnimationFrame(follow);
    })();
  }

  /* ---------------------------------------------------------- scramble */
  function scramble(el, duration) {
    if (el._scrambling || reduce) return;
    var text = el.dataset.text || (el.dataset.text = el.textContent);
    el._scrambling = true;
    var w = el.getBoundingClientRect().width;
    el.style.display = 'inline-block';
    el.style.minWidth = w + 'px';
    var start = performance.now();
    duration = duration || 520;
    (function step(now) {
      var p = Math.min(1, (now - start) / duration);
      var out = '';
      for (var i = 0; i < text.length; i++) {
        if (text[i] === ' ' || i / text.length < p) out += text[i];
        else out += GLYPHS[(Math.random() * GLYPHS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(step);
      else { el.textContent = text; el._scrambling = false; el.style.minWidth = ''; }
    })(start);
  }
  document.querySelectorAll('[data-scramble]').forEach(function (el) {
    el.addEventListener('mouseenter', function () { scramble(el); });
  });
  document.querySelectorAll('.step').forEach(function (s) {
    var n = s.querySelector('.step-n');
    s.addEventListener('mouseenter', function () { scramble(n, 400); });
  });

  // venture 03: a name that refuses to resolve
  var redact = document.querySelector('.redact');
  if (redact && !reduce) {
    var word = redact.dataset.redact;
    var fitRedact = function () { redact.textContent = word; redact.style.width = ''; redact.style.width = redact.getBoundingClientRect().width + 'px'; };
    fitRedact();
    window.addEventListener('resize', fitRedact);
    setInterval(function () {
      if (!revealed) return;
      var out = '';
      var settle = (Date.now() % 5200) < 1300;
      for (var i = 0; i < word.length; i++) {
        out += settle && Math.random() < 0.85 ? word[i] : GLYPHS[(Math.random() * 36) | 0];
      }
      redact.textContent = out;
    }, 90);
  }

  /* ------------------------------------------------------ scroll reveal */
  function observeReveals() {
    var targets = document.querySelectorAll('.reveal, .h2, .mega, .label');
    if (!('IntersectionObserver' in window)) {
      targets.forEach(function (t) { t.classList.add('in', 'lines-in'); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = en.target;
        el.classList.add('in');
        if (el.classList.contains('h2') || el.classList.contains('mega')) el.classList.add('lines-in');
        if (el.classList.contains('label')) scramble(el, 700);
        io.unobserve(el);
      });
    }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
    targets.forEach(function (t) { if (!t.closest('.hero')) io.observe(t); });
  }

  // vision: words light up as you read down
  var vision = document.querySelector('[data-words]');
  if (vision) {
    var words = vision.textContent.trim().split(/\s+/);
    vision.innerHTML = words.map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');
    var spans = vision.querySelectorAll('.w');
    var ticking = false;
    var paint = function () {
      ticking = false;
      var r = vision.getBoundingClientRect(), vh = window.innerHeight;
      var p = (vh * 0.82 - r.top) / (r.height + vh * 0.25);
      var n = Math.round(Math.max(0, Math.min(1, p)) * spans.length);
      for (var i = 0; i < spans.length; i++) spans[i].classList.toggle('on', i < n);
    };
    window.addEventListener('scroll', function () { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
    paint();
  }

  /* ------------------------------------------------ hero: code chevron */
  function startMark() {
    var cv = document.getElementById('mark');
    if (!cv || cv._on) return;
    cv._on = true;
    var x = cv.getContext('2d');
    var SRC = siteProgram.toString().replace(/\s+/g, '');
    var MONO = '"SF Mono", "SFMono-Regular", Menlo, Monaco, Consolas, monospace';
    // logo geometry (viewBox -196 0 392 281)
    var P = [[0, 0], [196, 196], [111, 281], [0, 170], [-111, 281], [-196, 196]];
    var W, H, dpr, cw, ch, cols, rows, mask, born, scale, ox, oy;
    var px = -1e4, py = -1e4, visible = true, looping = false, t0 = performance.now();

    function inside(vx, vy) {
      var c = false;
      for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
        var xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
        if ((yi > vy) !== (yj > vy) && vx < (xj - xi) * (vy - yi) / (yj - yi) + xi) c = !c;
      }
      return c;
    }

    function size() {
      var r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = r.width; H = r.height;
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
      cw = Math.max(6, Math.min(10, W / 58)); ch = cw * 1.6;
      cols = Math.floor(W / cw); rows = Math.floor(H / ch);
      scale = Math.min(W / 392, H / 281) * 0.94;
      ox = W / 2; oy = (H - 281 * scale) / 2;
      mask = new Uint8Array(cols * rows); born = new Float32Array(cols * rows);
      for (var r2 = 0; r2 < rows; r2++) for (var c = 0; c < cols; c++) {
        var vx = ((c + 0.5) * cw - ox) / scale, vy = ((r2 + 0.5) * ch - oy) / scale;
        var i = r2 * cols + c;
        mask[i] = inside(vx, vy) ? 1 : 0;
        born[i] = 300 + r2 * 26 + Math.random() * 500;
      }
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.font = '500 ' + (cw * 1.45).toFixed(1) + 'px ' + MONO;
      x.textBaseline = 'top';
    }

    window.addEventListener('pointermove', function (e) {
      var r = cv.getBoundingClientRect(); px = e.clientX - r.left; py = e.clientY - r.top;
    }, { passive: true });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (en) { visible = en[0].isIntersecting; if (visible) kick(); }).observe(cv);
    }
    window.addEventListener('resize', size);
    size();

    function kick() { if (!looping) { looping = true; requestAnimationFrame(draw); } }

    function draw(now) {
      if (!visible) { looping = false; return; }
      var t = now - t0;
      x.clearRect(0, 0, W, H);
      var scanY = ((t % 5200) / 5200) * (H + 160) - 80;
      var shift = Math.floor(t / 140);
      var buckets = [[], [], []];
      for (var r = 0; r < rows; r++) {
        var yy = r * ch;
        for (var c = 0; c < cols; c++) {
          var i = r * cols + c;
          var cx = c * cw, cy = yy;
          var d = Math.hypot(cx - px, cy - py);
          if (mask[i]) {
            if (t < born[i] && !reduce) {
              if (Math.random() < 0.5) buckets[2].push(GLYPHS[(Math.random() * GLYPHS.length) | 0], cx, cy);
              continue;
            }
            var ch2 = SRC[(i * 7 + shift + r * 13) % SRC.length];
            if (d < 70 && Math.random() < 0.5) ch2 = GLYPHS[(Math.random() * GLYPHS.length) | 0];
            var lit = Math.abs(cy - scanY) < 26 || d < 90;
            buckets[lit ? 0 : 1].push(ch2, cx, cy);
          } else if (c % 3 === 0 && r % 2 === 0) {
            buckets[2].push(d < 110 ? '+' : '·', cx, cy);
          }
        }
      }
      var styles = ['#ffffff', 'rgba(255,255,255,0.78)', 'rgba(255,255,255,0.16)'];
      for (var b = 0; b < 3; b++) {
        x.fillStyle = styles[b];
        var a = buckets[b];
        for (var k = 0; k < a.length; k += 3) x.fillText(a[k], a[k + 1], a[k + 2]);
      }
      if (!reduce) requestAnimationFrame(draw); else looping = false;
    }
    kick();
  }
})();
