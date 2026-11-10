import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  createInvestigation: vi.fn(async (input: { title: string }) => ({ id: "inv_test", title: input.title })),
  addSource: vi.fn(async () => ({})),
  deleteInvestigation: vi.fn(async () => {}),
}));
vi.mock("../server/lib/store", () => store);

import { listCases, loadCase } from "../server/lib/cases";

const previous = process.env.REDTHREAD_CASES_DIR;
const roots: string[] = [];

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockClear();
});

afterEach(async () => {
  if (previous == null) delete process.env.REDTHREAD_CASES_DIR;
  else process.env.REDTHREAD_CASES_DIR = previous;
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function tempDir(prefix: string) {
  const dir = await mkdtemp(path.join(tmpdir(), prefix));
  roots.push(dir);
  return dir;
}

async function root() {
  const dir = await tempDir("rt-load-");
  process.env.REDTHREAD_CASES_DIR = dir;
  return dir;
}

async function collection(dir: string, slug: string, files: string[]) {
  const folder = path.join(dir, slug);
  await mkdir(folder, { recursive: true });
  await writeFile(path.join(folder, "note.txt"), "inside", "utf8");
  await writeFile(
    path.join(folder, "case.json"),
    JSON.stringify({ title: slug, question: "What happened?", sources: files.map((file) => ({ file, title: file, kind: "text" })) }),
    "utf8",
  );
  return folder;
}

async function expectRefused(slug: string, code: string) {
  await expect(loadCase(slug)).rejects.toMatchObject({ code });
  expect(store.createInvestigation).not.toHaveBeenCalled();
  expect(store.addSource).not.toHaveBeenCalled();
}

describe("loadCase", () => {
  it("loads regular files, including ones in subfolders", async () => {
    const dir = await root();
    const folder = await collection(dir, "plain", ["note.txt", "docs/memo.txt"]);
    await mkdir(path.join(folder, "docs"));
    await writeFile(path.join(folder, "docs", "memo.txt"), "memo", "utf8");
    await loadCase("plain");
    expect(store.addSource.mock.calls.map((c) => (c as unknown as [{ content: string }])[0].content)).toEqual(["inside", "memo"]);
  });

  it("refuses parent-directory traversal", async () => {
    const dir = await root();
    await writeFile(path.join(dir, "secret.txt"), "outside", "utf8");
    await collection(dir, "climb", ["note.txt", "../secret.txt"]);
    await expectRefused("climb", "unsafe_path");
  });

  it("refuses a sibling folder whose name shares the collection's prefix", async () => {
    const dir = await root();
    await mkdir(path.join(dir, "acme-evil"));
    await writeFile(path.join(dir, "acme-evil", "secret.txt"), "outside", "utf8");
    await collection(dir, "acme", ["../acme-evil/secret.txt"]);
    await expectRefused("acme", "unsafe_path");
  });

  it("refuses absolute paths", async () => {
    const dir = await root();
    const outside = await tempDir("rt-outside-");
    await writeFile(path.join(outside, "secret.txt"), "outside", "utf8");
    await collection(dir, "absolute", [path.join(outside, "secret.txt")]);
    await expectRefused("absolute", "unsafe_path");
  });

  it("refuses a source file that is a symlink out of the collection", async () => {
    const dir = await root();
    const outside = await tempDir("rt-outside-");
    await writeFile(path.join(outside, "secret.txt"), "outside", "utf8");
    const folder = await collection(dir, "linked-out", ["note.txt", "secret.txt"]);
    await symlink(path.join(outside, "secret.txt"), path.join(folder, "secret.txt"));
    await expectRefused("linked-out", "unsafe_path");
  });

  it("refuses a symlink even when its target is inside the collection", async () => {
    const dir = await root();
    const folder = await collection(dir, "linked-in", ["alias.txt"]);
    await symlink(path.join(folder, "note.txt"), path.join(folder, "alias.txt"));
    await expectRefused("linked-in", "unsafe_path");
  });

  it("refuses a path through a symlinked folder", async () => {
    const dir = await root();
    const outside = await tempDir("rt-outside-");
    await writeFile(path.join(outside, "secret.txt"), "outside", "utf8");
    const folder = await collection(dir, "linked-dir", ["docs/secret.txt"]);
    await symlink(outside, path.join(folder, "docs"));
    await expectRefused("linked-dir", "unsafe_path");
  });

  it("refuses a collection folder that is a symlink and a manifest that is a symlink", async () => {
    const dir = await root();
    const outside = await tempDir("rt-outside-");
    await collection(outside, "real", ["note.txt"]);
    await symlink(path.join(outside, "real"), path.join(dir, "linked"));
    await expectRefused("linked", "not_found");

    const folder = path.join(dir, "manifest-link");
    await mkdir(folder);
    await symlink(path.join(outside, "real", "case.json"), path.join(folder, "case.json"));
    await expectRefused("manifest-link", "not_found");
    expect(await listCases()).toEqual([]);
  });

  it("checks every source before creating the investigation", async () => {
    const dir = await root();
    await collection(dir, "late-miss", ["note.txt", "missing.txt"]);
    await expectRefused("late-miss", "not_found");
  });

  it("rejects malformed slugs and manifests", async () => {
    const dir = await root();
    await expectRefused("../cases", "invalid_slug");
    await mkdir(path.join(dir, "broken"));
    await writeFile(path.join(dir, "broken", "case.json"), "{ not json", "utf8");
    await expectRefused("broken", "invalid_manifest");
    expect(await listCases()).toEqual([]);
  });
});
