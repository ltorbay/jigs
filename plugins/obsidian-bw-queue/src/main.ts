import { Notice, Plugin, TAbstractFile, TFile, normalizePath } from "obsidian";
import { hiddenIdExtension } from "./editor";
import { assignIds, highestId, isDeviceLetter, randomDeviceLetter } from "./ids";
import { getFile, putFile, RepoTarget } from "./github";
import { BwQueueSettings, BwQueueSettingTab, DEFAULT_SETTINGS } from "./settings";
import { parseStatus, repaint } from "./status";

const REMOTE_TODO = "queue/TODO.md";
const REMOTE_STATUS = "queue/status.json";
const DEVICE_KEY = "bw-queue-device";

interface PluginData {
  settings: BwQueueSettings;
  lastPushedContent: string | null;
}

export default class BwQueuePlugin extends Plugin {
  settings: BwQueueSettings = { ...DEFAULT_SETTINGS };
  private lastPushedContent: string | null = null;
  deviceLetter = "";
  private debounceHandle: number | null = null;
  private selfWrites = 0;
  private missingTokenNoticed = false;
  private queue: Promise<void> = Promise.resolve();
  private statusEl: HTMLElement | null = null;

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
    this.app.workspace.onLayoutReady(() => {
      if (this.settings.paintOnOpen) this.enqueue(() => this.refreshStatus());
    });
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

  private onModify(file: TAbstractFile): void {
    if (this.selfWrites > 0 || !this.isTodo(file)) return;
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

  private async writeOwn(file: TFile, content: string): Promise<void> {
    this.selfWrites++;
    try {
      await this.app.vault.modify(file, content);
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
    const original = await this.app.vault.read(file);
    const content = assignIds(original, this.deviceLetter, this.issuedFloor());
    if (content !== original) await this.writeOwn(file, content);
    this.recordIssued(content);
    await this.push(content);
  }

  private async push(content: string): Promise<void> {
    const target = this.target();
    if (!target) return;
    await putFile(target, REMOTE_TODO, content);
    this.lastPushedContent = content;
    await this.savePluginData();
    this.setStatus(`bw-queue: pushed ${clock()}`);
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
    const original = await this.app.vault.read(file);
    const painted = repaint(original, status);
    if (painted !== original) await this.writeOwn(file, painted);
    this.setStatus(`bw-queue: status ${clock()}`);
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
