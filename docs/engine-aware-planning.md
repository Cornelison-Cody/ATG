# Engine-aware planning prompts

Planning mode now receives the normalized project engine metadata and the selected editing target. Engine-backed plans can suggest sprite animation, particles, transitions, camera effects, sound cues, loading states, and performance strategies, but each suggestion must be labeled as required gameplay or optional polish and tied to the game's concept, audience, accessibility, and 4K/30 FPS budget.

The plan preserves the platform boundary: TV visuals use the pinned Pixi runtime, phone controls remain accessible DOM interfaces, and shared behavior crosses surfaces through ATG state/actions. Legacy projects keep their existing HTML/CSS/JavaScript contract and do not receive incidental Pixi migration advice.

When the plan is ready, the response includes an implementation handoff covering required gameplay, selected visuals/animation, selected sound/feedback, and performance/accessibility constraints. The dashboard's existing “Implement plan” action can pass that response into build mode, carrying the accepted engine decisions forward without silently adding scope.
