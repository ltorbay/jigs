export interface VerifyItem {
  seq: number;
  pr: number;
  group: string;
  text: string;
}

const PR_URL = "https://github.com/ltorbay/bonewake/pull/";
const CURSOR_LINE = /^verify_cursor:[ \t]*(\d+)[ \t]*$/m;
export const EMPTY_NOTE = "---\nverify_cursor: 0\n---\n";

export function parseVerify(json: string): VerifyItem[] {
  const raw: unknown = JSON.parse(json);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("verify.json is not an object");
  }
  const items = (raw as { items?: unknown }).items;
  if (!Array.isArray(items)) throw new Error("verify.json has no items array");
  return items.filter(isItem).sort((a, b) => a.seq - b.seq);
}

function isItem(value: unknown): value is VerifyItem {
  if (value === null || typeof value !== "object") return false;
  const { seq, pr, group, text } = value as Record<string, unknown>;
  return (
    Number.isInteger(seq) && (seq as number) > 0 &&
    Number.isInteger(pr) &&
    typeof group === "string" && group.trim() !== "" && !/[\r\n]/.test(group) &&
    typeof text === "string" && text.trim() !== "" && !/[\r\n]/.test(text)
  );
}

export function checkId(seq: number): string {
  return `vf-${String(seq).padStart(4, "0")}`;
}

export function readCursor(note: string): number {
  const front = frontmatter(note.replace(/\r\n/g, "\n"));
  const match = front === null ? null : CURSOR_LINE.exec(front.body);
  return match ? Number(match[1]) : 0;
}

export function mergeVerify(note: string, items: VerifyItem[]): string {
  const crlf = note.includes("\r\n");
  let text = note.replace(/\r\n/g, "\n");
  const cursor = readCursor(text);
  const fresh = items.filter((item) => item.seq > cursor).sort((a, b) => a.seq - b.seq);
  if (fresh.length === 0) return note;
  for (const item of fresh) {
    const id = checkId(item.seq);
    if (new RegExp(`\\^${id}\\s*$`, "m").test(text)) continue;
    text = appendToGroup(text, item.group.trim(), `- [ ] ${item.text.trim()} [#${item.pr}](${PR_URL}${item.pr}) ^${id}`);
  }
  text = writeCursor(text, Math.max(cursor, ...fresh.map((item) => item.seq)));
  return crlf ? text.replace(/\n/g, "\r\n") : text;
}

function frontmatter(text: string): { body: string; end: number } | null {
  if (!text.startsWith("---\n")) return null;
  const close = text.indexOf("\n---", 3);
  if (close === -1) return null;
  const after = close + 4;
  if (after < text.length && text[after] !== "\n") return null;
  return { body: text.slice(4, close + 1), end: after };
}

function writeCursor(text: string, cursor: number): string {
  const front = frontmatter(text);
  if (front === null) return `---\nverify_cursor: ${cursor}\n---\n${text}`;
  const body = CURSOR_LINE.test(front.body)
    ? front.body.replace(CURSOR_LINE, `verify_cursor: ${cursor}`)
    : `${front.body}verify_cursor: ${cursor}\n`;
  return `---\n${body}---${text.slice(front.end)}`;
}

function appendToGroup(text: string, group: string, line: string): string {
  const lines = text.split("\n");
  const heading = lines.findIndex((l) => l.trimEnd() === `## ${group}`);
  if (heading === -1) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === "") lines.pop();
    return `${lines.join("\n")}\n\n## ${group}\n\n${line}\n`;
  }
  let next = lines.findIndex((l, i) => i > heading && /^#{1,2} /.test(l));
  if (next === -1) next = lines.length;
  let last = next - 1;
  while (last > heading && lines[last].trim() === "") last--;
  const insertAt = last === heading ? heading + 1 : last + 1;
  const insert = last === heading ? ["", line] : [line];
  lines.splice(insertAt, 0, ...insert);
  if (insertAt + insert.length < lines.length && lines[insertAt + insert.length].trim() !== "") {
    lines.splice(insertAt + insert.length, 0, "");
  }
  const joined = lines.join("\n");
  return joined.endsWith("\n") ? joined : `${joined}\n`;
}
