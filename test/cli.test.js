import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import { readRoleSkills, filterByRole } from "../src/role.js";

const BIN = path.resolve(import.meta.dirname, "..", "bin", "pi-skill-fit.js");
const tempRoots = [];

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

function run(args) {
  return spawnSync(process.execPath, [BIN, ...args], { encoding: "utf8" });
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
