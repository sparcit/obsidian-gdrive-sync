import {
  type EventRef,
  Notice,
  Plugin,
  setIcon,
  type TAbstractFile,
} from "obsidian";
import { GoogleDriveApi } from "./googleDriveApi";
import { FsLocal } from "./localFs";
import { LocalDb } from "./localDb";
import { SyncEngine } from "./syncEngine";
import { GDriveSyncSettingTab } from "./settingsTab";
import {
  DEFAULT_SETTINGS,
  type PluginSettings,
  type SyncDirection,
  type SyncTrigger,
} from "./types";

export class GDriveSyncPlugin extends Plugin {
  public settings: PluginSettings = DEFAULT_SETTINGS;
  public localFs!: FsLocal;
  public driveApi!: GoogleDriveApi;
  public db!: LocalDb;
  public syncEngine!: SyncEngine;

  public isSyncing = false;
  private syncRibbonEl: HTMLElement | null = null;
  private statusBarEl: HTMLElement | null = null;
  private periodicTimer: number | null = null;
  private saveDebounceTimer: number | null = null;
  private eventRefs: EventRef[] = [];

  async onload() {
    console.log("Loading Obsidian Google Drive Sync Plugin");

    await this.loadSettings();

    // Initialize core components
    this.db = new LocalDb(this);
    await this.db.load();

    this.localFs = new FsLocal(
      this.app.vault,
      this.settings.syncConfigDir,
      this.settings.ignoredPatterns
    );

    this.driveApi = new GoogleDriveApi(
      this.settings.googleDrive,
      this.app.vault.getName(),
      this.settings.remoteVaultDir,
      async (updated) => {
        this.settings.googleDrive = updated;
        await this.saveSettings();
      }
    );

    this.syncEngine = new SyncEngine(
      this.localFs,
      this.driveApi,
      this.db,
      this.settings
    );

    // Settings Tab
    this.addSettingTab(new GDriveSyncSettingTab(this.app, this));

    // Ribbon Icon
    this.syncRibbonEl = this.addRibbonIcon(
      "refresh-cw",
      "Sync with Google Drive",
      () => {
        this.triggerSync("ribbon");
      }
    );
    this.syncRibbonEl.addClass("gdrive-sync-ribbon");

    // Status Bar Item
    this.statusBarEl = this.addStatusBarItem();
    this.statusBarEl.addClass("gdrive-sync-status-bar");
    this.updateStatusBar("Idle");
    this.statusBarEl.onclick = () => {
      this.triggerSync("manual");
    };

    // Register Commands
    this.addCommand({
      id: "gdrive-sync-now",
      name: "Sync now with Google Drive",
      callback: () => this.triggerSync("manual"),
    });

    this.addCommand({
      id: "gdrive-push-all",
      name: "Force Push to Google Drive (Upload all)",
      callback: () => this.triggerSync("manual", "push_only"),
    });

    this.addCommand({
      id: "gdrive-pull-all",
      name: "Force Pull from Google Drive (Download all)",
      callback: () => this.triggerSync("manual", "pull_only"),
    });

    this.addCommand({
      id: "gdrive-check-connection",
      name: "Check Google Drive Connection",
      callback: async () => {
        try {
          const user = await this.driveApi.getUserInfo();
          new Notice(`Google Drive is connected: ${user.email}`);
        } catch (err: any) {
          new Notice(`Google Drive connection error: ${err.message}`);
        }
      },
    });

    // File change listeners for auto-sync on save
    this.registerFileWatchers();

    // Periodic timer
    this.setupPeriodicTimer();

    // Auto-sync on startup
    if (this.settings.syncOnStartup) {
      this.app.workspace.onLayoutReady(() => {
        // Give vault 3 seconds to settle
        window.setTimeout(() => {
          this.triggerSync("startup");
        }, 3000);
      });
    }
  }

  onunload() {
    console.log("Unloading Obsidian Google Drive Sync Plugin");
    if (this.periodicTimer !== null) {
      window.clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }
    if (this.saveDebounceTimer !== null) {
      window.clearTimeout(this.saveDebounceTimer);
      this.saveDebounceTimer = null;
    }
    for (const ref of this.eventRefs) {
      this.app.vault.offref(ref);
    }
    this.eventRefs = [];
  }

  public setupPeriodicTimer() {
    if (this.periodicTimer !== null) {
      window.clearInterval(this.periodicTimer);
      this.periodicTimer = null;
    }

    const minutes = this.settings.periodicSyncIntervalMinutes;
    if (minutes > 0) {
      this.periodicTimer = window.setInterval(() => {
        this.triggerSync("timer");
      }, minutes * 60 * 1000);
    }
  }

  private registerFileWatchers() {
    const onFileChange = (file: TAbstractFile) => {
      if (!this.settings.syncOnSave || this.isSyncing) {
        return;
      }
      if (this.localFs.isIgnored(file.path)) {
        return;
      }

      if (this.saveDebounceTimer !== null) {
        window.clearTimeout(this.saveDebounceTimer);
      }

      const delay = Math.max(this.settings.syncOnSaveDelaySeconds, 2) * 1000;
      this.saveDebounceTimer = window.setTimeout(() => {
        this.triggerSync("save");
      }, delay);
    };

    this.eventRefs.push(this.app.vault.on("modify", onFileChange));
    this.eventRefs.push(this.app.vault.on("create", onFileChange));
    this.eventRefs.push(this.app.vault.on("delete", onFileChange));
    this.eventRefs.push(this.app.vault.on("rename", onFileChange));
  }

  public async triggerSync(
    trigger: SyncTrigger,
    forcedDirection?: SyncDirection
  ): Promise<void> {
    if (this.isSyncing) {
      new Notice("Google Drive sync is already in progress.");
      return;
    }

    if (!this.settings.googleDrive.refreshToken) {
      if (trigger === "manual" || trigger === "ribbon") {
        new Notice(
          "Google Drive is not connected. Please connect your account in Settings."
        );
      }
      return;
    }

    this.isSyncing = true;
    this.updateRibbonState("syncing");
    this.updateStatusBar("Syncing...");

    const effectiveSettings = { ...this.settings };
    if (forcedDirection) {
      effectiveSettings.syncDirection = forcedDirection;
    }

    const engine = new SyncEngine(
      this.localFs,
      this.driveApi,
      this.db,
      effectiveSettings
    );

    try {
      this.driveApi.clearCache();
      this.updateStatusBar("Scanning local...");
      const localEntities = await this.localFs.walk();

      this.updateStatusBar("Scanning Google Drive...");
      const remoteEntities = await this.driveApi.walk();

      this.updateStatusBar("Planning sync...");
      const decisions = await engine.planSync(localEntities, remoteEntities);

      const changeCount = decisions.filter((d) => d.isChange).length;
      if (changeCount === 0) {
        this.settings.lastSyncTime = Date.now();
        this.settings.lastSyncStatus = "success";
        this.settings.lastSyncError = "";
        await this.saveSettings();

        this.updateRibbonState("success");
        this.updateStatusBar("Up to date");
        if (trigger === "manual" || trigger === "ribbon") {
          new Notice("Google Drive: Vault is already up to date.");
        }
        return;
      }

      this.updateStatusBar(`Syncing (0/${changeCount})...`);

      const result = await engine.executePlan(
        decisions,
        (curr, total, msg) => {
          this.updateStatusBar(`Syncing (${curr}/${total})...`);
        }
      );

      this.settings.lastSyncTime = Date.now();
      this.settings.lastSyncStatus = "success";
      this.settings.lastSyncError =
        result.errors.length > 0
          ? `${result.errors.length} errors occurred`
          : "";
      await this.saveSettings();

      this.updateRibbonState("success");
      this.updateStatusBar("Synced");

      if (result.errors.length > 0) {
        new Notice(
          `Sync completed with ${result.errors.length} errors. Check console for details.`
        );
        console.warn("Google Drive Sync errors:", result.errors);
      } else {
        new Notice(`Google Drive: Synced ${result.syncedCount} items.`);
      }
    } catch (err: any) {
      console.error("Google Drive sync failed:", err);
      const formatted = GoogleDriveApi.formatGoogleError(err.message || String(err));
      this.settings.lastSyncStatus = "error";
      this.settings.lastSyncError = formatted;
      await this.saveSettings();

      this.updateRibbonState("error");
      this.updateStatusBar("Sync Error");
      new Notice(`Google Drive Sync Error: ${formatted}`);
    } finally {
      this.isSyncing = false;
      window.setTimeout(() => {
        if (!this.isSyncing) {
          this.updateRibbonState("idle");
          this.formatLastSyncStatusBar();
        }
      }, 4000);
    }
  }

  private updateRibbonState(state: "idle" | "syncing" | "success" | "error") {
    if (!this.syncRibbonEl) return;
    this.syncRibbonEl.removeClass("is-syncing");
    this.syncRibbonEl.removeClass("sync-success");
    this.syncRibbonEl.removeClass("sync-error");

    if (state === "syncing") {
      this.syncRibbonEl.addClass("is-syncing");
    } else if (state === "success") {
      this.syncRibbonEl.addClass("sync-success");
    } else if (state === "error") {
      this.syncRibbonEl.addClass("sync-error");
    }
  }

  private updateStatusBar(text: string) {
    if (!this.statusBarEl) return;
    this.statusBarEl.setText(`GDrive: ${text}`);
  }

  private formatLastSyncStatusBar() {
    if (this.settings.lastSyncTime > 0) {
      const minsAgo = Math.round(
        (Date.now() - this.settings.lastSyncTime) / 60000
      );
      if (minsAgo < 1) {
        this.updateStatusBar("Just now");
      } else if (minsAgo < 60) {
        this.updateStatusBar(`${minsAgo}m ago`);
      } else {
        const hoursAgo = Math.round(minsAgo / 60);
        this.updateStatusBar(`${hoursAgo}h ago`);
      }
    } else {
      this.updateStatusBar("Idle");
    }
  }

  async loadSettings() {
    const data = (await this.loadData()) || {};
    const { syncRecords, ...settingsData } = data;
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settingsData);
    if (settingsData && settingsData.googleDrive) {
      this.settings.googleDrive = Object.assign(
        {},
        DEFAULT_SETTINGS.googleDrive,
        settingsData.googleDrive
      );
    }
  }

  async saveSettings() {
    const currentData = (await this.loadData()) || {};
    const activeSyncRecords = currentData.syncRecords;
    const settingsCopy: any = { ...this.settings };
    delete settingsCopy.syncRecords;

    const toSave = Object.assign({}, currentData, settingsCopy);
    if (activeSyncRecords !== undefined) {
      toSave.syncRecords = activeSyncRecords;
    } else {
      delete toSave.syncRecords;
    }
    await this.saveData(toSave);
  }
}

export default GDriveSyncPlugin;
