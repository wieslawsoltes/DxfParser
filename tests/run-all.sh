#!/bin/bash

# Test runner for DxfParser rendering components
# Runs all test files and reports results

set -e  # Exit on first failure

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=========================================="
echo "Running DxfParser Test Suite"
echo "=========================================="
echo

TESTS=(
  "smoke-bundle.js"
  "check-dimensions.js"
  "check-environment.js"
  "check-materials.js"
  "check-mtext.js"
  "check-plot-styles.js"
  "check-solid-wipeout.js"
  "check-visual-styles.js"
  "check-matrix-utils.js"
  "check-parser-utils.js"
  "check-advanced-features.js"
  "rendering-parity.js"
)

PASSED=0
FAILED=0
FAILED_TESTS=()

for test in "${TESTS[@]}"; do
  echo "Running: $test"
  echo "----------------------------------------"

  if node "$test"; then
    PASSED=$((PASSED + 1))
    echo "✓ PASSED: $test"
  else
    FAILED=$((FAILED + 1))
    FAILED_TESTS+=("$test")
    echo "✗ FAILED: $test"
  fi

  echo
done

echo "=========================================="
echo "Test Results"
echo "=========================================="
echo "Total tests: $((PASSED + FAILED))"
echo "Passed: $PASSED"
echo "Failed: $FAILED"
echo

if [ $FAILED -eq 0 ]; then
  echo "✓ All tests passed!"
  exit 0
else
  echo "✗ Some tests failed:"
  for failed_test in "${FAILED_TESTS[@]}"; do
    echo "  - $failed_test"
  done
  exit 1
fi
