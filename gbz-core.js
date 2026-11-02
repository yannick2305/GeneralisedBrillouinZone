// GBZ core: pure functions, shared by the page's main thread and its worker.
// Symbol a(z) = sum_{k=1}^m k^-alpha (tR z^k + tL z^-k), T_n(a) = (a_{j-k}).

// Aberth-Ehrlich iteration for c_0 + c_1 z + ... + c_n z^n (complex coefficients,
// ascending). Roots are read from / written to (zr, zi). Returns iterations used.
function aberth(cr, ci, n, zr, zi, cold, maxIt) {
  if (cold) {
    var r = Math.pow(Math.hypot(cr[0], ci[0]) / Math.hypot(cr[n], ci[n]), 1 / n);
    if (!isFinite(r) || r === 0) r = 1;
    for (var k = 0; k < n; k++) {
      var t = 2 * Math.PI * k / n + 0.4;
      zr[k] = r * Math.cos(t); zi[k] = r * Math.sin(t);
    }
  }
  for (var it = 0; it < maxIt; it++) {
    var maxCorr = 0;
    for (var i = 0; i < n; i++) {
      var xr = zr[i], xi = zi[i], ax = Math.hypot(xr, xi);
      var Nr, Ni, pr, pi, dr, di, dd, j, t1, t2;
      if (ax <= 1) {
        // Newton ratio N = p / p' by Horner
        pr = cr[n]; pi = ci[n]; dr = 0; di = 0;
        for (j = n - 1; j >= 0; j--) {
          t1 = dr * xr - di * xi + pr; t2 = dr * xi + di * xr + pi; dr = t1; di = t2;
          t1 = pr * xr - pi * xi + cr[j]; t2 = pr * xi + pi * xr + ci[j]; pr = t1; pi = t2;
        }
        dd = dr * dr + di * di;
        if (dd === 0) continue;
        Nr = (pr * dr + pi * di) / dd; Ni = (pi * dr - pr * di) / dd;
      } else {
        // reversed polynomial q(y) = y^n p(1/y): N = x q / (n q - y q'), y = 1/x
        var yr = xr / (ax * ax), yi = -xi / (ax * ax);
        pr = cr[0]; pi = ci[0]; dr = 0; di = 0;
        for (j = 1; j <= n; j++) {
          t1 = dr * yr - di * yi + pr; t2 = dr * yi + di * yr + pi; dr = t1; di = t2;
          t1 = pr * yr - pi * yi + cr[j]; t2 = pr * yi + pi * yr + ci[j]; pr = t1; pi = t2;
        }
        // den = n q - y q'
        var er = n * pr - (yr * dr - yi * di), ei = n * pi - (yr * di + yi * dr);
        var numr = xr * pr - xi * pi, numi = xr * pi + xi * pr;
        dd = er * er + ei * ei;
        if (dd === 0) continue;
        Nr = (numr * er + numi * ei) / dd; Ni = (numi * er - numr * ei) / dd;
      }
      var Sr = 0, Si = 0;
      for (j = 0; j < n; j++) {
        if (j === i) continue;
        var ur = xr - zr[j], ui = xi - zi[j], uu = ur * ur + ui * ui;
        Sr += ur / uu; Si -= ui / uu;
      }
      var Dr = 1 - (Nr * Sr - Ni * Si), Di = -(Nr * Si + Ni * Sr), DD = Dr * Dr + Di * Di;
      var wr = (Nr * Dr + Ni * Di) / DD, wi = (Ni * Dr - Nr * Di) / DD;
      zr[i] = xr - wr; zi[i] = xi - wi;
      var c = Math.hypot(wr, wi) / (ax + 1e-300);
      if (c > maxCorr) maxCorr = c;
    }
    if (maxCorr < 1e-14) return it + 1;
  }
  return maxIt;
}

function allFinite(a) {
  for (var i = 0; i < a.length; i++) if (!isFinite(a[i])) return false;
  return true;
}

function solve(cr, ci, n, zr, zi, warm) {
  var it = aberth(cr, ci, n, zr, zi, !warm, warm ? 60 : 600);
  if ((warm && it === 60) || !allFinite(zr) || !allFinite(zi)) aberth(cr, ci, n, zr, zi, true, 600);
}

function symbolCoeffs(m, alpha, tR, tL) {
  var ak = new Float64Array(2 * m + 1);  // ak[k + m] = a_k
  for (var k = 1; k <= m; k++) {
    ak[m + k] = tR * Math.pow(k, -alpha);
    ak[m - k] = tL * Math.pow(k, -alpha);
  }
  return ak;
}

// a(z) for complex z, returns [re, im]
function symbolAt(ak, m, zr, zi) {
  var sr = 0, si = 0, t;
  for (var j = 2 * m; j >= 0; j--) { t = sr * zr - si * zi + ak[j]; si = sr * zi + si * zr; sr = t; }
  var az = Math.hypot(zr, zi), th = Math.atan2(zi, zr);
  var mr = Math.pow(az, -m), cr = mr * Math.cos(-m * th), ci = mr * Math.sin(-m * th);
  return [sr * cr - si * ci, sr * ci + si * cr];
}

// Sweep phi in (0, pi): roots z of a(z) = a(z e^{i phi}) are kept when z and z e^{i phi}
// are the m-th and (m+1)-th roots (by modulus) of z^m (a(z) - lambda), lambda = a(z).
// The phi step adapts: it halves when a kept branch jumps more than dsMax or when a
// branch starts or stops being kept (a junction of the GBZ), and regrows afterwards.
function computeGBZ(p) {
  var m = p.m, deg = 2 * m, N0 = p.nphi || (m > 10 ? Math.max(500, Math.round(10000 / m)) : 1000), tol = p.tol || 1e-6;
  var ak = symbolCoeffs(m, p.alpha, p.tR, p.tL);
  var hmax = Math.PI / N0, hmin = hmax / 256, budget = p.budget || 12 * N0;
  var rscale = Math.pow(Math.abs(ak[0] / ak[deg]), 1 / deg);
  var dsMax = p.ds || 0.004 * rscale;
  var qr = new Float64Array(deg + 1), qi = new Float64Array(deg + 1);
  var cr = new Float64Array(deg + 1), ci = new Float64Array(deg + 1);
  var mods = new Float64Array(deg);
  var S = [0, 1].map(function () {
    return { Qr: new Float64Array(deg), Qi: new Float64Array(deg), Pr: new Float64Array(deg * deg),
             Pi: new Float64Array(deg * deg), warm: new Uint8Array(deg), acc: new Array(deg), warmQ: false };
  });
  function copyState(a, b) {
    b.Qr.set(a.Qr); b.Qi.set(a.Qi); b.Pr.set(a.Pr); b.Pi.set(a.Pi); b.warm.set(a.warm); b.warmQ = a.warmQ;
  }
  function evalAt(phi, st) {
    for (var j = 0; j <= deg; j++) {
      var kk = j - m;
      qr[j] = ak[j] * (1 - Math.cos(kk * phi)); qi[j] = -ak[j] * Math.sin(kk * phi);
    }
    solve(qr, qi, deg, st.Qr, st.Qi, st.warmQ); st.warmQ = true;
    var er = Math.cos(phi), ei = Math.sin(phi);
    for (var k = 0; k < deg; k++) {
      st.acc[k] = null;
      var zr = st.Qr[k], zi = st.Qi[k], az = Math.hypot(zr, zi);
      if (!(az > 1e-4 && az < 1e4)) { st.warm[k] = 0; continue; }
      var lam = symbolAt(ak, m, zr, zi);
      for (j = 0; j <= deg; j++) { cr[j] = ak[j]; ci[j] = 0; }
      cr[m] -= lam[0]; ci[m] -= lam[1];
      var rr = st.Pr.subarray(k * deg, (k + 1) * deg), ri = st.Pi.subarray(k * deg, (k + 1) * deg);
      solve(cr, ci, deg, rr, ri, st.warm[k] === 1); st.warm[k] = 1;
      for (j = 0; j < deg; j++) mods[j] = Math.hypot(rr[j], ri[j]);
      mods.sort();
      if (Math.abs(mods[m - 1] / az - 1) < tol && Math.abs(mods[m] / az - 1) < tol)
        st.acc[k] = { zr: zr, zi: zi, wr: zr * er - zi * ei, wi: zr * ei + zi * er, lr: lam[0], li: lam[1] };
    }
  }
  var tracks = [];
  for (var k = 0; k < deg; k++) tracks.push([]);
  var cur = S[0], trial = S[1], step = 0, solves = 1;
  var phi = hmin * 0.3819660112501051, phiEnd = Math.PI * (1 - 1e-9), h = hmin;
  evalAt(phi, cur);
  function record() {
    for (var k = 0; k < deg; k++) if (cur.acc[k]) { var a = cur.acc[k]; a.s = step; tracks[k].push(a); }
  }
  record();
  while (phi < phiEnd) {
    var hTry = Math.min(h, phiEnd - phi);
    copyState(cur, trial);
    evalAt(phi + hTry, trial); solves++;
    var flip = false, maxd = 0;
    for (k = 0; k < deg; k++) {
      var a0 = cur.acc[k], a1 = trial.acc[k];
      if (!a0 !== !a1) flip = true;
      else if (a0) maxd = Math.max(maxd, Math.hypot(a1.zr - a0.zr, a1.zi - a0.zi), Math.hypot(a1.wr - a0.wr, a1.wi - a0.wi));
    }
    var refine = solves < budget && hTry > hmin * 1.0001 && (flip || maxd > dsMax);
    if (refine) { h = Math.max(hTry / 2, hmin); continue; }
    var t = cur; cur = trial; trial = t;
    phi += hTry; step++; record();
    h = (!flip && maxd < dsMax / 2) ? Math.min(hTry * 2, hmax) : hTry;
  }
  var jump = 3 * dsMax, joinTol = 1.5 * dsMax;

  // Split each track into runs of consecutive phi samples.
  var runs = [];
  tracks.forEach(function (tr) {
    var run = [];
    for (var n = 0; n < tr.length; n++) {
      if (run.length && tr[n].s !== run[run.length - 1].s + 1) { runs.push(run); run = []; }
      run.push(tr[n]);
    }
    if (run.length) runs.push(run);
  });

  // Each run gives two segments: the z branch and the z e^{i phi} branch. Break on jumps
  // (root-index swaps in the tracker).
  var segs = [];
  runs.forEach(function (run) {
    ['z', 'w'].forEach(function (b) {
      var seg = [];
      for (var n = 0; n < run.length; n++) {
        var r0 = run[n], isZ = b === 'z';
        var pt = { x: isZ ? r0.zr : r0.wr, y: isZ ? r0.zi : r0.wi, px: isZ ? r0.wr : r0.zr, py: isZ ? r0.wi : r0.zi, lr: r0.lr, li: r0.li };
        if (seg.length) {
          var q = seg[seg.length - 1];
          if (Math.hypot(pt.x - q.x, pt.y - q.y) > jump) { if (seg.length > 2) segs.push(seg); seg = []; }
        }
        seg.push(pt);
      }
      if (seg.length > 2) segs.push(seg);
    });
  });

  // Greedy chaining of segments by endpoint proximity into curves.
  var used = new Uint8Array(segs.length), chains = [];
  var d = function (a, b) { return Math.hypot(a.x - b.x, a.y - b.y); };
  while (true) {
    var best = -1;
    for (var s = 0; s < segs.length; s++) if (!used[s] && (best < 0 || segs[s].length > segs[best].length)) best = s;
    if (best < 0) break;
    used[best] = 1;
    var chain = segs[best].slice();
    var grew = true;
    while (grew) {
      grew = false;
      var head = chain[0], tail = chain[chain.length - 1];
      var bs = -1, bd = joinTol, mode = 0;
      for (s = 0; s < segs.length; s++) {
        if (used[s]) continue;
        var S = segs[s], a0 = S[0], a1 = S[S.length - 1];
        var c1 = d(tail, a0), c2 = d(tail, a1), c3 = d(head, a1), c4 = d(head, a0);
        if (c1 < bd) { bd = c1; bs = s; mode = 1; }
        if (c2 < bd) { bd = c2; bs = s; mode = 2; }
        if (c3 < bd) { bd = c3; bs = s; mode = 3; }
        if (c4 < bd) { bd = c4; bs = s; mode = 4; }
      }
      if (bs >= 0) {
        used[bs] = 1; grew = true;
        var add = segs[bs].slice();
        if (mode === 1) chain = chain.concat(add);
        else if (mode === 2) chain = chain.concat(add.reverse());
        else if (mode === 3) chain = add.concat(chain);
        else chain = add.reverse().concat(chain);
      }
    }
    if (chain.length > 2 && d(chain[0], chain[chain.length - 1]) < joinTol) chain.push(chain[0]);
    chains.push(chain);
  }

  // Stats: radius range, max |Im lambda|, share of GBZ arclength with complex lambda.
  var rmin = Infinity, rmax = 0, maxIm = 0, maxAbs = 0, Lc = 0, Lt = 0, npts = 0;
  chains.forEach(function (ch) {
    for (var n = 0; n < ch.length; n++) {
      var r = Math.hypot(ch[n].x, ch[n].y);
      if (r < rmin) rmin = r; if (r > rmax) rmax = r;
      maxIm = Math.max(maxIm, Math.abs(ch[n].li));
      maxAbs = Math.max(maxAbs, Math.hypot(ch[n].lr, ch[n].li));
      npts++;
    }
  });
  var eps = 1e-6 * Math.max(maxAbs, 1e-12);
  chains.forEach(function (ch) {
    for (var n = 1; n < ch.length; n++) {
      var L = d(ch[n], ch[n - 1]);
      Lt += L;
      if (Math.abs(ch[n].li) > eps && Math.abs(ch[n - 1].li) > eps) Lc += L;
    }
  });

  // Periodic (BZ) spectrum a(e^{i theta}) for reference.
  var pbc = { x: [], y: [] };
  for (var t = 0; t <= 720; t++) {
    var th = 2 * Math.PI * t / 720, v = symbolAt(ak, m, Math.cos(th), Math.sin(th));
    pbc.x.push(v[0]); pbc.y.push(v[1]);
  }

  return {
    chains: chains.map(function (ch) {
      return { x: ch.map(function (q) { return q.x; }), y: ch.map(function (q) { return q.y; }),
               px: ch.map(function (q) { return q.px; }), py: ch.map(function (q) { return q.py; }),
               lr: ch.map(function (q) { return q.lr; }), li: ch.map(function (q) { return q.li; }) };
    }),
    pbc: pbc,
    stats: { rmin: rmin, rmax: rmax, maxIm: maxIm, complexShare: Lt ? Lc / Lt : 0, npts: npts,
             nchains: chains.length, eps: eps, solves: solves, steps: step }
  };
}


// When loaded as a Web Worker, answer compute requests from app.js.
if (typeof window === 'undefined' && typeof self !== 'undefined') {
  self.onmessage = function (e) {
    var t0 = Date.now(), r = computeGBZ(e.data);
    self.postMessage({ params: e.data, result: r, ms: Date.now() - t0 });
  };
}
