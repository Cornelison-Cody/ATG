# Engine-backed Codex workspace validation

Codex jobs use a disposable text workspace under `game/`. Engine-backed projects keep the protected starter layout:

- `config.json` (engine and format metadata)
- `game.js`, `instructions.md`, `phone.html`, `styles.css`, and `tv.html`

Safe scene modules may use `.js` or `.mjs` under `game/scenes/`. Atlas metadata, bitmap-font descriptors, SVG art, and JSON metadata may live under `game/assets/` or another project-owned text path. Per-file and total text limits remain 200 KB and 1 MB.

Binary assets are deliberately excluded from this workspace. Codex must use the project asset flow for uploaded or generated binaries; creating a PNG, audio, video, font binary, archive, or other unsupported file under `game/` fails validation instead of being silently ignored.

Validation preserves the existing protections for both legacy and engine games:

- absolute paths, traversal, duplicate paths, unsupported extensions, and oversized files are rejected;
- symlinks are rejected, including symlinked directories;
- deleting any initial file is rejected;
- engine metadata cannot be removed or downgraded during a Codex edit;
- engine protected files must remain present after the job.

Legacy workspaces do not acquire engine-only required files. The same path, size, symlink, and deletion protections continue to apply to their existing file layout.
