import {
  type App,
  Notice,
  PluginSettingTab,
  Setting,
} from "obsidian";
import type { GDriveSyncPlugin } from "./main";
import { GoogleOAuthDeviceFlow, DeviceAuthModal } from "./oauthDeviceFlow";
import type { ConflictAction, SyncDirection } from "./types";

export class GDriveSyncSettingTab extends PluginSettingTab {
  private plugin: GDriveSyncPlugin;

  constructor(app: App, plugin: GDriveSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: "Google Drive Sync Settings" });

    // Section 1: Account & Authentication
    this.renderAccountSection(containerEl);

    // Section 2: Remote Target
    this.renderRemoteTargetSection(containerEl);

    // Section 3: Sync Automation
    this.renderAutomationSection(containerEl);

    // Section 4: Conflict Resolution & Safety
    this.renderConflictAndSafetySection(containerEl);

    // Section 5: Exclusion Filters
    this.renderExclusionsSection(containerEl);

    // Section 6: Diagnostics & Manual Actions
    this.renderDiagnosticsSection(containerEl);
  }

  private renderAccountSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Google Account" });

    const isConnected = !!this.plugin.settings.googleDrive.refreshToken;

    const card = containerEl.createDiv({ cls: "gdrive-settings-card" });
    const infoRow = card.createDiv({ cls: "gdrive-account-info" });

    const badge = infoRow.createSpan({
      cls: `gdrive-status-badge ${isConnected ? "connected" : "disconnected"}`,
      text: isConnected ? "Connected" : "Not Connected",
    });

    if (isConnected && this.plugin.settings.googleDrive.userEmail) {
      infoRow.createSpan({
        cls: "gdrive-account-email",
        text: this.plugin.settings.googleDrive.userEmail,
      });
    }

    if (isConnected) {
      new Setting(card)
        .setName("Check Connection")
        .setDesc("Test authentication and Google Drive API connectivity")
        .addButton((btn) => {
          btn.setButtonText("Test Connection").onClick(async () => {
            btn.setDisabled(true);
            try {
              const userInfo = await this.plugin.driveApi.getUserInfo();
              this.plugin.settings.googleDrive.userEmail = userInfo.email;
              this.plugin.settings.googleDrive.userDisplayName = userInfo.name;
              await this.plugin.saveSettings();
              new Notice(`Connected to Google Drive as ${userInfo.email}`);
              this.display();
            } catch (err: any) {
              new Notice(`Connection test failed: ${err.message}`);
            } finally {
              btn.setDisabled(false);
            }
          });
        })
        .addButton((btn) => {
          btn
            .setButtonText("Disconnect Account")
            .setWarning()
            .onClick(async () => {
              this.plugin.settings.googleDrive.refreshToken = "";
              this.plugin.settings.googleDrive.accessToken = "";
              this.plugin.settings.googleDrive.accessTokenExpiresAtMs = 0;
              this.plugin.settings.googleDrive.userEmail = "";
              this.plugin.settings.googleDrive.userDisplayName = "";
              await this.plugin.saveSettings();
              new Notice("Google Drive disconnected.");
              this.display();
            });
        });
    } else {
      // Prompt user to provide Client ID and Secret before connecting
      new Setting(card)
        .setName("Google OAuth Credentials")
        .setDesc(
          "Enter your Google Cloud OAuth 2.0 Client ID and Secret (type: 'TVs and Limited Input devices')."
        );

      new Setting(card)
        .setName("Google Client ID")
        .setDesc("Client ID from your Google Cloud Console project")
        .addText((text) => {
          text
            .setPlaceholder("e.g. 123456789-abcdef.apps.googleusercontent.com")
            .setValue(this.plugin.settings.googleDrive.clientId)
            .onChange(async (val) => {
              this.plugin.settings.googleDrive.clientId = val.trim();
              await this.plugin.saveSettings();
            });
        });

      new Setting(card)
        .setName("Google Client Secret")
        .setDesc("Required by Google OAuth 2.0 Device Flow")
        .addText((text) => {
          text
            .setPlaceholder("GOCSPX-...")
            .setValue(this.plugin.settings.googleDrive.clientSecret)
            .onChange(async (val) => {
              this.plugin.settings.googleDrive.clientSecret = val.trim();
              await this.plugin.saveSettings();
            });
        });

      new Setting(card)
        .setName("Google Drive OAuth Scope")
        .setDesc(
          "For Google Device Login, select 'App-Created Files Only' (Google blocks full drive scope on device flow). To sync an existing Drive folder with Full Access, use 'Manual Token Entry' below."
        )
        .addDropdown((drop) => {
          drop
            .addOption(
              "https://www.googleapis.com/auth/drive.file",
              "App-Created Files Only (Required for Device Flow)"
            )
            .addOption(
              "https://www.googleapis.com/auth/drive",
              "Full Drive Access (Manual Token Entry only)"
            )
            .setValue(
              this.plugin.settings.googleDrive.scope ||
                "https://www.googleapis.com/auth/drive.file"
            )
            .onChange(async (val) => {
              this.plugin.settings.googleDrive.scope = val;
              await this.plugin.saveSettings();
            });
        });

      new Setting(card)
        .setName("Connect to Google Drive")
        .setDesc(
          "Authorize this plugin to access your vault files using Google's secure device login"
        )
        .addButton((btn) => {
          btn
            .setButtonText("Connect Account")
            .setCta()
            .onClick(async () => {
              const { clientId, clientSecret, scope } =
                this.plugin.settings.googleDrive;

              if (!clientId || !clientSecret) {
                new Notice(
                  "Please enter both your Google Client ID and Client Secret before connecting."
                );
                return;
              }

              btn.setDisabled(true);
              try {
                const deviceResp =
                  await GoogleOAuthDeviceFlow.requestDeviceCode(
                    clientId,
                    scope
                  );

                new DeviceAuthModal(
                  this.app,
                  deviceResp,
                  clientId,
                  clientSecret,
                  async (tokens) => {
                    this.plugin.settings.googleDrive.refreshToken =
                      tokens.refreshToken;
                    this.plugin.settings.googleDrive.accessToken =
                      tokens.accessToken;
                    this.plugin.settings.googleDrive.accessTokenExpiresAtMs =
                      Date.now() + tokens.expiresIn * 1000;

                    try {
                      const userInfo =
                        await this.plugin.driveApi.getUserInfo();
                      this.plugin.settings.googleDrive.userEmail =
                        userInfo.email;
                      this.plugin.settings.googleDrive.userDisplayName =
                        userInfo.name;
                    } catch (e) {
                      console.warn("Could not fetch user details right away", e);
                    }

                    await this.plugin.saveSettings();
                    this.display();
                  }
                ).open();
              } catch (err: any) {
                new Notice(`Auth error: ${err.message}`);
              } finally {
                btn.setDisabled(false);
              }
            });
        });
    }

    // Manual Refresh Token Section (Alternative setup)
    const advancedDetails = containerEl.createEl("details");
    advancedDetails.createEl("summary", {
      text: "Manual Token Entry (Alternative)",
    });

    new Setting(advancedDetails)
      .setName("Manual Refresh Token")
      .setDesc("Paste an existing Google OAuth refresh token directly")
      .addText((text) => {
        text
          .setPlaceholder("1//...")
          .setValue(this.plugin.settings.googleDrive.refreshToken)
          .onChange(async (val) => {
            this.plugin.settings.googleDrive.refreshToken = val.trim();
            this.plugin.settings.googleDrive.accessToken = "";
            this.plugin.settings.googleDrive.accessTokenExpiresAtMs = 0;
            await this.plugin.saveSettings();
          });
      });
  }

  private renderRemoteTargetSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Vault Storage Location" });

    new Setting(containerEl)
      .setName("Remote Vault Directory")
      .setDesc(
        "Folder on Google Drive where notes will be stored (e.g. 'Obsidian/MyVault'). Defaults to your vault name if left empty."
      )
      .addText((text) => {
        text
          .setPlaceholder(this.app.vault.getName())
          .setValue(this.plugin.settings.remoteVaultDir)
          .onChange(async (val) => {
            this.plugin.settings.remoteVaultDir = val.trim();
            this.plugin.driveApi.updateConfig(
              this.plugin.settings.googleDrive,
              this.plugin.settings.remoteVaultDir
            );
            await this.plugin.saveSettings();
          });
      });
  }

  private renderAutomationSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Sync Automation" });

    new Setting(containerEl)
      .setName("Sync on Startup")
      .setDesc("Automatically sync when Obsidian opens (recommended for mobile)")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.syncOnStartup)
          .onChange(async (val) => {
            this.plugin.settings.syncOnStartup = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Periodic Sync")
      .setDesc("Automatically sync in the background at regular intervals")
      .addDropdown((drop) => {
        drop
          .addOption("0", "Disabled")
          .addOption("5", "Every 5 minutes")
          .addOption("10", "Every 10 minutes")
          .addOption("15", "Every 15 minutes")
          .addOption("30", "Every 30 minutes")
          .addOption("60", "Every 1 hour")
          .setValue(String(this.plugin.settings.periodicSyncIntervalMinutes))
          .onChange(async (val) => {
            this.plugin.settings.periodicSyncIntervalMinutes = Number(val);
            await this.plugin.saveSettings();
            this.plugin.setupPeriodicTimer();
          });
      });

    new Setting(containerEl)
      .setName("Sync on File Change")
      .setDesc("Automatically sync shortly after you modify or create a note")
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.syncOnSave)
          .onChange(async (val) => {
            this.plugin.settings.syncOnSave = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("File Change Delay (seconds)")
      .setDesc("Wait time after your last edit before triggering sync")
      .addSlider((slider) => {
        slider
          .setLimits(3, 60, 1)
          .setValue(this.plugin.settings.syncOnSaveDelaySeconds)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.syncOnSaveDelaySeconds = val;
            await this.plugin.saveSettings();
          });
      });
  }

  private renderConflictAndSafetySection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Conflicts & Safety Guard" });

    new Setting(containerEl)
      .setName("Sync Direction")
      .setDesc("Choose whether sync is bidirectional or one-way")
      .addDropdown((drop) => {
        drop
          .addOption("bidirectional", "Bidirectional (Two-way)")
          .addOption("push_only", "Push Only (Local to Google Drive)")
          .addOption("pull_only", "Pull Only (Google Drive to Local)")
          .setValue(this.plugin.settings.syncDirection)
          .onChange(async (val) => {
            this.plugin.settings.syncDirection = val as SyncDirection;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Conflict Resolution")
      .setDesc("How to resolve when both local and Google Drive files were modified")
      .addDropdown((drop) => {
        drop
          .addOption("keep_newer", "Keep Newer File (by modification time)")
          .addOption("keep_local", "Always Keep Local")
          .addOption("keep_remote", "Always Keep Remote")
          .addOption(
            "create_conflict_copy",
            "Keep Both (Create .sync-conflict- copy)"
          )
          .setValue(this.plugin.settings.conflictAction)
          .onChange(async (val) => {
            this.plugin.settings.conflictAction = val as ConflictAction;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Accidental Deletion Protection Threshold (%)")
      .setDesc(
        "Halts sync if more than this percentage of files would be deleted in a single run (prevents catastrophic loss). Set to 0 to disable."
      )
      .addSlider((slider) => {
        slider
          .setLimits(0, 100, 5)
          .setValue(this.plugin.settings.protectModifyDeletePercentage)
          .setDynamicTooltip()
          .onChange(async (val) => {
            this.plugin.settings.protectModifyDeletePercentage = val;
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Sync .obsidian Configuration Folder")
      .setDesc(
        "Sync plugin configurations, snippets, and themes (excluding workspace cache). Caution: May conflict if devices have different screen sizes."
      )
      .addToggle((toggle) => {
        toggle
          .setValue(this.plugin.settings.syncConfigDir)
          .onChange(async (val) => {
            this.plugin.settings.syncConfigDir = val;
            await this.plugin.saveSettings();
          });
      });
  }

  private renderExclusionsSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Exclusions" });

    new Setting(containerEl)
      .setName("Ignored Patterns (RegExp)")
      .setDesc(
        "One regular expression per line. Files or folders matching these patterns will be excluded from sync."
      )
      .addTextArea((text) => {
        text
          .setPlaceholder("^\\.git/\n\\.DS_Store$")
          .setValue(this.plugin.settings.ignoredPatterns.join("\n"))
          .onChange(async (val) => {
            this.plugin.settings.ignoredPatterns = val
              .split("\n")
              .map((s) => s.trim())
              .filter((s) => s.length > 0);
            await this.plugin.saveSettings();
          });
        text.inputEl.rows = 5;
        text.inputEl.cols = 35;
      });
  }

  private renderDiagnosticsSection(containerEl: HTMLElement): void {
    containerEl.createEl("h3", { text: "Diagnostics & Actions" });

    new Setting(containerEl)
      .setName("Sync Now")
      .setDesc("Trigger an immediate manual synchronization run")
      .addButton((btn) => {
        btn
          .setButtonText("Sync Now")
          .setCta()
          .onClick(async () => {
            await this.plugin.triggerSync("manual");
            this.display();
          });
      });

    new Setting(containerEl)
      .setName("Reset Local Sync Cache")
      .setDesc(
        "Clears the local sync database. Use if you want the plugin to re-scan all local and remote files afresh."
      )
      .addButton((btn) => {
        btn
          .setButtonText("Reset Cache")
          .setWarning()
          .onClick(async () => {
            this.plugin.db.clear();
            await this.plugin.db.save();
            new Notice("Local sync cache cleared.");
          });
      });

    if (this.plugin.settings.lastSyncTime > 0) {
      const timeStr = new Date(
        this.plugin.settings.lastSyncTime
      ).toLocaleString();
      const statusText = `Status: ${this.plugin.settings.lastSyncStatus.toUpperCase()} | Last Run: ${timeStr}`;
      const logBox = containerEl.createDiv({ cls: "gdrive-sync-log-box" });
      logBox.createEl("div", { text: statusText });
      if (this.plugin.settings.lastSyncError) {
        logBox.createEl("div", {
          text: `Error: ${this.plugin.settings.lastSyncError}`,
          cls: "text-error",
        });
      }
    }
  }
}
