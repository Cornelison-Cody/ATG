const ENGINE_CONFIG = JSON.stringify({ engine: { formatVersion: 1, migrationStatus: "upgraded", runtimeVersion: "atg-2d-1.3.0", type: "pixi" } });

export const ENGINE_MIGRATION_FIXTURES = Object.freeze([
  makeFixture("simple-ui", { instructions: "Press ready, then answer the prompt." }),
  makeFixture("complex-state", { game: "window.ATG.setState({ round: 1, score: {} });" }),
  makeFixture("animation", { game: "scene.tween({ target: title, to: { alpha: 1 }, duration: 300 });" }),
  makeFixture("uploaded-assets", { asset: "assets/logo.png", assets: [{ path: "assets/logo.png", contentType: "image/png" }] }),
  makeFixture("audio", { game: "scene.audio.play('assets/chime.ogg');", asset: "assets/chime.ogg", assets: [{ path: "assets/chime.ogg", contentType: "audio/ogg" }] }),
  makeFixture("custom-instructions", { instructions: "Teams alternate turns. Highest score wins." }),
  makeFixture("incompatible", { incompatible: true })
]);

export function getFixture(id) {
  return ENGINE_MIGRATION_FIXTURES.find((fixture) => fixture.id === id) || null;
}

function makeFixture(id, options = {}) {
  const files = [
    { path: "config.json", content: JSON.stringify({ title: id, engine: { formatVersion: 1, migrationStatus: "legacy", runtimeVersion: null, type: "legacy" } }) },
    { path: "game.js", content: options.game || "window.ATG.onState(() => {});" },
    { path: "instructions.md", content: options.instructions || "Play the game." },
    { path: "phone.html", content: options.incompatible ? "<button>Ready</button>" : "<button onclick=\"window.ATG.sendAction('ready')\">Ready</button>" },
    { path: "styles.css", content: "body { color: white; }" },
    { path: "tv.html", content: "<main>Legacy TV</main>" }
  ];
  return Object.freeze({ id, files, assets: options.assets || [], asset: options.asset || null, incompatible: Boolean(options.incompatible) });
}

export function convertFixture(fixture) {
  const files = fixture.files.map((file) => {
    if (file.path === "config.json") return { ...file, content: ENGINE_CONFIG };
    if (file.path === "tv.html") return { ...file, content: "<script>window.ATGEngine.ready.then(() => {});</script>" };
    if (file.path === "phone.html" && !fixture.incompatible) return { ...file, content: "<button onclick=\"window.ATG.sendAction('ready')\">Ready</button>" };
    if (file.path === "tv.html") return { ...file, content: "<main>Legacy TV</main>" };
    return { ...file };
  });
  if (fixture.asset) files[1].content += `\nconst asset = '${fixture.asset}';`;
  return { files, assets: fixture.assets };
}
