import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import { readRoleSkills, filterByRole } from "../src/role.js";
import { normalizeSuffix } from "../src/score.js";

const BIN = path.resolve(import.meta.dirname, "..", "bin", "pi-skill-fit.js");
const tempRoots = [];
// Hermetic XDG root: no default overrides file is read unless a test asks for it.
const emptyConfig = tempDir();

function overridesFile(content) {
  const file = path.join(tempDir(), "triggers.json");
  writeFileSync(file, content);
  return file;
}

function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "pi-skill-fit-"));
  tempRoots.push(dir);
  return dir;
}

function makeSkill(root, dirName, frontmatter) {
  const dir = path.join(root, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), frontmatter === null ? "# no frontmatter\n" : `---\n${frontmatter}\n---\n\nBody.\n`);
}

function run(args, env = {}) {
  return spawnSync(process.execPath, [BIN, ...args], {
    encoding: "utf8",
    env: { ...process.env, XDG_CONFIG_HOME: emptyConfig, ...env },
  });
}

after(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

describe("scoring", () => {
  test("a name match outranks a description-only match", () => {
    const root = tempDir();
    makeSkill(root, "security-audit", "name: security-audit\ndescription: Deep codebase checks.");
    makeSkill(root, "notes", "name: notes\ndescription: Security observations.");
    const result = run(["security", "--roots", root, "--json"]);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.deepEqual(
      output.selected.map((skill) => [skill.name, skill.score]),
      [
        ["security-audit", 3],
        ["notes", 1],
      ],
    );
  });

  test("a skill without frontmatter is scored by its directory name", () => {
    const root = tempDir();
    makeSkill(root, "legacy-notes", null);
    const result = run(["legacy", "--roots", root, "--json"]);
    assert.equal(result.status, 0);
    assert.deepEqual(
      JSON.parse(result.stdout).selected.map((skill) => skill.name),
      ["legacy-notes"],
    );
  });
});

describe("limit", () => {
  test("the cap is enforced and dropped counts the remainder", () => {
    const root = tempDir();
    for (let index = 1; index <= 7; index += 1) {
      makeSkill(root, `task-skill-${index}`, `name: task-skill-${index}\ndescription: Handles task work.`);
    }
    const result = run(["task", "--roots", root, "--limit", "5", "--json"]);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.selected.length, 5);
    assert.equal(output.dropped, 2);
    assert.equal(output.candidates, 7);
  });
});

describe("roles", () => {
  test("a !* allowlist restricts candidates to the named skills", async () => {
    const roleDir = tempDir();
    writeFileSync(
      path.join(roleDir, "writer.md"),
      '---\nskills: ["!*", writing-for-agents, research]\n---\n\nRole body.\n',
    );
    const allowlist = await readRoleSkills("writer", roleDir);
    const skills = [{ name: "writing-for-agents" }, { name: "research" }, { name: "other-skill" }];
    assert.deepEqual(
      filterByRole(skills, allowlist).map((skill) => skill.name),
      ["writing-for-agents", "research"],
    );
  });

  test("a role without a skills field does not filter", async () => {
    const roleDir = tempDir();
    writeFileSync(path.join(roleDir, "plain.md"), "---\nmodel: x\n---\n\nRole body.\n");
    assert.equal(await readRoleSkills("plain", roleDir), null);
  });

  test("a missing role file exits 2 with the tried path", () => {
    const result = run(["anything", "--role", "__no-such-role__"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /__no-such-role__\.md/);
  });
});

describe("invalid input", () => {
  test("an empty task exits 2", () => {
    const result = run([""]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /task text is required/);
  });

  test("--limit 0 exits 2", () => {
    const result = run(["review", "--limit", "0"]);
    assert.equal(result.status, 2);
    assert.match(result.stderr, /--limit/);
  });
});

describe("Italian stopwords and suffixes", () => {
  test("Italian task text selects an Italian-described skill", () => {
    const root = tempDir();
    // Skill described in Italian
    makeSkill(root, "documentazione", "name: documentazione\ndescription: Gestione della documentazione del progetto.");
    // Skill described in English (should not match Italian task)
    makeSkill(root, "deploy", "name: deploy\ndescription: Deploy to production servers.");
    // Task in Italian: "scrivi la documentazione" = "write the documentation"
    const result = run(["scrivi la documentazione", "--roots", root, "--json"]);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.selected.length, 1);
    assert.equal(output.selected[0].name, "documentazione");
  });
});

describe("English inflection collapse", () => {
  test("reviewing matches review via suffix normalisation", () => {
    const root = tempDir();
    makeSkill(root, "code-review", "name: code-review\ndescription: Review pull requests.");
    const result = run(["reviewing", "--roots", root, "--json"]);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.selected.length, 1);
    assert.equal(output.selected[0].name, "code-review");
    // "reviewing" -> "review" which matches name token "review"
    assert.ok(output.selected[0].score >= 3);
  });

  test("reviews matches review via suffix normalisation", () => {
    const root = tempDir();
    makeSkill(root, "code-review", "name: code-review\ndescription: Review pull requests.");
    const result = run(["reviews", "--roots", root, "--json"]);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.equal(output.selected.length, 1);
    assert.equal(output.selected[0].name, "code-review");
  });
});

describe("triggers alias", () => {
  test("a triggers alias outranks a description-only match", () => {
    const root = tempDir();
    // Skill with trigger alias matching "audit"
    makeSkill(root, "checker", "name: checker\ntriggers: [audit, inspect]\ndescription: General checking tool.");
    // Skill with "audit" only in description
    makeSkill(root, "logger", "name: logger\ndescription: Audit log viewer.");
    const result = run(["audit", "--roots", root, "--json"]);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    // checker: trigger match (2), logger: description match (1)
    assert.equal(output.selected[0].name, "checker");
    assert.ok(output.selected[0].score > output.selected[1].score);
  });

  test("a name match still beats a triggers alias match", () => {
    const root = tempDir();
    // Skill with "audit" in name
    makeSkill(root, "audit-tool", "name: audit-tool\ndescription: Main auditor.");
    // Skill with "audit" only as a trigger alias
    makeSkill(root, "checker", "name: checker\ntriggers: [audit]\ndescription: General tool.");
    const result = run(["audit", "--roots", root, "--json"]);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    // audit-tool: name match (3) + description match for "auditor"->"audit" potentially
    // checker: trigger match (2)
    assert.equal(output.selected[0].name, "audit-tool");
    assert.ok(output.selected[0].score > output.selected[1].score);
  });

  test("a skill without triggers behaves as before", () => {
    const root = tempDir();
    makeSkill(root, "plain-skill", "name: plain-skill\ndescription: Does plain work.");
    const result = run(["plain", "--roots", root, "--json"]);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).selected[0].name, "plain-skill");
  });
});

describe("--explain", () => {
  test("--explain names the matched tokens", () => {
    const root = tempDir();
    makeSkill(root, "code-review", "name: code-review\ndescription: Review pull requests.");
    const result = run(["review", "--roots", root, "--explain"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /review\(name:3\)/);
  });

  test("--json includes matches array", () => {
    const root = tempDir();
    makeSkill(root, "code-review", "name: code-review\ndescription: Review pull requests.");
    const result = run(["review", "--roots", root, "--json"]);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    assert.ok(Array.isArray(output.selected[0].matches));
    assert.ok(output.selected[0].matches.length > 0);
    const nameMatch = output.selected[0].matches.find((m) => m.source === "name");
    assert.ok(nameMatch);
    assert.equal(nameMatch.weight, 3);
  });
});

describe("self-routing regression", () => {
  test("a domain task does not put pi-skill-fit in the top three", () => {
    const root = tempDir();
    // Use the real repo SKILL.md for pi-skill-fit
    const selfDir = path.join(root, "pi-skill-fit");
    mkdirSync(selfDir, { recursive: true });
    const realSkillMd = path.resolve(import.meta.dirname, "..", "SKILL.md");
    writeFileSync(path.join(selfDir, "SKILL.md"), readFileSync(realSkillMd, "utf8"));
    // Create a domain skill that should outrank it
    makeSkill(root, "security-audit", "name: security-audit\ndescription: Deep security review and vulnerability audit of the codebase.");
    makeSkill(root, "code-review", "name: code-review\ndescription: Review pull requests and code changes.");
    makeSkill(root, "ponytail-review", "name: ponytail-review\ndescription: Quality review of a change for correctness and load handling.");
    makeSkill(root, "engineering-excellence", "name: engineering-excellence\ndescription: Performance, accessibility, and production readiness standards.");
    const result = run(["pick skills for a security review", "--roots", root, "--json"]);
    assert.equal(result.status, 0);
    const output = JSON.parse(result.stdout);
    const topThree = output.selected.slice(0, 3).map((s) => s.name);
    assert.equal(topThree[0], "security-audit", "security-audit must be #1");
    assert.ok(!topThree.includes("pi-skill-fit"), "pi-skill-fit must not be in the top 3");
  });
});

describe("trigger overrides", () => {
  test("an override raises a skill above a same-score rival", () => {
    const root = tempDir();
    makeSkill(root, "alpha-notes", "name: alpha-notes\ndescription: Writes files.");
    makeSkill(root, "zeta-notes", "name: zeta-notes\ndescription: Writes files.");
    const baseline = run(["write documentation", "--roots", root, "--json"]);
    assert.equal(baseline.status, 0);
    assert.equal(JSON.parse(baseline.stdout).selected[0].name, "alpha-notes");

    const file = overridesFile(JSON.stringify({ "zeta-notes": ["documentation"] }));
    const result = run(["write documentation", "--roots", root, "--overrides", file, "--json"]);
    assert.equal(result.status, 0);
    assert.deepEqual(
      JSON.parse(result.stdout).selected.map((skill) => [skill.name, skill.score]),
      [
        ["zeta-notes", 3],
        ["alpha-notes", 1],
      ],
    );
  });

  test("override tokens add to frontmatter triggers instead of replacing them", () => {
    const root = tempDir();
    makeSkill(root, "checker", "name: checker\ntriggers: [audit]\ndescription: General tool.");
    const file = overridesFile(JSON.stringify({ checker: ["docs"] }));
    const result = run(["audit docs", "--roots", root, "--overrides", file, "--json"]);
    assert.equal(result.status, 0);
    const selected = JSON.parse(result.stdout).selected[0];
    assert.equal(selected.score, 4);
    assert.deepEqual(selected.matches.map((match) => match.source).sort(), ["override", "trigger"]);
  });

  test("an override for an uninstalled skill is ignored without error", () => {
    const root = tempDir();
    makeSkill(root, "alpha-notes", "name: alpha-notes\ndescription: Writes files.");
    const file = overridesFile(JSON.stringify({ "ghost-skill": ["documentation"] }));
    const result = run(["write documentation", "--roots", root, "--overrides", file, "--json"]);
    assert.equal(result.status, 0);
    assert.deepEqual(
      JSON.parse(result.stdout).selected.map((skill) => [skill.name, skill.score]),
      [["alpha-notes", 1]],
    );
  });

  test("a malformed overrides file exits 2 naming the path", () => {
    const root = tempDir();
    makeSkill(root, "alpha-notes", "name: alpha-notes\ndescription: Writes files.");
    for (const content of ["{ not json", '{"alpha-notes": [1]}', '["alpha-notes"]']) {
      const file = overridesFile(content);
      const result = run(["write", "--roots", root, "--overrides", file]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
      assert.match(result.stderr, /overrides/);
    }
  });

  test("--overrides points at a temp file and the default path is not read", () => {
    const root = tempDir();
    makeSkill(root, "alpha-notes", "name: alpha-notes\ndescription: Writes files.");
    const configHome = tempDir();
    mkdirSync(path.join(configHome, "pi-skill-fit"), { recursive: true });
    writeFileSync(path.join(configHome, "pi-skill-fit", "triggers.json"), "{ broken");
    const file = overridesFile(JSON.stringify({ "alpha-notes": ["documentation"] }));
    const result = run(["write documentation", "--roots", root, "--overrides", file, "--json"], {
      XDG_CONFIG_HOME: configHome,
    });
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.stdout).selected[0].score, 3);
  });

  test("--explain distinguishes an override match from a description match", () => {
    const root = tempDir();
    makeSkill(root, "zeta-notes", "name: zeta-notes\ndescription: Writes files.");
    const file = overridesFile(JSON.stringify({ "zeta-notes": ["documentation"] }));
    const result = run(["write documentation", "--roots", root, "--overrides", file, "--explain"]);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /\(override:2\)/);
    assert.match(result.stdout, /\(description:1\)/);
  });
});

describe("suffix normalisation safety", () => {
  test("no token in a sample vocabulary normalises to fewer than 4 characters", () => {
    const vocabulary = [
      "writing", "reviewing", "reviews", "reviewed", "documentation",
      "documents", "documentazione", "documenti", "recensione", "recensioni",
      "security", "testing", "tests", "tested", "design", "skills", "which",
      "lies", "dies", "tried", "asked", "based", "typed", "runs", "bugs",
      "adds", "sets", "gets", "puts", "cuts", "logs", "maps", "tags", "aims",
      "doing", "going", "used", "cried", "fried",
    ];
    for (const word of vocabulary) {
      const stem = normalizeSuffix(word);
      assert.ok(stem.length >= 4, `"${word}" normalised to "${stem}" (${stem.length} chars < 4)`);
    }
  });

  test("writing does not over-stem below 'writ'", () => {
    const stem = normalizeSuffix("writing");
    assert.ok(stem.length >= 4, `"writing" -> "${stem}" is too short`);
    assert.equal(stem, "writ");
  });

  test("word families collapse to a single stem", () => {
    // EN documentation family
    assert.equal(normalizeSuffix("documentation"), normalizeSuffix("documents"));
    // IT documentation family
    assert.equal(normalizeSuffix("documentazione"), normalizeSuffix("documenti"));
    // EN/IT documentation families agree
    assert.equal(normalizeSuffix("documentation"), normalizeSuffix("documentazione"));
    // review family
    const reviewStem = normalizeSuffix("review");
    assert.equal(normalizeSuffix("reviewing"), reviewStem);
    assert.equal(normalizeSuffix("reviews"), reviewStem);
    assert.equal(normalizeSuffix("reviewed"), reviewStem);
    // test family
    const testStem = normalizeSuffix("testing");
    assert.equal(normalizeSuffix("tests"), testStem);
    assert.equal(normalizeSuffix("tested"), testStem);
    // IT recensione family
    assert.equal(normalizeSuffix("recensione"), normalizeSuffix("recensioni"));
  });
});

describe("determinism", () => {
  test("ordering is stable across two runs", () => {
    const root = tempDir();
    makeSkill(root, "beta-review", "name: beta-review\ndescription: Review work.");
    makeSkill(root, "alpha-review", "name: alpha-review\ndescription: Review work.");
    makeSkill(root, "gamma-notes", "name: gamma-notes\ndescription: Review work.");
    const first = run(["review", "--roots", root]);
    const second = run(["review", "--roots", root]);
    assert.equal(first.status, 0);
    assert.equal(first.stdout, second.stdout);
  });
});
