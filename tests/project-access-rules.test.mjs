import assert from "node:assert/strict";
import test from "node:test";
import {
  canEditProject,
  canManageProject,
  getProjectAccessRole,
  normalizePrincipalName
} from "../lib/project-access-rules.mjs";

const baseProject = {
  id: "project-1",
  name: "Project",
  slug: "project",
  path: "/tmp/project",
  codexThreadId: null,
  collaborators: [],
  visibility: "private",
  status: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  messages: []
};

test("project access treats unowned legacy projects as claimable by an editor", () => {
  const principal = { principalName: "owner@example.com", userId: "owner-id" };

  assert.equal(getProjectAccessRole(baseProject, principal), "owner");
  assert.equal(canEditProject(baseProject, principal), true);
  assert.equal(canManageProject(baseProject, principal), true);
});

test("project owners can edit and manage projects", () => {
  const principal = { principalName: "owner@example.com", userId: "owner-id" };
  const project = { ...baseProject, ownerUserId: "owner-id", ownerName: "owner@example.com" };

  assert.equal(getProjectAccessRole(project, principal), "owner");
  assert.equal(canEditProject(project, principal), true);
  assert.equal(canManageProject(project, principal), true);
});

test("project collaborators can edit but not manage projects", () => {
  const principal = { principalName: "COLLAB@example.com", userId: "collab-id" };
  const project = {
    ...baseProject,
    ownerUserId: "owner-id",
    ownerName: "owner@example.com",
    collaborators: [{ principalName: "collab@example.com", invitedAt: "2026-01-01T00:00:00.000Z" }]
  };

  assert.equal(getProjectAccessRole(project, principal), "collaborator");
  assert.equal(canEditProject(project, principal), true);
  assert.equal(canManageProject(project, principal), false);
});

test("public non-members have no editor permissions", () => {
  const principal = { principalName: "player@example.com", userId: "player-id" };
  const project = {
    ...baseProject,
    ownerUserId: "owner-id",
    ownerName: "owner@example.com",
    visibility: "public"
  };

  assert.equal(getProjectAccessRole(project, principal), null);
  assert.equal(canEditProject(project, principal), false);
  assert.equal(canManageProject(project, principal), false);
});

test("principal names are normalized for invite matching", () => {
  assert.equal(normalizePrincipalName("  Person@Example.COM  "), "person@example.com");
});
