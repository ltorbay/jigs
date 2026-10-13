export type QueueState =
  | "queued"
  | "ask"
  | "quickfix"
  | "shallow"
  | "deep"
  | "balance"
  | "human"
  | "stale"
  | "in-progress"
  | "review"
  | "done";

export interface StatusEntry {
  issue: number;
  state: QueueState;
  updated?: string;
}

export type StatusMap = Record<string, StatusEntry>;

const GLYPHS: Record<QueueState, string> = {
  queued: "⏳",
  ask: "⏳",
  quickfix: "🔎",
  shallow: "🔎",
  deep: "🔎",
  "in-progress": "🔎",
  review: "🔎",
  balance: "⚖",
  human: "👤",
  done: "✅",
  stale: "✅",
};

const GLYPH_FRAGMENT = /(?:\s+(?:⏳|🔎|⚖️?|👤|✅)\s+#\d+)+$/u;
const TRAILING_ID = /^(.*?)\s+\^(bw-[a-z]?\d{4,})\s*$/;

export function glyphFor(state: string): string | undefined {
  return Object.prototype.hasOwnProperty.call(GLYPHS, state)
    ? GLYPHS[state as QueueState]
    : undefined;
}

export function parseStatus(json: string): StatusMap {
  const raw: unknown = JSON.parse(json);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("status.json is not an object");
  }
  const map: StatusMap = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const entry = toEntry(value);
    if (entry) map[normalizeKey(key)] = entry;
  }
  return map;
}

function normalizeKey(key: string): string {
  return key.replace(/^\^/, "");
}

function toEntry(value: unknown): StatusEntry | undefined {
  if (value === null || typeof value !== "object") return undefined;
  const { issue, state, updated } = value as Record<string, unknown>;
  if (typeof issue !== "number" || !Number.isInteger(issue)) return undefined;
  if (typeof state !== "string" || glyphFor(state) === undefined) return undefined;
  return { issue, state: state as QueueState, updated: typeof updated === "string" ? updated : undefined };
}

export function repaintLine(line: string, status: StatusMap): string {
  const cr = line.endsWith("\r") ? "\r" : "";
  const body = cr ? line.slice(0, -1) : line;
  const match = TRAILING_ID.exec(body);
  if (!match) return line;
  const [, prefix, id] = match;
  const entry = status[id];
  if (!entry) return line;
  const text = prefix.replace(GLYPH_FRAGMENT, "");
  return `${text} ${GLYPHS[entry.state]} #${entry.issue} ^${id}${cr}`;
}

export function repaint(text: string, status: StatusMap): string {
  return text
    .split("\n")
    .map((line) => repaintLine(line, status))
    .join("\n");
}
