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
    return execSync(cmd, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore'],
    }).trim();
  } catch (_e) {
    return null;
  }
}

async function fetchIssueHierarchy(
  owner: string,
  repo: string,
  issueNumber: number,
  depth = 0,
): Promise<any> {
  if (depth >= 3) return null;

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
        }
      }
    }
  }`;

  const result = await run(
    `gh api graphql -F owner="${owner}" -F repo="${repo}" -F number=${issueNumber} -f query='${gqlQuery}'`,
  );
  if (!result) return null;

  const data = JSON.parse(result);
  const issue = data?.data?.repository?.issue;
  if (!issue) return null;

  const hierarchy: any = {
    number: issue.number,
    title: issue.title,
    body: issue.body,
    state: issue.state,
    parent: issue.parent,
    subIssues: [],
  };

  if (issue.subIssues?.nodes) {
    for (const sub of issue.subIssues.nodes) {
      const subHierarchy = await fetchIssueHierarchy(
        owner,
        repo,
        sub.number,
        depth + 1,
      );
      hierarchy.subIssues.push(
        subHierarchy || {
          number: sub.number,
          title: sub.title,
          state: sub.state,
        },
      );
    }
  }

  return hierarchy;
}

async function main() {
  const prNumber = process.argv[2];
  const logDir = process.argv[3];
  const geminiBin = process.argv[4];
  const policyPath = process.argv[5];

  if (!prNumber || !logDir) {
    console.error(
      'Usage: fetch-mission-context <pr_number> <log_dir> <gemini_bin> <policy_path>',
    );
    process.exit(1);
  }

  const remoteUrl = await run('git remote get-url origin');
  const repoMatch = remoteUrl?.match(
    /github\.com[\/:]?([^\/]+)\/([^\/.]+)(\.git)?$/,
  );
  const owner = repoMatch ? repoMatch[1] : null;
  const repo = repoMatch ? repoMatch[2] : null;

  if (!owner || !repo) {
    console.error('❌ Could not determine repo owner/name.');
    process.exit(1);
  }

  console.log(`📡 Fetching metadata for PR #${prNumber}...`);
  const prJson = await run(
    `gh pr view ${prNumber} --json body,closingIssuesReferences,baseRefName,headRefName`,
  );
  if (!prJson) {
    console.error('❌ Could not fetch PR metadata.');
    process.exit(1);
  }

  const prMetadata = JSON.parse(prJson);
  fs.writeFileSync(
    path.join(logDir, 'pr-metadata.json'),
    JSON.stringify(prMetadata, null, 2),
  );

  let issueContext = '# Linked Issue Context\n\n';
  if (prMetadata.closingIssuesReferences?.length > 0) {
    for (const ref of prMetadata.closingIssuesReferences) {
      console.log(`🌿 Fetching hierarchy for Issue #${ref.number}...`);
      const hierarchy = await fetchIssueHierarchy(owner, repo, ref.number);
      if (hierarchy) {
        issueContext += `## Issue #${hierarchy.number}: ${hierarchy.title} (${hierarchy.state})\n\n`;
        issueContext += `**Description**:\n${hierarchy.body}\n\n`;
        if (hierarchy.subIssues && (hierarchy.subIssues as any[]).length > 0) {
          issueContext += `### Sub-Tasks:\n`;
          (hierarchy.subIssues as any[]).forEach((sub: any) => {
            issueContext += `- [#${sub.number}] ${sub.title} (${sub.state})\n`;
          });
          issueContext += '\n';
        }
      }
    }
  } else {
    issueContext += '_No linked issues found._\n';
  }

  const rawContextPath = path.join(logDir, 'raw-issue-context.md');
  fs.writeFileSync(rawContextPath, issueContext);

  console.log('⚔️ Checking for merge conflicts...');
  const baseBranch = prMetadata.baseRefName || 'main';
  const conflictCheck = await run(
    `git fetch origin ${baseBranch} && git merge-tree --write-tree HEAD origin/${baseBranch}`,
  );
  const hasConflicts = conflictCheck
    ? conflictCheck.includes('<<<<<<<')
    : false;
  fs.writeFileSync(
    path.join(logDir, 'conflict-status.json'),
    JSON.stringify({ hasConflicts, baseBranch }, null, 2),
  );

  if (geminiBin && policyPath) {
    console.log('🧠 Synthesizing Mission Context...');
    const synthesisPrompt = `Combine this PR description and linked issue data into a unified, concise summary of requirements and goals. This will be used as the "Source of Truth" for evaluating if the PR meets its objectives.\n\nPR Description:\n${prMetadata.body}\n\n${issueContext}`;
    const synthesisCmd = `${geminiBin} --policy ${policyPath} -p "${synthesisPrompt.replace(/"/g, '\\"')}" > ${path.join(logDir, 'mission-context.md')} 2>&1`;
    try {
      execSync(synthesisCmd);
    } catch (_e) {
      console.error(
        '❌ Failed to synthesize mission context with Gemini. Falling back to raw context.',
      );
      fs.writeFileSync(
        path.join(logDir, 'mission-context.md'),
        `# Mission Context (Raw)\n\n## PR Description\n${prMetadata.body}\n\n${issueContext}`,
      );
    }
  } else {
    console.log('⚠️ No Gemini bin/policy provided. Using raw context.');
    fs.writeFileSync(
      path.join(logDir, 'mission-context.md'),
      `# Mission Context (Raw)\n\n## PR Description\n${prMetadata.body}\n\n${issueContext}`,
    );
  }

  console.log('✨ Mission context complete.');
}

main().catch((err) => {
  console.error('❌ Error fetching mission context:', err);
  process.exit(1);
});
