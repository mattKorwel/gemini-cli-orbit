#!/bin/bash
# bundle.sh - Bundles the Orbit extension entry points

# Find all .ts files in relevant directories (excluding tests)
FILES=$(find src -maxdepth 1 -name "*.ts" ! -name "*.test.ts")
BIN_FILES=$(find src/bin -name "*.ts" ! -name "*.test.ts" 2>/dev/null)
UTIL_FILES=$(find src/utils -name "*.ts" ! -name "*.test.ts" ! -name "*.js" 2>/dev/null)
PLAYBOOK_FILES=$(find src/playbooks -name "*.ts" ! -name "*.test.ts" 2>/dev/null)

# Execute esbuild for all entrypoints
npx esbuild $FILES $BIN_FILES $UTIL_FILES $PLAYBOOK_FILES \
  --bundle \
  --platform=node \
  --format=esm \
  --outdir=bundle \
  --minify \
  --sourcemap \
  --target=node20 \
  --external:vitest \
  --external:node:*
