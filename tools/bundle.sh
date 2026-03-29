#!/bin/bash
# bundle.sh - Bundles the Orbit extension entry points, ignoring any extra arguments (like from lint-staged)

# Find all .ts files in scripts/ (non-recursive, excluding tests)
FILES=$(find scripts -maxdepth 1 -name "*.ts" ! -name "*.test.ts")

# Execute esbuild
npx esbuild $FILES \
  --bundle \
  --platform=node \
  --format=esm \
  --outdir=bundle \
  --minify \
  --sourcemap \
  --target=node20 \
  --external:vitest \
  --external:node:*
