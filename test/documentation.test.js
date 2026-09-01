import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("podcast corpus ownership names the Librarian", async () => {
  const [agentGuide, readme] = await Promise.all([
    readFile(new URL("../AGENTS.md", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  for (const document of [agentGuide, readme]) {
    assert.match(document, /librarian-thing/);
    assert.doesNotMatch(document, /\bStudio (?:imports|owns)\b/);
  }
});
