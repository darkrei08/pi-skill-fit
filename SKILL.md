---
name: pi-skill-fit
description: "Deterministic selector that ranks installed agent capabilities by relevance to a query. Answers meta-questions about which capability to load or how to route a query to the right one."
triggers: [routing, selector, selezione, scegli, quale, load]
---

# pi-skill-fit

Given a task description, select at most 5 of the ~121 installed agent skills
that are relevant, and print the absolute path of each `SKILL.md`.

## When to use

- An orchestrator needs to decide which skills to inject into a sub-agent.
- A user asks "which skill should I load for this task" or "pick skills for X".
- A delegator implements the skill-resolver protocol and needs a deterministic,
  auditable selection step.

## Commands

```bash
# Basic usage
pi-skill-fit "<task text>"

# With options
pi-skill-fit "<task text>" --limit 5 --json --explain --role <name> --roots <dir>
```

| Flag | Meaning |
| --- | --- |
| `--role <name>` | Restrict candidates to the role's `skills:` allowlist. |
| `--limit <n>` | Maximum selected skills (default 5, >= 1). |
| `--json` | JSON output: `{task, role, limit, selected, dropped, candidates}`. |
| `--explain` | For each selected skill, print the task tokens that matched and their weights. |
| `--roots <dir>` | Skill root to scan; repeatable, replaces defaults. |
| `--overrides <path>` | Trigger overrides file; defaults to `$XDG_CONFIG_HOME/pi-skill-fit/triggers.json` or `~/.config/pi-skill-fit/triggers.json`. |

## Pi extension

The same selector ships as a Pi extension. It runs at `before_agent_start` and appends
the selected `SKILL.md` paths to the system prompt (max 5 entries, 700 characters).
Disable it with `PI_SKILL_FIT=off` or `extensionSettings: { "pi-skill-fit": false }`
in `settings.json`.

## Output contract

- **Table mode** (default): `RANK  NAME  SCORE  PATH` rows, then a summary line.
  With `--explain`: after the table, one line per skill showing `token(source:weight)` pairs.
- **JSON mode**: `selected[].matches[]` contains `{token, source, weight}` for auditability.
- Exit codes: `0` success, `2` invalid input, `1` internal error.
- Two runs with the same input produce byte-identical output (deterministic).

## What this does NOT do

This tool does **not** discover, install, update, or remove skills. It only reads
skill directories that already exist on this machine. For skill discovery and
installation, use:

- `skills find <query>` — search for skills upstream.
- `skills add <source>` — install a skill from a path or repository.

The `skills` CLI (`command -v skills`) owns the supply chain; `pi-skill-fit` owns
the task-to-skill routing once skills are installed.
