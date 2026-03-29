#!/bin/bash
# bundle.sh - Bundles the Orbit extension entry points, ignoring any extra arguments (like from lint-staged)

# Find all .ts files in scripts/ and scripts/bin/ (excluding tests)
FILES=$(find scripts -maxdepth 1 -name "*.ts" ! -name "*.test.ts")
BIN_FILES=$(find scripts/bin -name "*.ts" ! -name "*.test.ts" 2>/dev/null)

# Execute esbuild
npx esbuild $FILES $BIN_FILES \
  --bundle \
  --platform=node \
  --format=esm \
  --outdir=bundle \
  --minify \
  --sourcemap \
  --target=node20 \
  --external:vitest \
  --external:node:*
