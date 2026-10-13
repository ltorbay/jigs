const OPEN_TASK = /^\s*- \[ \] /;
const TRAILING_ID = /\s\^bw-[a-z]?\d{4,}\s*$/;
const DEVICE_ID = /\^bw-([a-z])(\d{4,})/g;
const DEVICE_LETTER = /^[a-z]$/;

export function isDeviceLetter(value: unknown): value is string {
  return typeof value === "string" && DEVICE_LETTER.test(value);
}

export function randomDeviceLetter(random: () => number = Math.random): string {
  return String.fromCharCode(97 + Math.floor(random() * 26) % 26);
}

export function formatId(letter: string, n: number): string {
  return `bw-${letter}${String(n).padStart(4, "0")}`;
}

export function highestId(text: string, letter: string): number {
  let highest = 0;
  for (const match of text.matchAll(DEVICE_ID)) {
    if (match[1] === letter) highest = Math.max(highest, Number(match[2]));
  }
  return highest;
}

export function nextId(text: string, letter: string, issuedFloor = 0): number {
  return Math.max(highestId(text, letter), issuedFloor) + 1;
}

export function needsId(line: string): boolean {
  return OPEN_TASK.test(line) && !TRAILING_ID.test(line);
}

function splitCarriageReturn(line: string): [string, string] {
  return line.endsWith("\r") ? [line.slice(0, -1), "\r"] : [line, ""];
}

export function assignIds(text: string, letter: string, issuedFloor = 0): string {
  if (!isDeviceLetter(letter)) throw new Error(`device letter "${letter}" is not in [a-z]`);
  let next = nextId(text, letter, issuedFloor);
  return text
    .split("\n")
    .map((raw) => {
      const [line, cr] = splitCarriageReturn(raw);
      if (!needsId(line)) return raw;
      return `${line.trimEnd()} ^${formatId(letter, next++)}${cr}`;
    })
    .join("\n");
}
