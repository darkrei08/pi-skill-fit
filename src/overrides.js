import { readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Override file location: `$XDG_CONFIG_HOME/pi-skill-fit/triggers.json`, else `~/.config/...`. */
export function defaultOverridesPath(env = process.env) {
  const base = env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  return path.join(base, "pi-skill-fit", "triggers.json");
}

function invalid(file, reason) {
  const error = new Error(`invalid overrides file ${file}: ${reason}`);
  error.exitCode = 2;
  return error;
}

/** Validate the `{ "skill-name": ["term", ...] }` shape. */
export function parseOverrides(text, file) {
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw invalid(file, error.message);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw invalid(file, "expected an object mapping skill names to arrays of strings");
  }
  for (const [name, tokens] of Object.entries(data)) {
    if (!Array.isArray(tokens)) throw invalid(file, `"${name}" must be an array of strings`);
    for (const token of tokens) {
      if (typeof token !== "string") throw invalid(file, `"${name}" contains a non-string entry`);
    }
  }
  return data;
}

/**
 * Read the override map. A missing file is `{}` unless it was named explicitly,
 * which is a user error worth reporting.
 */
export async function loadOverrides(file, { required = false } = {}) {
  let text;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if (error.code === "ENOENT" && !required) return {};
    if (error.code === "ENOENT") throw invalid(file, "file not found");
    throw error;
  }
  return parseOverrides(text, file);
}

/** Attach override tokens to installed skills; names that are not installed are ignored. */
export function applyOverrides(skills, overrides) {
  return skills.map((skill) =>
    Object.hasOwn(overrides, skill.name) ? { ...skill, overrides: overrides[skill.name] } : skill,
  );
}
