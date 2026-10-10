`maplibre-gl-5.24.0/`: MapLibre GL JS 5.24.0 (BSD-3-Clause, see its LICENSE.txt), `dist/maplibre-gl.js` and
`dist/maplibre-gl.css` unmodified from https://unpkg.com/maplibre-gl@5.24.0/. Served from this site so viewers never
reach a CDN. `s/index.html` and `live/index.html` pin both files with sha384 SRI: replace them only together with those
`integrity` attributes. `.gitattributes` stops git from rewriting their line endings, which would break the hashes.
