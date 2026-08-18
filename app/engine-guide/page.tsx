import Link from "next/link";

export default function EngineGuidePage() {
  return (
    <main style={{ margin: "0 auto", maxWidth: 900, padding: "48px 24px" }}>
      <p><Link href="/dashboard">← Back to dashboard</Link></p>
      <h1>ATG engine creator guide</h1>
      <p>This guide explains engine-backed games, conversion review, generated media, and runtime upgrades.</p>
      <h2>TV and phone</h2>
      <p>TV visuals use the pinned ATG engine runtime. Phone controls stay accessible DOM-based HTML controls with clear text and focus feedback.</p>
      <h2>Upgrade Game</h2>
      <p>Choose <strong>Upgrade Game</strong> from an editable legacy project. Review both previews before accepting. Blocking errors prevent acceptance; warnings require acknowledgment. <strong>Cancel Upgrade</strong> restores the unchanged legacy game, while <strong>Accept Upgrade</strong> ends the temporary rollback window and creates one revision.</p>
      <h2>Assets, media, and audio</h2>
      <p>Game Assets supports images, atlases, bitmap fonts, web fonts, compressed audio, and video textures. Generated images and short sound effects can be previewed, retried, discarded, or accepted. Reference art requires consent. Generated music and video are not supported.</p>
      <h2>Performance and diagnostics</h2>
      <p>Target a logical 1920×1080 stage at 4K and 30 FPS. Editor diagnostics report runtime, asset, audio, and renderer issues. Every sound cue should have equivalent visual or text feedback.</p>
      <h2>Runtime upgrades</h2>
      <p>Existing engine games stay pinned. <strong>Runtime Upgrade</strong> previews a compatible release and changes metadata only after explicit acceptance.</p>
      <h2>Troubleshooting and telemetry</h2>
      <p>Retry conversion failures, re-upload missing assets, unlock audio with a TV interaction, and reduce particles or filters for performance warnings. ATG does not collect engine gameplay telemetry during play; operational signals are limited to editor and conversion workflows.</p>
    </main>
  );
}
