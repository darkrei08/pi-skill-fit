# pi-skill-fit v1

Deterministic local skill selector: task text in, at most five installed `SKILL.md` paths out. Status: v1 implemented and tested.

## Specs

**S1.** Node ESM, no runtime dependencies, engines node >= 22. Package name "pi-skill-fit", bin "pi-skill-fit".

**S2.** CLI: `pi-skill-fit "<task text>"` with flags: --role <name>, --limit <n> (default 5), --json, --roots <dir> (repeatable, overrides the default roots).

**S3.** Default skill roots, in this order: /root/.agents/skills, /root/.pi/agent/skills, and any */skills directory under /root/.pi/agent/npm/node_modules. A skill is a directory containing SKILL.md.

**S4.** Parse only the YAML frontmatter keys `name` and `description` (a minimal parser is fine; do not add a YAML dependency). Missing frontmatter = use the directory name as name and skip scoring terms from description.

**S5.** Deterministic scoring, no network, no model call: tokenize the task text (lowercase, split on non-alphanumeric, drop tokens shorter than 3 chars and a small English stopword list); a skill's trigger terms are the tokens of its name (split on "-") plus the tokens of its description; score = 3 * (number of distinct task tokens matching a name token) + 1 * (number matching a description token); skills with score 0 are excluded.

**S6.** Role filter: when --role is given, read /root/.pi/agent/pi-ext-roles/roles/<role>.md, parse its `skills:` list, and if that list contains "!*" restrict candidates to the positively named skills; if the role declares no skills field, do not filter. A missing role file is an error (exit 2) naming the path tried.

**S7.** Ordering: score descending, then name ascending. Deterministic across runs.

**S8.** --limit default 5, must be >= 1; more matches than the limit are truncated, and the count of dropped matches is reported. Output: human table (rank, name, score, absolute path) plus a trailing line "N of M candidates, K dropped"; --json emits {task, role, limit, selected:[{name,score,path}], dropped, candidates}. Exit codes: 0 success, 2 invalid input (empty task, bad limit, missing role), 1 internal error.

## Tasks

- T1 package skeleton: ESM package, bin shebang, test script - S1
- T2 argument parsing and validation: task text, --role, --limit, --json, --roots - S2, S8
- T3 root resolution and skill discovery: fixed roots plus npm `skills` directories, dedupe by real path - S3
- T4 minimal frontmatter parser with directory-name fallback - S4
- T5 tokenizer and weighted scoring with zero-score exclusion - S5
- T6 role allowlist reader and `!*` filter, exit 2 with tried path - S6
- T7 total ordering and limit/dropped accounting - S7, S8
- T8 table and JSON renderers with exit codes - S8
- T9 test suite covering scoring, cap, role filter, missing role, invalid input, determinism, missing frontmatter - S2-S8
- T10 README, design document, ODD feature document - S1-S8

## Log

- L1: Operator asked to bootstrap this project from scratch and to create it in the personal repository. No prior design existed in Engram (`mem_search` across all projects returned no `pi-skill-fit` observations).
