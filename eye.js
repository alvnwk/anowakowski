/* ==========================================================================
   NOVA CORPORATE — Intro
   An eye written with its own source code. Every glyph on screen is a
   character of this very file, shaded in black & white by the eye's
   anatomy (lids, sclera, iris fibres, pupil, corneal reflections).
   ========================================================================== */
(function eyeProgram() {
  'use strict';

  var root = document.documentElement;
  var intro = document.getElementById('intro');
  if (!intro || root.classList.contains('is-site')) return;

  var cv = document.getElementById('eye');
  var ctx = null, R = null;
  var sub = document.getElementById('subtitle');
  var enterBtn = document.getElementById('enter-btn');
  var voiceIntro = document.getElementById('voice-intro');
  var voiceEnter = document.getElementById('voice-enter');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------- text */
  var BG = '#0e0e0e';
  var MONO = '"SF Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", monospace';
  var SRC = eyeProgram.toString().replace(/\s+/g, ' ');
  var DENSE = SRC.replace(/ /g, '');
  var NOVA = 'NOVA';
  var GLITCH = '#%&@$*+=<>/\\|{}[]01';
  var LEVELS = 32;

  var CHARS = [];
  var charMap = new Map();
  function idx(ch) {
    if (!charMap.has(ch)) { charMap.set(ch, CHARS.length); CHARS.push(ch); }
    return charMap.get(ch);
  }
  var SPACE = 65535;
  function toIdx(str) {
    var a = new Uint16Array(str.length);
    for (var i = 0; i < str.length; i++) a[i] = str[i] === ' ' ? SPACE : idx(str[i]);
    return a;
  }
  var SRC_I = toIdx(SRC), DENSE_I = toIdx(DENSE), NOVA_I = toIdx(NOVA), GLITCH_I = toIdx(GLITCH);
  var SN = SRC_I.length, DN = DENSE_I.length, GN = GLITCH_I.length;

  /* --------------------------------------------------------------- maths */
  function ss(a, b, x) { var t = (x - a) / (b - a); t = t < 0 ? 0 : t > 1 ? 1 : t; return t * t * (3 - 2 * t); }
  function hash(a, b) {
    var h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }

  /* ------------------------------------------------------------- canvas */
  // cw/ch: cell size in CSS px · cwPx/chPx: the same cell in device pixels
  var W, H, dpr, cw, ch, cwPx, chPx, cols, rows, E, CX, CY;
  var atlas = document.createElement('canvas');
  var g1 = document.createElement('canvas'), g1x = g1.getContext('2d');
  var g2 = document.createElement('canvas'), g2x = g2.getContext('2d');
  var rowBase = [], rowSpeed = [];

  function paintAtlas(levels) {
    atlas.width = cwPx * CHARS.length; atlas.height = chPx * levels * 2;
    var a = atlas.getContext('2d');
    a.clearRect(0, 0, atlas.width, atlas.height);
    a.textAlign = 'center'; a.textBaseline = 'middle';
    for (var w = 0; w < 2; w++) {
      a.font = (w ? '700 ' : '400 ') + (cwPx * 1.5).toFixed(2) + 'px ' + MONO;
      for (var l = 0; l < levels; l++) {
        var v = levels === 1 ? 255 : Math.round(255 * Math.pow((l + 1) / levels, 0.92));
        a.fillStyle = 'rgb(' + v + ',' + v + ',' + v + ')';
        var y = (w * levels + l) * chPx + chPx * 0.55;
        for (var i = 0; i < CHARS.length; i++) a.fillText(CHARS[i], i * cwPx + cwPx / 2, y);
      }
    }
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    if (!W || !H) return;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    var minCell = dpr > 1.4 ? (W < 700 ? 3.2 : 4.4) : 6.5;
    var css = R ? Math.max(minCell, Math.min(8, W / 240)) : Math.max(6, Math.min(10, W / 150));
    cwPx = Math.max(5, Math.round(css * dpr)); chPx = Math.round(cwPx * 1.62);
    cw = cwPx / dpr; ch = chPx / dpr;
    cols = Math.ceil(cv.width / cwPx); rows = Math.ceil(cv.height / chPx);
    E = H > W ? Math.min(W * 0.6, H * 0.5) : Math.min(W * 0.42, H * 0.7);
    CX = W / 2; CY = H * 0.47;
    if (R) { sizeGL(); return; }
    g1.width = Math.max(1, Math.ceil(W / 4)); g1.height = Math.max(1, Math.ceil(H / 4));
    g2.width = Math.max(1, Math.ceil(W / 10)); g2.height = Math.max(1, Math.ceil(H / 10));
    for (var r = rowBase.length; r < rows; r++) {
      rowBase[r] = Math.floor(hash(r, 11) * SN);
      rowSpeed[r] = 0.7 + hash(r, 29) * 2.2;
    }
    paintAtlas(LEVELS);
  }

  /* ---------------------------------------------------- per-frame state */
  var OP = 0, GX = 0, GY = 0, ICX = 0, ICY = 0.04, PU = 0.34, ZM = 1, ZX = 0, ZY = 0;
  var NX = 0, NY = 0, FS = 0, SCAN = -9;
  var IR = 0.38;
  var Z_BG = 0, Z_SKIN = 1, Z_SCLERA = 2, Z_PUPIL = 3, Z_IRIS = 4, Z_SPEC = 5;
  var zone = 0, irisQ = 0;

  /* --------------------------------------------------------------- eye */
  function field(x, y) {
    if (ZM !== 1) { x = ZX + (x - ZX) / ZM; y = ZY + (y - ZY) / ZM; }
    var ax = Math.abs(x);
    var yU = 9, yL = -9, yUo = 0, wu = 0, wl = 0;
    if (ax < 1) {
      var tilt = -0.035 * x;
      var xu = x + 0.12 * (1 - x * x), xl = x - 0.1 * (1 - x * x);
      wu = 1 - xu * xu; wl = 1 - xl * xl;
      var yLo = 0.335 * Math.pow(wl, 1.05) + 0.03 + tilt + GY * 0.03 * wl;
      yUo = -0.4 * Math.pow(wu, 0.8) + 0.02 + tilt + GY * 0.07 * Math.sqrt(wu);
      yL = yLo - 0.04 * (1 - OP) * wl;
      yU = yL - (yL - yUo) * OP;
      if (y > yU && y < yL) return eyeball(x, y, ax, yU, yL);
    }
    return skin(x, y, ax, yU, yL, yUo, wu, wl);
  }

  function eyeball(x, y, ax, yU, yL) {
    var L;
    var dx = x - ICX, dy = y - ICY, ux = dx, uy = dy;
    if (FS > 0.001) { // the iris is a disc on a sphere: foreshorten it along the gaze
      var dn = dx * NX + dy * NY, dp = -dx * NY + dy * NX, d2 = dn / (1 - FS);
      ux = d2 * NX - dp * NY; uy = d2 * NY + dp * NX;
    }
    var k = Math.sqrt(ux * ux + uy * uy) / IR;

    var Ls = 0.98 - 0.34 * Math.pow(ax, 2.4) - 0.1 * Math.max(0, y);
    Ls *= 0.92 + 0.08 * vnoise(x * 34, y * 34);
    if (ax > 0.5) { var vn = Math.abs(vnoise(x * 16 + 3, y * 16) - 0.5); if (vn < 0.03) Ls *= 0.78; }
    var cd = Math.hypot((x + 0.95) / 0.08, (y - 0.03) / 0.07);
    if (cd < 1) Ls = Ls * ss(0.6, 1, cd) + (0.42 + 0.14 * vnoise(x * 70, y * 70)) * (1 - ss(0.6, 1, cd));

    if (k < 1.09) {
      if (k < PU) { zone = Z_PUPIL; L = 0; irisQ = 0; }
      else if (k < 1) {
        zone = Z_IRIS;
        var q = (k - PU) / (1 - PU); irisQ = q;
        var th = Math.atan2(uy, ux), nx = ux / IR, ny = uy / IR;
        var f1 = Math.sin(th * 36 + 1.7 * Math.sin(th * 5 + q * 4) + q * 3);
        var f2 = Math.sin(th * 21 - q * 7 + 2.4 * vnoise(nx * 4 + 7, ny * 4 + 7));
        var fib = 0.5 + 0.28 * f1 + 0.22 * f2;
        var cr = vnoise(nx * 6.5 + 13, ny * 6.5 + 2);
        var crypt = ss(0.6, 0.78, cr) * ss(0.06, 0.2, q) * (1 - ss(0.6, 0.85, q));
        var coll = Math.exp(-Math.pow((q - 0.3 - 0.04 * Math.sin(th * 9 + 1.5 * Math.sin(th * 4))) / 0.05, 2));
        L = (0.32 + 0.32 * (1 - q)) * (0.42 + 0.95 * fib) + 0.26 * coll;
        L *= 1 - 0.6 * crypt;
        L *= 1 - 0.55 * ss(0.1, 0, q);
        L *= 1 - 0.25 * Math.exp(-Math.pow((q - 0.7) / 0.02, 2)) * (0.5 + 0.5 * Math.sin(th * 2 + 1));
        L *= 1 - 0.88 * ss(0.76, 1, q);
      } else {
        var m = ss(1, 1.09, k);
        L = Ls * m + 0.06 * (1 - m);
        zone = Z_SCLERA;
      }
    } else { L = Ls; zone = Z_SCLERA; }

    L *= 1 - 0.62 * Math.exp(-(y - yU) / 0.055);
    L *= 1 - 0.28 * Math.exp(-(yL - y) / 0.028);
    if (yL - y < 0.017 && ax < 0.85 && OP > 0.5) L = Math.max(L, 0.72 * (1 - ax));

    if (y - yU > 0.012) {
      var hx = x - (ICX - 0.118 - 0.02 * GX), hy = y - (ICY - 0.125 - 0.012 * GY);
      var e = Math.pow(Math.abs(hx) / 0.064, 4) + Math.pow(Math.abs(hy) / 0.05, 4);
      if (e < 1) { L = 1; zone = Z_SPEC; }
      else if (e < 1.7) L = Math.max(L, 0.55 * (1.7 - e) / 0.7 + L * 0.5);
      var h2 = Math.hypot(x - (ICX + 0.13 + 0.015 * GX), y - (ICY + 0.12));
      if (h2 < 0.024) { L = 0.94; zone = Z_SPEC; }
    }
    return L;
  }

  function skin(x, y, ax, yU, yL, yUo, wu, wl) {
    var rr = Math.hypot(x * 0.66, (y + 0.08) * 1.02);
    var fade = 1 - ss(0.42, 1.12, rr);
    var L = 0;
    if (fade > 0) {
      var tex = vnoise(x * 24, y * 24) * 0.6 + vnoise(x * 7 + 5, y * 7) * 0.4;
      L = 0.24 + 0.1 * (tex - 0.5);
      if (ax < 1) {
        var du = yU - y, dl = y - yL;
        if (du > 0) {
          var yCr = yUo - 0.12 * Math.pow(wu, 0.6) + 0.04 * (1 - OP) * wu;
          if (y > yCr) L += 0.12 * Math.sqrt(wu);
          L -= 0.2 * Math.exp(-Math.pow((y - yCr) / 0.024, 2)) * Math.pow(wu, 0.7);
          L += 0.06 * Math.exp(-Math.pow((y - yCr + 0.12) / 0.08, 2)) * wu;
          if (du < 0.03) L *= 0.08 + 0.5 * du / 0.03;
          // upper lashes: strands rooted on the lid margin, fanning outwards
          var x0 = x - du * 0.95 * x - du * du * 3.2 * x;
          var u = x0 * 30 + 0.6 * vnoise(x0 * 20, 3);
          var len = (0.05 + 0.12 * wu) * (0.7 + 0.6 * hash(Math.floor(u), 3));
          if (du < len) {
            var fu = Math.abs(u - Math.floor(u) - 0.5);
            if (fu < 0.2 * (1 - du / len) + 0.04) L *= 0.1;
          }
        } else if (dl > 0) {
          if (dl < 0.018) L = (0.56 + 0.1 * tex) * (0.6 + 0.4 * wl);
          else if (dl < 0.03) L *= 0.3;
          L -= 0.13 * Math.exp(-Math.pow((y - (yL + 0.13 * wl)) / 0.035, 2)) * wl;
          var x1 = x - (dl - 0.03) * 0.8 * x;
          var u2 = x1 * 20 + 0.5 * vnoise(x1 * 15, 9);
          var len2 = 0.05 * wl * (0.6 + 0.8 * hash(Math.floor(u2), 5));
          if (dl > 0.03 && dl - 0.03 < len2 && Math.abs(u2 - Math.floor(u2) - 0.5) < 0.14) L *= 0.25;
        }
      }
      L *= fade;
      if (L < 0) L = 0;
    }
    var bg = 0.07 + 0.07 * Math.exp(-Math.pow((y - SCAN) / 0.06, 2));
    if (L < bg) { L = bg; zone = Z_BG; } else zone = Z_SKIN;
    return L;
  }

  /* -------------------------------------------------------------- state */
  // modes: boot → (sleep) → narrate → prompt → enter → done
  var mode = 'boot';
  var openTarget = 0, openAmt = 0, blinkT = -1, nextBlink = 0, doubleBlink = false;
  var tx = 0, ty = 0, gx = 0, gy = 0, lastMove = -1e9, nextSaccade = 0, sx = 0, sy = 0;
  var pointerX = -1, pointerY = -1, hover = false;
  var pupilTarget = 0.34, pupil = 0.34;
  var novaMix = 0, novaOn = false;
  var enterT = 0, glitch = 0, last = 0, running = true, drawMs = 0;
  var DEBUG = /[?&]debug\b/.test(location.search);
  var FORCE_BLOCK = /[?&]noautoplay\b/.test(location.search), blockedOnce = false;
  var startT = performance.now();

  function aim(px, py) {
    var vx = (px - CX) / (E * 1.05), vy = (py - CY) / (E * 0.8);
    tx = vx / Math.sqrt(1 + vx * vx); ty = vy / Math.sqrt(1 + vy * vy);
  }

  function irisScreen() { return [CX + ICX * E, CY + ICY * E]; }

  function overIris(px, py) {
    var p = irisScreen(), r = IR * E * 1.08;
    return Math.hypot(px - p[0], py - p[1]) < r || Math.hypot(px - CX, py - (CY + 0.04 * E)) < r * 0.9;
  }

  function update(now, dt) {
    var t = now - startT;

    // --- gaze: follow the pointer, wander when idle (saccades)
    var idle = now - lastMove > 2600;
    if (mode === 'enter') { tx = 0; ty = 0; }
    else if (idle) {
      if (now > nextSaccade) {
        sx = (Math.random() * 2 - 1) * 0.55; sy = (Math.random() * 2 - 1) * 0.4;
        if (Math.random() < 0.35) { sx = 0; sy = 0; }
        nextSaccade = now + 600 + Math.random() * 1900;
      }
      tx = sx; ty = sy;
    }
    var rate = mode === 'sleep' ? 5 : 15;
    var kk = 1 - Math.exp(-dt * rate);
    gx += (tx - gx) * kk; gy += (ty - gy) * kk;
    var jx = 0.006 * Math.sin(t * 0.013) + 0.004 * Math.sin(t * 0.031);
    var jy = 0.005 * Math.cos(t * 0.017);
    GX = gx + jx; GY = gy + jy;
    ICX = GX * 0.36; ICY = 0.04 + GY * 0.14;
    var gm = Math.hypot(GX, GY);
    if (gm > 1e-4) { NX = GX / gm; NY = GY / gm; FS = Math.min(0.32, gm * 0.3); } else FS = 0;

    // --- lids: wake / sleep / blink
    var rk = 1 - Math.exp(-dt * (openTarget > openAmt ? 2.6 : 6));
    openAmt += (openTarget - openAmt) * rk;
    var b = 1;
    if (blinkT >= 0) {
      var e = now - blinkT;
      if (e < 80) b = 1 - (e / 80) * (e / 80);
      else if (e < 120) b = 0;
      else if (e < 320) { var s = (e - 120) / 200; b = 1 - Math.pow(1 - s, 3); }
      else {
        blinkT = -1;
        if (!doubleBlink && Math.random() < 0.18) { doubleBlink = true; nextBlink = now + 90; }
        else { doubleBlink = false; nextBlink = now + (mode === 'sleep' ? 3600 : 2200) + Math.random() * 4200; }
      }
    } else if (now > nextBlink && openAmt > 0.25 && mode !== 'enter' && !reduceMotion) blinkT = now;
    var drowsy = mode === 'sleep' ? 0.05 * Math.sin(t * 0.0011) : 0;
    OP = Math.max(0, Math.min(1, (openAmt + drowsy) * b));

    // --- pupil: hippus, dilates when the cursor rests on it, opens wide to let you in
    hover = mode === 'prompt' && pointerX >= 0 && overIris(pointerX, pointerY);
    root.classList.toggle('eye-hover', hover);
    pupilTarget = mode === 'enter' ? 0.96 : hover ? 0.48 : mode === 'sleep' ? 0.42 : 0.34;
    pupil += (pupilTarget - pupil) * (1 - Math.exp(-dt * (mode === 'enter' ? 7 : 4)));
    PU = pupil + 0.012 * Math.sin(t * 0.0011) + 0.008 * Math.sin(t * 0.0037);

    // --- "I can see Nova": the iris rewrites itself as NOVA
    if (novaOn && novaMix < 1) novaMix = Math.min(1, novaMix + dt * 0.9);

    // --- scan line sweeping the screen
    SCAN = ((t % 7000) / 7000) * 3.2 - 1.6;

    // --- entering: dive through the pupil
    ZM = 1; glitch = 0.0015;
    if (mode === 'enter') {
      var et = now - enterT;
      var zt = Math.max(0, Math.min(1, (et - 260) / 1250));
      ZM = Math.exp(easeInOut(zt) * Math.log(80));
      ZX = ICX; ZY = ICY;
      glitch = 0.002 + zt * 0.06;
      if (et > 1380 && !root.classList.contains('intro-out')) finish();
    }
  }

  /* ---------------------------------------------------- render: canvas 2D */
  function draw2D(now) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = BG; ctx.fillRect(0, 0, cv.width, cv.height);
    var warp = mode === 'enter' ? 1 + (ZM - 1) * 0.08 : 1;
    var secs = now * 0.001;
    for (var r = 0; r < rows; r++) {
      var y = ((r + 0.5) * ch - CY) / E;
      var off = rowBase[r] + Math.floor(secs * rowSpeed[r] * warp);
      var dy = r * chPx;
      for (var c = 0; c < cols; c++) {
        var L = field(((c + 0.5) * cw - CX) / E, y);
        if (L < 0.03) continue;
        var k = off + c, ci;
        if (zone === Z_IRIS && novaMix > 0 && irisQ < novaMix * 1.15) ci = NOVA_I[k & 3];
        else if (zone >= Z_SCLERA) ci = DENSE_I[k % DN];
        else { ci = SRC_I[k % SN]; if (ci === SPACE) continue; }
        if (Math.random() < glitch) ci = GLITCH_I[(Math.random() * GN) | 0];
        var lvl = (L * LEVELS) | 0; if (lvl >= LEVELS) lvl = LEVELS - 1;
        var wgt = L > 0.62 || zone === Z_SPEC ? 1 : 0;
        ctx.drawImage(atlas, ci * cwPx, (wgt * LEVELS + lvl) * chPx, cwPx, chPx, c * cwPx, dy, cwPx, chPx);
      }
    }
    g1x.globalCompositeOperation = 'copy'; g1x.drawImage(cv, 0, 0, g1.width, g1.height);
    g2x.globalCompositeOperation = 'copy'; g2x.drawImage(g1, 0, 0, g2.width, g2.height);
    ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.32;
    ctx.drawImage(g2, 0, 0, cv.width, cv.height);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  /* ------------------------------------------------------- render: GPU */
  // Pass 1 evaluates the eye's anatomy once per character cell.
  // Pass 2 types the source code into every pixel, glyph by glyph, and adds a soft bloom.
  var VS = 'attribute vec2 aP;void main(){gl_Position=vec4(aP,0.0,1.0);}';
  var GL_HEAD = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH',
    'precision highp float;',
    '#else',
    'precision mediump float;',
    '#endif',
    'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float sq(float v){return v*v;}',
    'float sst(float a,float b,float x){float t=clamp((x-a)/(b-a),0.0,1.0);return t*t*(3.0-2.0*t);}',
    'float vn(vec2 p){vec2 i=floor(p),f=fract(p),u=f*f*(3.0-2.0*f);',
    '  return mix(mix(h21(i),h21(i+vec2(1.0,0.0)),u.x),mix(h21(i+vec2(0.0,1.0)),h21(i+vec2(1.0,1.0)),u.x),u.y);}'
  ].join('\n');

  var FS_CELL = GL_HEAD + '\n' + [
    'uniform vec2 uGrid,uCell,uCenter,uG,uIC;',
    'uniform float uE,uOP,uPU,uScan;',
    'uniform vec3 uZ,uN;',
    'const float IR=0.38;',
    'vec3 eyeball(float x,float y,float ax,float yU,float yL){',
    '  float L=0.0;float zone=2.0;float iq=0.0;',
    '  vec2 d=vec2(x,y)-uIC;vec2 u=d;',
    '  if(uN.z>0.001){float dn=dot(d,uN.xy);float dp=-d.x*uN.y+d.y*uN.x;float d2=dn/(1.0-uN.z);u=vec2(d2*uN.x-dp*uN.y,d2*uN.y+dp*uN.x);}',
    '  float k=length(u)/IR;',
    '  float Ls=0.98-0.34*pow(ax,2.4)-0.1*max(0.0,y);',
    '  Ls*=0.92+0.08*vn(vec2(x,y)*34.0);',
    '  if(ax>0.5){float vv=abs(vn(vec2(x*16.0+3.0,y*16.0))-0.5);if(vv<0.03)Ls*=0.78;}',
    '  float cd=length(vec2((x+0.95)/0.08,(y-0.03)/0.07));',
    '  if(cd<1.0){float m=sst(0.6,1.0,cd);Ls=Ls*m+(0.42+0.14*vn(vec2(x,y)*70.0))*(1.0-m);}',
    '  if(k<1.09){',
    '    if(k<uPU){zone=3.0;L=0.0;}',
    '    else if(k<1.0){',
    '      zone=4.0;float q=(k-uPU)/(1.0-uPU);iq=q;',
    '      float th=atan(u.y,u.x);vec2 n=u/IR;',
    '      float f1=sin(th*36.0+1.7*sin(th*5.0+q*4.0)+q*3.0);',
    '      float f2=sin(th*21.0-q*7.0+2.4*vn(n*4.0+7.0));',
    '      float fib=0.5+0.28*f1+0.22*f2;',
    '      float cr=vn(n*6.5+vec2(13.0,2.0));',
    '      float crypt=sst(0.6,0.78,cr)*sst(0.06,0.2,q)*(1.0-sst(0.6,0.85,q));',
    '      float coll=exp(-sq((q-0.3-0.04*sin(th*9.0+1.5*sin(th*4.0)))/0.05));',
    '      L=(0.32+0.32*(1.0-q))*(0.42+0.95*fib)+0.26*coll;',
    '      L*=1.0-0.6*crypt;',
    '      L*=1.0-0.55*sst(0.1,0.0,q);',
    '      L*=1.0-0.25*exp(-sq((q-0.7)/0.02))*(0.5+0.5*sin(th*2.0+1.0));',
    '      L*=1.0-0.88*sst(0.76,1.0,q);',
    '    } else {float m=sst(1.0,1.09,k);L=Ls*m+0.06*(1.0-m);}',
    '  } else {L=Ls;}',
    '  L*=1.0-0.62*exp(-(y-yU)/0.055);',
    '  L*=1.0-0.28*exp(-(yL-y)/0.028);',
    '  if(yL-y<0.017&&ax<0.85&&uOP>0.5)L=max(L,0.72*(1.0-ax));',
    '  if(y-yU>0.012){',
    '    vec2 hh=vec2(x,y)-(uIC+vec2(-0.118-0.02*uG.x,-0.125-0.012*uG.y));',
    '    float e=pow(abs(hh.x)/0.064,4.0)+pow(abs(hh.y)/0.05,4.0);',
    '    if(e<1.0){L=1.0;zone=5.0;}',
    '    else if(e<1.7)L=max(L,0.55*(1.7-e)/0.7+L*0.5);',
    '    float h2=length(vec2(x,y)-(uIC+vec2(0.13+0.015*uG.x,0.12)));',
    '    if(h2<0.024){L=0.94;zone=5.0;}',
    '  }',
    '  return vec3(L,zone,iq);',
    '}',
    'vec3 skin(float x,float y,float ax,float yU,float yL,float yUo,float wu,float wl){',
    '  float rr=length(vec2(x*0.66,(y+0.08)*1.02));',
    '  float fade=1.0-sst(0.42,1.12,rr);',
    '  float L=0.0;',
    '  if(fade>0.0){',
    '    float tex=vn(vec2(x,y)*24.0)*0.6+vn(vec2(x*7.0+5.0,y*7.0))*0.4;',
    '    L=0.24+0.1*(tex-0.5);',
    '    if(ax<1.0){',
    '      float du=yU-y;float dl=y-yL;',
    '      if(du>0.0){',
    '        float yCr=yUo-0.12*pow(wu,0.6)+0.04*(1.0-uOP)*wu;',
    '        if(y>yCr)L+=0.12*sqrt(wu);',
    '        L-=0.2*exp(-sq((y-yCr)/0.024))*pow(wu,0.7);',
    '        L+=0.06*exp(-sq((y-yCr+0.12)/0.08))*wu;',
    '        if(du<0.03)L*=0.08+0.5*du/0.03;',
    '        float x0=x-du*0.95*x-du*du*3.2*x;',
    '        float uu=x0*30.0+0.6*vn(vec2(x0*20.0,3.0));',
    '        float len=(0.05+0.12*wu)*(0.7+0.6*h21(vec2(floor(uu),3.0)));',
    '        if(du<len){float fu=abs(fract(uu)-0.5);if(fu<0.2*(1.0-du/len)+0.04)L*=0.1;}',
    '      } else if(dl>0.0){',
    '        if(dl<0.018)L=(0.56+0.1*tex)*(0.6+0.4*wl);',
    '        else if(dl<0.03)L*=0.3;',
    '        L-=0.13*exp(-sq((y-(yL+0.13*wl))/0.035))*wl;',
    '        float x1=x-(dl-0.03)*0.8*x;',
    '        float u2=x1*20.0+0.5*vn(vec2(x1*15.0,9.0));',
    '        float len2=0.05*wl*(0.6+0.8*h21(vec2(floor(u2),5.0)));',
    '        if(dl>0.03&&dl-0.03<len2&&abs(fract(u2)-0.5)<0.14)L*=0.25;',
    '      }',
    '    }',
    '    L=max(0.0,L*fade);',
    '  }',
    '  float bg=0.07+0.07*exp(-sq((y-uScan)/0.06));',
    '  if(L<bg)return vec3(bg,0.0,0.0);',
    '  return vec3(L,1.0,0.0);',
    '}',
    'void main(){',
    '  vec2 cell=floor(gl_FragCoord.xy);',
    '  float row=uGrid.y-1.0-cell.y;',
    '  float x=((cell.x+0.5)*uCell.x-uCenter.x)/uE;',
    '  float y=((row+0.5)*uCell.y-uCenter.y)/uE;',
    '  if(uZ.x!=1.0){x=uZ.y+(x-uZ.y)/uZ.x;y=uZ.z+(y-uZ.z)/uZ.x;}',
    '  float ax=abs(x);',
    '  float yU=9.0,yL=-9.0,yUo=0.0,wu=0.0,wl=0.0;',
    '  vec3 r;bool inEye=false;',
    '  if(ax<1.0){',
    '    float tilt=-0.035*x;',
    '    float xu=x+0.12*(1.0-x*x),xl=x-0.1*(1.0-x*x);',
    '    wu=max(0.0,1.0-xu*xu);wl=max(0.0,1.0-xl*xl);',
    '    float yLo=0.335*pow(wl,1.05)+0.03+tilt+uG.y*0.03*wl;',
    '    yUo=-0.4*pow(wu,0.8)+0.02+tilt+uG.y*0.07*sqrt(wu);',
    '    yL=yLo-0.04*(1.0-uOP)*wl;',
    '    yU=yL-(yL-yUo)*uOP;',
    '    if(y>yU&&y<yL){r=eyeball(x,y,ax,yU,yL);inEye=true;}',
    '  }',
    '  if(!inEye)r=skin(x,y,ax,yU,yL,yUo,wu,wl);',
    '  gl_FragColor=vec4(clamp(r.x,0.0,1.0),r.y/8.0,clamp(r.z,0.0,1.0),1.0);',
    '}'
  ].join('\n');

  var FS_GLYPH = GL_HEAD + '\n' + [
    'uniform sampler2D uCells,uAtlas,uSrc,uDense;',
    'uniform vec2 uGrid,uCellPx,uRes,uSrcTex,uDenseTex;',
    'uniform float uNChars,uSrcLen,uDenseLen,uTime,uWarp,uNova,uGlitch;',
    'uniform vec4 uNovaIdx;',
    'uniform vec3 uBG;',
    'float idxAt(sampler2D t,vec2 dim,float i){float yy=floor(i/dim.x);float xx=i-yy*dim.x;',
    '  return floor(texture2D(t,(vec2(xx,yy)+0.5)/dim).r*255.0+0.5);}',
    'vec4 cellAt(vec2 c){return texture2D(uCells,vec2((c.x+0.5)/uGrid.x,(uGrid.y-c.y-0.5)/uGrid.y));}',
    'void main(){',
    '  vec2 fp=vec2(gl_FragCoord.x,uRes.y-gl_FragCoord.y);',
    '  vec2 cell=floor(fp/uCellPx);',
    '  vec2 lp=(fp-cell*uCellPx)/uCellPx;',
    '  vec3 col=uBG;',
    '  vec2 cc=fp/uCellPx-0.5;',
    '  float gs=0.0,ws=0.0;',
    '  for(int i=-1;i<=1;i++){for(int j=-1;j<=1;j++){',
    '    vec2 nc=cell+vec2(float(i),float(j))*2.0;vec2 dd=nc-cc;float w=exp(-dot(dd,dd)/4.5);',
    '    gs+=cellAt(clamp(nc,vec2(0.0),uGrid-1.0)).r*w;ws+=w;}}',
    '  float glow=gs/ws;',
    '  if(cell.x<uGrid.x&&cell.y<uGrid.y){',
    '    vec4 cd=cellAt(cell);',
    '    float L=cd.r;float zone=floor(cd.g*8.0+0.5);float q=cd.b;',
    '    if(L>=0.03){',
    '      float base=floor(h21(vec2(cell.y,11.0))*uSrcLen);',
    '      float speed=0.7+h21(vec2(cell.y,29.0))*2.2;',
    '      float k=base+floor(uTime*speed*uWarp)+cell.x;',
    '      float ci=-1.0;',
    '      if(zone>3.5&&zone<4.5&&uNova>0.0&&q<uNova*1.15){',
    '        float m=mod(k,4.0);',
    '        ci=m<0.5?uNovaIdx.x:m<1.5?uNovaIdx.y:m<2.5?uNovaIdx.z:uNovaIdx.w;',
    '      } else if(zone>1.5){ci=idxAt(uDense,uDenseTex,mod(k,uDenseLen));}',
    '      else {ci=idxAt(uSrc,uSrcTex,mod(k,uSrcLen));if(ci>254.5)ci=-1.0;}',
    '      if(ci>=0.0){',
    '        if(h21(cell+floor(uTime*12.0)*vec2(0.37,1.13))<uGlitch)ci=floor(h21(cell.yx+fract(uTime)*91.0)*uNChars);',
    '        float bold=(L>0.62||zone>4.5)?1.0:0.0;',
    '        float a=texture2D(uAtlas,vec2((ci+lp.x)/uNChars,(bold+lp.y)*0.5)).a;',
    '        col=mix(col,vec3(pow(L,0.92)),a);',
    '      }',
    '    }',
    '  }',
    '  col+=vec3(glow*glow*0.14);',
    '  gl_FragColor=vec4(col,1.0);',
    '}'
  ].join('\n');

  function initGL() {
    var g = null;
    try {
      g = cv.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: DEBUG });
    } catch (err) { g = null; }
    if (!g) return null;
    function shader(type, src) {
      var s = g.createShader(type);
      g.shaderSource(s, src); g.compileShader(s);
      if (!g.getShaderParameter(s, g.COMPILE_STATUS)) { if (DEBUG) console.warn(g.getShaderInfoLog(s)); return null; }
      return s;
    }
    function program(fs) {
      var v = shader(g.VERTEX_SHADER, VS), f = shader(g.FRAGMENT_SHADER, fs);
      if (!v || !f) return null;
      var p = g.createProgram();
      g.attachShader(p, v); g.attachShader(p, f);
      g.bindAttribLocation(p, 0, 'aP');
      g.linkProgram(p);
      if (!g.getProgramParameter(p, g.LINK_STATUS)) { if (DEBUG) console.warn(g.getProgramInfoLog(p)); return null; }
      var u = {}, n = g.getProgramParameter(p, g.ACTIVE_UNIFORMS);
      for (var i = 0; i < n; i++) { var name = g.getActiveUniform(p, i).name; u[name] = g.getUniformLocation(p, name); }
      return { p: p, u: u };
    }
    var pc = program(FS_CELL), pg = program(FS_GLYPH);
    if (!pc || !pg) return 'failed';
    var buf = g.createBuffer();
    g.bindBuffer(g.ARRAY_BUFFER, buf);
    g.bufferData(g.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), g.STATIC_DRAW);
    g.enableVertexAttribArray(0);
    g.vertexAttribPointer(0, 2, g.FLOAT, false, 0, 0);
    g.pixelStorei(g.UNPACK_ALIGNMENT, 1);
    function texture() {
      var t = g.createTexture();
      g.bindTexture(g.TEXTURE_2D, t);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MIN_FILTER, g.NEAREST);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_MAG_FILTER, g.NEAREST);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_S, g.CLAMP_TO_EDGE);
      g.texParameteri(g.TEXTURE_2D, g.TEXTURE_WRAP_T, g.CLAMP_TO_EDGE);
      return t;
    }
    function textTexture(arr) {
      var tw = 1024, th = Math.ceil(arr.length / tw), data = new Uint8Array(tw * th);
      for (var i = 0; i < arr.length; i++) data[i] = arr[i] === SPACE ? 255 : arr[i];
      var t = texture();
      g.texImage2D(g.TEXTURE_2D, 0, g.LUMINANCE, tw, th, 0, g.LUMINANCE, g.UNSIGNED_BYTE, data);
      return { t: t, w: tw, h: th };
    }
    return {
      g: g, pc: pc, pg: pg,
      src: textTexture(SRC_I), dense: textTexture(DENSE_I),
      atlas: texture(), cells: texture(), fb: g.createFramebuffer()
    };
  }

  function sizeGL() {
    var g = R.g;
    paintAtlas(1);
    g.bindTexture(g.TEXTURE_2D, R.atlas);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, g.RGBA, g.UNSIGNED_BYTE, atlas);
    g.bindTexture(g.TEXTURE_2D, R.cells);
    g.texImage2D(g.TEXTURE_2D, 0, g.RGBA, cols, rows, 0, g.RGBA, g.UNSIGNED_BYTE, null);
    g.bindFramebuffer(g.FRAMEBUFFER, R.fb);
    g.framebufferTexture2D(g.FRAMEBUFFER, g.COLOR_ATTACHMENT0, g.TEXTURE_2D, R.cells, 0);
    g.bindFramebuffer(g.FRAMEBUFFER, null);
  }

  function drawGL(now) {
    var g = R.g, u;
    g.bindFramebuffer(g.FRAMEBUFFER, R.fb);
    g.viewport(0, 0, cols, rows);
    g.useProgram(R.pc.p); u = R.pc.u;
    g.uniform2f(u.uGrid, cols, rows); g.uniform2f(u.uCell, cw, ch); g.uniform2f(u.uCenter, CX, CY);
    g.uniform1f(u.uE, E); g.uniform1f(u.uOP, OP); g.uniform1f(u.uPU, PU); g.uniform1f(u.uScan, SCAN);
    g.uniform2f(u.uG, GX, GY); g.uniform2f(u.uIC, ICX, ICY);
    g.uniform3f(u.uZ, ZM, ZX, ZY); g.uniform3f(u.uN, NX, NY, FS);
    g.drawArrays(g.TRIANGLES, 0, 3);

    g.bindFramebuffer(g.FRAMEBUFFER, null);
    g.viewport(0, 0, cv.width, cv.height);
    g.useProgram(R.pg.p); u = R.pg.u;
    var units = [R.cells, R.atlas, R.src.t, R.dense.t], names = ['uCells', 'uAtlas', 'uSrc', 'uDense'];
    for (var i = 0; i < 4; i++) { g.activeTexture(g.TEXTURE0 + i); g.bindTexture(g.TEXTURE_2D, units[i]); g.uniform1i(u[names[i]], i); }
    g.uniform2f(u.uGrid, cols, rows); g.uniform2f(u.uCellPx, cwPx, chPx); g.uniform2f(u.uRes, cv.width, cv.height);
    g.uniform2f(u.uSrcTex, R.src.w, R.src.h); g.uniform2f(u.uDenseTex, R.dense.w, R.dense.h);
    g.uniform1f(u.uNChars, CHARS.length); g.uniform1f(u.uSrcLen, SN); g.uniform1f(u.uDenseLen, DN);
    g.uniform1f(u.uTime, now / 1000); g.uniform1f(u.uWarp, mode === 'enter' ? 1 + (ZM - 1) * 0.08 : 1);
    g.uniform1f(u.uNova, novaMix); g.uniform1f(u.uGlitch, glitch);
    g.uniform4f(u.uNovaIdx, NOVA_I[0], NOVA_I[1], NOVA_I[2], NOVA_I[3]);
    g.uniform3f(u.uBG, 14 / 255, 14 / 255, 14 / 255);
    g.drawArrays(g.TRIANGLES, 0, 3);
    g.activeTexture(g.TEXTURE0);
  }

  function pickRenderer() {
    var want2D = /[?&]2d\b/.test(location.search);
    var r = want2D ? null : initGL();
    if (r && r !== 'failed') { R = r; return; }
    if (r === 'failed') { // a canvas that gave out a WebGL context cannot switch to 2D: swap it
      var fresh = cv.cloneNode(false);
      cv.parentNode.replaceChild(fresh, cv);
      cv = fresh;
    }
    R = null;
    ctx = cv.getContext('2d', { alpha: false });
  }

  function loop(now) {
    if (!running) return;
    requestAnimationFrame(loop);
    if (window.innerWidth !== W || window.innerHeight !== H) resize();
    var dt = Math.min(0.05, (now - (last || now)) / 1000); last = now;
    update(now, dt);
    tickSubtitles(now);
    if (W > 0 && H > 0) {
      var t0 = performance.now();
      if (R) drawGL(now); else draw2D(now);
      drawMs += (performance.now() - t0 - drawMs) * 0.05;
      if (DEBUG) window.__eyeMs = drawMs;
    }
  }

  /* ---------------------------------------------------------- subtitles */
  var CUES = [
    { from: 0.05, to: 2.12, words: [['I', 0.14], ['can', 0.33], ['see', 0.5], ['the', 0.8], ['future.', 1.0]] },
    { from: 2.16, to: 99, words: [['I', 2.22], ['can', 2.4], ['see', 2.55], ['Nova.', 2.96]] }
  ];
  var NOVA_AT = 2.96;
  var cueEls = [], activeCue = -1, clockMode = 'audio', fakeStart = 0, narrationDone = false;

  function buildCues() {
    sub.textContent = '';
    cueEls = CUES.map(function (cue) {
      var line = document.createElement('span');
      line.className = 'sub-line';
      cue.words.forEach(function (w, i) {
        var s = document.createElement('span');
        s.className = 'sub-word'; s.textContent = w[0];
        line.appendChild(s);
        if (i < cue.words.length - 1) line.appendChild(document.createTextNode(' '));
      });
      sub.appendChild(line);
      return line;
    });
  }

  function clock() {
    if (clockMode === 'audio') return voiceIntro.currentTime || 0;
    return (performance.now() - fakeStart) / 1000;
  }

  function tickSubtitles() {
    if (mode !== 'narrate') return;
    var t = clock();
    var ci = -1;
    for (var i = 0; i < CUES.length; i++) if (t >= CUES[i].from && t < CUES[i].to) ci = i;
    if (ci !== activeCue) {
      cueEls.forEach(function (el, j) { el.classList.toggle('is-on', j === ci); });
      activeCue = ci;
    }
    if (ci >= 0) {
      var words = cueEls[ci].querySelectorAll('.sub-word');
      CUES[ci].words.forEach(function (w, j) { if (t >= w[1]) words[j].classList.add('is-on'); });
    }
    if (!novaOn && t >= NOVA_AT) novaOn = true;
    var ended = clockMode === 'audio' ? voiceIntro.ended : t > 3.8;
    if (ended && !narrationDone) { narrationDone = true; setTimeout(showPrompt, 650); }
  }

  function showPrompt() {
    if (mode !== 'narrate') return;
    mode = 'prompt';
    cueEls.forEach(function (el) { el.classList.remove('is-on'); });
    var p = document.createElement('span');
    p.className = 'sub-line sub-prompt';
    p.textContent = 'Click the center of the eye';
    sub.appendChild(p);
    void p.offsetWidth; p.classList.add('is-on');
    enterBtn.textContent = 'Click the center of the eye to enter Nova';
  }

  function showHint() {
    sub.textContent = '';
    var p = document.createElement('span');
    p.className = 'sub-line sub-prompt sub-hint';
    p.textContent = 'Click anywhere to begin';
    sub.appendChild(p);
    void p.offsetWidth; p.classList.add('is-on');
  }

  /* ---------------------------------------------------------- narration */
  function beginNarration(useAudio) {
    mode = 'narrate';
    openTarget = 1;
    nextBlink = performance.now() + 1500;
    buildCues();
    clockMode = useAudio ? 'audio' : 'timer';
    fakeStart = performance.now();
  }

  function tryNarration() {
    if (FORCE_BLOCK && mode === 'boot' && !blockedOnce) { blockedOnce = true; goSleep(); return; }
    voiceIntro.currentTime = 0;
    var p;
    try { p = voiceIntro.play(); } catch (err) { p = Promise.reject(err); }
    if (!p || !p.then) { beginNarration(true); return; }
    p.then(function () { beginNarration(true); }).catch(function (err) {
      if (err && err.name === 'NotAllowedError' && mode === 'boot') { goSleep(); }
      else { beginNarration(false); }
    });
  }

  function goSleep() {
    mode = 'sleep';
    openTarget = 0.4;
    nextBlink = performance.now() + 2600;
    showHint();
  }

  /* -------------------------------------------------------------- enter */
  function enter() {
    if (mode !== 'prompt') return;
    mode = 'enter';
    enterT = performance.now();
    blinkT = -1;
    try {
      voiceEnter.currentTime = 0;
      var p = voiceEnter.play();
      if (p && p.catch) p.catch(function () {});
    } catch (err) { /* sound is a bonus */ }
    root.classList.add('intro-entering');
    root.classList.remove('eye-hover');
  }

  function finish() {
    root.classList.add('intro-out');
    if (window.Nova && typeof window.Nova.reveal === 'function') window.Nova.reveal();
    setTimeout(function () {
      running = false;
      window.removeEventListener('resize', resize);
      intro.setAttribute('hidden', '');
    }, 1100);
  }

  /* -------------------------------------------------------------- input */
  window.addEventListener('pointermove', function (e) {
    pointerX = e.clientX; pointerY = e.clientY; lastMove = performance.now();
    if (mode !== 'enter') aim(e.clientX, e.clientY);
  }, { passive: true });
  document.addEventListener('mouseleave', function () { lastMove = -1e9; pointerX = -1; });

  intro.addEventListener('pointerdown', function (e) {
    pointerX = e.clientX; pointerY = e.clientY; lastMove = performance.now();
    if (mode !== 'enter') aim(e.clientX, e.clientY);
  });
  intro.addEventListener('click', function (e) {
    if (mode === 'sleep') { mode = 'boot'; tryNarration(); return; }
    if (mode === 'prompt') {
      if (overIris(e.clientX, e.clientY)) enter();
      else { root.classList.remove('prompt-nudge'); void sub.offsetWidth; root.classList.add('prompt-nudge'); }
    }
  });
  enterBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    if (mode === 'sleep') { mode = 'boot'; tryNarration(); } else if (mode === 'prompt') enter();
  });
  window.addEventListener('keydown', function (e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (document.activeElement === enterBtn) return;
    if (mode === 'sleep') { mode = 'boot'; tryNarration(); } else if (mode === 'prompt') enter();
  });

  /* --------------------------------------------------------------- boot */
  pickRenderer();
  resize();
  window.addEventListener('resize', resize);
  requestAnimationFrame(loop);
  setTimeout(function () { if (mode === 'boot') tryNarration(); }, 650);
})();
