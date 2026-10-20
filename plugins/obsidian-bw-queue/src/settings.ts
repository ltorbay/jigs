import { App, PluginSettingTab, Setting } from "obsidian";
import type BwQueuePlugin from "./main";

export interface BwQueueSettings {
  token: string;
  repo: string;
  branch: string;
  todoPath: string;
  verifyPath: string;
  debounceSeconds: number;
  paintOnOpen: boolean;
  statusPollMinutes: number;
}

export const DEFAULT_SETTINGS: BwQueueSettings = {
  token: "",
  repo: "ltorbay/bonewake-queue",
  branch: "main",
  todoPath: "1. Projects/Bonewake/TODO.md",
  verifyPath: "1. Projects/Bonewake/Verify.md",
  debounceSeconds: 20,
  paintOnOpen: true,
  statusPollMinutes: 10,
};

export class BwQueueSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: BwQueuePlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    const settings = this.plugin.settings;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Device letter")
      .setDesc("Letter in the ids this device issues (^bw-<letter>NNNN). Stored on this device only, never synced.")
      .addText((text) => text.setValue(this.plugin.deviceLetter).setDisabled(true));

    new Setting(containerEl)
      .setName("GitHub token")
      .setDesc("Fine-grained PAT with Contents read and write on the queue repo only.")
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(settings.token).onChange(async (value) => {
          settings.token = value.trim();
          await this.plugin.saveSettings();
        });
      });

    this.addText("Repository", "owner/name", "repo");
    this.addText("Branch", "Branch the queue files live on.", "branch");
    this.addText("TODO note", "Vault path of the TODO note.", "todoPath");
    this.addText("Checks note", "Vault path of the in-game checks note filled from queue/verify.json.", "verifyPath");

    new Setting(containerEl)
      .setName("Debounce (seconds)")
      .setDesc("Quiet time after the last edit before pushing.")
      .addText((text) =>
        text.setValue(String(settings.debounceSeconds)).onChange(async (value) => {
          const seconds = Number(value);
          if (!Number.isFinite(seconds) || seconds < 1) return;
          settings.debounceSeconds = seconds;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Paint status on open")
      .setDesc("Fetch queue/status.json when the vault opens and paint glyphs onto tasks.")
      .addToggle((toggle) =>
        toggle.setValue(settings.paintOnOpen).onChange(async (value) => {
          settings.paintOnOpen = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Status refresh (minutes)")
      .setDesc("Repaint from queue/status.json on this interval and when the app returns to the foreground. 0 turns both off; a push always repaints.")
      .addText((text) =>
        text.setValue(String(settings.statusPollMinutes)).onChange(async (value) => {
          const minutes = Number(value);
          if (!Number.isFinite(minutes) || minutes < 0) return;
          settings.statusPollMinutes = minutes;
          await this.plugin.saveSettings();
          this.plugin.restartStatusPoll();
        }),
      );
  }

  private addText(name: string, desc: string, key: "repo" | "branch" | "todoPath" | "verifyPath"): void {
    const settings = this.plugin.settings;
    new Setting(this.containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) =>
        text.setValue(settings[key]).onChange(async (value) => {
          settings[key] = value.trim() || DEFAULT_SETTINGS[key];
          await this.plugin.saveSettings();
        }),
      );
  }
}
