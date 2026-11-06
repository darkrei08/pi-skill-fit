# pi-skill-fit

Given a task, print the installed agent skills that fit it, most relevant first, with the absolute path of each `SKILL.md`.

**The problem:** an agent receives a ~130-skill index in its prompt and has to guess which files to load; nothing maps a concrete task to the small set of installed skills worth reading.

```bash
node bin/pi-skill-fit.js "review the pull request for security issues" --limit 5
```

```text
RANK  NAME                 SCORE  PATH
1     security-audit       5      /root/.agents/skills/security-audit/SKILL.md
2     code-review          4      /root/.agents/skills/code-review/SKILL.md
3     contract-review      3      /root/.agents/skills/contract-review/SKILL.md
4     review-reputation    3      /root/.agents/skills/review-reputation/SKILL.md
5     gentle-ai-branch-pr  2      /root/.pi/agent/npm/node_modules/gentle-pi/skills/branch-pr/SKILL.md
5 of 24 candidates, 19 dropped
```

## Requirements

Node.js >= 22. No runtime dependencies, no build step.

```bash
npm test
```

Optionally expose the `pi-skill-fit` binary: `npm link`.

## Usage

```text
pi-skill-fit "<task text>" [--role <name>] [--limit <n>] [--json] [--roots <dir>]
```

| Flag | Meaning |
| --- | --- |
| `--role <name>` | Restrict candidates to the role's `skills:` allowlist from `/root/.pi/agent/pi-ext-roles/roles/<name>.md`. Only an explicit `!*` entry restricts; a role without `skills:` does not filter. |
| `--limit <n>` | Maximum selected skills, default 5, must be >= 1. Remaining matches are reported as dropped. |
| `--json` | Emit `{task, role, limit, selected, dropped, candidates}` instead of the table. |
| `--roots <dir>` | Skill root to scan; repeatable, replaces the default roots. |

Default roots, in order: `/root/.agents/skills`, `/root/.pi/agent/skills`, then every `*/skills` directory under `/root/.pi/agent/npm/node_modules`. A skill is a directory containing `SKILL.md`.

Exit codes: `0` success, `2` invalid input (empty task, bad limit, missing role), `1` internal error.

## What it does NOT do

- It does not discover, install, update, or remove skills upstream. It only reads skill directories that already exist on this machine.
- It does not call a model, embed anything, or use the network. Scoring is token overlap only.
- It does not modify any skill, role, or Pi configuration file.
- It does not judge skill quality and it does not read `SKILL.md` bodies: only `name` and `description` from the frontmatter.

See [docs/design.md](docs/design.md) for the design sources and scoring model.
