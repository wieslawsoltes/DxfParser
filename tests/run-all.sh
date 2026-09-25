#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python tests/check-docking-regressions.py
node --test packages/dxf-compare/tests/*.test.js
for suite in skia-workspace visual-compare docking-workspace ribbon-workspace gridweb-previews analysis-views; do
  python "tests/$suite.py"
done
