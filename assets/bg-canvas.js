/*
 * Fixed full-viewport canvas behind the page content: a plain honeycomb —
 * one hexagon, tessellated, no jitter, no size or shape variation. The only
 * motion is a slow diagonal wave of opacity drifting across the tiling, plus
 * a gentle parallax shift of the whole grid toward the pointer. Colors are
 * read from the page's own CSS custom properties.
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
  var cells = [];
  var R; // hexagon circumradius

  function buildGrid() {
    cells = [];
    R = Math.max(24, Math.min(38, Math.min(W, H) / 20));
    var horizStep = Math.sqrt(3) * R;
    var vertStep = 1.5 * R;
    var cols = Math.ceil(W / horizStep) + 2;
    var rows = Math.ceil(H / vertStep) + 2;
    for (var row = 0; row < rows; row++) {
      var offsetX = (row % 2 === 1) ? horizStep / 2 : 0;
      for (var col = 0; col < cols; col++) {
        cells.push({
          x: -horizStep + col * horizStep + offsetX,
          y: -vertStep + row * vertStep,
          wave: col * 0.5 + row * 0.5
        });
      }
    }
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    buildGrid();
  }
  window.addEventListener('resize', resize);
  resize();

  var mx = W / 2, my = H / 2;
  window.addEventListener('mousemove', function (e) { mx = e.clientX; my = e.clientY; }, { passive: true });
  window.addEventListener('touchmove', function (e) {
    if (e.touches && e.touches[0]) { mx = e.touches[0].clientX; my = e.touches[0].clientY; }
  }, { passive: true });

  function drawHex(cx, cy, radius) {
    ctx.beginPath();
    for (var i = 0; i < 6; i++) {
      var a = -Math.PI / 2 + i * (Math.PI / 3);
      var x = cx + radius * Math.cos(a);
      var y = cy + radius * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  var px = 0, py = 0; // eased parallax offset
  var t = 0;
  var MAX_SHIFT = 18;

  function drawFrame() {
    var targetPX = ((mx / Math.max(W, 1)) - 0.5) * MAX_SHIFT;
    var targetPY = ((my / Math.max(H, 1)) - 0.5) * MAX_SHIFT;
    px += (targetPX - px) * 0.025;
    py += (targetPY - py) * 0.025;

    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = paperColor;
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(px, py);
    ctx.lineWidth = 1;

    for (var i = 0; i < cells.length; i++) {
      var cell = cells[i];
      var wave = 0.5 + 0.5 * Math.sin(t - cell.wave * 0.35);
      var alpha = 0.05 + wave * 0.12;
      ctx.strokeStyle = 'rgba(' + lineRGB.r + ',' + lineRGB.g + ',' + lineRGB.b + ',' + alpha.toFixed(3) + ')';
      drawHex(cell.x, cell.y, R * 0.94);
    }

    ctx.restore();

    t += 0.006;
    if (!reduced) requestAnimationFrame(drawFrame);
  }

  drawFrame();
})();
