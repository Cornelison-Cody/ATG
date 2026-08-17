import test from "node:test";
import assert from "node:assert/strict";
import { acceptConversionIdentity, assertIdentityPreserved, captureConversionIdentity } from "../lib/conversion-identity.mjs";

const project = {
  id: "project-1", slug: "trivia-night", path: "/games/trivia-night", name: "Trivia Night",
  ownerUserId: "user-1", ownerName: "creator@example.com", collaborators: [{ principalName: "friend@example.com", invitedAt: "2026-01-01" }], visibility: "private"
};

test("identity capture preserves URLs, collaborators, assets, instructions, and saved state", () => {
  const identity = captureConversionIdentity(project, {
    assets: [{ path: "assets/logo.png", size: 10 }, { path: "assets/logo.png", size: 10 }],
    instructions: "Answer quickly.", savedState: { round: 2 }
  });
  assert.equal(identity.tvUrl, "/tv/project-1");
  assert.equal(identity.phoneUrl, "/join/project-1");
  assert.equal(identity.assets.length, 1);
  assert.deepEqual(identity.savedState, { round: 2 });
  assert.equal(identity.activeSession, null);
});

test("acceptance restores identity and increments exactly one coherent revision", () => {
  const identity = captureConversionIdentity(project, { assets: [{ path: "assets/logo.png" }], instructions: "Rules" });
  const accepted = acceptConversionIdentity(identity, { engine: { type: "pixi" }, revision: "legacy-revision" }, "engine-revision");
  assert.equal(accepted.id, project.id);
  assert.equal(accepted.slug, project.slug);
  assert.equal(accepted.revision, "engine-revision");
  assert.equal(accepted.previousRevision, "legacy-revision");
  assert.equal(accepted.activeSession, null);
  assertIdentityPreserved(identity, accepted);
});

test("identity validation rejects changed owner, visibility, or assets", () => {
  const identity = captureConversionIdentity(project, { assets: [{ path: "assets/logo.png" }] });
  assert.throws(() => assertIdentityPreserved(identity, { ...project, visibility: "public", assets: [{ path: "assets/logo.png" }] }), /visibility/);
  assert.throws(() => assertIdentityPreserved(identity, { ...project, assets: [{ path: "assets/other.png" }] }), /uploaded asset set/);
});
