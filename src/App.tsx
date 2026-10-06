import type { PluginArtifact, PluginRoom, RoomsPlugin } from "@alto-rooms/plugin-sdk";
import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { FILE, createSaver, parseBoard, reduce, type Action, type Board, type Column, type Doc, type Item } from "./board";

const SAVE_DELAY_MS = 300;
const newId = () => crypto.randomUUID().slice(0, 8);

type Load = { kind: "loading" } | { kind: "broken"; text: string } | { kind: "ready" };

export function App({ rooms }: { rooms: RoomsPlugin }) {
  const [load, setLoad] = useState<Load>({ kind: "loading" });
  const [board, setBoard] = useState<Board | null>(null);
  const [failing, setFailing] = useState(false);
  const boardRef = useRef<Board | null>(null);
  const saver = useMemo(() => createSaver((t) => rooms.storage.write(FILE, t), SAVE_DELAY_MS, setFailing), [rooms]);

  useEffect(() => {
    let live = true;
    void rooms.storage.read(FILE).then((text) => {
      if (!live) return;
      const r = parseBoard(text);
      if (!r.ok) return setLoad({ kind: "broken", text: text ?? "" });
      boardRef.current = r.board;
      setBoard(r.board);
      setLoad({ kind: "ready" });
    });
    const off = rooms.onBeforeClose(() => saver.flush());
    return () => {
      live = false;
      off();
    };
  }, [rooms, saver]);

  const dispatch = (a: Action) => {
    const cur = boardRef.current;
    if (!cur) return;
    const next = reduce(cur, a);
    if (next === cur) return;
    boardRef.current = next;
    setBoard(next);
    saver.schedule(JSON.stringify(next, null, 2) + "\n");
  };

  const startOver = async () => {
    if (load.kind !== "broken") return;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await rooms.storage.write(`goals.broken-${stamp}.json`, load.text);
    const fresh = parseBoard(null);
    if (!fresh.ok) return;
    boardRef.current = fresh.board;
    setBoard(fresh.board);
    setLoad({ kind: "ready" });
  };

  return (
    <div className="app">
      <header className="top">
        <h1>Goals</h1>
        {failing ? (
          <button type="button" className="warn" onClick={() => void saver.flush()}>
            Not saved · Retry
          </button>
        ) : null}
        {load.kind === "ready" ? (
          <button
            type="button"
            className="icon"
            aria-label="Add column"
            title="Add column"
            onClick={() => dispatch({ type: "addColumn", id: newId(), title: "New column" })}
          >
            +
          </button>
        ) : null}
      </header>
      {load.kind === "broken" ? (
        <div className="message">
          <p>goals.json can't be read.</p>
          <p className="muted">It stays as it is until you start over. A copy is kept beside it.</p>
          <button type="button" onClick={() => void startOver()}>
            Start over
          </button>
        </div>
      ) : null}
      {board && load.kind === "ready" ? (
        <div className="columns">
          {board.columns.map((c) => (
            <ColumnView key={c.id} column={c} items={board.items.filter((i) => i.column === c.id)} dispatch={dispatch} rooms={rooms} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ColumnView({
  column,
  items,
  dispatch,
  rooms,
}: {
  column: Column;
  items: Item[];
  dispatch: (a: Action) => void;
  rooms: RoomsPlugin;
}) {
  const headingId = useId();
  const [renaming, setRenaming] = useState(false);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dropAt, setDropAt] = useState<number | null>(null);
  const list = useRef<HTMLUListElement>(null);

  const indexAt = (e: DragEvent) => {
    const rows = [...(list.current?.querySelectorAll<HTMLElement>(":scope > li[data-id]") ?? [])];
    const i = rows.findIndex((r) => {
      const box = r.getBoundingClientRect();
      return e.clientY < box.top + box.height / 2;
    });
    return i === -1 ? rows.length : i;
  };

  return (
    <section className="column" aria-labelledby={headingId}>
      <div className="column-head">
        {renaming ? (
          <TextInput
            label="Column name"
            initial={column.title}
            onDone={(t) => {
              if (t !== null) dispatch({ type: "renameColumn", id: column.id, title: t });
              setRenaming(false);
            }}
          />
        ) : (
          <h2 id={headingId} onDoubleClick={() => setRenaming(true)} title="Double-click to rename">
            {column.title}
          </h2>
        )}
        <button
          type="button"
          className={confirmDelete ? "danger small" : "icon quiet"}
          aria-label={confirmDelete ? `Confirm delete ${column.title}` : `Delete column ${column.title}`}
          title={confirmDelete ? "Delete column and its items" : "Delete column"}
          onBlur={() => setConfirmDelete(false)}
          onClick={() => (confirmDelete ? dispatch({ type: "removeColumn", id: column.id }) : setConfirmDelete(true))}
        >
          {confirmDelete ? "Delete" : "×"}
        </button>
      </div>
      <ul
        ref={list}
        className="items"
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("text/x-goal")) return;
          e.preventDefault();
          setDropAt(indexAt(e));
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setDropAt(null);
        }}
        onDrop={(e) => {
          const id = e.dataTransfer.getData("text/x-goal");
          setDropAt(null);
          if (id) dispatch({ type: "move", id, column: column.id, index: indexAt(e) });
        }}
      >
        {items.map((it, i) => (
          <ItemView key={it.id} item={it} dispatch={dispatch} rooms={rooms} dropBefore={dropAt === i} />
        ))}
        {dropAt !== null && dropAt >= items.length ? <li className="drop-line" aria-hidden /> : null}
      </ul>
      {adding ? (
        <TextInput
          label="New item"
          initial=""
          keepOpen
          onDone={(t) => {
            if (t === null) return setAdding(false);
            dispatch({ type: "add", id: newId(), column: column.id, text: t });
          }}
        />
      ) : (
        <button type="button" className="add" onClick={() => setAdding(true)}>
          Add
        </button>
      )}
    </section>
  );
}

function ItemView({
  item,
  dispatch,
  rooms,
  dropBefore,
}: {
  item: Item;
  dispatch: (a: Action) => void;
  rooms: RoomsPlugin;
  dropBefore: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [picking, setPicking] = useState(false);
  const row = useRef<HTMLLIElement>(null);
  return (
    <li
      ref={row}
      data-id={item.id}
      className={`item${item.done ? " done" : ""}${dropBefore ? " drop-before" : ""}`}
      draggable={!editing}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/x-goal", item.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <div className="item-row">
        <input type="checkbox" aria-label={item.text} checked={item.done} onChange={() => dispatch({ type: "toggle", id: item.id })} />
        {editing ? (
          <TextInput
            label="Edit item"
            initial={item.text}
            onDone={(t) => {
              if (t !== null) dispatch({ type: "edit", id: item.id, text: t });
              setEditing(false);
            }}
          />
        ) : (
          <span className="text" onClick={() => setEditing(true)}>
            {item.text}
          </span>
        )}
        <span className="actions">
          <button
            type="button"
            className="icon quiet"
            aria-label={`Link a document to ${item.text}`}
            title="Link a document"
            onClick={() => setPicking(true)}
          >
            ⧉
          </button>
          <button
            type="button"
            className="icon quiet"
            aria-label={`Delete ${item.text}`}
            title="Delete"
            onClick={() => dispatch({ type: "remove", id: item.id })}
          >
            ×
          </button>
        </span>
      </div>
      {item.docs.length > 0 ? (
        <div className="chips">
          {item.docs.map((d) => (
            <span key={d.fileKey} className="chip">
              <button type="button" aria-label={`Open ${d.title || "document"}`} onClick={() => void rooms.open({ fileKey: d.fileKey })}>
                <span aria-hidden>▤ </span>
                {d.title || "Untitled"}
              </button>
              <button
                type="button"
                className="unlink"
                aria-label={`Unlink ${d.title || "document"}`}
                onClick={() => dispatch({ type: "unlink", id: item.id, fileKey: d.fileKey })}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      {picking ? (
        <Picker
          anchor={row.current}
          rooms={rooms}
          onPick={(doc) => {
            dispatch({ type: "link", id: item.id, doc });
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
    </li>
  );
}

/** One line of text. Enter saves (null on Escape); with keepOpen it clears for the next line. */
function TextInput({
  label,
  initial,
  keepOpen,
  onDone,
}: {
  label: string;
  initial: string;
  keepOpen?: boolean;
  onDone: (text: string | null) => void;
}) {
  const [text, setText] = useState(initial);
  const done = useRef(false);
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Enter") {
      e.preventDefault();
      if (keepOpen) {
        onDone(text);
        setText("");
      } else {
        done.current = true;
        onDone(text);
      }
    } else if (e.key === "Escape") {
      done.current = true;
      onDone(null);
    }
  };
  return (
    <input
      className="line"
      aria-label={label}
      autoFocus
      value={text}
      onChange={(e) => setText(e.target.value)}
      onKeyDown={onKeyDown}
      onBlur={() => {
        if (done.current) return;
        done.current = true;
        if (keepOpen) {
          if (text.trim()) onDone(text);
          onDone(null);
        } else onDone(text);
      }}
    />
  );
}

const PICKER_MAX_HEIGHT = 320;

/** Fixed beside the item (below it, or above when there is no room), so no column scroll clips it. */
function placeBeside(anchor: HTMLElement | null): CSSProperties {
  if (!anchor) return { visibility: "hidden" };
  const r = anchor.getBoundingClientRect();
  const below = window.innerHeight - r.bottom;
  const up = below < PICKER_MAX_HEIGHT && r.top > below;
  return { left: r.left, width: Math.max(r.width, 240), ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }) };
}

function Picker({
  anchor,
  rooms,
  onPick,
  onClose,
}: {
  anchor: HTMLElement | null;
  rooms: RoomsPlugin;
  onPick: (d: Doc) => void;
  onClose: () => void;
}) {
  const [place, setPlace] = useState<CSSProperties>({ visibility: "hidden" });
  useLayoutEffect(() => {
    const update = () => setPlace(placeBeside(anchor));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [anchor]);
  const [roomList, setRoomList] = useState<PluginRoom[] | null>(null);
  const [room, setRoom] = useState<PluginRoom | null>(null);
  const [docs, setDocs] = useState<PluginArtifact[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    rooms.rooms.list().then(setRoomList, () => setError("Rooms can't be listed."));
  }, [rooms]);
  useEffect(() => {
    if (!room) return;
    setDocs(null);
    rooms.artifacts.list(room.id).then(setDocs, () => setError("Documents can't be listed."));
  }, [rooms, room]);
  useEffect(() => {
    const onDown = (e: MouseEvent) => !box.current?.contains(e.target as Node) && onClose();
    const onKey = (e: globalThis.KeyboardEvent) => e.key === "Escape" && onClose();
    // The board scrolling under it would leave it floating beside the wrong item.
    const onScroll = (e: Event) => !box.current?.contains(e.target as Node) && onClose();
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [onClose]);

  const q = query.trim().toLowerCase();
  const shown = docs?.filter((d) => !q || d.title.toLowerCase().includes(q));
  return createPortal(
    <div ref={box} role="dialog" aria-label="Link a document" className="picker" style={place}>
      {error ? <p className="muted">{error}</p> : null}
      {!room ? (
        <>
          <p className="picker-title">Pick a room</p>
          {roomList?.map((r) => (
            <button key={r.id} type="button" className="row" onClick={() => setRoom(r)}>
              <span aria-hidden>▢ </span>
              {r.name}
            </button>
          ))}
          {roomList?.length === 0 ? <p className="muted">No rooms yet.</p> : null}
        </>
      ) : (
        <>
          <div className="picker-head">
            <button type="button" className="icon quiet" aria-label="Back to rooms" onClick={() => setRoom(null)}>
              ‹
            </button>
            <span className="picker-title">{room.name}</span>
          </div>
          <input type="search" className="line" placeholder="Filter" value={query} onChange={(e) => setQuery(e.target.value)} autoFocus />
          <div className="picker-list">
            {shown?.map((d) => (
              <button key={d.fileKey} type="button" className="row" onClick={() => onPick({ fileKey: d.fileKey, title: d.title })}>
                <span aria-hidden>▤ </span>
                {d.title}
              </button>
            ))}
            {shown?.length === 0 ? <p className="muted">No documents.</p> : null}
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
