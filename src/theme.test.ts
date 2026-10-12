import { THEME_TOKENS } from "@alto-rooms/plugin-sdk";
import { describe, expect, it } from "vitest";
import css from "./styles.css?raw";

const rootBlock = css.match(/:root\s*\{([^}]*)\}/)![1];
const rules = css.replace(/:root\s*\{[^}]*\}/, "");
const used = new Set([...css.matchAll(/--rooms-([\w-]+)/g)].map((m) => m[1]));

describe("theme", () => {
  it("reads only tokens the SDK applies", () => {
    for (const name of used) expect(THEME_TOKENS, `--rooms-${name}`).toContain(name);
  });

  it("maps every role the board paints with to a token", () => {
    const needed = ["bg", "card", "surface", "surface-strong", "border", "border-strong", "text", "text-muted", "text-faint", "accent", "on-accent", "error", "font-sans", "shadow"];
    for (const name of needed) expect(rootBlock, `--rooms-${name}`).toContain(`var(--rooms-${name},`);
  });

  it("keeps every colour literal inside the :root map", () => {
    const literals = rules.match(/#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\(|\b(?:white|black)\b(?!-)/gi) ?? [];
    expect(literals).toEqual([]);
  });
});
