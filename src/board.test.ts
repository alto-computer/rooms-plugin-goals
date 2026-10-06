import { describe, expect, it, vi } from "vitest";
import { DEFAULT_BOARD, createSaver, parseBoard, reduce, type Board } from "./board";

const withItems = (): Board => ({
  ...DEFAULT_BOARD,
  items: [
    { id: "a", column: "long", text: "Rooms becomes a daily tool", done: false, docs: [] },
    { id: "b", column: "todo", text: "Write plugin spec", done: false, docs: [] },
    { id: "c", column: "todo", text: "Pick v1 slots", done: false, docs: [] },
  ],
});

describe("parseBoard", () => {
  it("starts with the four default columns when there is no file", () => {
    const r = parseBoard(null);
    expect(r.ok && r.board.columns.map((c) => c.title)).toEqual([
      "Long term · 1 year",
      "Mid term · this quarter",
      "Short term · this week",
      "TODO",
    ]);
  });

  it("refuses text that isn't JSON, so the file is never overwritten by accident", () => {
    expect(parseBoard("{oops").ok).toBe(false);
    expect(parseBoard("[1,2]").ok).toBe(false);
  });

  it("keeps what an agent wrote by hand and drops what it can't use", () => {
    const r = parseBoard(
      JSON.stringify({
        columns: [{ id: "q", title: "Quarter" }, { title: "no id" }, "junk"],
        items: [
          { id: "1", column: "q", text: "Ship", docs: [{ fileKey: "k1", title: "Spec" }, { title: "no key" }] },
          { id: "2", column: "gone", text: "Orphan" },
          { column: "q", text: "no id" },
        ],
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.board.columns).toEqual([{ id: "q", title: "Quarter" }]);
    expect(r.board.items).toEqual([{ id: "1", column: "q", text: "Ship", done: false, docs: [{ fileKey: "k1", title: "Spec" }] }]);
  });
});

describe("reduce", () => {
  it("adds, edits, checks and removes items", () => {
    let b = reduce(DEFAULT_BOARD, { type: "add", id: "x", column: "short", text: "  Excalidraw MVP  " });
    expect(b.items).toEqual([{ id: "x", column: "short", text: "Excalidraw MVP", done: false, docs: [] }]);
    b = reduce(b, { type: "edit", id: "x", text: "Excalidraw plugin MVP" });
    b = reduce(b, { type: "toggle", id: "x" });
    expect(b.items[0]).toMatchObject({ text: "Excalidraw plugin MVP", done: true });
    expect(reduce(b, { type: "remove", id: "x" }).items).toEqual([]);
  });

  it("ignores empty text", () => {
    expect(reduce(DEFAULT_BOARD, { type: "add", id: "x", column: "todo", text: "   " })).toBe(DEFAULT_BOARD);
    const b = withItems();
    expect(reduce(b, { type: "edit", id: "a", text: "" })).toBe(b);
  });

  it("links a document once and unlinks it", () => {
    const doc = { fileKey: "9f2c", title: "Plugin anatomy" };
    let b = reduce(withItems(), { type: "link", id: "a", doc });
    b = reduce(b, { type: "link", id: "a", doc: { ...doc, title: "renamed" } });
    expect(b.items[0].docs).toEqual([doc]);
    expect(reduce(b, { type: "unlink", id: "a", fileKey: "9f2c" }).items[0].docs).toEqual([]);
  });

  it("moves an item to another column at a position", () => {
    const b = reduce(withItems(), { type: "move", id: "a", column: "todo", index: 1 });
    expect(b.items.filter((i) => i.column === "todo").map((i) => i.id)).toEqual(["b", "a", "c"]);
    const back = reduce(b, { type: "move", id: "c", column: "todo", index: 0 });
    expect(back.items.filter((i) => i.column === "todo").map((i) => i.id)).toEqual(["c", "b", "a"]);
  });

  it("adds and renames columns, and removes a column with its items", () => {
    let b = reduce(withItems(), { type: "addColumn", id: "life", title: "Life" });
    expect(b.columns.at(-1)).toEqual({ id: "life", title: "Life" });
    b = reduce(b, { type: "renameColumn", id: "life", title: "Someday" });
    expect(b.columns.at(-1)!.title).toBe("Someday");
    b = reduce(b, { type: "removeColumn", id: "todo" });
    expect(b.columns.map((c) => c.id)).not.toContain("todo");
    expect(b.items.map((i) => i.id)).toEqual(["a"]);
  });
});

describe("createSaver", () => {
  it("writes the last text once after a quiet spell, and flush writes at once", async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => {});
    const s = createSaver(write, 300);
    s.schedule("1");
    s.schedule("2");
    await vi.advanceTimersByTimeAsync(299);
    expect(write).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(write).toHaveBeenCalledWith("2");
    s.schedule("3");
    await s.flush();
    expect(write).toHaveBeenLastCalledWith("3");
    await vi.advanceTimersByTimeAsync(1000);
    expect(write).toHaveBeenCalledTimes(2);
    await s.flush(); // nothing pending: no write
    expect(write).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("reports a failed write and keeps the text to try again", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("disk")).mockResolvedValue(undefined);
    const onError = vi.fn();
    const s = createSaver(write, 0, onError);
    s.schedule("x");
    await s.flush();
    expect(onError).toHaveBeenCalledWith(true);
    await s.flush();
    expect(write).toHaveBeenLastCalledWith("x");
    expect(onError).toHaveBeenLastCalledWith(false);
  });
});
