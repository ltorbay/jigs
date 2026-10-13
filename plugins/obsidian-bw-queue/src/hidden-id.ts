const TRAILING_ID = / \^(bw-[a-z]?\d{4,})\s*$/;

export interface HiddenId {
  from: number;
  to: number;
  id: string;
}

export function findHiddenId(line: string): HiddenId | null {
  const match = TRAILING_ID.exec(line);
  if (!match) return null;
  return { from: match.index, to: line.length, id: match[1] };
}

export function findHiddenIdRange(line: string): [number, number] | null {
  const hidden = findHiddenId(line);
  return hidden ? [hidden.from, hidden.to] : null;
}

export function clampCursor(line: string, oldHead: number | null, newHead: number, hasNextLine: boolean): number {
  const range = findHiddenIdRange(line);
  if (!range || newHead <= range[0]) return newHead;
  const steppedForward = oldHead === range[0] && newHead === range[1];
  if (steppedForward && hasNextLine) return range[1] + 1;
  return range[0];
}
