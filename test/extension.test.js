import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";

import { HEADING, MAX_BLOCK_CHARS, buildBlock, createHandler, selectSkills } from "../src/extension.js";

const tempRoots = [];

function tempDir() {
  const dir = mkdtempSync(path.join(tmpdir(), "pi-skill-fit-ext-"));
  tempRoots.push(dir);
  return dir;
}

function makeSkill(root, dirName, frontmatter) {
  const dir = path.join(root, dirName);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "SKILL.md"), `---\n${frontmatter}\n---\n\nBody.\n`);
  return path.join(dir, "SKILL.md");
}

function fakeEvent(prompt) {
  return { messageType: "user", prompt, systemPromptOptions: { appendSystemPrompt: "" } };
}

const ctx = { sessionManager: { getSessionId: () => "session-1" } };

after(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

describe("buildBlock", () => {
  test("renders a heading and one line per selected skill", () => {
    const block = buildBlock([
      {
        name: "security-audit",
        path: "/root/.agents/skills/security-audit/SKILL.md",
        matches: [
          { token: "security", source: "name", weight: 3 },
          { token: "review", source: "description", weight: 1 },
        ],
      },
    ]);
    assert.ok(block.startsWith(HEADING));
    assert.match(block, /- \/root\/\.agents\/skills\/security-audit\/SKILL\.md — security-audit: security, review/);
  });

  test("caps the number of entries at five", () => {
    const selected = Array.from({ length: 7 }, (_, index) => ({
      name: `skill-${index}`,
      path: `/root/.agents/skills/skill-${index}/SKILL.md`,
      matches: [{ token: `token-${index}`, source: "name", weight: 3 }],
    }));
    assert.equal(buildBlock(selected).split("\n").length - 1, 5);
  });

  test("holds the 700-character cap with five long-token skills", () => {
    const longToken = "x".repeat(200);
    const selected = Array.from({ length: 5 }, (_, index) => ({
      name: `skill-${index}`,
      path: `/root/.agents/skills/skill-${index}/SKILL.md`,
      matches: Array.from({ length: 4 }, () => ({ token: longToken, source: "description", weight: 1 })),
    }));
    const block = buildBlock(selected);
    assert.ok(block.length <= MAX_BLOCK_CHARS, `block is ${block.length} chars`);
    assert.equal(block.split("\n").length - 1, 5);
  });

  test("is stable across two calls", () => {
    const selected = [
      { name: "alpha", path: "/a/SKILL.md", matches: [{ token: "one", source: "name", weight: 3 }] },
      { name: "beta", path: "/b/SKILL.md", matches: [{ token: "two", source: "trigger", weight: 2 }] },
    ];
    assert.equal(buildBlock(selected), buildBlock(selected));
  });

  test("returns an empty string for no selection", () => {
    assert.equal(buildBlock([]), "");
  });
});

describe("selection", () => {
  test("a scoring prompt produces a block with the real path", async () => {
    const root = tempDir();
    const skillPath = makeSkill(
      root,
      "security-audit",
      "name: security-audit\ndescription: Review pull requests for security issues.",
    );
    const selected = await selectSkills("review the pull request for security issues", {
      roots: [root],
      overrides: {},
    });
    const block = buildBlock(selected);
    assert.match(block, new RegExp(skillPath.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(block, /security-audit: /);
  });

  test("a prompt with no matches produces nothing", async () => {
    const root = tempDir();
    makeSkill(root, "knitting", "name: knitting\ndescription: Patterns and yarn.");
    const selected = await selectSkills("quantum chromodynamics", { roots: [root], overrides: {} });
    assert.deepEqual(selected, []);
    assert.equal(buildBlock(selected), "");
  });
});

describe("handler", () => {
  test("appends the block to the system prompt once per distinct selection", async () => {
    const selected = [
      { name: "alpha", path: "/skills/alpha/SKILL.md", matches: [{ token: "review", source: "name", weight: 3 }] },
    ];
    const handler = createHandler({ select: async () => selected });

    const first = fakeEvent("review");
    await handler(first, ctx);
    assert.match(first.systemPromptOptions.appendSystemPrompt, /## Selected skills/);

    const second = fakeEvent("review");
    await handler(second, ctx);
    assert.equal(second.systemPromptOptions.appendSystemPrompt, "");
  });

  test("does nothing when PI_SKILL_FIT is off", async () => {
    let calls = 0;
    const handler = createHandler({
      select: async () => {
        calls += 1;
        return [{ name: "alpha", path: "/a/SKILL.md", matches: [] }];
      },
    });
    const previous = process.env.PI_SKILL_FIT;
    process.env.PI_SKILL_FIT = "off";
    try {
      const event = fakeEvent("review");
      await handler(event, ctx);
      assert.equal(event.systemPromptOptions.appendSystemPrompt, "");
      assert.equal(calls, 0);
    } finally {
      if (previous === undefined) delete process.env.PI_SKILL_FIT;
      else process.env.PI_SKILL_FIT = previous;
    }
  });

  test("does nothing when extensionSettings disable it", async () => {
    let calls = 0;
    const handler = createHandler({
      select: async () => {
        calls += 1;
        return [{ name: "alpha", path: "/a/SKILL.md", matches: [] }];
      },
      getSettings: () => ({ extensionSettings: { "pi-skill-fit": false } }),
    });
    const event = fakeEvent("review");
    await handler(event, ctx);
    assert.equal(event.systemPromptOptions.appendSystemPrompt, "");
    assert.equal(calls, 0);
  });

  test("swallows a selector error and logs it once", async () => {
    let warnings = 0;
    const handler = createHandler({
      select: async () => {
        throw new Error("boom");
      },
      warn: () => {
        warnings += 1;
      },
    });
    await handler(fakeEvent("review"), ctx);
    await handler(fakeEvent("review"), { sessionManager: { getSessionId: () => "session-2" } });
    assert.equal(warnings, 1);
  });
});
