# ATG engine performance benchmarks

Issue [#145](https://github.com/Cornelison-Cody/ATG/issues/145) establishes repeatable budgets for engine-backed TV games.

## Baseline profile

The target display is a 3840 × 2160 (4K UHD) TV driven by a representative laptop on a current evergreen browser with hardware-accelerated WebGL. The engine keeps a 1920 × 1080 logical stage and scales it to the display; it does not allocate a native 4K backing buffer. The ticker target is 30 FPS, giving each frame a 33.33 ms wall-clock budget.

Record the following with each browser run:

- laptop CPU/GPU, operating system, browser and browser version;
- display resolution, device pixel ratio, power mode, and hardware acceleration state;
- renderer and resolution reported by PixiJS;
- frame-time average, p95, worst frame, dropped frames, and load time.

## Workload budgets

The suite covers the representative workloads that most affect generated games. Budgets are for the named workload's p95 CPU/update or load time; the full scene must remain under 33.33 ms per frame.

| Workload | Fixture size | p95 budget | Measurement |
| --- | ---: | ---: | --- |
| Static sprites | 1,200 sprites | 10 ms | update and submit |
| Animated characters | 120 characters | 12 ms | frame selection and transforms |
| Particles | 5,000 particles | 14 ms | spawn, update, and retire |
| Frequently changing text | 24 labels | 16 ms | text update and layout |
| Filters | 8 filtered objects | 20 ms | filter update and submit |
| Video textures | 2 textures | 22 ms | frame upload/update proxy |
| Asset loading | 48 assets | 500 ms | manifest load and decode proxy |

These are regression budgets, not claims that every browser or GPU will meet them. A result over budget is reported as `REVIEW` with its p95 and budget so a maintainer can identify which workload needs attention. The Node harness measures deterministic CPU-side proxies and runs in CI without requiring a GPU; browser measurements must be recorded using the profile above before changing a budget.

## Running the suite

Run the fast contract tests with:

```sh
npm test -- tests/engine-performance-benchmark.test.mjs
```

Run a local sample report with 20 measured iterations and three warmups:

```sh
npm run engine:benchmark
```

Use `ATG_BENCHMARK_ITERATIONS=100 npm run engine:benchmark` for a steadier local sample. Do not fail CI based on host timing alone; timing noise is expected on shared runners. Store browser results with the machine profile and compare p95 and worst-frame trends between changes.

## Practical scene budgets

Generated scenes should keep the following limits visible in code review:

- 1,200 ordinary sprites, 120 animated characters, and 5,000 particles in a representative scene;
- 24 frequently changing text objects and 8 filtered objects;
- no more than two simultaneous video textures;
- preload assets before the first interactive frame and show progress for larger manifests;
- keep the logical 1920 × 1080 stage and the runtime's 30 FPS cap; do not increase backing resolution to 4K to improve visual sharpness.

When a scene exceeds a budget, prefer atlases, sprite batching, `ParticleContainer`, fewer filter passes, cached text styles, and staged asset loading before reducing accessibility or gameplay feedback.
