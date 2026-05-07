import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { Octokit } from "@octokit/rest";

function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN environment variable is not set.");
  return new Octokit({ auth: token });
}

export function registerGithubTools(pi: ExtensionAPI): void {
  // ── github_list_commits ───────────────────────────────────────────────────
  pi.registerTool({
    name: "github_list_commits",
    label: "GitHub List Commits",
    description: "List recent commits for a GitHub repository, with author, message, and timestamp.",
    promptSnippet: "List recent commits for a GitHub repo",
    parameters: Type.Object({
      owner:  Type.String({ description: "Repository owner (org or user)" }),
      repo:   Type.String({ description: "Repository name" }),
      branch: Type.Optional(Type.String({ description: "Branch or ref (default: default branch)" })),
      since:  Type.Optional(Type.String({ description: "ISO 8601 — only commits after this time" })),
      until:  Type.Optional(Type.String({ description: "ISO 8601 — only commits before this time" })),
      limit:  Type.Optional(Type.Number({ description: "Max commits to return (default 30, max 100)" })),
    }),

    async execute(_id, params, signal) {
      const octokit = getOctokit();
      const res = await octokit.repos.listCommits({
        owner:    params.owner,
        repo:     params.repo,
        sha:      params.branch,
        since:    params.since,
        until:    params.until,
        per_page: Math.min(params.limit ?? 30, 100),
        request:  { signal },
      });

      const commits = res.data.map((c) => ({
        sha:       c.sha.slice(0, 8),
        message:   c.commit.message.split("\n")[0],
        author:    c.commit.author?.name,
        date:      c.commit.author?.date,
        url:       c.html_url,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(commits, null, 2) }],
        details: { commits, repo: `${params.owner}/${params.repo}` },
      };
    },
  });

  // ── github_get_diff ───────────────────────────────────────────────────────
  pi.registerTool({
    name: "github_get_diff",
    label: "GitHub Get Diff",
    description: "Get the diff between two refs (commit SHAs, branches, or tags) in a GitHub repo.",
    promptSnippet: "Get a code diff between two refs (commits, branches, tags) in a GitHub repo",
    parameters: Type.Object({
      owner:  Type.String(),
      repo:   Type.String(),
      base:   Type.String({ description: "Base ref (older)" }),
      head:   Type.String({ description: "Head ref (newer)" }),
      max_files: Type.Optional(Type.Number({ description: "Limit to N files (default 20)" })),
    }),

    async execute(_id, params, signal) {
      const octokit = getOctokit();
      const res = await octokit.repos.compareCommitsWithBasehead({
        owner:      params.owner,
        repo:       params.repo,
        basehead:   `${params.base}...${params.head}`,
        request:    { signal },
      });

      const limit = params.max_files ?? 20;
      const files = (res.data.files ?? []).slice(0, limit).map((f) => ({
        filename:  f.filename,
        status:    f.status,
        additions: f.additions,
        deletions: f.deletions,
        patch:     f.patch?.slice(0, 2000), // truncate large patches
      }));

      const summary = {
        base:        params.base,
        head:        params.head,
        commits:     res.data.total_commits,
        files_changed: res.data.files?.length ?? 0,
        additions:   res.data.files?.reduce((s, f) => s + f.additions, 0) ?? 0,
        deletions:   res.data.files?.reduce((s, f) => s + f.deletions, 0) ?? 0,
        files,
      };

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        details: summary,
      };
    },
  });

  // ── github_list_workflow_runs ─────────────────────────────────────────────
  pi.registerTool({
    name: "github_list_workflow_runs",
    label: "GitHub List Workflow Runs",
    description: "List recent GitHub Actions workflow runs for a repo, with status and conclusion.",
    promptSnippet: "List recent GitHub Actions workflow runs (CI/CD status) for a repo",
    parameters: Type.Object({
      owner:       Type.String(),
      repo:        Type.String(),
      workflow:    Type.Optional(Type.String({ description: "Workflow file name or ID (default: all workflows)" })),
      branch:      Type.Optional(Type.String()),
      status:      Type.Optional(Type.Union([
        Type.Literal("completed"), Type.Literal("in_progress"),
        Type.Literal("queued"),   Type.Literal("failure"),
        Type.Literal("success"),
      ])),
      limit:       Type.Optional(Type.Number({ description: "Max runs to return (default 20)" })),
    }),

    async execute(_id, params, signal) {
      const octokit = getOctokit();
      const limit = Math.min(params.limit ?? 20, 100);

      let runs;
      if (params.workflow) {
        const res = await octokit.actions.listWorkflowRuns({
          owner:       params.owner,
          repo:        params.repo,
          workflow_id: params.workflow,
          branch:      params.branch,
          status:      params.status as "completed" | undefined,
          per_page:    limit,
          request:     { signal },
        });
        runs = res.data.workflow_runs;
      } else {
        const res = await octokit.actions.listWorkflowRunsForRepo({
          owner:    params.owner,
          repo:     params.repo,
          branch:   params.branch,
          status:   params.status as "completed" | undefined,
          per_page: limit,
          request:  { signal },
        });
        runs = res.data.workflow_runs;
      }

      const summary = runs.slice(0, limit).map((r) => ({
        id:          r.id,
        name:        r.name,
        workflow:    r.path,
        branch:      r.head_branch,
        commit:      r.head_sha.slice(0, 8),
        status:      r.status,
        conclusion:  r.conclusion,
        started_at:  r.run_started_at,
        updated_at:  r.updated_at,
        url:         r.html_url,
      }));

      return {
        content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        details: { runs: summary, repo: `${params.owner}/${params.repo}` },
      };
    },
  });
}
