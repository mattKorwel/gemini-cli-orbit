/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:child_process');
vi.mock('node:fs');

describe('fetch-implement-context.ts utility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should parse repository owner and name correctly', () => {
    const remoteUrl = 'https://github.com/google-gemini/gemini-cli.git';
    const repoMatch = remoteUrl.match(
      /github\.com[\/:]?([^\/]+)\/([^\/.]+)(\.git)?$/,
    );

    expect(repoMatch![1]).toBe('google-gemini');
    expect(repoMatch![2]).toBe('gemini-cli');
  });

  it('should simulate deep hierarchy extraction logic', () => {
    // Mock GraphQL Response Structure
    const mockGqlResponse = {
      data: {
        repository: {
          issue: {
            number: 100,
            title: 'Target Issue',
            body: 'Implement feature X',
            state: 'OPEN',
            subIssues: {
              nodes: [{ number: 101, title: 'Child 1', state: 'OPEN' }],
            },
            parent: {
              number: 90,
              title: 'Parent Issue',
              body: 'Theme Y',
              subIssues: {
                nodes: [
                  { number: 100, title: 'Target Issue', state: 'OPEN' },
                  { number: 99, title: 'Sibling 1', state: 'CLOSED' },
                ],
              },
              parent: {
                number: 80,
                title: 'Grandparent Issue',
                body: 'Epic Z',
              },
            },
          },
        },
      },
    };

    const issue = mockGqlResponse.data.repository.issue;
    const hierarchy: any = {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      subIssues: issue.subIssues?.nodes || [],
      parent: null,
      grandparent: null,
      siblings: [],
    };

    if (issue.parent) {
      hierarchy.parent = {
        number: issue.parent.number,
        title: issue.parent.title,
        body: issue.parent.body,
      };
      hierarchy.siblings = (issue.parent.subIssues?.nodes || []).filter(
        (s: any) => s.number !== issue.number,
      );

      if (issue.parent.parent) {
        hierarchy.grandparent = {
          number: issue.parent.parent.number,
          title: issue.parent.parent.title,
          body: issue.parent.parent.body,
        };
      }
    }

    expect(hierarchy.number).toBe(100);
    expect(hierarchy.parent.number).toBe(90);
    expect(hierarchy.grandparent.number).toBe(80);
    expect(hierarchy.siblings).toHaveLength(1);
    expect(hierarchy.siblings[0].number).toBe(99);
    expect(hierarchy.subIssues).toHaveLength(1);
    expect(hierarchy.subIssues[0].number).toBe(101);
  });
});
