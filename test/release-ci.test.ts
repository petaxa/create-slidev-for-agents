import { afterEach, expect, test, vi } from "vite-plus/test";
import { createReleasePR } from "../scripts/release-ci";

afterEach(() => vi.unstubAllGlobals());

test("creates a main-targeted PR with GitHub's CI token", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({ html_url: "https://github.com/owner/repo/pull/1" }),
    });
  vi.stubGlobal("fetch", fetch);
  expect(await createReleasePR("owner/repo", "release/v0.0.3", "ci-token")).toBe(
    "https://github.com/owner/repo/pull/1",
  );
  const [endpoint, options] = fetch.mock.calls[1];
  expect(endpoint).toBe("https://api.github.com/repos/owner/repo/pulls");
  expect(options.headers.Authorization).toBe("Bearer ci-token");
  expect(JSON.parse(options.body)).toMatchObject({
    head: "release/v0.0.3",
    base: "main",
    title: "chore: release v0.0.3",
  });
});

test("re-running the workflow reuses its open PR", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => [{ html_url: "existing" }] });
  vi.stubGlobal("fetch", fetch);
  expect(await createReleasePR("owner/repo", "release/v0.0.3", "ci-token")).toBe("existing");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0][0]).toContain("head=owner%3Arelease%2Fv0.0.3");
});

test("reports missing PR permission and rejects unrelated branch names", async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, json: async () => [] })
    .mockResolvedValueOnce({ ok: false, status: 403 });
  vi.stubGlobal("fetch", fetch);
  await expect(createReleasePR("owner/repo", "release/v0.0.3", "ci-token")).rejects.toThrow(
    /permissions/,
  );
  fetch.mockClear();
  await expect(createReleasePR("owner/repo", "feature", "ci-token")).rejects.toThrow(/Expected/);
  expect(fetch).not.toHaveBeenCalled();
});
