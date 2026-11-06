import { readdir, readFile, realpath, stat } from "node:fs/promises";
import path from "node:path";

/** Fixed roots, in resolution order. @type {string[]} */
export const DEFAULT_ROOTS = ["/root/.agents/skills", "/root/.pi/agent/skills"];

const NPM_ROOT = "/root/.pi/agent/npm/node_modules";

async function isDirectory(target) {
  try {
    return (await stat(target)).isDirectory();
  } catch {
    return false;
  }
}

/** Default roots plus every skills directory under each Pi npm package. */
export async function defaultRoots() {
  const roots = [...DEFAULT_ROOTS];
  const entries = await readdir(NPM_ROOT, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const dir = path.join(NPM_ROOT, entry.name, "skills");
    if (await isDirectory(dir)) roots.push(dir);
  }
  return roots;
}

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) return trimmed;
  return trimmed.slice(1, -1).replace(/\\(["'\\])/g, "$1");
}

/**
 * Minimal YAML frontmatter reader: only the single-line `name` and
 * `description` keys are understood.
 */
export function parseFrontmatter(text) {
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end === -1) return {};
  const fields = {};
  for (const line of text.slice(3, end).split(/\r?\n/)) {
    // NOTE: multi-line YAML scalars are not supported; v1 reads single-line keys.
    const match = /^(name|description|triggers):\s*(.*)$/.exec(line);
    if (match) {
      if (match[1] === "triggers") {
        // Parse as comma-separated or YAML inline list: triggers: [a, b] or triggers: a, b
        const raw = match[2].trim().replace(/^\[/, "").replace(/\]$/, "").trim();
        fields.triggers = raw ? raw.split(",").map((t) => unquote(t)).filter(Boolean) : [];
      } else {
        fields[match[1]] = unquote(match[2]);
      }
    }
  }
  return fields;
}

/**
 * Discover skill directories under each root. A skill directory is a
 * directory containing `SKILL.md`; a missing root is skipped silently.
 */
export async function discoverSkills(roots) {
  const skills = [];
  const seen = new Set();
  for (const root of roots) {
    const entries = await readdir(root, { withFileTypes: true }).catch(() => []);
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const dir = path.join(root, entry.name);
      if (!(await isDirectory(dir))) continue;
      const file = path.join(dir, "SKILL.md");
      const text = await readFile(file, "utf8").catch(() => null);
      if (text === null) continue;
      const realDir = await realpath(dir).catch(() => dir);
      if (seen.has(realDir)) continue;
      seen.add(realDir);
      const front = parseFrontmatter(text);
      skills.push({
        name: front.name || path.basename(dir),
        description: front.description || "",
        triggers: front.triggers || null,
        path: path.join(realDir, "SKILL.md"),
      });
    }
  }
  return skills;
}
