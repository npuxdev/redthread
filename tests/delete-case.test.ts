import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { CaseError, deleteCase, listCases } from "../server/lib/cases";

const previous = process.env.REDTHREAD_CASES_DIR;
const roots: string[] = [];

afterEach(async () => {
  if (previous == null) delete process.env.REDTHREAD_CASES_DIR;
  else process.env.REDTHREAD_CASES_DIR = previous;
  await Promise.all(roots.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function root() {
  const dir = await mkdtemp(path.join(tmpdir(), "rt-cases-"));
  roots.push(dir);
  process.env.REDTHREAD_CASES_DIR = dir;
  return dir;
}

async function collection(dir: string, slug: string, title = slug) {
  const folder = path.join(dir, slug);
  await mkdir(folder);
  await writeFile(path.join(folder, "note.txt"), "hello", "utf8");
  await writeFile(
    path.join(folder, "case.json"),
    JSON.stringify({
      title,
      question: "What happened?",
      sources: [{ file: "note.txt", title: "Note", kind: "text" }],
    }),
    "utf8",
  );
  return folder;
}

describe("deleteCase", () => {
  it("removes a collection and leaves its siblings", async () => {
    const dir = await root();
    await collection(dir, "keep-me", "Keep");
    await collection(dir, "drop-me", "Drop");
    await deleteCase("drop-me");
    const listed = await listCases();
    expect(listed.map((item) => item.slug)).toEqual(["keep-me"]);
  });

  it("rejects a slug that is not a single collection name", async () => {
    await root();
    await expect(deleteCase("../drop-me")).rejects.toMatchObject({ code: "invalid_slug" });
    await expect(deleteCase("drop/me")).rejects.toBeInstanceOf(CaseError);
  });

  it("rejects a missing collection before deleting anything", async () => {
    await root();
    await expect(deleteCase("missing")).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses a collection directory that is a symlink", async () => {
    const dir = await root();
    const outside = await mkdtemp(path.join(tmpdir(), "rt-outside-"));
    roots.push(outside);
    await collection(outside, "real", "Real");
    await symlink(path.join(outside, "real"), path.join(dir, "linked"));
    await expect(deleteCase("linked")).rejects.toMatchObject({ code: "not_found" });
    expect(await listCases()).toEqual([]);
  });

  it("refuses a source file that points outside the collection", async () => {
    const dir = await root();
    const outside = await mkdtemp(path.join(tmpdir(), "rt-outside-"));
    roots.push(outside);
    const secret = path.join(outside, "secret.txt");
    await writeFile(secret, "keep", "utf8");
    const folder = await collection(dir, "linked-file", "Linked");
    await symlink(secret, path.join(folder, "secret.txt"));
    await expect(deleteCase("linked-file")).rejects.toMatchObject({ code: "unsafe_path" });
    const listed = await listCases();
    expect(listed.map((item) => item.slug)).toEqual(["linked-file"]);
  });
});
