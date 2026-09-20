#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python tests/check-docking-regressions.py
for suite in skia-workspace docking-workspace ribbon-workspace gridweb-previews analysis-views; do
  python "tests/$suite.py"
done
