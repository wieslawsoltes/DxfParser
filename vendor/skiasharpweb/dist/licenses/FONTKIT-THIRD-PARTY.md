# Browser font engine dependencies

The bundled browser font engine uses fontkit 2.0.4 (MIT), plus the dependencies listed in `font-engine-third-party/manifest.json`. Source: https://github.com/foliojs/fontkit/tree/v2.0.4 . Per-package license texts and original package manifests are included in the corresponding directories. Fontkit, dfa and brotli npm packages declare MIT in package.json; their upstream README files and manifests are preserved.

`vendor/woff2.js` is the decompression-only WebAssembly distribution from wawoff2 2.0.1 (MIT, Copyright 2013–2017 the WOFF2 Authors). The wrapper is adapted for ES modules and browser/Node portability; the embedded reference WOFF2 decoder bytecode is unchanged. Source: https://github.com/fontello/wawoff2 . The WOFF2 license is included in `font-engine-third-party/wawoff2/LICENSE`.

`RobotoFlex-Variable.woff2` is the Latin weight-axis subset distributed by @fontsource-variable/roboto-flex 5.2.8, under the SIL Open Font License 1.1. Its complete license appears in `RobotoFlex-OFL.txt`.

All other small font fixtures are original synthetic fonts created using the build script in `tests/fixtures/create-fixtures.py`, under this project's MIT license.

`vendor/font-instance.js` embeds the unchanged standalone HarfBuzz subsetter WebAssembly from harfbuzzjs 0.10.3. The local wrapper adapts byte ownership and axis pinning to ES modules. The original MIT license and build/export provenance are included under `harfbuzzjs/`. This version was retained after the supplied CFF2/HVAR regression fixture failed with a newer tested subsetter distribution.
