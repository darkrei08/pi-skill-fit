---
name: pi-skill-fit
description: "Deterministic selector that picks the most relevant installed agent skills for a task. Use when routing a task to skills, choosing which skill to load, skill selection, skill routing, pick skills, which skill applies, quale skill caricare, selezione skill, routing skill."
triggers: [skill routing, skill selection, pick skills, which skill, quale skill, selezione skill, skill fit, skill match]
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
