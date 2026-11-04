import { MarkdownFileInfo, MarkdownView, Notice, Plugin, TAbstractFile, TFile, normalizePath } from "obsidian";
import { hiddenIdExtension } from "./editor";
import { assignIds, highestId, isDeviceLetter, randomDeviceLetter } from "./ids";
import { getFile, putFile, RepoTarget } from "./github";
import { BwQueueSettings, BwQueueSettingTab, DEFAULT_SETTINGS } from "./settings";
import { parseStatus, repaint } from "./status";
import { EMPTY_NOTE, mergeVerify, parseVerify } from "./verify";

const REMOTE_TODO = "queue/TODO.md";
const REMOTE_STATUS = "queue/status.json";
const REMOTE_VERIFY = "queue/verify.json";
const DEVICE_KEY = "bw-queue-device";
/** Quiet time after any change this device did not type before it may rewrite the TODO note. */
const SETTLE_MS = 30_000;
/** A vault modify this soon after a focused editor change counts as a local edit. */
const LOCAL_EDIT_WINDOW_MS = 10_000;

interface PluginData {
  settings: BwQueueSettings;
  lastPushedContent: string | null;
}

export default class BwQueuePlugin extends Plugin {
  settings: BwQueueSettings = { ...DEFAULT_SETTINGS };
  private lastPushedContent: string | null = null;
  deviceLetter = "";
  private debounceHandle: number | null = null;
  private pollHandle: number | null = null;
  private selfWrites = 0;
  private missingTokenNoticed = false;
  private queue: Promise<void> = Promise.resolve();
  private statusEl: HTMLElement | null = null;
  private lastLocalEdit = 0;
  private lastExternalChange = Date.now();
  private settleHandle: number | null = null;

  async onload(): Promise<void> {
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
    this.registerEvent(this.app.workspace.on("editor-change", (_editor, info) => this.onEditorChange(info)));
    this.app.workspace.onLayoutReady(() => {
      this.lastExternalChange = Date.now();
      if (this.settings.paintOnOpen) this.scheduleSettled(() => this.refreshStatus());
    });
    this.registerDomEvent(document, "visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      this.lastExternalChange = Date.now();
      if (this.settings.statusPollMinutes > 0) this.scheduleSettled(() => this.refreshStatus());
    });
    this.restartStatusPoll();
  }

  restartStatusPoll(): void {
    if (this.pollHandle !== null) window.clearInterval(this.pollHandle);
    this.pollHandle = null;
    const minutes = this.settings.statusPollMinutes;
    if (minutes > 0) this.pollHandle = window.setInterval(() => this.backgroundRefresh(), minutes * 60_000);
  }

  private backgroundRefresh(): void {
    if (this.debounceHandle !== null || !this.settings.token) return;
    if (!this.isForeground()) return;
    this.enqueue(() => this.refreshStatus());
  }

  private isForeground(): boolean {
    return document.visibilityState === "visible" && document.hasFocus();
  }

  /**
   * Time left before this device may write the TODO note. Obsidian Sync merges concurrent
   * edits textually; a device rewriting a stale copy (on open, on foreground, on a poll)
   * produces duplicated blocks and garbled lines. Wait until incoming changes have settled.
   */
  private settleRemaining(): number {
    return Math.max(0, this.lastExternalChange + SETTLE_MS - Date.now());
  }

  private scheduleSettled(task: () => Promise<void>): void {
    if (this.settleHandle !== null) window.clearTimeout(this.settleHandle);
    this.settleHandle = window.setTimeout(() => {
      this.settleHandle = null;
      if (this.settleRemaining() > 0) return this.scheduleSettled(task);
      this.enqueue(task);
    }, this.settleRemaining() + 50);
  }

  private deferIfUnsettled(task: () => Promise<void>): boolean {
    if (this.settleRemaining() === 0) return false;
    this.setStatus("bw-queue: waiting for sync to settle");
    this.scheduleSettled(task);
    return true;
  }

  private injectIdStyle(): void {
    const style = document.createElement("style");
    style.textContent =
      ".bw-queue-id { display: inline-block; width: 6px; height: 6px; margin-left: 4px; border-radius: 50%; background: var(--text-faint); vertical-align: middle; cursor: help; }";
    document.head.appendChild(style);
    this.register(() => style.remove());
  }

  onunload(): void {
    this.clearDebounce();
    if (this.pollHandle !== null) window.clearInterval(this.pollHandle);
    if (this.settleHandle !== null) window.clearTimeout(this.settleHandle);
  }

  async saveSettings(): Promise<void> {
    await this.savePluginData();
  }

  private async loadPluginData(): Promise<void> {
    const data = ((await this.loadData()) ?? {}) as Partial<PluginData>;
    this.settings = { ...DEFAULT_SETTINGS, ...(data.settings ?? {}) };
    this.lastPushedContent = typeof data.lastPushedContent === "string" ? data.lastPushedContent : null;
  }

  private async savePluginData(): Promise<void> {
    const data: PluginData = { settings: this.settings, lastPushedContent: this.lastPushedContent };
    await this.saveData(data);
  }

  private loadDeviceLetter(): string {
    const stored: unknown = this.app.loadLocalStorage(DEVICE_KEY);
    if (isDeviceLetter(stored)) return stored;
    const letter = randomDeviceLetter();
    this.app.saveLocalStorage(DEVICE_KEY, letter);
    return letter;
  }

  private floorKey(): string {
    return `${DEVICE_KEY}-floor-${this.deviceLetter}`;
  }

  private issuedFloor(): number {
    const stored: unknown = this.app.loadLocalStorage(this.floorKey());
    return typeof stored === "number" && Number.isInteger(stored) && stored > 0 ? stored : 0;
  }

  private recordIssued(content: string): void {
    const highest = highestId(content, this.deviceLetter);
    if (highest > this.issuedFloor()) this.app.saveLocalStorage(this.floorKey(), highest);
  }

  private onEditorChange(info: MarkdownView | MarkdownFileInfo): void {
    if (!info.file || !this.isTodo(info.file) || !document.hasFocus()) return;
    this.lastLocalEdit = Date.now();
  }

  private onModify(file: TAbstractFile): void {
    if (this.selfWrites > 0 || !this.isTodo(file)) return;
    if (Date.now() - this.lastLocalEdit > LOCAL_EDIT_WINDOW_MS) {
      // Not typed here: Sync (or another app) changed the file. The device that made the
      // edit assigns ids and pushes; this one only waits for the changes to settle.
      this.lastExternalChange = Date.now();
      return;
    }
    this.clearDebounce();
    this.debounceHandle = window.setTimeout(() => {
      this.debounceHandle = null;
      this.enqueue(() => this.sync());
    }, this.settings.debounceSeconds * 1000);
  }

  private clearDebounce(): void {
    if (this.debounceHandle === null) return;
    window.clearTimeout(this.debounceHandle);
    this.debounceHandle = null;
  }

  private isTodo(file: TAbstractFile): file is TFile {
    return file instanceof TFile && file.path === normalizePath(this.settings.todoPath);
  }

  private todoFile(): TFile | null {
    const file = this.app.vault.getAbstractFileByPath(normalizePath(this.settings.todoPath));
    return file instanceof TFile ? file : null;
  }

  private enqueue(task: () => Promise<void>): void {
    this.queue = this.queue.then(task).catch((error: unknown) => this.report(error));
  }

  /** Atomic read-transform-write of a note; skips the write when nothing changes. */
  private async processOwn(file: TFile, transform: (text: string) => string): Promise<string> {
    const current = await this.app.vault.read(file);
    if (transform(current) === current) return current;
    this.selfWrites++;
    try {
      return await this.app.vault.process(file, transform);
    } finally {
      window.setTimeout(() => this.selfWrites--, 0);
    }
  }

  private target(): RepoTarget | null {
    if (!this.settings.token) {
      if (!this.missingTokenNoticed) {
        this.missingTokenNoticed = true;
        new Notice("bw-queue: no GitHub token set, network actions disabled.");
        console.warn("bw-queue: no GitHub token set");
      }
      this.setStatus("bw-queue: no token");
      return null;
    }
    return { token: this.settings.token, repo: this.settings.repo, branch: this.settings.branch };
  }

  private requireTodo(): TFile | null {
    const file = this.todoFile();
    if (!file) {
      new Notice(`bw-queue: ${this.settings.todoPath} not found.`);
      this.setStatus("bw-queue: TODO note missing");
    }
    return file;
  }

  private async sync(): Promise<void> {
    const file = this.requireTodo();
    if (!file) return;
    if (this.deferIfUnsettled(() => this.sync())) return;
    const content = await this.processOwn(file, (text) => assignIds(text, this.deviceLetter, this.issuedFloor()));
    this.recordIssued(content);
    if (await this.push(content)) await this.refreshStatus();
  }

  private async push(content: string): Promise<boolean> {
    const target = this.target();
    if (!target) return false;
    await putFile(target, REMOTE_TODO, content);
    this.lastPushedContent = content;
    await this.savePluginData();
    this.setStatus(`bw-queue: pushed ${clock()}`);
    return true;
  }

  private async refreshStatus(): Promise<void> {
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
    if (this.deferIfUnsettled(() => this.refreshStatus())) return;
    await this.processOwn(file, (text) => repaint(text, status));
    await this.pullChecks(target);
    this.setStatus(`bw-queue: status ${clock()}`);
  }

  private async pullChecks(target: RepoTarget): Promise<void> {
    const remote = await getFile(target, REMOTE_VERIFY);
    if (!remote) return;
    const items = parseVerify(remote.content);
    const path = normalizePath(this.settings.verifyPath);
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing !== null && !(existing instanceof TFile)) throw new Error(`${path} is not a file`);
    const original = existing ? await this.app.vault.read(existing) : EMPTY_NOTE;
    const merged = mergeVerify(original, items);
    if (existing) {
      if (merged !== original) await this.app.vault.modify(existing, merged);
      return;
    }
    const folder = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    if (folder && !this.app.vault.getAbstractFileByPath(folder)) await this.app.vault.createFolder(folder);
    await this.app.vault.create(path, merged);
  }

  private report(error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    console.warn("bw-queue:", error);
    new Notice(`bw-queue: ${message}`);
    this.setStatus(`bw-queue: error ${clock()}: ${message.slice(0, 60)}`);
  }

  private setStatus(text: string): void {
    this.statusEl?.setText(text);
  }
}

function clock(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
