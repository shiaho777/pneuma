import { test } from "node:test";
import assert from "node:assert/strict";
import { checkForUpdate, compareSemver } from "@pneuma/core";

test("semver 比较", () => {
  assert.equal(compareSemver("1.2.3", "1.2.3"), 0);
  assert.equal(compareSemver("v1.3.0", "1.2.9"), 1);
  assert.equal(compareSemver("1.2.3", "1.10.0"), -1);
});

test("未配置仓库槽位：诚实返回 unconfigured，不发请求", async () => {
  const result = await checkForUpdate(undefined, "0.1.0", {});
  assert.equal(result.status, "unconfigured");
});

test("304 缓存路径：沿用缓存版本且跳过生效", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    new Response(null, { status: 304 })) as typeof fetch;
  try {
    const prev = { etag: '"x"', latest: "9.9.9", notes: "n", url: "u" };
    const hit = await checkForUpdate("owner/repo", "0.1.0", prev);
    assert.equal(hit.status, "available");
    assert.equal(hit.latest, "9.9.9");
    const skipped = await checkForUpdate("owner/repo", "0.1.0", {
      ...prev,
      skipped: "9.9.9",
    });
    assert.equal(skipped.status, "current");
  } finally {
    globalThis.fetch = original;
  }
});