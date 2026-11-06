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

## Pi extension

The package also ships a Pi extension (`src/extension.js`). At `before_agent_start` it
ranks the installed skills for the user's prompt in process and appends the selection
to the system prompt:

```text
## Selected skills (pi-skill-fit)
- /root/.agents/skills/security-audit/SKILL.md — security-audit: security, review
```

Rules: at most 5 entries, the matched tokens (max 4) are shown, the whole block is
capped at 700 characters, and token lists shrink before entries are dropped. The same
selection is injected once per session; a later prompt that selects a different set
injects the new set. Any failure is swallowed and reported once on stderr, so the
extension can never block the agent start.

Enable it with `pi -e ./src/extension.js`, or install the package and let the `pi`
manifest in `package.json` load it. Disable it either way:

```bash
PI_SKILL_FIT=off pi ...
```

or, in `settings.json`:

```json
{ "extensionSettings": { "pi-skill-fit": false } }
```

`false`, `"off"` and `{ "enabled": false }` all disable it. A value of `true` or a
missing entry leaves it enabled.

Known limitation: the `before_agent_start` context does not expose the active role, so
the extension cannot apply a role's `skills:` allowlist and uses the global selector.
The CLI keeps `--role` support. Role-level `extensionSettings` are resolved by
pi-ext-roles for programmatic consumers but are not delivered to the Pi CLI, so only
the settings file and the environment variable act as switches today.

## Requirements

Node.js >= 22. No runtime dependencies, no build step.

```bash
npm test
```

Optionally expose the `pi-skill-fit` binary: `npm link`.

## Usage

```text
pi-skill-fit "<task text>" [--role <name>] [--limit <n>] [--json] [--explain] [--roots <dir>] [--overrides <path>]
```

| Flag | Meaning |
| --- | --- |
| `--role <name>` | Restrict candidates to the role's `skills:` allowlist from `/root/.pi/agent/pi-ext-roles/roles/<name>.md`. Only an explicit `!*` entry restricts; a role without `skills:` does not filter. |
| `--limit <n>` | Maximum selected skills, default 5, must be >= 1. Remaining matches are reported as dropped. |
| `--json` | Emit `{task, role, limit, selected, dropped, candidates}` instead of the table. Each selected skill includes a `matches` array with `{token, source, weight}`. |
| `--explain` | In table mode, append per-skill match details showing which task tokens matched and at what weight. |
| `--roots <dir>` | Skill root to scan; repeatable, replaces the default roots. |
| `--overrides <path>` | Read trigger overrides from this file instead of the default one. The file must exist and be valid. |

Default roots, in order: `/root/.agents/skills`, `/root/.pi/agent/skills`, then every `*/skills` directory under `/root/.pi/agent/npm/node_modules`. A skill is a directory containing `SKILL.md`.

Exit codes: `0` success, `2` invalid input (empty task, bad limit, missing role, malformed overrides), `1` internal error.

## Scoring model

1. Tokenize the task: lowercase, split on non-alphanumeric, drop tokens shorter than 3 characters, English and Italian stopwords, then apply light suffix normalisation.
2. A skill's name terms are its `name` split on non-alphanumeric separators; its description terms use the same tokenizer as the task.
3. For each distinct task token:
   - `+3` if it matches a name term
   - `+2` if it matches a `triggers:` alias or an override token (see below)
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

### Trigger overrides

A skill's frontmatter belongs to its upstream author, and `skills update` overwrites it. To fix or extend the trigger vocabulary of an installed skill without editing it, keep a local override file instead:

```json
{
  "writing-for-agents": ["write", "writing", "documentation", "docs", "README", "guide", "manual"],
  "research": ["investigate", "sources", "evidence", "paper"]
}
```

- Location: `--overrides <path>` if given, else `$XDG_CONFIG_HOME/pi-skill-fit/triggers.json`, else `~/.config/pi-skill-fit/triggers.json`. A missing default file means no overrides; it is not an error.
- Semantics: override tokens are normalised with the same tokenizer and suffix table as everything else, score at weight 2 (same as `triggers:`), and are added to the skill's own triggers, never replacing them.
- A name that is not installed is ignored silently.
- A malformed file (not JSON, not an object of string arrays, missing when named with `--overrides`) exits `2` with the path and the reason. It is never silently ignored.
- `--json` and `--explain` report these matches with `source: "override"`, distinct from `name`, `trigger` and `description`, so a ranking decision stays auditable.

## What it does NOT do

- It does not discover, install, update, or remove skills upstream. It only reads skill directories that already exist on this machine.
- It does not call a model, embed anything, or use the network. Scoring is token overlap only.
- It does not modify any skill, role, or Pi configuration file. Overrides live in its own config file and are read-only input to scoring.
- It does not judge skill quality and it does not read `SKILL.md` bodies: only `name`, `description` and `triggers` from the frontmatter.

See [docs/design.md](docs/design.md) for the design sources and scoring model.
