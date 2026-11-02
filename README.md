# Lifted Generalised Brillouin Zone

An interactive plot of the GBZ of the non-reciprocal banded Toeplitz matrix with symbol

    a(z) = Σ_{k=1}^m k^(−α) (t_R z^k + t_L z^(−k)),

drawn as the curve (Re z, Im z, Im a(z)) in R³. The page is static: it only needs a web server and loads Plotly from cdnjs. All computation happens in the visitor's browser, in a Web Worker.

| File | Purpose |
|---|---|
| `index.html` | page markup |
| `style.css` | layout and light/dark colours |
| `gbz-core.js` | the GBZ solver (pure functions; also runs as the Web Worker) |
| `app.js` | sliders, presets, plots, linked hover |

## Put it on GitHub Pages

1. Copy this `gbz-lift` folder into the repository that builds your site, for example the root of `<username>.github.io`.
2. Commit and push. The page is then at `https://<username>.github.io/gbz-lift/`.

For a project site (`<username>.github.io/<repo>/`), the address is `https://<username>.github.io/<repo>/gbz-lift/`. Jekyll copies the files as they are, because they have no front matter.

## Embed it in another page or post

Paste this into any page of the same site, in Markdown or HTML:

```html
<iframe class="gbz-lift" src="/gbz-lift/?embed" title="Lifted generalised Brillouin zone"
        style="width: 100%; height: 1000px; border: 0;" loading="lazy"></iframe>
<script>
  // Grow each frame to the height of its content.
  window.addEventListener('message', function (e) {
    if (!e.data || e.data.type !== 'gbz-lift:height') return;
    document.querySelectorAll('iframe.gbz-lift').forEach(function (f) {
      if (f.contentWindow === e.source) f.style.height = e.data.height + 'px';
    });
  });
</script>
```

Without the script, the frame keeps its fixed height (1000px fits the desktop layout).

On a Jekyll site with a `baseurl`, use `src="{{ '/gbz-lift/?embed' | relative_url }}"`.

## URL options

Options can be combined, for example `/gbz-lift/?embed&m=12&alpha=1&tR=1&tL=0.5`.

| Option | Effect |
|---|---|
| `embed` | hides the title and the notes and makes the background transparent |
| `theme=light` / `theme=dark` | overrides the visitor's system colour scheme |
| `m`, `alpha`, `tR`, `tL` | starting parameters, clamped to the slider ranges |

When a visitor moves a slider, the address updates, so a copied link reopens the same parameters.

If your site has its own light/dark switch, it can set the theme of the embedded page:

```js
frame.contentWindow.postMessage({ type: 'gbz-lift:theme', theme: 'dark' }, '*');  // 'light', 'dark' or 'auto'
```

## Preview locally

```bash
python3 -m http.server 8000
```

Run it in the folder that contains `gbz-lift`, then open `http://localhost:8000/gbz-lift/`. Opening `index.html` directly from disk also works, but the solver then runs on the main thread, so the sliders feel slower.
