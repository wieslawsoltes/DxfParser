#!/usr/bin/env python3
"""Strict replacement-engine regression gate, without legacy SVG exceptions.

The old renderer and its internal-object snapshot runner were removed. This gate
checks native pixels, analytical geometry, malformed data, explicit unsupported
coverage, package consumers and deterministic artifacts. It does NOT claim output
parity against AutoCAD or against the deleted renderer's SVG approximation.
"""
from pathlib import Path
import subprocess
import sys
ROOT=Path(__file__).resolve().parents[1]

def main():
    commands=[['node','scripts/check-skia-distribution.js'],
              ['node','--test',*[str(p.relative_to(ROOT)) for p in sorted((ROOT/'packages/dxf-skia/tests').glob('*.test.js'))],'tests/skia-native.test.mjs','tests/skia-recovery.test.mjs','tests/skia-webgpu-abi.test.mjs'],
              ['node','scripts/check-skia-package.mjs']]
    failed=False
    for command in commands:
        print('\n== '+' '.join(command)+' ==',flush=True)
        try:result=subprocess.run(command,cwd=ROOT,timeout=240,check=False);failed|=result.returncode!=0
        except subprocess.TimeoutExpired:print('TIMEOUT',flush=True);failed=True
    print('\nSkia regression gate: '+('FAILED' if failed else 'PASSED'),flush=True)
    return int(failed)
if __name__=='__main__':sys.exit(main())
