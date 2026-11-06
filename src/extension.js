import { defaultOverridesPath, applyOverrides, loadOverrides } from "./overrides.js";
import { rankSkills } from "./score.js";
import { defaultRoots, discoverSkills } from "./skills.js";

export const HEADING = "## Selected skills (pi-skill-fit)";
export const MAX_BLOCK_CHARS = 700;
const MAX_ENTRIES = 5;
const MAX_TOKENS = 4;
const MAX_SESSIONS = 64;

function render(entries, tokenLimit) {
  const lines = entries.map((entry) => {
    const tokens = entry.tokens.slice(0, tokenLimit);
    return `- ${entry.path} — ${entry.name}${tokens.length > 0 ? `: ${tokens.join(", ")}` : ""}`;
  });
  return [HEADING, ...lines].join("\n");
}

/** Build the prompt block. Token lists shrink before entries are dropped. */
export function buildBlock(selected, { maxChars = MAX_BLOCK_CHARS } = {}) {
  const entries = selected
    .slice(0, MAX_ENTRIES)
    .map((skill) => ({
      path: skill.path,
      name: skill.name,
      tokens: [...new Set((skill.matches ?? []).map((match) => match.token))].slice(0, MAX_TOKENS),
    }));
  if (entries.length === 0) return "";
  for (let tokenLimit = MAX_TOKENS; tokenLimit >= 0; tokenLimit -= 1) {
    const block = render(entries, tokenLimit);
    if (block.length <= maxChars) return block;
  }
  const kept = entries.slice();
  while (kept.length > 0 && render(kept, 0).length > maxChars) kept.pop();
  return kept.length === 0 ? "" : render(kept, 0).slice(0, maxChars);
}

/** Rank installed skills for a prompt without spawning a process. */
export async function selectSkills(prompt, { roots, overrides } = {}) {
  const skillRoots = roots ?? (await defaultRoots());
  const overrideMap = overrides ?? (await loadOverrides(defaultOverridesPath()));
  const skills = applyOverrides(await discoverSkills(skillRoots), overrideMap);
  return rankSkills(skills, prompt, MAX_ENTRIES).selected;
}

function disabledBySettings(getSettings) {
  try {
    const namespace = getSettings()?.extensionSettings?.["pi-skill-fit"];
    return namespace === false || namespace === "off" || namespace?.enabled === false;
  } catch {
    return false;
  }
}

function sessionKey(ctx) {
  try {
    const id = ctx?.sessionManager?.getSessionId?.();
    return typeof id === "string" ? id : "default";
  } catch {
    return "default";
  }
}

/**
 * Create the `before_agent_start` handler. Every failure is swallowed and
 * reported at most once so selection can never block the agent start.
 */
export function createHandler({ select = selectSkills, getSettings = () => undefined, warn } = {}) {
  const lastSelection = new Map();
  let warned = false;
  const report = warn ?? ((error) => process.stderr.write(`pi-skill-fit: ${error?.message ?? error}\n`));
  return async function beforeAgentStart(event, ctx) {
    try {
      if (process.env.PI_SKILL_FIT === "off" || disabledBySettings(getSettings)) return;
      if (event?.messageType !== "user" || typeof event.prompt !== "string" || event.prompt.trim() === "") return;
      if (!event.systemPromptOptions || typeof event.systemPromptOptions !== "object") return;
      // NOTE: the active role is not exposed by the hook context, so the role allowlist cannot
      // be applied here; the CLI keeps it. See README for the limitation.
      const selected = await select(event.prompt);
      if (!Array.isArray(selected) || selected.length === 0) return;
      const key = selected.map((skill) => `${skill.name}\u0000${skill.path}`).join("\n");
      const session = sessionKey(ctx);
      if (lastSelection.get(session) === key) return;
      const block = buildBlock(selected);
      if (block === "") return;
      lastSelection.set(session, key);
      if (lastSelection.size > MAX_SESSIONS) lastSelection.delete(lastSelection.keys().next().value);
      const current = event.systemPromptOptions.appendSystemPrompt;
      event.systemPromptOptions.appendSystemPrompt =
        typeof current === "string" && current !== "" ? `${current}\n\n${block}` : block;
    } catch (error) {
      if (warned) return;
      warned = true;
      report(error);
    }
  };
}

export default function piSkillFit(pi) {
  pi.on("before_agent_start", createHandler({ getSettings: () => pi.getSettings?.() }));
}
