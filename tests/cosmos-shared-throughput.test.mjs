import assert from "node:assert/strict";
import test from "node:test";

import {
  copyContainerDefinition,
  fingerprintItems,
  partitionKeyValue,
  sanitizeCosmosItem
} from "../scripts/migrate-cosmos-shared-throughput.mjs";

test("Cosmos migration strips service metadata while preserving item TTL", () => {
  assert.deepEqual(sanitizeCosmosItem({
    id: "one",
    projectId: "project-one",
    _ttl: 60,
    _etag: "etag",
    _rid: "rid",
    _self: "self",
    _attachments: "attachments",
    _ts: 123
  }), {
    id: "one",
    projectId: "project-one",
    _ttl: 60
  });
});

test("Cosmos migration copies data-bearing container settings only", () => {
  assert.deepEqual(copyContainerDefinition({
    id: "jobs",
    _rid: "rid",
    defaultTtl: 86400,
    partitionKey: { paths: ["/tenant/id"], kind: "Hash", version: 2 },
    indexingPolicy: { indexingMode: "consistent", automatic: true },
    analyticalStorageTtl: null
  }), {
    id: "jobs",
    defaultTtl: 86400,
    partitionKey: { paths: ["/tenant/id"], kind: "Hash", version: 2 },
    indexingPolicy: { indexingMode: "consistent", automatic: true }
  });
});

test("Cosmos fingerprints ignore service metadata and property ordering", () => {
  const left = fingerprintItems([{ id: "two", value: 2 }, { id: "one", nested: { b: 2, a: 1 }, _etag: "old" }]);
  const right = fingerprintItems([{ nested: { a: 1, b: 2 }, id: "one", _etag: "new" }, { value: 2, id: "two" }]);
  assert.equal(left, right);
});

test("Cosmos migration resolves nested partition keys", () => {
  assert.equal(partitionKeyValue({ id: "one", tenant: { id: "tenant-one" } }, { paths: ["/tenant/id"] }), "tenant-one");
});
