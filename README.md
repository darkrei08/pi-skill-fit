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
pi-skill-fit "<task text>" [--role <name>] [--limit <n>] [--json] [--explain] [--roots <dir>]
```

| Flag | Meaning |
| --- | --- |
| `--role <name>` | Restrict candidates to the role's `skills:` allowlist from `/root/.pi/agent/pi-ext-roles/roles/<name>.md`. Only an explicit `!*` entry restricts; a role without `skills:` does not filter. |
| `--limit <n>` | Maximum selected skills, default 5, must be >= 1. Remaining matches are reported as dropped. |
| `--json` | Emit `{task, role, limit, selected, dropped, candidates}` instead of the table. Each selected skill includes a `matches` array with `{token, source, weight}`. |
| `--explain` | In table mode, append per-skill match details showing which task tokens matched and at what weight. |
| `--roots <dir>` | Skill root to scan; repeatable, replaces the default roots. |

Default roots, in order: `/root/.agents/skills`, `/root/.pi/agent/skills`, then every `*/skills` directory under `/root/.pi/agent/npm/node_modules`. A skill is a directory containing `SKILL.md`.

Exit codes: `0` success, `2` invalid input (empty task, bad limit, missing role), `1` internal error.

## Scoring model

1. Tokenize the task: lowercase, split on non-alphanumeric, drop tokens shorter than 3 characters, English and Italian stopwords, then apply light suffix normalisation.
2. A skill's name terms are its `name` split on non-alphanumeric separators; its description terms use the same tokenizer as the task.
3. For each distinct task token:
   - `+3` if it matches a name term
   - `+2` if it matches a `triggers:` alias (see below)
   - `+1` if it matches a description term
   - All three can apply.
4. Drop skills with score 0.
5. Sort by score descending, then name ascending, then path ascending; take `--limit`.

### Suffix normalisation

A light, dependency-free suffix stripper collapses common inflections:
- English: -ing, -tion, -sion, -ment, -ness, -ies, -ed, -er, -ly, -s
- Italian: -zione, -zioni, -mente, -ione, -ioni, -ando, -endo, -are, -ire, -ere, -ato, -ata, -ati, -ate, -ari

Each suffix has a minimum word length to avoid over-stripping (never below 3 characters).

### Trigger aliases

A skill's SKILL.md frontmatter may include a `triggers:` key (YAML list or comma-separated). These tokens are scored at weight 2 (between name=3 and description=1). Skills without this key behave exactly as before.

```yaml
---
name: my-skill
description: Does something useful.
triggers: [audit, inspect, check]
---
```

## What it does NOT do

- It does not discover, install, update, or remove skills upstream. It only reads skill directories that already exist on this machine.
- It does not call a model, embed anything, or use the network. Scoring is token overlap only.
- It does not modify any skill, role, or Pi configuration file.
- It does not judge skill quality and it does not read `SKILL.md` bodies: only `name` and `description` from the frontmatter.

See [docs/design.md](docs/design.md) for the design sources and scoring model.
