import { readFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_ROLE_DIR = "/root/.pi/agent/pi-ext-roles/roles";

function unquote(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return trimmed;
  const quote = trimmed[0];
  if ((quote !== '"' && quote !== "'") || trimmed.at(-1) !== quote) return trimmed;
  return trimmed.slice(1, -1).replace(/\\(["'\\])/g, "$1");
}

/**
 * Read the `skills:` allowlist from a role prompt.
 * `null` means the role declares no allowlist, so no filtering applies.
 */
export async function readRoleSkills(role, roleDir = DEFAULT_ROLE_DIR) {
  if (/[\\/]/.test(role) || role === "." || role === "..") {
    const error = new Error(`invalid role name: ${role}`);
    error.exitCode = 2;
    throw error;
  }
  const file = path.join(roleDir, `${role}.md`);
  const text = await readFile(file, "utf8").catch(() => {
    const error = new Error(`role file not found: ${file}`);
    error.exitCode = 2;
    throw error;
  });
  const end = text.startsWith("---") ? text.indexOf("\n---", 3) : -1;
  const block = end === -1 ? "" : text.slice(3, end);
  const match = /^skills:\s*(.*)$/m.exec(block);
  if (!match) return null;
  const inner = match[1].trim().replace(/^\[/, "").replace(/\]$/, "").trim();
  if (!inner) return null;
  return inner
    .split(",")
    .map((entry) => unquote(entry))
    .filter(Boolean);
}

/** Apply a role allowlist. Only an explicit `!*` restricts candidates. */
export function filterByRole(skills, allowlist) {
  if (!allowlist || !allowlist.includes("!*")) return skills;
  const allowed = new Set(allowlist.filter((entry) => !entry.startsWith("!")));
  return skills.filter((skill) => allowed.has(skill.name));
}
