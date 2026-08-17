#!/usr/bin/env node
import { formatEnginePromptEvaluationReport, runEnginePromptEvaluations } from "../lib/engine-prompt-evaluations.mjs";

const results = runEnginePromptEvaluations();
console.log(formatEnginePromptEvaluationReport(results));
if (results.some((result) => !result.passed)) process.exitCode = 1;
