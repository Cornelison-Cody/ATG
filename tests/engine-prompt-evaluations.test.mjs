import assert from "node:assert/strict";
import test from "node:test";
import {
  ENGINE_PROMPT_EVALUATION_CASES,
  formatEnginePromptEvaluationReport,
  runEnginePromptEvaluations
} from "../lib/engine-prompt-evaluations.mjs";

test("engine prompt regression fixtures cover build and planning contracts", () => {
  assert.ok(ENGINE_PROMPT_EVALUATION_CASES.some((testCase) => testCase.mode === "build"));
  assert.ok(ENGINE_PROMPT_EVALUATION_CASES.some((testCase) => testCase.mode === "plan"));
  assert.ok(ENGINE_PROMPT_EVALUATION_CASES.some((testCase) => testCase.id.includes("legacy")));
  assert.ok(ENGINE_PROMPT_EVALUATION_CASES.some((testCase) => testCase.id.includes("sound")));
  assert.ok(ENGINE_PROMPT_EVALUATION_CASES.some((testCase) => testCase.id.includes("assets")));
});

test("all representative engine prompt evaluations pass with named contracts", () => {
  const results = runEnginePromptEvaluations();
  assert.equal(results.length, ENGINE_PROMPT_EVALUATION_CASES.length);
  assert.ok(results.every((result) => result.passed), formatEnginePromptEvaluationReport(results));
  assert.ok(results.every((result) => result.failures.length === 0));
});

test("evaluation reports identify the violated contract", () => {
  const testCase = ENGINE_PROMPT_EVALUATION_CASES.find((item) => item.id === "build-tv-visual-polish");
  const result = { id: testCase.id, passed: false, failures: ["missing scene lifecycle"], mode: testCase.mode };
  assert.match(formatEnginePromptEvaluationReport([result]), /FAIL build-tv-visual-polish — missing scene lifecycle/);
});
