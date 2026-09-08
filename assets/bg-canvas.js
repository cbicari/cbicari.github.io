/*
 * Fixed full-viewport canvas behind the page content: a quiet constellation
 * of geometric outlines (hexagons/squares) linked by straight lines, like a
 * faint blueprint grid. It drifts on its own (slow rotation + a soft pulse)
 * and the whole grid parallax-shifts a little toward the pointer — no
 * per-frame reshaping, so it never turns into a tangle. Colors are read
 * from the page's own CSS custom properties.
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
  var nodeRGB = hexToRgb(rootStyle.getPropertyValue('--copper-dark')) || { r: 124, g: 63, b: 31 };
  var lineRGB = hexToRgb(rootStyle.getPropertyValue('--rule')) || { r: 90, g: 95, b: 88 };

  function hexToRgb(hex) {
    var m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || '').trim());
    return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : null;
  }

  // Deterministic pseudo-random in [0, 1) from an integer, no Math.random drift.
  function hash(n) { var s = Math.sin(n * 12.9898) * 43758.5453123; return s - Math.floor(s); }

  var W, H, DPR;
  var nodes = [], edges = [];

  function buildGrid() {
    nodes = [];
    edges = [];
    var spacing = Math.max(150, Math.min(230, Math.min(W, H) / 4));
    var cols = Math.ceil(W / spacing) + 2;
    var rows = Math.ceil(H / spacing) + 2;
    var jitter = spacing * 0.26;
    var grid = [];
    for (var r = 0; r < rows; r++) {
      grid[r] = [];
      for (var c = 0; c < cols; c++) {
        var seed = r * 97 + c * 13;
        grid[r][c] = {
          x: -spacing + c * spacing + (hash(seed) - 0.5) * jitter,
          y: -spacing + r * spacing + (hash(seed + 51) - 0.5) * jitter,
          phase: hash(seed + 7) * Math.PI * 2,
          sides: hash(seed + 3) > 0.55 ? 6 : 4,
          baseSize: spacing * 0.15 * (0.7 + hash(seed + 9) * 0.6)
        };
        nodes.push(grid[r][c]);
      }
    }
    for (var r2 = 0; r2 < rows; r2++) {
      for (var c2 = 0; c2 < cols; c2++) {
        if (c2 + 1 < cols) edges.push([grid[r2][c2], grid[r2][c2 + 1]]);
        if (r2 + 1 < rows) edges.push([grid[r2][c2], grid[r2 + 1][c2]]);
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

  function drawPolygon(cx, cy, sides, radius, rotation) {
    ctx.beginPath();
    for (var i = 0; i < sides; i++) {
      var a = rotation + i * (2 * Math.PI / sides);
      var x = cx + radius * Math.cos(a);
      var y = cy + radius * Math.sin(a);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
  }

  var px = 0, py = 0; // eased parallax offset
  var t = 0;
  var MAX_SHIFT = 22;

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

    ctx.strokeStyle = 'rgba(' + lineRGB.r + ',' + lineRGB.g + ',' + lineRGB.b + ',0.5)';
    ctx.lineWidth = 1;
    for (var i = 0; i < edges.length; i++) {
      var a = edges[i][0], b = edges[i][1];
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    ctx.strokeStyle = 'rgba(' + nodeRGB.r + ',' + nodeRGB.g + ',' + nodeRGB.b + ',0.22)';
    ctx.lineWidth = 1.1;
    for (var n = 0; n < nodes.length; n++) {
      var node = nodes[n];
      var scale = 0.82 + 0.18 * Math.sin(t * 0.6 + node.phase);
      var rotation = t * 0.12 + node.phase;
      drawPolygon(node.x, node.y, node.sides, node.baseSize * scale, rotation);
    }

    ctx.restore();

    t += 0.01;
    if (!reduced) requestAnimationFrame(drawFrame);
  }

  drawFrame();
})();
