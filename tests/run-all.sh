#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python tests/check-docking-regressions.py
node --test packages/dxf-compare/tests/*.test.js
node --test tests/analysis-visual-model.test.cjs
for suite in skia-workspace visual-compare multiple-drawings workspace-startup docking-workspace ribbon-workspace gridweb-previews analysis-views analysis-visuals; do
  python "tests/$suite.py"
done
