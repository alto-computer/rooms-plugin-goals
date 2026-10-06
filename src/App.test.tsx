import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { RoomsPlugin } from "@alto-rooms/plugin-sdk";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

afterEach(cleanup);

function fakeRooms(files: Record<string, string> = {}) {
  let closer: (() => Promise<void> | void) | null = null;
  const rooms = {
    pluginId: "goals",
    onContext: () => () => {},
    onBeforeClose: (cb: () => Promise<void> | void) => {
      closer = cb;
      return () => {};
    },
    storage: {
      read: vi.fn(async (p: string) => files[p] ?? null),
      write: vi.fn(async (p: string, t: string) => void (files[p] = t)),
      list: vi.fn(async () => Object.keys(files).sort()),
      delete: vi.fn(async (p: string) => void delete files[p]),
    },
    rooms: {
      list: vi.fn(async () => [
        { id: "r1", name: "Benchmarks" },
        { id: "r2", name: "Design system" },
      ]),
    },
    artifacts: {
      list: vi.fn(async (roomId: string) =>
        roomId === "r1"
          ? [
              { roomId: "r1", artifactId: "a1", fileKey: "k1", title: "Latency comparison", createdAt: "2026-10-01" },
              { roomId: "r1", artifactId: "a2", fileKey: "k2", title: "Plugin anatomy", createdAt: "2026-09-30" },
            ]
          : [],
      ),
    },
    open: vi.fn(async () => {}),
  };
  const close = async () => closer?.();
  return { rooms: rooms as unknown as RoomsPlugin & typeof rooms, files, close };
}

const saved = (files: Record<string, string>) => JSON.parse(files["goals.json"]);

async function start(files?: Record<string, string>) {
  const f = fakeRooms(files);
  render(<App rooms={f.rooms} />);
  await screen.findByRole("heading", { name: "Goals" });
  return f;
}

describe("Goals", () => {
  it("shows the default columns and saves a new item", async () => {
    const { files, close } = await start();
    for (const t of ["Long term · 1 year", "Mid term · this quarter", "Short term · this week", "TODO"]) {
      expect(screen.getByRole("region", { name: t })).toBeTruthy();
    }
    const todo = screen.getByRole("region", { name: "TODO" });
    fireEvent.click(within(todo).getByRole("button", { name: "Add" }));
    const input = within(todo).getByRole("textbox", { name: "New item" });
    fireEvent.change(input, { target: { value: "Write plugin spec" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(within(todo).getByText("Write plugin spec")).toBeTruthy();
    await act(close);
    expect(saved(files).items).toMatchObject([{ column: "todo", text: "Write plugin spec", done: false }]);
  });

  it("checks an item off", async () => {
    const board = {
      version: 1,
      columns: [{ id: "todo", title: "TODO" }],
      items: [{ id: "a", column: "todo", text: "Pick v1 slots", done: false, docs: [] }],
    };
    const { files, close } = await start({ "goals.json": JSON.stringify(board) });
    fireEvent.click(screen.getByRole("checkbox", { name: "Pick v1 slots" }));
    await act(close);
    expect(saved(files).items[0].done).toBe(true);
  });

  it("links a document from a room and opens it from its chip", async () => {
    const board = {
      version: 1,
      columns: [{ id: "mid", title: "Mid term" }],
      items: [{ id: "a", column: "mid", text: "Ship plugin API v1", done: false, docs: [] }],
    };
    const { rooms, files, close } = await start({ "goals.json": JSON.stringify(board) });
    fireEvent.click(screen.getByRole("button", { name: "Link a document to Ship plugin API v1" }));
    const picker = await screen.findByRole("dialog", { name: "Link a document" });
    fireEvent.click(await within(picker).findByRole("button", { name: "Benchmarks" }));
    fireEvent.click(await within(picker).findByRole("button", { name: "Plugin anatomy" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Open Plugin anatomy" }));
    expect(rooms.open).toHaveBeenCalledWith({ fileKey: "k2" });
    await act(close);
    expect(saved(files).items[0].docs).toEqual([{ fileKey: "k2", title: "Plugin anatomy" }]);
  });

  it("filters documents in the picker", async () => {
    const board = {
      version: 1,
      columns: [{ id: "mid", title: "Mid term" }],
      items: [{ id: "a", column: "mid", text: "Ship", done: false, docs: [] }],
    };
    await start({ "goals.json": JSON.stringify(board) });
    fireEvent.click(screen.getByRole("button", { name: "Link a document to Ship" }));
    const picker = await screen.findByRole("dialog", { name: "Link a document" });
    fireEvent.click(await within(picker).findByRole("button", { name: "Benchmarks" }));
    await within(picker).findByRole("button", { name: "Plugin anatomy" });
    fireEvent.change(within(picker).getByRole("searchbox"), { target: { value: "laten" } });
    expect(within(picker).queryByRole("button", { name: "Plugin anatomy" })).toBeNull();
    expect(within(picker).getByRole("button", { name: "Latency comparison" })).toBeTruthy();
  });

  it("renames a column and adds one", async () => {
    const { files, close } = await start();
    fireEvent.doubleClick(screen.getByRole("heading", { name: "TODO" }));
    const input = screen.getByRole("textbox", { name: "Column name" });
    fireEvent.change(input, { target: { value: "Today" } });
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(screen.getByRole("button", { name: "Add column" }));
    await act(close);
    expect(saved(files).columns.map((c: { title: string }) => c.title)).toEqual([
      "Long term · 1 year",
      "Mid term · this quarter",
      "Short term · this week",
      "Today",
      "New column",
    ]);
  });

  it("never overwrites a goals.json it can't read, and can start over after keeping a copy", async () => {
    const { rooms, files } = await start({ "goals.json": "{broken" });
    expect(screen.getByText("goals.json can't be read.")).toBeTruthy();
    expect(rooms.storage.write).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Start over" }));
    await screen.findByRole("region", { name: "TODO" });
    const backup = Object.keys(files).find((k) => k.startsWith("goals.broken-"));
    expect(backup && files[backup]).toBe("{broken");
  });
});
