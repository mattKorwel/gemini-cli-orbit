#!/usr/bin/env node
/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

async function run(cmd: string) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
  } catch (_e) {
    return null;
  }
}

async function fetchIssueHierarchy(owner: string, repo: string, issueNumber: number) {
  const gqlQuery = `query($owner:String!, $repo:String!, $number:Int!) {
    repository(owner:$owner, name:$repo) {
      issue(number:$number) {
        number
        title
        body
        state
        subIssues(first:100) {
          nodes {
            number
            title
            state
          }
        }
        parent {
          number
          title
          body
          subIssues(first:100) {
             nodes {
                number
                title
                state
             }
          }
          parent {
             number
             title
             body
          }
        }
      }
    }
  }`;

  const result = await run(`gh api graphql -F owner="${owner}" -F repo="${repo}" -F number=${issueNumber} -f query='${gqlQuery}'`);
  if (!result) return null;

  const data = JSON.parse(result);
  const issue = data?.data?.repository?.issue;
  if (!issue) return null;

  const hierarchy: any = {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    subIssues: issue.subIssues?.nodes || [],
    parent: null,
    grandparent: null,
    siblings: []
  };

  if (issue.parent) {
    hierarchy.parent = {
      number: issue.parent.number,
      title: issue.parent.title,
      body: issue.parent.body
    };
    hierarchy.siblings = (issue.parent.subIssues?.nodes || []).filter((s: any) => s.number !== issue.number);
    
    if (issue.parent.parent) {
      hierarchy.grandparent = {
        number: issue.parent.parent.number,
        title: issue.parent.parent.title,
        body: issue.parent.parent.body
      };
    }
  }

  return hierarchy;
}

async function main() {
  const issueNumber = process.argv[2];
  const logDir = process.argv[3];
  const geminiBin = process.argv[4];
  const policyPath = process.argv[5];

  if (!issueNumber || !logDir) {
    console.error('Usage: fetch-implement-context <issue_number> <log_dir> <gemini_bin> <policy_path>');
    process.exit(1);
  }

  const remoteUrl = await run('git remote get-url origin');
  const repoMatch = remoteUrl?.match(/github\.com[\/:]?([^\/]+)\/([^\/.]+)(\.git)?$/);
  const owner = repoMatch ? repoMatch[1] : null;
  const repo = repoMatch ? repoMatch[2] : null;

  if (!owner || !repo) {
    console.error('❌ Could not determine repo owner/name.');
    process.exit(1);
  }

  console.log(`📡 Fetching deep hierarchy for Issue #${issueNumber}...`);
  const hierarchy = await fetchIssueHierarchy(owner, repo, parseInt(issueNumber));

  if (!hierarchy) {
    console.error(`❌ Could not fetch hierarchy for Issue #${issueNumber}.`);
    process.exit(1);
  }

  // 1. Build Issue Context Markdown
  let contextMd = `# Implement Mission Context: Issue #${hierarchy.number}\n\n`;
  contextMd += `## Target Issue: ${hierarchy.title} (${hierarchy.state})\n`;
  contextMd += `**Body**:\n${hierarchy.body}\n\n`;

  if (hierarchy.parent) {
    contextMd += `### Parent Issue: #${hierarchy.parent.number} ${hierarchy.parent.title}\n`;
    contextMd += `**BodyExcerpt**:\n${hierarchy.parent.body.slice(0, 500)}...\n\n`;
  }

  if (hierarchy.grandparent) {
    contextMd += `### Grandparent Issue: #${hierarchy.grandparent.number} ${hierarchy.grandparent.title}\n`;
    contextMd += `**BodyExcerpt**:\n${hierarchy.grandparent.body.slice(0, 500)}...\n\n`;
  }

  if (hierarchy.siblings.length > 0) {
    contextMd += `### Sibling Issues:\n`;
    hierarchy.siblings.forEach((s: any) => {
      contextMd += `- [#${s.number}] ${s.title} (${s.state})\n`;
    });
    contextMd += '\n';
  }

  if (hierarchy.subIssues.length > 0) {
    contextMd += `### Sub-Tasks (Children):\n`;
    hierarchy.subIssues.forEach((s: any) => {
      contextMd += `- [#${s.number}] ${s.title} (${s.state})\n`;
    });
    contextMd += '\n';
  }

  // 2. Fetch Guidelines
  contextMd += `## Repository Guidelines\n\n`;
  const guidelineFiles = ['GEMINI.md', '.gemini/review-rules.md', 'CONTRIBUTING.md'];
  let foundGuidelines = false;
  for (const f of guidelineFiles) {
    const p = path.join(process.cwd(), f);
    if (fs.existsSync(p)) {
      contextMd += `### FROM ${f}:\n${fs.readFileSync(p, 'utf8').slice(0, 2000)}...\n\n`;
      foundGuidelines = true;
    }
  }
  if (!foundGuidelines) {
    contextMd += `_No specific repository guidelines found._\n`;
  }

  const rawPath = path.join(logDir, 'mission-context-raw.md');
  fs.writeFileSync(rawPath, contextMd);

  if (geminiBin && policyPath) {
    console.log('🧠 Synthesizing Mission Context...');
    const synthesisPrompt = `Synthesize this deep issue hierarchy and repository guidelines into a concise "Source of Truth" document for implementation. 
Focus on the specific requirements for Issue #${hierarchy.number} while considering the broader context of its parents and siblings.
Identify any architectural constraints or coding standards mentioned in the guidelines.`;
    
    const synthesisCmd = `${geminiBin} --policy ${policyPath} -p "${synthesisPrompt.replace(/"/g, '\\"')}" < ${rawPath} > ${path.join(logDir, 'mission-context.md')} 2>&1`;
    try {
      execSync(synthesisCmd);
    } catch (_e) {
       console.error('❌ Failed to synthesize mission context with Gemini. Falling back to raw context.');
       fs.copyFileSync(rawPath, path.join(logDir, 'mission-context.md'));
    }
  } else {
     console.log('⚠️ No Gemini bin/policy provided. Using raw context.');
     fs.copyFileSync(rawPath, path.join(logDir, 'mission-context.md'));
  }

  console.log('✨ Mission context complete.');
}

main().catch(err => {
  console.error('❌ Error fetching implementation context:', err);
  process.exit(1);
});
