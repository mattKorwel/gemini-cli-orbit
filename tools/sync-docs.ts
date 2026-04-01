/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import { glob } from 'glob';
import { logger } from '../src/Logger.js';

/**
 * sync-docs.ts
 *
 * Scans Markdown files for <!-- @include <file_path>[:<symbol>] --> markers
 * and replaces the following code block with the actual source content.
 */

async function sync() {
  const mdFiles = await glob('**/*.md', { ignore: 'node_modules/**' });

  for (const mdFile of mdFiles) {
    let content = fs.readFileSync(mdFile, 'utf8');
    let modified = false;

    // Regex to match <!-- @include path/to/file[:symbol] --> followed by a code block
    const regex =
      /<!--\s*@include\s+([^\s:]+)(?::([^\s]+))?\s*-->\n```[a-z]*\n[\s\S]*?\n```/g;

    content = content.replace(regex, (match, filePath, symbol) => {
      const fullPath = path.resolve(path.dirname(mdFile), filePath);
      if (!fs.existsSync(fullPath)) {
        logger.warn(
          `⚠️  Warning: ${filePath} not found (referenced in ${mdFile})`,
        );
        return match;
      }

      let source = fs.readFileSync(fullPath, 'utf8');

      if (symbol) {
        // Simple heuristic to extract a constant or interface
        // Works for: export const SYMBOL = ...
        // Works for: export interface SYMBOL { ... }
        const symbolRegex = new RegExp(
          `export\\s+(?:const|interface|type|class|function)\\s+${symbol}[\\s\\S]*?(?:;|\\n\\})`,
          'm',
        );
        const symbolMatch = source.match(symbolRegex);
        if (symbolMatch) {
          source = symbolMatch[0];
        } else {
          logger.warn(`⚠️  Warning: Symbol ${symbol} not found in ${filePath}`);
        }
      }

      modified = true;
      const lang = path.extname(filePath).slice(1) || '';
      return `<!-- @include ${filePath}${symbol ? ':' + symbol : ''} -->\n\`\`\`${lang}\n${source.trim()}\n\`\`\``;
    });

    if (modified) {
      logger.info(`✅ Synced ${mdFile}`);
      fs.writeFileSync(mdFile, content);
    }
  }
}

sync().catch((err) => {
  logger.error(err instanceof Error ? err.message : String(err));
});
