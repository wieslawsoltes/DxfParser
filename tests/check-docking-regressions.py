#!/usr/bin/env python3
"""Gate all existing suites, with byte-for-byte base comparison for known SVG debt.

A new failure always fails. The two pre-existing parity failures are tolerated only
when the base commit has precisely the same failures AND all captured frames agree.
No baselines are rewritten and no blanket continue-on-error is used.
"""
from __future__ import annotations
import argparse
import hashlib
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
TESTS = [
    'smoke-bundle.js', 'check-dimensions.js', 'check-environment.js', 'check-materials.js',
    'check-mtext.js', 'check-plot-styles.js', 'check-solid-wipeout.js', 'check-visual-styles.js',
    'check-matrix-utils.js', 'check-parser-utils.js', 'check-advanced-features.js'
]
KNOWN = {'advanced-geometry', 'dimension-parity'}


def run(root: Path, name: str, *args: str):
    result = subprocess.run(['node', str(root / 'tests' / name), *args], cwd=root,
                            text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, timeout=180)
    print(result.stdout, end='', flush=True)
    return result


def frames(root: Path):
    directory = root / 'tests' / 'outputs'
    return {file.name: hashlib.sha256(file.read_bytes()).hexdigest()
            for file in sorted(directory.iterdir()) if file.name.endswith(('.frame.svg', '.frame.json'))}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--baseline', type=Path, required=True)
    args = parser.parse_args()
    failed = False
    for test in TESTS:
        print(f'\n== {test} ==', flush=True)
        failed |= run(ROOT, test).returncode != 0
    print('\n== rendering-parity.js ==', flush=True)
    head = run(ROOT, 'rendering-parity.js', '--capture', '--capture-svg')
    if head.returncode:
        print('\n== Compare known parity failures with base commit ==', flush=True)
        base = run(args.baseline, 'rendering-parity.js', '--capture', '--capture-svg')
        mismatches = lambda output: set(re.findall(r'^SVG mismatch for (.+)$', output, re.M))
        # Exact output also rules out exceptions/numeric regressions hidden behind an expected SVG failure.
        allowed = (base.returncode == head.returncode == 1 and
                   mismatches(head.stdout) == mismatches(base.stdout) == KNOWN and
                   head.stdout == base.stdout and frames(ROOT) == frames(args.baseline))
        if allowed:
            print('::warning::Existing SVG snapshot mismatches (advanced-geometry, dimension-parity) '
                  'reproduced on base; all generated SVG/JSON frames are byte-identical. No rendering regression.')
        else:
            print('::error::Rendering failure differs from the base commit or generated frames changed.')
            failed = True
    print('\nRegression gate: ' + ('FAILED' if failed else 'PASSED (see any baseline-debt warning above)'))
    return 1 if failed else 0


if __name__ == '__main__':
    sys.exit(main())
