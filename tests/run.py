#!/usr/bin/env python3
"""Run current source, native and HTTP test suites; retain per-command evidence."""
from __future__ import annotations

import argparse
import json
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
SUITES = json.loads((ROOT / 'tests/suites.json').read_text())
BROWSER_GROUPS = ('workspace', 'analysis', 'drawings')


def commands(group: str) -> list[tuple[str, list[str]]]:
    result = []
    if group in ('models', 'all'):
        tests = sorted({str(p.relative_to(ROOT)) for folder in (ROOT / 'tests', ROOT / 'packages')
                        for pattern in ('*.test.js', '*.test.cjs', '*.test.mjs')
                        for p in folder.rglob(pattern)
                        if 'node_modules' not in p.parts and 'dist' not in p.parts})
        result.extend([
            ('distribution', ['node', 'scripts/check-skia-distribution.js']),
            ('models', ['node', '--test', *tests]),
            ('package', ['node', 'scripts/check-skia-package.mjs']),
            ('component-packages', ['node', 'scripts/check-component-packages.mjs']),
        ])
    groups = BROWSER_GROUPS if group in ('all', 'browser') else (group,)
    for name in groups:
        for suite in SUITES.get(name, []):
            result.append((suite, [sys.executable, '-u', f'tests/{suite}.py']))
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('group', nargs='?', default='all',
                        choices=('all', 'models', 'browser', *SUITES))
    parser.add_argument('--list', action='store_true', help='Print commands without running them.')
    parser.add_argument('--timeout', type=int, default=360, help='Timeout in seconds per command.')
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error('--timeout must be positive')
    selected = commands(args.group)
    if args.list:
        for name, command in selected:
            print(f'{name}: {" ".join(command)}')
        return 0
    output = ROOT / 'test-results/runner' / args.group
    output.mkdir(parents=True, exist_ok=True)
    identity = subprocess.run(['git', 'rev-parse', 'HEAD', 'HEAD^{tree}'], cwd=ROOT, capture_output=True, text=True, check=False)
    (output / 'tested-source.txt').write_text(identity.stdout if identity.returncode == 0 else 'Unversioned source tree\n')
    results = []
    try:
        for name, command in selected:
            print(f'\n== {name}: {" ".join(command)} ==', flush=True)
            started = time.monotonic()
            with (output / f'{name}.log').open('w') as log:
                try:
                    status = subprocess.run(command, cwd=ROOT, stdout=log, stderr=subprocess.STDOUT,
                                            timeout=args.timeout, check=False).returncode
                except subprocess.TimeoutExpired:
                    log.write(f'\nTIMEOUT after {args.timeout} seconds\n')
                    status = 124
                except OSError as error:
                    log.write(str(error) + '\n')
                    status = 127
            print((output / f'{name}.log').read_text(errors='replace'), end='', flush=True)
            results.append({'suite': name, 'command': command, 'exitCode': status,
                            'seconds': round(time.monotonic() - started, 3)})
    finally:
        (output / 'results.json').write_text(json.dumps(results, indent=2) + '\n')
    failed = [r['suite'] for r in results if r['exitCode'] != 0]
    print('\nFAILED: ' + ', '.join(failed) if failed else '\nAll selected suites passed.', flush=True)
    return int(bool(failed))


if __name__ == '__main__':
    raise SystemExit(main())
