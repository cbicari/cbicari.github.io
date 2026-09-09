/*
 * Fixed full-viewport canvas behind the page content: a single dense,
 * self-crossing curve built the same way as yecto's original p5 sketch
 * (yecto.github.io/js/sketch8.js) — a huge number of angular steps run
 * through a noise-modulated radius, so the line wraps back on itself
 * hundreds of times and reads as one intricate, organic figure rather
 * than a repeated motif. Reimplemented here in plain canvas (no p5.js)
 * so the page stays dependency-free. Pointer X changes how tightly the
 * curve winds, same as the original's mouseX mapping; a slow envelope
 * makes the whole figure breathe — expanding and contracting — over time.
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
  var lineRGB = hexToRgb(rootStyle.getPropertyValue('--copper-dark')) || { r: 124, g: 63, b: 31 };

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim());
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

  var mx = W * 0.5, my = H * 0.0004, tx = mx, ty = my;
  window.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches[0]) { mx = e.touches[0].clientX; my = e.touches[0].clientY; }
  }, { passive: true });

  // Smooth hash-based value noise (1D input), the same shape as p5's noise() here.
  function hash(n) { var s = Math.sin(n) * 43758.5453123; return s - Math.floor(s); }
  function noise(x) {
    var i = Math.floor(x), f = x - i;
    var u = f * f * (3 - 2 * f);
    return hash(i) * (1 - u) + hash(i + 1) * u;
  }

  var STEPS = 700;
  var t = 0;

  function drawFrame() {
    tx += (mx - tx) * 0.0002;
    ty += (my - ty) * 0.0002;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W / 2, H * 0.42);

    // Pointer X sets how many times the curve winds around itself, same
    // mapping as the original sketch (~90 to ~155 wraps end to end).
    var factor = 71 - (tx / Math.max(W, 1)) * 17;
    // A slow envelope makes the whole figure expand and contract in place.
    var envelope = 0.72 + 0.28 * Math.sin(t * 0.00026);
    var sizeFactor = W < 500 ? 0.65 : 1;
    var baseRad = Math.min(W, H) * 0.5 * envelope * sizeFactor;

    ctx.strokeStyle = 'rgba(' + lineRGB.r + ',' + lineRGB.g + ',' + lineRGB.b + ',0.14)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i < STEPS; i++) {
      var ang = (i * Math.PI / 180) * factor;
      var rad = baseRad * noise(i * 0.045 + t * 0.0006);
      var x = rad * Math.sin(ang);
      var y = rad * Math.cos(ang);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    ctx.fillStyle = 'rgba(' + lineRGB.r + ',' + lineRGB.g + ',' + lineRGB.b + ',0.22)';
    for (var j = 0; j < STEPS; j += 5) {
      var ang2 = (j * Math.PI / 180) * factor;
      var rad2 = baseRad * noise(j * 0.045 + t * 0.0006);
      ctx.beginPath();
      ctx.arc(rad2 * Math.sin(ang2), rad2 * Math.cos(ang2), 1.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    t += 4;
    if (!reduced) requestAnimationFrame(drawFrame);
  }

  drawFrame();
})();
