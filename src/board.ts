/*
 * The board: columns of items, stored as data/goals.json. The format is documented in the
 * README so the user's agent can read and change it; parseBoard tolerates hand edits.
 */

export interface Doc {
  fileKey: string;
  title: string;
}

export interface Item {
  id: string;
  column: string;
  text: string;
  done: boolean;
  docs: Doc[];
}

export interface Column {
  id: string;
  title: string;
}

export interface Board {
  version: 1;
  columns: Column[];
  items: Item[];
}

export const DEFAULT_BOARD: Board = {
  version: 1,
  columns: [
    { id: "long", title: "Long term · 1 year" },
    { id: "mid", title: "Mid term · this quarter" },
    { id: "short", title: "Short term · this week" },
    { id: "todo", title: "TODO" },
  ],
  items: [],
};

export const FILE = "goals.json";

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): v is string => typeof v === "string" && v.length > 0;

/** `null` (no file yet) gives the default board; text that isn't a JSON object is refused. */
export function parseBoard(text: string | null): { ok: true; board: Board } | { ok: false } {
  if (text === null) return { ok: true, board: DEFAULT_BOARD };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false };
  }
  if (!isObj(raw)) return { ok: false };
  const columns: Column[] = (Array.isArray(raw.columns) ? raw.columns : [])
    .filter((c): c is Record<string, unknown> => isObj(c) && str(c.id) && typeof c.title === "string")
    .map((c) => ({ id: c.id as string, title: c.title as string }));
  const ids = new Set(columns.map((c) => c.id));
  const items: Item[] = (Array.isArray(raw.items) ? raw.items : [])
    .filter((i): i is Record<string, unknown> => isObj(i) && str(i.id) && str(i.column) && ids.has(i.column) && typeof i.text === "string")
    .map((i) => ({
      id: i.id as string,
      column: i.column as string,
      text: i.text as string,
      done: i.done === true,
      docs: (Array.isArray(i.docs) ? i.docs : [])
        .filter((d): d is Record<string, unknown> => isObj(d) && str(d.fileKey))
        .map((d) => ({ fileKey: d.fileKey as string, title: typeof d.title === "string" ? d.title : "" })),
    }));
  return { ok: true, board: { version: 1, columns, items } };
}

export type Action =
  | { type: "add"; id: string; column: string; text: string }
  | { type: "edit"; id: string; text: string }
  | { type: "toggle"; id: string }
  | { type: "remove"; id: string }
  | { type: "link"; id: string; doc: Doc }
  | { type: "unlink"; id: string; fileKey: string }
  | { type: "move"; id: string; column: string; index: number }
  | { type: "addColumn"; id: string; title: string }
  | { type: "renameColumn"; id: string; title: string }
  | { type: "removeColumn"; id: string };

const patch = (b: Board, id: string, f: (i: Item) => Item): Board => ({ ...b, items: b.items.map((i) => (i.id === id ? f(i) : i)) });

export function reduce(b: Board, a: Action): Board {
  switch (a.type) {
    case "add": {
      const text = a.text.trim();
      if (!text) return b;
      return { ...b, items: [...b.items, { id: a.id, column: a.column, text, done: false, docs: [] }] };
    }
    case "edit": {
      const text = a.text.trim();
      return text ? patch(b, a.id, (i) => ({ ...i, text })) : b;
    }
    case "toggle":
      return patch(b, a.id, (i) => ({ ...i, done: !i.done }));
    case "remove":
      return { ...b, items: b.items.filter((i) => i.id !== a.id) };
    case "link":
      return patch(b, a.id, (i) => (i.docs.some((d) => d.fileKey === a.doc.fileKey) ? i : { ...i, docs: [...i.docs, a.doc] }));
    case "unlink":
      return patch(b, a.id, (i) => ({ ...i, docs: i.docs.filter((d) => d.fileKey !== a.fileKey) }));
    case "move": {
      const item = b.items.find((i) => i.id === a.id);
      if (!item) return b;
      const rest = b.items.filter((i) => i.id !== a.id);
      const inColumn = rest.filter((i) => i.column === a.column);
      const before = inColumn[Math.max(0, Math.min(a.index, inColumn.length))];
      const at = before ? rest.indexOf(before) : rest.length;
      return { ...b, items: [...rest.slice(0, at), { ...item, column: a.column }, ...rest.slice(at)] };
    }
    case "addColumn":
      return { ...b, columns: [...b.columns, { id: a.id, title: a.title.trim() || "New column" }] };
    case "renameColumn": {
      const title = a.title.trim();
      return title ? { ...b, columns: b.columns.map((c) => (c.id === a.id ? { ...c, title } : c)) } : b;
    }
    case "removeColumn":
      return { ...b, columns: b.columns.filter((c) => c.id !== a.id), items: b.items.filter((i) => i.column !== a.id) };
  }
}

/** Writes the latest text after `delayMs` of quiet; `flush` writes what is pending now. */
export function createSaver(write: (text: string) => Promise<void>, delayMs: number, onError: (failing: boolean) => void = () => {}) {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const flush = async () => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (pending === null) return;
    const text = pending;
    pending = null;
    try {
      await write(text);
      onError(false);
    } catch {
      if (pending === null) pending = text;
      onError(true);
    }
  };
  return {
    schedule(text: string) {
      pending = text;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void flush(), delayMs);
    },
    flush,
  };
}
