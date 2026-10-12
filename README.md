# Goals for Alto Rooms

Long-, mid- and short-term goals and a TODO list, in a tab of [Alto Rooms](https://github.com/alto-computer/alto-rooms). Link documents to a goal and open them from it.

Goals ships with Alto Rooms 0.4.0 and later. It is on by default; right-click it in the sidebar to turn it off. From 0.2.0 the board follows the app's appearance, light or dark, which needs Alto Rooms 0.7.1 or later.

## Use

- **Add** an item at the bottom of a column. Click its text to edit it.
- **Link a document**: hover an item and click ⧉, pick a room, then a document. Click the chip to open the document.
- **Move** an item by dragging it, within a column or to another one.
- **Columns**: double-click a title to rename it, **+** adds one, **×** deletes one with its items.

## Data

Everything is one file: `~/rooms/.rooms/plugins/goals/data/goals.json`. Your agent can read and edit it too.

```json
{
  "version": 1,
  "columns": [{ "id": "mid", "title": "Mid term · this quarter" }],
  "items": [
    {
      "id": "a1b2c3d4",
      "column": "mid",
      "text": "Ship plugin API v1",
      "done": false,
      "docs": [{ "fileKey": "9f2c01aa77e0b3d4", "title": "Plugin anatomy" }]
    }
  ]
}
```

- `items` are in order; an item belongs to the column with its `column` id.
- `docs[].fileKey` is the document's Rooms file key (`GET /v1/artifacts/by-file-key/{key}`). `title` is shown on the chip.
- Items with an unknown column, and entries without an `id`, are dropped when Goals reads the file. A file that isn't JSON is never overwritten: Goals asks before starting over and keeps a copy.

The board reads the file when its tab opens. If an agent changes it while the tab is open, reopen the tab.

## Develop

```sh
bun install
bun run test
bun run build          # → dist/
```

To try a build in the app, copy `dist/` to `~/rooms/.rooms/plugins/goals/` (delete the `.bundled` file there too; otherwise the next app update replaces your build). See the [plugin guide](https://github.com/alto-computer/alto-rooms/blob/main/docs/plugins.md).

## License

MIT
