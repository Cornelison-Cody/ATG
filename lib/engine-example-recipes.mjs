export const ENGINE_EXAMPLE_RECIPES = Object.freeze([
  { id: "trivia", required: ["state", "phone-feedback", "scoring"], optional: ["transition", "sprite"] },
  { id: "buzzer", required: ["action", "audio", "phone-feedback"], optional: ["particles"] },
  { id: "board", required: ["scene-module", "state", "animation"], optional: ["camera"] },
  { id: "action", required: ["sprite", "action", "audio", "particles"], optional: ["animation"] },
  { id: "timer", required: ["elapsed-time", "phone-feedback", "loading"], optional: ["transition"] },
  { id: "teams", required: ["state", "scoring", "phone-feedback"], optional: ["sprite", "audio"] }
]);

export function validateEngineExampleRecipes(recipes = ENGINE_EXAMPLE_RECIPES) {
  const ids = new Set(recipes.map((recipe) => recipe.id));
  if (ids.size !== 6 || !["trivia", "buzzer", "board", "action", "timer", "teams"].every((id) => ids.has(id))) {
    throw new Error("Engine example recipes must cover trivia, buzzer, board, action, timer, and teams.");
  }
  if (recipes.some((recipe) => !recipe.required.length)) throw new Error("Every engine example needs required gameplay patterns.");
  return true;
}
