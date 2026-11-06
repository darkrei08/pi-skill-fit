# Design

## Sources

This tool exists to implement, locally and deterministically, a selection step that three documents already describe by contract.

### 1. `~/.agents/skills/_shared/skill-resolver.md` (Gentle selection contract)

- Match on two dimensions: code/file context and task/action keywords.
- Prefer the smallest useful set; hard cap of five skills.
- Inject absolute `SKILL.md` paths, never summaries: the skill file stays the runtime contract.
- The delegator reports what it injected, so selection must name exact files.

Dictates: five-skill default cap, path-only output, trigger/description matching, no rewriting of skill content.

### 2. `~/git/personale/pi.dev/dotenv/docs/agent-skill-priority.md` (priority tiers)

- P0-P3 tiers bias which skills should load for a kind of work.
- Per-role required skills are declared, not inferred.
- Ownership rows say a selection aid must not duplicate workflow execution or model routing.

Diktat for v1: role assignment is read from the role files, and pi-skill-fit owns none of the work it recommends. Priority tiers are not scored in v1 because the tiers are prose, not machine-readable metadata.

### 3. `~/.pi/agent/pi-ext-roles/roles/*.md` (role allowlists)

- Each role frontmatter may declare `skills: [ ... ]`.
- `!*` is a selector meaning "start from nothing"; the remaining bare names are the allowlist.
- Roles without the field inherit everything.

Dictates: `--role` reads that file, applies only when `!*` is present, and errors (exit 2) naming the path when the role does not exist.

## Scoring model

1. Tokenize the task: lowercase, split on non-alphanumeric, drop tokens shorter than 3 characters and a small English stopword list.
2. A skill's name terms are its `name` split on non-alphanumeric separators; its description terms use the same tokenizer as the task.
3. For each distinct task token: `+3` if it matches a name term, `+1` if it matches a description term. Both can apply.
4. Drop skills with score 0.
5. Sort by score descending, then name ascending, then path ascending; take `--limit`.

Why deterministic: the input is the task string plus file contents on disk. There is no model, no sampling, no network, no randomness, no time or locale input beyond `localeCompare` on ASCII skill names. Two runs over the same tree produce byte-identical output, which the test suite asserts. The score is a coarse keyword-overlap heuristic; it is meant to narrow a large index to a handful of files a human or agent then reads, not to rank skills by quality.

## Open decisions

| Decision | Chosen default | Reasoning |
| --- | --- | --- |
| Skill identity | Frontmatter `name` wins, directory name fallback | Roles reference skills by frontmatter name, so selection must use the same key. |
| Missing `SKILL.md` | Not a skill | The contract is the file; a bare directory is not loadable. |
| Missing root | Skipped silently | Installations differ per machine; a missing optional root is not invalid input. |
| Symlinked duplicates | Deduplicated by real path, first root wins | Prevents the same skill appearing twice with two root-relative paths. |
| Frontmatter parsing | Single-line `name`/`description` only, no YAML dependency | Both keys are single-line in every installed skill; a parser dependency is not justified. |
| Name token filter | Name parts are not stopword/min-length filtered | A short or common name part (e.g. `ai`) is still a deliberate identity signal. |
| Weights | 3 for name, 1 for description | A skill named after the task is a stronger trigger than prose that mentions it. |
| Tie-break | Score, then name, then path | Name alone can collide across roots; path keeps the order total. |
| Role filter stage | Applied before scoring | Cheaper and equivalent, since the allowlist does not depend on the task. |
| `candidates` count | Skills with score > 0 after the role filter | Makes `selected + dropped == candidates` hold and keeps the report honest. |
| Priority tiers (P0-P3) | Not scored in v1 | The tiers are prose; encoding them would invent metadata the skills do not carry. |
| Description stemming | None | Stemming needs a dictionary or dependency and makes scores harder to explain. |
