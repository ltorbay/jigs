"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => BwQueuePlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian4 = require("obsidian");

// src/editor.ts
var import_state = require("@codemirror/state");
var import_view = require("@codemirror/view");
var import_obsidian = require("obsidian");

// src/hidden-id.ts
var TRAILING_ID = / \^(bw-[a-z]?\d{4,})\s*$/;
function findHiddenId(line) {
  const match = TRAILING_ID.exec(line);
  if (!match) return null;
  return { from: match.index, to: line.length, id: match[1] };
}
function findHiddenIdRange(line) {
  const hidden = findHiddenId(line);
  return hidden ? [hidden.from, hidden.to] : null;
}
function clampCursor(line, oldHead, newHead, hasNextLine) {
  const range = findHiddenIdRange(line);
  if (!range || newHead <= range[0]) return newHead;
  const steppedForward = oldHead === range[0] && newHead === range[1];
  if (steppedForward && hasNextLine) return range[1] + 1;
  return range[0];
}

// src/editor.ts
var bypassClamp = import_state.Annotation.define();
var HiddenIdWidget = class extends import_view.WidgetType {
  constructor(id) {
    super();
    this.id = id;
  }
  eq(other) {
    return other.id === this.id;
  }
  toDOM() {
    const dot = document.createElement("span");
    const label = `${this.id} (pipeline id)`;
    dot.className = "bw-queue-id";
    dot.title = label;
    dot.setAttribute("aria-label", label);
    dot.addEventListener("click", () => new import_obsidian.Notice(label));
    return dot;
  }
};
function buildDecorations(view) {
  const builder = new import_state.RangeSetBuilder();
  const doc = view.state.doc;
  for (const { from, to } of view.visibleRanges) {
    let pos = from;
    while (pos <= to) {
      const line = doc.lineAt(pos);
      const hidden = findHiddenId(line.text);
      if (hidden) {
        builder.add(
          line.from + hidden.from,
          line.from + hidden.to,
          import_view.Decoration.replace({ widget: new HiddenIdWidget(hidden.id) })
        );
      }
      pos = line.to + 1;
    }
  }
  return builder.finish();
}
var hiddenIdPlugin = import_view.ViewPlugin.fromClass(
  class {
    constructor(view) {
      this.decorations = buildDecorations(view);
    }
    update(update) {
      if (update.docChanged || update.viewportChanged) this.decorations = buildDecorations(update.view);
    }
  },
  {
    decorations: (plugin) => plugin.decorations,
    provide: (plugin) => import_view.EditorView.atomicRanges.of((view) => view.plugin(plugin)?.decorations ?? import_view.Decoration.none)
  }
);
function clampSelection(tr) {
  if (!tr.selection || tr.annotation(bypassClamp)) return tr;
  const doc = tr.newDoc;
  const oldRanges = tr.startState.selection.ranges;
  let changed = false;
  const ranges = tr.selection.ranges.map((range, index) => {
    if (!range.empty) return range;
    const line = doc.lineAt(range.head);
    const old = oldRanges[index];
    const oldHead = old && old.empty ? tr.changes.mapPos(old.head) - line.from : null;
    const head = line.from + clampCursor(line.text, oldHead, range.head - line.from, line.number < doc.lines);
    if (head === range.head) return range;
    changed = true;
    return import_state.EditorSelection.cursor(head);
  });
  if (!changed) return tr;
  return [tr, { selection: import_state.EditorSelection.create(ranges, tr.selection.mainIndex), sequential: true }];
}
function enterAfterHiddenId(view) {
  const { state } = view;
  if (state.selection.ranges.length !== 1 || !state.selection.main.empty) return false;
  const line = state.doc.lineAt(state.selection.main.head);
  const hidden = findHiddenId(line.text);
  if (!hidden || state.selection.main.head !== line.from + hidden.from) return false;
  view.dispatch({ selection: import_state.EditorSelection.cursor(line.to), annotations: bypassClamp.of(true) });
  return false;
}
function hiddenIdExtension() {
  return [
    hiddenIdPlugin,
    import_state.EditorState.transactionFilter.of(clampSelection),
    import_state.Prec.highest(import_view.keymap.of([{ key: "Enter", run: enterAfterHiddenId }]))
  ];
}

// src/ids.ts
var OPEN_TASK = /^\s*- \[ \] /;
var TRAILING_ID2 = /\s\^bw-[a-z]?\d{4,}\s*$/;
var DEVICE_ID = /\^bw-([a-z])(\d{4,})/g;
var DEVICE_LETTER = /^[a-z]$/;
function isDeviceLetter(value) {
  return typeof value === "string" && DEVICE_LETTER.test(value);
}
function randomDeviceLetter(random = Math.random) {
  return String.fromCharCode(97 + Math.floor(random() * 26) % 26);
}
function formatId(letter, n) {
  return `bw-${letter}${String(n).padStart(4, "0")}`;
}
function highestId(text, letter) {
  let highest = 0;
  for (const match of text.matchAll(DEVICE_ID)) {
    if (match[1] === letter) highest = Math.max(highest, Number(match[2]));
  }
  return highest;
}
function nextId(text, letter, issuedFloor = 0) {
  return Math.max(highestId(text, letter), issuedFloor) + 1;
}
function needsId(line) {
  return OPEN_TASK.test(line) && !TRAILING_ID2.test(line);
}
function splitCarriageReturn(line) {
  return line.endsWith("\r") ? [line.slice(0, -1), "\r"] : [line, ""];
}
function assignIds(text, letter, issuedFloor = 0) {
  if (!isDeviceLetter(letter)) throw new Error(`device letter "${letter}" is not in [a-z]`);
  let next = nextId(text, letter, issuedFloor);
  return text.split("\n").map((raw) => {
    const [line, cr] = splitCarriageReturn(raw);
    if (!needsId(line)) return raw;
    return `${line.trimEnd()} ^${formatId(letter, next++)}${cr}`;
  }).join("\n");
}

// src/github.ts
var import_obsidian2 = require("obsidian");

// src/encoding.ts
function utf8ToBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  const chunk = 32768;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}
function base64ToUtf8(encoded) {
  const binary = atob(encoded.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

// src/github.ts
var GitHubError = class extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
};
var API = "https://api.github.com";
function contentsUrl(target, path) {
  const [owner, name] = target.repo.split("/").map((part) => encodeURIComponent(part.trim()));
  if (!owner || !name) throw new GitHubError(`repo "${target.repo}" is not owner/name`, 0);
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  return `${API}/repos/${owner}/${name}/contents/${encodedPath}`;
}
function headers(target) {
  return {
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${target.token}`,
    "X-GitHub-Api-Version": "2022-11-28"
  };
}
function describe(response) {
  try {
    const message = response.json?.message;
    if (typeof message === "string") return message;
  } catch {
    return `HTTP ${response.status}`;
  }
  return `HTTP ${response.status}`;
}
async function getFile(target, path) {
  const url = `${contentsUrl(target, path)}?ref=${encodeURIComponent(target.branch)}`;
  const response = await (0, import_obsidian2.requestUrl)({ url, method: "GET", headers: headers(target), throw: false });
  if (response.status === 404) return null;
  if (response.status !== 200) throw new GitHubError(`GET ${path}: ${describe(response)}`, response.status);
  const body = response.json;
  if (typeof body.sha !== "string" || typeof body.content !== "string" || body.encoding !== "base64") {
    throw new GitHubError(`GET ${path}: unexpected response shape (file over 1 MB?)`, response.status);
  }
  return { sha: body.sha, content: base64ToUtf8(body.content) };
}
async function putOnce(target, path, content, sha) {
  const payload = {
    message: `bw-queue: update ${path}`,
    content: utf8ToBase64(content),
    branch: target.branch
  };
  if (sha) payload.sha = sha;
  return (0, import_obsidian2.requestUrl)({
    url: contentsUrl(target, path),
    method: "PUT",
    headers: { ...headers(target), "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    throw: false
  });
}
function isShaConflict(status) {
  return status === 409 || status === 422;
}
async function putFile(target, path, content) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const remote = await getFile(target, path);
    if (remote?.content === content) return;
    const response = await putOnce(target, path, content, remote?.sha);
    if (response.status === 200 || response.status === 201) return;
    if (!isShaConflict(response.status) || attempt === 1) {
      throw new GitHubError(`PUT ${path}: ${describe(response)}`, response.status);
    }
  }
}

// src/settings.ts
var import_obsidian3 = require("obsidian");
var DEFAULT_SETTINGS = {
  token: "",
  repo: "ltorbay/bonewake-queue",
  branch: "main",
  todoPath: "1. Projects/Bonewake/TODO.md",
  debounceSeconds: 20,
  paintOnOpen: true,
  statusPollMinutes: 10
};
var BwQueueSettingTab = class extends import_obsidian3.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    const { containerEl } = this;
    const settings = this.plugin.settings;
    containerEl.empty();
    new import_obsidian3.Setting(containerEl).setName("Device letter").setDesc("Letter in the ids this device issues (^bw-<letter>NNNN). Stored on this device only, never synced.").addText((text) => text.setValue(this.plugin.deviceLetter).setDisabled(true));
    new import_obsidian3.Setting(containerEl).setName("GitHub token").setDesc("Fine-grained PAT with Contents read and write on the queue repo only.").addText((text) => {
      text.inputEl.type = "password";
      text.setValue(settings.token).onChange(async (value) => {
        settings.token = value.trim();
        await this.plugin.saveSettings();
      });
    });
    this.addText("Repository", "owner/name", "repo");
    this.addText("Branch", "Branch the queue files live on.", "branch");
    this.addText("TODO note", "Vault path of the TODO note.", "todoPath");
    new import_obsidian3.Setting(containerEl).setName("Debounce (seconds)").setDesc("Quiet time after the last edit before pushing.").addText(
      (text) => text.setValue(String(settings.debounceSeconds)).onChange(async (value) => {
        const seconds = Number(value);
        if (!Number.isFinite(seconds) || seconds < 1) return;
        settings.debounceSeconds = seconds;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Paint status on open").setDesc("Fetch queue/status.json when the vault opens and paint glyphs onto tasks.").addToggle(
      (toggle) => toggle.setValue(settings.paintOnOpen).onChange(async (value) => {
        settings.paintOnOpen = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian3.Setting(containerEl).setName("Status refresh (minutes)").setDesc("Repaint from queue/status.json on this interval and when the app returns to the foreground. 0 turns both off; a push always repaints.").addText(
      (text) => text.setValue(String(settings.statusPollMinutes)).onChange(async (value) => {
        const minutes = Number(value);
        if (!Number.isFinite(minutes) || minutes < 0) return;
        settings.statusPollMinutes = minutes;
        await this.plugin.saveSettings();
        this.plugin.restartStatusPoll();
      })
    );
  }
  addText(name, desc, key) {
    const settings = this.plugin.settings;
    new import_obsidian3.Setting(this.containerEl).setName(name).setDesc(desc).addText(
      (text) => text.setValue(settings[key]).onChange(async (value) => {
        settings[key] = value.trim() || DEFAULT_SETTINGS[key];
        await this.plugin.saveSettings();
      })
    );
  }
};

// src/status.ts
var GLYPHS = {
  queued: "\u23F3",
  ask: "\u23F3",
  quickfix: "\u{1F50E}",
  shallow: "\u{1F50E}",
  deep: "\u{1F50E}",
  "in-progress": "\u{1F50E}",
  review: "\u{1F50E}",
  balance: "\u2696",
  human: "\u{1F464}",
  done: "\u2705",
  stale: "\u2705"
};
var GLYPH_FRAGMENT = /(?:\s+(?:⏳|🔎|⚖️?|👤|✅)(?:\s+#\d+)?)+$/u;
var TRAILING_ID3 = /^(.*?)\s+\^(bw-[a-z]?\d{4,})\s*$/;
function glyphFor(state) {
  return Object.prototype.hasOwnProperty.call(GLYPHS, state) ? GLYPHS[state] : void 0;
}
function parseStatus(json) {
  const raw = JSON.parse(json);
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("status.json is not an object");
  }
  const map = {};
  for (const [key, value] of Object.entries(raw)) {
    const entry = toEntry(value);
    if (entry) map[normalizeKey(key)] = entry;
  }
  return map;
}
function normalizeKey(key) {
  return key.replace(/^\^/, "");
}
function toEntry(value) {
  if (value === null || typeof value !== "object") return void 0;
  const { issue, state, updated } = value;
  if (typeof issue !== "number" || !Number.isInteger(issue)) return void 0;
  if (typeof state !== "string" || glyphFor(state) === void 0) return void 0;
  return { issue, state, updated: typeof updated === "string" ? updated : void 0 };
}
function repaintLine(line, status) {
  const cr = line.endsWith("\r") ? "\r" : "";
  const body = cr ? line.slice(0, -1) : line;
  const match = TRAILING_ID3.exec(body);
  if (!match) return line;
  const [, prefix, id] = match;
  const entry = status[id];
  if (!entry) return line;
  const stripped = prefix.replace(GLYPH_FRAGMENT, "");
  const text = entry.state === "done" ? stripped.replace(/^(\s*- )\[ \]/, "$1[x]") : stripped;
  const ref = entry.issue > 0 ? ` #${entry.issue}` : "";
  return `${text} ${GLYPHS[entry.state]}${ref} ^${id}${cr}`;
}
function repaint(text, status) {
  return text.split("\n").map((line) => repaintLine(line, status)).join("\n");
}

// src/main.ts
var REMOTE_TODO = "queue/TODO.md";
var REMOTE_STATUS = "queue/status.json";
var DEVICE_KEY = "bw-queue-device";
var BwQueuePlugin = class extends import_obsidian4.Plugin {
  constructor() {
    super(...arguments);
    this.settings = { ...DEFAULT_SETTINGS };
    this.lastPushedContent = null;
    this.deviceLetter = "";
    this.debounceHandle = null;
    this.pollHandle = null;
    this.selfWrites = 0;
    this.missingTokenNoticed = false;
    this.queue = Promise.resolve();
    this.statusEl = null;
  }
  async onload() {
    await this.loadPluginData();
    this.deviceLetter = this.loadDeviceLetter();
    this.addSettingTab(new BwQueueSettingTab(this.app, this));
    this.statusEl = this.addStatusBarItem();
    this.injectIdStyle();
    this.registerEditorExtension(hiddenIdExtension());
    this.setStatus("bw-queue: idle");
    this.addCommand({ id: "push-now", name: "push now", callback: () => this.enqueue(() => this.sync()) });
    this.addCommand({ id: "refresh-status", name: "refresh status", callback: () => this.enqueue(() => this.refreshStatus()) });
    this.registerEvent(this.app.vault.on("modify", (file) => this.onModify(file)));
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.paintOnOpen) this.enqueue(() => this.refreshStatus());
    });
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState === "visible" && this.settings.statusPollMinutes > 0) this.backgroundRefresh();
    });
    this.restartStatusPoll();
  }
  restartStatusPoll() {
    if (this.pollHandle !== null) window.clearInterval(this.pollHandle);
    this.pollHandle = null;
    const minutes = this.settings.statusPollMinutes;
    if (minutes > 0) this.pollHandle = window.setInterval(() => this.backgroundRefresh(), minutes * 6e4);
  }
  backgroundRefresh() {
    if (this.debounceHandle !== null || !this.settings.token) return;
    this.enqueue(() => this.refreshStatus());
  }
  injectIdStyle() {
    const style = document.createElement("style");
    style.textContent = ".bw-queue-id { display: inline-block; width: 6px; height: 6px; margin-left: 4px; border-radius: 50%; background: var(--text-faint); vertical-align: middle; cursor: help; }";
    document.head.appendChild(style);
    this.register(() => style.remove());
  }
  onunload() {
    this.clearDebounce();
    if (this.pollHandle !== null) window.clearInterval(this.pollHandle);
  }
  async saveSettings() {
    await this.savePluginData();
  }
  async loadPluginData() {
    const data = await this.loadData() ?? {};
    this.settings = { ...DEFAULT_SETTINGS, ...data.settings ?? {} };
    this.lastPushedContent = typeof data.lastPushedContent === "string" ? data.lastPushedContent : null;
  }
  async savePluginData() {
    const data = { settings: this.settings, lastPushedContent: this.lastPushedContent };
    await this.saveData(data);
  }
  loadDeviceLetter() {
    const stored = this.app.loadLocalStorage(DEVICE_KEY);
    if (isDeviceLetter(stored)) return stored;
    const letter = randomDeviceLetter();
    this.app.saveLocalStorage(DEVICE_KEY, letter);
    return letter;
  }
  floorKey() {
    return `${DEVICE_KEY}-floor-${this.deviceLetter}`;
  }
  issuedFloor() {
    const stored = this.app.loadLocalStorage(this.floorKey());
    return typeof stored === "number" && Number.isInteger(stored) && stored > 0 ? stored : 0;
  }
  recordIssued(content) {
    const highest = highestId(content, this.deviceLetter);
    if (highest > this.issuedFloor()) this.app.saveLocalStorage(this.floorKey(), highest);
  }
  onModify(file) {
    if (this.selfWrites > 0 || !this.isTodo(file)) return;
    this.clearDebounce();
    this.debounceHandle = window.setTimeout(() => {
      this.debounceHandle = null;
      this.enqueue(() => this.sync());
    }, this.settings.debounceSeconds * 1e3);
  }
  clearDebounce() {
    if (this.debounceHandle === null) return;
    window.clearTimeout(this.debounceHandle);
    this.debounceHandle = null;
  }
  isTodo(file) {
    return file instanceof import_obsidian4.TFile && file.path === (0, import_obsidian4.normalizePath)(this.settings.todoPath);
  }
  todoFile() {
    const file = this.app.vault.getAbstractFileByPath((0, import_obsidian4.normalizePath)(this.settings.todoPath));
    return file instanceof import_obsidian4.TFile ? file : null;
  }
  enqueue(task) {
    this.queue = this.queue.then(task).catch((error) => this.report(error));
  }
  async writeOwn(file, content) {
    this.selfWrites++;
    try {
      await this.app.vault.modify(file, content);
    } finally {
      window.setTimeout(() => this.selfWrites--, 0);
    }
  }
  target() {
    if (!this.settings.token) {
      if (!this.missingTokenNoticed) {
        this.missingTokenNoticed = true;
        new import_obsidian4.Notice("bw-queue: no GitHub token set, network actions disabled.");
        console.warn("bw-queue: no GitHub token set");
      }
      this.setStatus("bw-queue: no token");
      return null;
    }
    return { token: this.settings.token, repo: this.settings.repo, branch: this.settings.branch };
  }
  requireTodo() {
    const file = this.todoFile();
    if (!file) {
      new import_obsidian4.Notice(`bw-queue: ${this.settings.todoPath} not found.`);
      this.setStatus("bw-queue: TODO note missing");
    }
    return file;
  }
  async sync() {
    const file = this.requireTodo();
    if (!file) return;
    const original = await this.app.vault.read(file);
    const content = assignIds(original, this.deviceLetter, this.issuedFloor());
    if (content !== original) await this.writeOwn(file, content);
    this.recordIssued(content);
    if (await this.push(content)) await this.refreshStatus();
  }
  async push(content) {
    const target = this.target();
    if (!target) return false;
    await putFile(target, REMOTE_TODO, content);
    this.lastPushedContent = content;
    await this.savePluginData();
    this.setStatus(`bw-queue: pushed ${clock()}`);
    return true;
  }
  async refreshStatus() {
    const target = this.target();
    if (!target) return;
    const file = this.requireTodo();
    if (!file) return;
    const remote = await getFile(target, REMOTE_STATUS);
    if (!remote) {
      this.setStatus(`bw-queue: no status.json (${clock()})`);
      return;
    }
    const status = parseStatus(remote.content);
    const original = await this.app.vault.read(file);
    const painted = repaint(original, status);
    if (painted !== original) await this.writeOwn(file, painted);
    this.setStatus(`bw-queue: status ${clock()}`);
  }
  report(error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("bw-queue:", error);
    new import_obsidian4.Notice(`bw-queue: ${message}`);
    this.setStatus(`bw-queue: error ${clock()}: ${message.slice(0, 60)}`);
  }
  setStatus(text) {
    this.statusEl?.setText(text);
  }
};
function clock() {
  return (/* @__PURE__ */ new Date()).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
