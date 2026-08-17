#!/usr/bin/env node
import { formatBenchmarkReport, runEnginePerformanceBenchmark } from "../lib/engine-performance-benchmark.mjs";

const iterations = Number.parseInt(process.env.ATG_BENCHMARK_ITERATIONS ?? "20", 10);
const report = runEnginePerformanceBenchmark({ iterations, warmup: 3 });
console.log(formatBenchmarkReport(report));
