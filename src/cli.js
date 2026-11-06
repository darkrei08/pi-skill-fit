import { discoverSkills, defaultRoots } from "./skills.js";
import { rankSkills } from "./score.js";
import { filterByRole, readRoleSkills } from "./role.js";

const USAGE = 'usage: pi-skill-fit "<task text>" [--role <name>] [--limit <n>] [--json] [--roots <dir>]';

function invalid(message) {
  const error = new Error(`${message}\n${USAGE}`);
  error.exitCode = 2;
  throw error;
}

/** Parse CLI arguments into an options object. */
export function parseArgs(argv) {
  const options = { task: null, role: null, limit: 5, json: false, roots: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = () => {
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) invalid(`${arg} requires a value`);
      index += 1;
      return next;
    };
    if (arg === "--json") options.json = true;
    else if (arg === "--role") options.role = value();
    else if (arg === "--limit") {
      const raw = value();
      if (!/^\d+$/.test(raw) || Number(raw) < 1) invalid(`--limit must be an integer >= 1, got ${raw}`);
      options.limit = Number(raw);
    } else if (arg === "--roots") options.roots.push(value());
    else if (arg.startsWith("--")) invalid(`unknown flag: ${arg}`);
    else if (options.task === null) options.task = arg;
    else invalid(`unexpected argument: ${arg}`);
  }
  if (options.task === null || options.task.trim() === "") invalid("task text is required");
  return options;
}

function renderTable(selected) {
  const rows = [
    ["RANK", "NAME", "SCORE", "PATH"],
    ...selected.map((skill, index) => [String(index + 1), skill.name, String(skill.score), skill.path]),
  ];
  const widths = rows[0].map((_, column) => Math.max(...rows.map((row) => row[column].length)));
  return rows
    .map((row) => row.map((cell, column) => (column === 3 ? cell : cell.padEnd(widths[column]))).join("  ").trimEnd())
    .join("\n");
}

/** @param {string[]} argv @returns {Promise<number>} exit code */
export async function main(argv) {
  try {
    const options = parseArgs(argv);
    const allowlist = options.role === null ? null : await readRoleSkills(options.role);
    const roots = options.roots.length > 0 ? options.roots : await defaultRoots();
    const skills = filterByRole(await discoverSkills(roots), allowlist);
    const { candidates, selected, dropped } = rankSkills(skills, options.task, options.limit);

    if (options.json) {
      process.stdout.write(
        `${JSON.stringify({
          task: options.task,
          role: options.role,
          limit: options.limit,
          selected,
          dropped,
          candidates: candidates.length,
        })}\n`,
      );
    } else {
      if (selected.length > 0) process.stdout.write(`${renderTable(selected)}\n`);
      process.stdout.write(`${selected.length} of ${candidates.length} candidates, ${dropped} dropped\n`);
    }
    return 0;
  } catch (error) {
    process.stderr.write(`pi-skill-fit: ${error.message}\n`);
    return error.exitCode === 2 ? 2 : 1;
  }
}
