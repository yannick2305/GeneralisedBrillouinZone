(function () {
  var PRESETS = [
    { id: 'partly', label: 'Partly complex Λ', p: { m: 7, alpha: 2, tR: 1, tL: 0.5 } },
    { id: 'real', label: 'Real Λ, flat lift', p: { m: 7, alpha: 3, tR: 1, tL: 0.5 } },
    { id: 'strong', label: 'Strong asymmetry', p: { m: 7, alpha: 2, tR: 1, tL: 0.1 } },
    { id: 'slow', label: 'Slow decay', p: { m: 12, alpha: 1, tR: 1, tL: 0.5 } },
    { id: 'recip', label: 'Reciprocal', p: { m: 7, alpha: 2, tR: 1, tL: 1 } },
    { id: 'hn', label: 'Hatano–Nelson', p: { m: 1, alpha: 2, tR: 1, tL: 0.5 } }
  ];
  var CAMS = {
    oblique: { eye: { x: 1.05, y: -1.25, z: 0.7 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: -0.05 } },
    top: { eye: { x: 0, y: 0, z: 2.3 }, up: { x: 0, y: 1, z: 0 }, center: { x: 0, y: 0, z: 0 } },
    side: { eye: { x: 0, y: -2.3, z: 0.05 }, up: { x: 0, y: 0, z: 1 }, center: { x: 0, y: 0, z: 0 } }
  };
  var CORE_URL = new URL('gbz-core.js', document.currentScript.src).href;
  var params = Object.assign({}, PRESETS[0].p);
  var data = null;   // flattened result
  var $ = function (id) { return document.getElementById(id); };
  var ids = ['m', 'alpha', 'tR', 'tL'];

  // ---------- URL state: ?m=12&alpha=1&tR=1&tL=0.5 sets the start, clamped to the sliders ----------
  var query = new URLSearchParams(location.search);
  ids.forEach(function (k) {
    var v = parseFloat(query.get(k)), el = $(k);
    if (isFinite(v)) params[k] = Math.min(+el.max, Math.max(+el.min, k === 'm' ? Math.round(v) : v));
  });
  function writeURL() {
    try {
      var q = new URLSearchParams(location.search);
      ids.forEach(function (k) { q.set(k, params[k]); });
      history.replaceState(null, '', '?' + q.toString() + location.hash);
    } catch (e) {}
  }

  // ---------- formatting ----------
  function r0(x, d) { return Math.abs(x) < 0.5 * Math.pow(10, -d) ? 0 : x; }
  function f(x, d) { x = r0(x, d); return (x < 0 ? '−' : '') + Math.abs(x).toFixed(d); }
  function fc(re, im, d) { im = r0(im, d); return f(re, d) + (im < 0 ? ' − ' : ' + ') + Math.abs(im).toFixed(d) + 'i'; }
  function fsci(x) {
    if (x === 0) return '0';
    if (x >= 1e-3) return x.toFixed(4);
    var e = Math.floor(Math.log10(x)), mnt = x / Math.pow(10, e);
    return mnt.toFixed(2) + '·10' + String(e).replace('-', '⁻').replace(/\d/g, function (c) { return '⁰¹²³⁴⁵⁶⁷⁸⁹'[c]; });
  }

  // ---------- theme ----------
  function tokens() {
    var s = getComputedStyle(document.documentElement);
    var g = function (n) { return s.getPropertyValue(n).trim(); };
    return { surface: g('--surface'), ink: g('--ink'), ink2: g('--ink-2'), muted: g('--muted'), rule: g('--rule'),
             grid: g('--grid'), neg: g('--neg'), zero: g('--zero'), pos: g('--pos'), body: g('--font-body'), mono: g('--font-mono') };
  }
  function rgba(hex, a) {
    var h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map(function (c) { return c + c; }).join('');
    var n = parseInt(h, 16);
    return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  // ---------- controls ----------
  function syncControls() {
    ids.forEach(function (k) { $(k).value = params[k]; });
    $('m-out').textContent = params.m;
    $('alpha-out').textContent = params.alpha.toFixed(2);
    $('tR-out').textContent = params.tR.toFixed(2);
    $('tL-out').textContent = params.tL.toFixed(2);
    $('symbol').innerHTML = '<span class="m">a</span>(<span class="m">z</span>) = Σ<sub><span class="m">k</span>=1</sub><sup>' + params.m +
      '</sup> <span class="m">k</span><sup>−' + params.alpha.toFixed(2) + '</sup> (' + params.tR.toFixed(2) + ' <span class="m">z<sup>k</sup></span> + ' +
      params.tL.toFixed(2) + ' <span class="m">z</span><sup>−<span class="m">k</span></sup>)';
    var match = PRESETS.filter(function (pr) {
      return pr.p.m === params.m && Math.abs(pr.p.alpha - params.alpha) < 1e-9 && Math.abs(pr.p.tR - params.tR) < 1e-9 && Math.abs(pr.p.tL - params.tL) < 1e-9;
    })[0];
    Array.prototype.forEach.call($('presets').children, function (b) { b.setAttribute('aria-pressed', match && b.dataset.id === match.id ? 'true' : 'false'); });
  }
  PRESETS.forEach(function (pr) {
    var b = document.createElement('button');
    b.type = 'button'; b.textContent = pr.label; b.dataset.id = pr.id;
    b.addEventListener('click', function () { params = Object.assign({}, pr.p); syncControls(); writeURL(); request(); });
    $('presets').appendChild(b);
  });
  ids.forEach(function (k) {
    $(k).addEventListener('input', function () {
      params[k] = k === 'm' ? parseInt($(k).value, 10) : parseFloat($(k).value);
      syncControls(); writeURL(); request();
    });
  });

  // ---------- compute (worker, falling back to the main thread, e.g. when opened from file://) ----------
  var worker = null, busy = false, pending = false;
  try {
    worker = new Worker(CORE_URL);
    worker.onmessage = function (e) { done(e.data); };
    worker.onerror = function () { worker = null; busy = false; request(); };
  } catch (err) { worker = null; }
  function request() {
    if (busy) { pending = true; return; }
    busy = true; pending = false;
    $('status').textContent = 'computing…';
    var p = Object.assign({}, params);
    if (worker) worker.postMessage(p);
    else setTimeout(function () { var t0 = Date.now(); var r = computeGBZ(p); done({ params: p, result: r, ms: Date.now() - t0 }); }, 0);
  }
  function done(msg) {
    busy = false;
    data = flatten(msg.result, msg.params);
    data.ms = msg.ms;
    render();
    if (pending) request();
  }

  function flatten(res, p) {
    var X = [], Y = [], Hz = [], Hc = [], LR = [], PX = [], PY = [], T = [];
    res.chains.forEach(function (ch, c) {
      if (c) { X.push(null); Y.push(null); Hz.push(null); Hc.push(0); LR.push(null); PX.push(null); PY.push(null); T.push(''); }
      for (var i = 0; i < ch.x.length; i++) {
        X.push(ch.x[i]); Y.push(ch.y[i]); Hz.push(ch.li[i]); Hc.push(ch.li[i]); LR.push(ch.lr[i]);
        PX.push(ch.px[i]); PY.push(ch.py[i]);
        T.push('z = ' + fc(ch.x[i], ch.y[i], 4) + '<br>|z| = ' + Math.hypot(ch.x[i], ch.y[i]).toFixed(4) + '<br>λ = ' + fc(ch.lr[i], ch.li[i], 4));
      }
    });
    var s = res.stats, lifted = s.maxIm > s.eps;
    var reMin = Infinity, reMax = -Infinity;
    LR.forEach(function (v) { if (v !== null) { reMin = Math.min(reMin, v); reMax = Math.max(reMax, v); } });
    return { X: X, Y: Y, Hz: Hz, Hc: Hc, LR: LR, PX: PX, PY: PY, T: T, pbc: res.pbc, stats: s, lifted: lifted, reMin: reMin, reMax: reMax, p: p };
  }

  // ---------- plotting ----------
  var drawn = false;
  function axisStyle(t, title) {
    return { title: { text: title, font: { family: t.body, size: 12, color: t.ink2 }, standoff: 6 }, color: t.ink2, gridcolor: t.grid, zerolinecolor: t.rule,
             linecolor: t.rule, tickfont: { family: t.mono, size: 10, color: t.ink2 }, automargin: true };
  }
  function render() {
    if (!data || typeof Plotly === 'undefined') return;
    var t = tokens(), d = data, s = d.stats;
    var H = d.lifted ? s.maxIm : 1;
    var cs = [[0, t.neg], [0.5, t.zero], [1, t.pos]];
    var R = Math.max(1, s.rmax) * 1.08;
    var circ = { x: [], y: [], z: [] };
    for (var k = 0; k <= 240; k++) { var th = 2 * Math.PI * k / 240; circ.x.push(Math.cos(th)); circ.y.push(Math.sin(th)); circ.z.push(0); }
    var zr = Math.max(1.15 * s.maxIm, 0.02 * Math.max(Math.abs(d.reMin), Math.abs(d.reMax), 1e-3));
    var shadowZ = d.X.map(function (v) { return v === null ? null : 0; });

    var traces3d = [
      { type: 'scatter3d', mode: 'lines', name: 'GBZ lift', showlegend: false, x: d.X, y: d.Y, z: d.Hz, text: d.T, hovertemplate: '%{text}<extra></extra>',
        line: { width: 5, color: d.Hc, colorscale: cs, cmin: -H, cmax: H, showscale: d.lifted,
                colorbar: { title: { text: 'Im λ', side: 'top', font: { family: t.body, size: 12, color: t.ink2 } }, thickness: 10, len: 0.55, x: 1.0,
                            outlinewidth: 0, tickfont: { family: t.mono, size: 10, color: t.ink2 } } } },
      { type: 'scatter3d', mode: 'lines', name: 'Shadow in ℂ × {0}', x: d.X, y: d.Y, z: shadowZ, hoverinfo: 'skip',
        line: { width: 2, color: rgba(t.muted, 0.55) } },
      { type: 'scatter3d', mode: 'lines', name: 'BZ  |z| = 1', x: circ.x, y: circ.y, z: circ.z, hoverinfo: 'skip',
        line: { width: 2, color: t.muted, dash: 'dot' } }
    ];
    var sceneAxis = function (title, range) {
      var a = axisStyle(t, title);
      return { title: a.title, color: t.ink2, gridcolor: t.grid, zerolinecolor: t.rule, showbackground: true, backgroundcolor: t.surface,
               tickfont: a.tickfont, range: range, showspikes: false };
    };
    var layout3d = {
      paper_bgcolor: t.surface, plot_bgcolor: t.surface, font: { family: t.body, color: t.ink2, size: 12 },
      margin: { l: 0, r: 0, t: 8, b: 0 }, uirevision: 'gbz',
      legend: { orientation: 'h', x: 0, y: 1, xanchor: 'left', yanchor: 'top', font: { size: 12, color: t.ink2 }, bgcolor: 'rgba(0,0,0,0)' },
      hoverlabel: { bgcolor: t.surface, bordercolor: t.rule, font: { family: t.mono, size: 12, color: t.ink } },
      scene: { xaxis: sceneAxis('Re z', [-R, R]), yaxis: sceneAxis('Im z', [-R, R]), zaxis: sceneAxis('Im a(z)', [-zr, zr]),
               aspectmode: 'manual', aspectratio: { x: 1, y: 1, z: 0.6 }, camera: drawn ? undefined : CAMS.oblique }
    };
    if (drawn) delete layout3d.scene.camera;

    var mk = { size: 4, color: d.Hc, colorscale: cs, cmin: -H, cmax: H };
    var hi = { size: 13, color: 'rgba(0,0,0,0)', line: { color: t.ink, width: 2 } };
    var tracesLam = [
      { type: 'scatter', mode: 'lines', name: 'Periodic spectrum a(S¹)', x: d.pbc.x, y: d.pbc.y, hoverinfo: 'skip', line: { color: t.muted, width: 1.5 } },
      { type: 'scatter', mode: 'markers', name: 'Open limit Λ(a)', x: d.LR, y: d.Hz, text: d.T, hovertemplate: '%{text}<extra></extra>', marker: mk },
      { type: 'scatter', mode: 'markers', x: [], y: [], hoverinfo: 'skip', showlegend: false, marker: hi }
    ];
    var tracesZ = [
      { type: 'scatter', mode: 'lines', name: 'BZ  |z| = 1', x: circ.x, y: circ.y, hoverinfo: 'skip', line: { color: t.muted, width: 1.5, dash: 'dot' } },
      { type: 'scatter', mode: 'markers', name: 'GBZ', x: d.X, y: d.Y, text: d.T, hovertemplate: '%{text}<extra></extra>', marker: mk },
      { type: 'scatter', mode: 'markers', x: [], y: [], hoverinfo: 'skip', showlegend: false, marker: hi }
    ];
    var layout2d = function (xt, yt, equal) {
      var L = {
        paper_bgcolor: t.surface, plot_bgcolor: t.surface, font: { family: t.body, color: t.ink2, size: 12 },
        margin: { l: 8, r: 8, t: 8, b: 8 }, hovermode: 'closest', hoverlabel: { bgcolor: t.surface, bordercolor: t.rule, font: { family: t.mono, size: 12, color: t.ink } },
        legend: { orientation: 'h', x: 0, y: 1, xanchor: 'left', yanchor: 'bottom', font: { size: 12, color: t.ink2 } },
        xaxis: axisStyle(t, xt), yaxis: axisStyle(t, yt)
      };
      if (equal) { L.yaxis.scaleanchor = 'x'; L.yaxis.scaleratio = 1; }
      return L;
    };
    var cfg = { responsive: true, displaylogo: false, scrollZoom: false, modeBarButtonsToRemove: ['toImage', 'resetCameraLastSave3d'] };
    Plotly.react('plot3d', traces3d, layout3d, cfg);
    Plotly.react('plotLam', tracesLam, layout2d('Re λ', 'Im λ', false), cfg);
    Plotly.react('plotZ', tracesZ, layout2d('Re z', 'Im z', true), cfg);
    if (!drawn) { drawn = true; bindHover(); }
    updateStats();
    clearProbe();
  }

  function updateStats() {
    var d = data, s = d.stats;
    $('s-r').textContent = s.rmin.toFixed(3) + ' – ' + s.rmax.toFixed(3);
    $('s-im').textContent = d.lifted ? fsci(s.maxIm) : '0';
    $('s-share').textContent = Math.round(100 * s.complexShare) + '%';
    $('s-re').textContent = f(d.reMin, 3) + ' – ' + f(d.reMax, 3);
    $('state').classList.toggle('lifted', d.lifted);
    $('state-text').textContent = d.lifted ? 'Λ is partly complex, so the curve lifts out of ℂ × {0}.'
                                           : 'Λ is real, so the whole curve lies in ℂ × {0}.';
    $('status').textContent = s.steps + ' φ-steps · ' + Math.round(d.ms) + ' ms';
  }

  // ---------- linked hover ----------
  function probe(i) {
    var d = data;
    if (!d || d.X[i] === null || d.X[i] === undefined) return;
    Plotly.restyle('plotZ', { x: [[d.X[i], d.PX[i]]], y: [[d.Y[i], d.PY[i]]] }, [2]);
    Plotly.restyle('plotLam', { x: [[d.LR[i]]], y: [[d.Hz[i]]] }, [2]);
    $('probe-hint').hidden = true;
    ['pr-z', 'pr-p', 'pr-r', 'pr-l'].forEach(function (k) { $(k).hidden = false; });
    $('pv-z').textContent = fc(d.X[i], d.Y[i], 4);
    $('pv-p').textContent = fc(d.PX[i], d.PY[i], 4);
    $('pv-r').textContent = Math.hypot(d.X[i], d.Y[i]).toFixed(4);
    $('pv-l').textContent = fc(d.LR[i], d.Hz[i], 4);
  }
  function clearProbe() {
    $('probe-hint').hidden = false;
    ['pr-z', 'pr-p', 'pr-r', 'pr-l'].forEach(function (k) { $(k).hidden = true; });
  }
  function bindHover() {
    [['plot3d', 0], ['plotLam', 1], ['plotZ', 1]].forEach(function (pc) {
      $(pc[0]).on('plotly_hover', function (ev) {
        var pt = ev.points.filter(function (q) { return q.curveNumber === pc[1]; })[0];
        if (pt) probe(pt.pointNumber);
      });
    });
  }

  ['oblique', 'top', 'side'].forEach(function (v) {
    $('view-' + v).addEventListener('click', function () { if (drawn) Plotly.relayout('plot3d', { 'scene.camera': CAMS[v] }); });
  });
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', render); } catch (e) {}
  new MutationObserver(render).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // ---------- iframe embedding ----------
  // Report the content height so the host page can size the frame, and accept a
  // theme from the host page: postMessage({ type: 'gbz-lift:theme', theme: 'dark' }).
  if (window.parent !== window) {
    var sent = 0;
    var report = function () {
      var h = Math.ceil(document.body.getBoundingClientRect().height);
      if (h !== sent) { sent = h; window.parent.postMessage({ type: 'gbz-lift:height', height: h }, '*'); }
    };
    if ('ResizeObserver' in window) new ResizeObserver(report).observe(document.body);
    window.addEventListener('load', report);
    window.addEventListener('message', function (e) {
      if (e.source !== window.parent || !e.data || e.data.type !== 'gbz-lift:theme') return;
      if (e.data.theme === 'light' || e.data.theme === 'dark') document.documentElement.dataset.theme = e.data.theme;
      else delete document.documentElement.dataset.theme;
    });
  }

  syncControls();
  request();
})();
