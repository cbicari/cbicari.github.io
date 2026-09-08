/*
 * Fixed full-viewport canvas behind the page content: a slow, organic line
 * pattern (value noise, no dependencies) that widens/tightens with the
 * pointer's X position and shifts radius with its Y position. Colors are
 * read from the page's own CSS custom properties, so it reuses whatever
 * palette --paper / --copper-dark resolve to.
 */
(function () {
  'use strict';

  var canvas = document.createElement('canvas');
  canvas.id = 'bg-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none;';
  document.body.insertBefore(canvas, document.body.firstChild);

  var ctx = canvas.getContext('2d');
  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var rootStyle = getComputedStyle(document.documentElement);
  var paperColor = (rootStyle.getPropertyValue('--paper') || '#F5F6F3').trim();
  var lineColor = (rootStyle.getPropertyValue('--copper-dark') || '#7C3F1F').trim();
  var lineRGB = hexToRgb(lineColor) || { r: 124, g: 63, b: 31 };

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }

  var W, H, DPR;
  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  window.addEventListener('resize', resize);
  resize();

  var mx = W / 2, my = H * 0.4, tx = mx, ty = my;
  function setPointer(x, y) { mx = x; my = y; }
  window.addEventListener('mousemove', function (e) { setPointer(e.clientX, e.clientY); }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches[0]) setPointer(e.touches[0].clientX, e.touches[0].clientY);
  }, { passive: true });

  // Smooth hash-based value noise (1D input, no libraries).
  function hash(n) { var s = Math.sin(n) * 43758.5453123; return s - Math.floor(s); }
  function noise(x) {
    var i = Math.floor(x), f = x - i;
    var u = f * f * (3 - 2 * f);
    return hash(i) * (1 - u) + hash(i + 1) * u;
  }

  var t = 0;

  function drawFrame() {
    // Pointer position eases toward the raw input so motion stays gentle.
    tx += (mx - tx) * 0.04;
    ty += (my - ty) * 0.04;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H * 0.4);

    var turns = 42 + (tx / Math.max(W, 1)) * 34;      // ~42..76, driven by pointer X
    var baseRad = Math.min(W, H) * (0.26 + (ty / Math.max(H, 1)) * 0.1);

    ctx.strokeStyle = 'rgba(' + lineRGB.r + ',' + lineRGB.g + ',' + lineRGB.b + ',0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i <= 720; i++) {
      var ang = (i * Math.PI / 180) * (turns / 42);
      var rad = baseRad * noise(i * 0.045 + t * 0.0006);
      var x = rad * Math.sin(ang);
      var y = rad * Math.cos(ang) * 0.55; // flattened, editorial rather than circular
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();

    t += 5;
    if (!reduced) requestAnimationFrame(drawFrame);
  }

  drawFrame();
})();
