/* ==========================================================================
   NOVA CORPORATE — v2 · site
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  var site = document.getElementById('site');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var fine = window.matchMedia('(pointer: fine)').matches;
  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

  /* ------------------------------------------------- hand-off from the eye */
  var revealed = false;
  function reveal(fromIntro) {
    if (revealed) return;
    revealed = true;
    if (site) site.inert = false;
    if (fromIntro) window.scrollTo(0, 0);
    root.classList.add('is-site');
    observeReveals();
    startLens();
  }
  window.Nova = { reveal: function () { reveal(true); } };
  if (root.classList.contains('is-site')) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { reveal(false); });
    else reveal(false);
  } else if (site) {
    site.inert = true;
  }

  /* ------------------------------------------------------------ cursor */
  // White dot + ring that grows over anything clickable.
  if (fine && !reduce && document.querySelector('.cursor')) {
    root.classList.add('has-cursor');
    var cur = document.querySelector('.cursor');
    var dot = cur.querySelector('.cursor-dot'), ring = cur.querySelector('.cursor-ring');
    var mx = -100, my = -100, rx = -100, ry = -100;
    window.addEventListener('pointermove', function (e) {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = 'translate3d(' + mx + 'px,' + my + 'px,0)';
    }, { passive: true });
    document.addEventListener('pointerover', function (e) {
      var hot = e.target.closest && e.target.closest('a, button, .slide, .card, .row');
      cur.classList.toggle('is-hot', !!hot);
    });
    (function follow() {
      rx += (mx - rx) * 0.2; ry += (my - ry) * 0.2;
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
      requestAnimationFrame(follow);
    })();
  }

  /* ----------------------------------------------------------- details */
  document.querySelectorAll('.year').forEach(function (y) { y.textContent = new Date().getFullYear(); });

  document.querySelectorAll('.replay').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      var onHome = !!document.getElementById('intro');
      if (onHome) { history.replaceState(null, '', location.pathname); location.reload(); }
      else location.href = 'index.html';
    });
  });

  var hd = document.querySelector('.hd');
  if (hd) {
    var onScroll = function () { hd.classList.toggle('is-scrolled', window.scrollY > 40); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  /* ---------------------------------------------- lens over the headline */
  // A circle follows the cursor and shows, under the words, what Nova sees.
  var lensOn = false;
  function startLens() {
    var stage = document.getElementById('lens');
    if (!stage || lensOn) return;
    lensOn = true;
    var hero = stage.closest('.hero') || stage;
    var rev = stage.querySelector('.lens-reveal');
    var px = 0, py = 0, inside = false, visible = true;
    var x = 0, y = 0, r = 0, t0 = performance.now(), w = 0, h = 0, R = 120;
    function measure() {
      var b = rev.getBoundingClientRect();
      w = b.width; h = b.height;
      R = Math.max(70, Math.min(200, parseFloat(getComputedStyle(stage.querySelector('.lens-base')).fontSize) * 1.05));
      if (!x) { x = w * 0.5; y = h * 0.5; }
    }
    measure();
    window.addEventListener('resize', measure);
    hero.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var b = rev.getBoundingClientRect();
      px = e.clientX - b.left; py = e.clientY - b.top; inside = true;
    });
    hero.addEventListener('pointerleave', function () { inside = false; });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (en) { visible = en[0].isIntersecting; }).observe(hero);
    (function loop(now) {
      requestAnimationFrame(loop);
      if (!visible) return;
      var t = now - t0, tx, ty, tr;
      if (inside) { tx = px; ty = py; tr = R; }
      else { tx = w * (0.5 + 0.34 * Math.sin(t * 0.00042)); ty = h * (0.5 + 0.26 * Math.sin(t * 0.00071 + 1)); tr = R * 0.82; }
      var k = reduce ? 1 : 0.12;
      x += (tx - x) * k; y += (ty - y) * k; r += (tr - r) * 0.06;
      rev.style.setProperty('--x', x.toFixed(1) + 'px');
      rev.style.setProperty('--y', y.toFixed(1) + 'px');
      rev.style.setProperty('--r', r.toFixed(1) + 'px');
    })(t0);
  }

  /* ------------------------------------------------------ rolling numbers */
  var counters = document.querySelectorAll('[data-count]');
  counters.forEach(function (el) {
    var target = el.getAttribute('data-count');
    el.setAttribute('aria-label', target);
    el.textContent = '';
    target.split('').forEach(function (ch) {
      var d = document.createElement('span'); d.className = 'digit'; d.setAttribute('aria-hidden', 'true');
      var col = document.createElement('span');
      for (var i = 0; i < 20; i++) { var n = document.createElement('i'); n.textContent = i % 10; col.appendChild(n); }
      col.dataset.to = 10 + parseInt(ch, 10);
      d.appendChild(col); el.appendChild(d);
    });
  });
  function roll(el) {
    el.querySelectorAll('.digit > span').forEach(function (col, i) {
      col.style.transitionDelay = (i * 0.12) + 's';
      col.style.transform = 'translateY(' + (-0.9 * col.dataset.to) + 'em)';
    });
  }

  /* --------------------------------------------------- reveal on scroll */
  function observeReveals() {
    var items = document.querySelectorAll('.rv, [data-count]');
    if (!('IntersectionObserver' in window)) { items.forEach(function (el) { el.classList.add('in'); if (el.hasAttribute('data-count')) roll(el); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        en.target.classList.add('in');
        if (en.target.hasAttribute('data-count')) roll(en.target);
        io.unobserve(en.target);
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { io.observe(el); });

    // approach: the row in the middle of the screen lights up (handy on touch screens)
    var rows = document.querySelectorAll('.row');
    if (rows.length) {
      var rio = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { en.target.classList.toggle('on', en.isIntersecting); });
      }, { rootMargin: '-42% 0px -42% 0px' });
      rows.forEach(function (r) { rio.observe(r); });
    }
  }

  /* -------------------------------------------- vision, read as you scroll */
  var vision = document.querySelector('[data-words]');
  if (vision) {
    var words = vision.textContent.trim().split(/\s+/);
    vision.innerHTML = words.map(function (w) { return '<span class="w">' + w + '</span>'; }).join(' ');
    var spans = vision.querySelectorAll('.w');
    var paint = function () {
      var b = vision.getBoundingClientRect(), vh = window.innerHeight;
      var p = (vh * 0.8 - b.top) / (b.height + vh * 0.3);
      var n = Math.round(Math.max(0, Math.min(1, p)) * spans.length);
      for (var i = 0; i < spans.length; i++) spans[i].classList.toggle('on', i < n);
    };
    window.addEventListener('scroll', function () { requestAnimationFrame(paint); }, { passive: true });
    paint();
  }

  /* ---------------------------------- stacked ventures: the card underneath steps back */
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  if (slides.length > 1 && !reduce) {
    var stackPaint = function () {
      var vh = window.innerHeight;
      for (var i = 0; i < slides.length - 1; i++) {
        var a = slides[i].getBoundingClientRect(), b = slides[i + 1].getBoundingClientRect();
        var p = Math.max(0, Math.min(1, (a.bottom - b.top) / Math.max(1, a.height)));
        slides[i].style.transform = 'scale(' + (1 - 0.06 * p).toFixed(4) + ')';
        slides[i].style.filter = p > 0.01 ? 'brightness(' + (1 - 0.45 * p).toFixed(3) + ')' : '';
      }
      void vh;
    };
    window.addEventListener('scroll', function () { requestAnimationFrame(stackPaint); }, { passive: true });
    window.addEventListener('resize', stackPaint);
    stackPaint();
  }

  /* ---------------------------------------- a name that refuses to resolve */
  var redact = document.querySelector('.redact');
  if (redact && !reduce) {
    var word = redact.dataset.redact;
    var fit = function () { redact.textContent = word; redact.style.width = ''; redact.style.width = redact.getBoundingClientRect().width + 'px'; };
    fit();
    window.addEventListener('resize', fit);
    setInterval(function () {
      var out = '', settle = (Date.now() % 5200) < 1300;
      for (var i = 0; i < word.length; i++) out += settle && Math.random() < 0.85 ? word[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
      redact.textContent = out;
    }, 90);
  }
})();
