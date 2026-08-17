# Engine prompt regression evaluations

Run `npm run engine:prompt-eval` to evaluate the build and planning prompt contracts without calling a model or modifying a creator workspace. Fixtures cover TV visual polish, full-game state and gameplay, sound and asset reuse, phone controls, engine-aware planning, both-surface ownership, and legacy isolation.

Each fixture has named required and forbidden patterns. Failures report the case ID and the violated contract, making prompt drift actionable. The evaluations check that prompts preserve pinned runtime metadata, use the ATG scene/bridge/audio lifecycle, reuse approved assets, respect accessibility and 4K/30 FPS guidance, keep phone controls DOM-based, and prevent engine instructions from leaking into legacy projects.

These are contract regressions, not a claim that a language model will always produce correct code. They are intentionally deterministic and safe to run in CI; representative live-output evaluations can be added later using isolated fixture workspaces.
