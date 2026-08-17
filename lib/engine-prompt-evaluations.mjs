import { buildPlanningRequest } from "./chat-mode.mjs";
import { buildProjectPrompt } from "./project-prompt.mjs";

export const ENGINE_PROMPT_METADATA = Object.freeze({
  formatVersion: 1,
  migrationStatus: "upgraded",
  runtimeVersion: "atg-2d-1.3.0",
  type: "pixi"
});

const LEGACY_PROMPT_METADATA = Object.freeze({
  formatVersion: 1,
  migrationStatus: "legacy",
  runtimeVersion: null,
  type: "legacy"
});

const cases = [
  {
    id: "build-tv-visual-polish",
    mode: "build",
    target: "tv",
    message: "Add animated character sprites and a celebratory transition.",
    required: [
      ["pinned runtime", /Runtime: atg-2d-1\.3\.0/],
      ["scene lifecycle", /engine\.gameplay\.createScene/],
      ["sprite/animation guidance", /scene\.tween/],
      ["TV engine boundary", /pinned ATG Pixi runtime/],
      ["performance budget", /4K\/30 FPS budgets/]
    ],
    forbidden: []
  },
  {
    id: "build-both-state-gameplay",
    mode: "build",
    target: "both",
    message: "Add team rounds, shared scoring, and a results animation.",
    required: [
      ["both-surface target", /Full game plan/],
      ["state bridge", /engine\.bridge\.onState/],
      ["action bridge", /engine\.bridge\.sendAction/],
      ["platform state protection", /platform-owned players/],
      ["phone DOM boundary", /Pixi TV scene and DOM phone controls/]
    ],
    forbidden: []
  },
  {
    id: "build-tv-sound-assets",
    mode: "build",
    target: "tv",
    message: "Add a countdown sound and reuse the existing score artwork.",
    required: [
      ["audio lifecycle", /scene\.audio/],
      ["asset reuse", /approved game asset paths and manifests/],
      ["binary boundary", /do not create binary files/i],
      ["dependency boundary", /public CDNs/]
    ],
    forbidden: []
  },
  {
    id: "build-phone-controls",
    mode: "build",
    target: "phone",
    message: "Add an accessible buzz confirmation and disabled loading state.",
    required: [
      ["phone target", /Primary target file: game\/phone\.html/],
      ["DOM phone boundary", /Phone edits must remain accessible DOM controls/],
      ["loading guidance", /loading state/],
      ["accessibility guidance", /prefers-reduced-motion/]
    ],
    forbidden: []
  },
  {
    id: "plan-engine-features",
    mode: "plan",
    target: "tv",
    message: "Plan a polished action game with readable feedback.",
    required: [
      ["required vs optional", /required gameplay from optional polish/],
      ["feature menu", /sprite animation, particles, transitions, camera effects, sound cues/],
      ["implementation handoff", /Implementation handoff:/],
      ["selected assets", /Selected visuals\/animation/],
      ["selected sound", /Selected sound\/feedback/],
      ["performance constraints", /Performance\/accessibility constraints/]
    ],
    forbidden: []
  },
  {
    id: "plan-both-boundaries",
    mode: "plan",
    target: "both",
    message: "Plan a team game with TV effects and phone voting.",
    required: [
      ["full planning target", /TV display and phone controller/],
      ["TV Pixi boundary", /TV visuals use the pinned Pixi runtime/],
      ["phone DOM boundary", /phone controls remain accessible DOM interfaces/],
      ["handoff gameplay", /Required gameplay:/]
    ],
    forbidden: []
  },
  {
    id: "legacy-isolation",
    mode: "build",
    target: "tv",
    metadata: LEGACY_PROMPT_METADATA,
    message: "Polish the existing legacy scoreboard without changing its architecture.",
    required: [
      ["legacy contract", /LEGACY GAME CONTRACT/],
      ["legacy renderer", /existing HTML\/CSS\/JavaScript rendering architecture/],
      ["engine prohibition", /Do not add PixiJS/]
    ],
    forbidden: [["engine contract leakage", /ENGINE-BACKED GAME CONTRACT/], ["Pixi runtime leakage", /window\.ATGEngine/]]
  }
];

export const ENGINE_PROMPT_EVALUATION_CASES = Object.freeze(cases);

export function evaluateEnginePromptCase(testCase) {
  const metadata = testCase.metadata || ENGINE_PROMPT_METADATA;
  const prompt = testCase.mode === "plan"
    ? buildPlanningRequest(testCase.message, testCase.target, { engineMetadata: metadata })
    : buildProjectPrompt(testCase.message, testCase.target, metadata);
  const failures = [];
  for (const [contract, pattern] of testCase.required || []) {
    if (!pattern.test(prompt)) failures.push(`missing ${contract}`);
  }
  for (const [contract, pattern] of testCase.forbidden || []) {
    if (pattern.test(prompt)) failures.push(`violates ${contract}`);
  }
  return Object.freeze({ id: testCase.id, mode: testCase.mode, prompt, failures, passed: failures.length === 0 });
}

export function runEnginePromptEvaluations() {
  return ENGINE_PROMPT_EVALUATION_CASES.map(evaluateEnginePromptCase);
}

export function formatEnginePromptEvaluationReport(results) {
  const lines = ["ATG engine prompt regression evaluations", ""];
  for (const result of results) {
    lines.push(`${result.passed ? "PASS" : "FAIL"} ${result.id}${result.failures.length ? ` — ${result.failures.join("; ")}` : ""}`);
  }
  return lines.join("\n");
}
