import { App, Modal, Notice, requestUrl } from "obsidian";
import type { DeviceCodeResponse, GoogleDriveConfig } from "./types";
import { GoogleDriveApi } from "./googleDriveApi";

export class GoogleOAuthDeviceFlow {
  /**
   * Initiates the OAuth 2.0 Device Code Flow
   */
  public static async requestDeviceCode(
    clientId: string,
    scope: string
  ): Promise<DeviceCodeResponse> {
    if (!clientId) {
      throw new Error("Missing Google Client ID. Please configure it in plugin settings.");
    }

    const params = new URLSearchParams({
      client_id: clientId,
      scope: scope,
    });

    if (scope === "https://www.googleapis.com/auth/drive") {
      throw new Error(
        "Google's Device Flow restricts full drive access. Please switch scope to 'App-Created Files Only' in settings, or use 'Manual Token Entry' if syncing an existing drive folder."
      );
    }

    try {
      const resp = await requestUrl({
        url: "https://oauth2.googleapis.com/device/code",
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: params.toString(),
      });

      if (resp.status !== 200) {
        throw new Error(
          `Failed to obtain device code from Google: ${GoogleDriveApi.formatGoogleError(resp.text, resp.status)}`
        );
      }

      return resp.json as DeviceCodeResponse;
    } catch (err: any) {
      if (err.status === 400 || (err.message && err.message.includes("400"))) {
        throw new Error(
          "Google Device Flow rejected the request (Status 400). Ensure your Google Client ID is of type 'TVs and Limited Input devices' and scope is set to 'App-Created Files Only'."
        );
      }
      throw err;
    }
  }

  /**
   * Polls Google token endpoint until user approves or denies
   */
  public static async pollForTokens(
    clientId: string,
    clientSecret: string,
    deviceCode: string,
    intervalSeconds: number,
    expiresInSeconds: number,
    isCancelled: () => boolean,
    onStatusUpdate?: (statusText: string) => void
  ): Promise<{ accessToken: string; refreshToken: string; expiresIn: number }> {
    if (!clientSecret) {
      throw new Error("Missing Google Client Secret. Google requires client_secret for device code authentication.");
    }

    const deadline = Date.now() + expiresInSeconds * 1000;
    let pollInterval = Math.max(intervalSeconds, 5);

    while (Date.now() < deadline) {
      if (isCancelled()) {
        throw new Error("Authorization was cancelled.");
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval * 1000));

      if (isCancelled()) {
        throw new Error("Authorization was cancelled.");
      }

      const params = new URLSearchParams({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      });
      if (clientSecret) {
        params.append("client_secret", clientSecret);
      }

      try {
        const resp = await requestUrl({
          url: "https://oauth2.googleapis.com/token",
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: params.toString(),
          throw: false,
        });

        if (resp.status === 200) {
          const data = resp.json;
          return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresIn: Number(data.expires_in) || 3600,
          };
        }

        const errJson = resp.json || {};
        const error = errJson.error;

        if (error === "authorization_pending") {
          onStatusUpdate?.("Waiting for approval in browser...");
          continue;
        } else if (error === "slow_down") {
          pollInterval += 5;
          onStatusUpdate?.("Waiting (rate-adjusted)...");
          continue;
        } else if (error === "access_denied") {
          throw new Error("Access was denied on the Google consent screen.");
        } else if (error === "expired_token") {
          throw new Error("The authorization session timed out. Please try again.");
        } else {
          throw new Error(`Token authorization error: ${GoogleDriveApi.formatGoogleError(resp.text, resp.status)}`);
        }
      } catch (err: any) {
        if (
          err.message?.includes("denied") ||
          err.message?.includes("timed out") ||
          err.message?.includes("cancelled")
        ) {
          throw err;
        }
        // Network blips can be tolerated during polling
        console.warn("Polling request blip:", err);
      }
    }

    throw new Error("Authorization timed out.");
  }
}

export class DeviceAuthModal extends Modal {
  private deviceResponse: DeviceCodeResponse;
  private clientId: string;
  private clientSecret: string;
  private onSuccess: (config: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }) => Promise<void>;

  private cancelled = false;
  private statusEl!: HTMLElement;

  constructor(
    app: App,
    deviceResponse: DeviceCodeResponse,
    clientId: string,
    clientSecret: string,
    onSuccess: (config: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    }) => Promise<void>
  ) {
    super(app);
    this.deviceResponse = deviceResponse;
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.onSuccess = onSuccess;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("gdrive-auth-modal");

    contentEl.createEl("h2", {
      text: "Connect Google Drive",
      cls: "gdrive-auth-modal-header",
    });

    const stepBox = contentEl.createDiv({ cls: "gdrive-auth-step-box" });

    stepBox.createEl("p", {
      text: "1. Copy this one-time code:",
    });

    const codeBox = stepBox.createDiv({ cls: "gdrive-auth-code-container" });
    codeBox.createDiv({
      text: this.deviceResponse.user_code,
      cls: "gdrive-auth-user-code",
    });

    const copyBtn = codeBox.createEl("button", {
      text: "Copy Code",
    });
    copyBtn.onclick = async () => {
      await navigator.clipboard.writeText(this.deviceResponse.user_code);
      new Notice("Code copied to clipboard!");
    };

    stepBox.createEl("p", {
      text: "2. Open Google in your browser, paste the code, and grant permission:",
    });

    const verifyUrl =
      this.deviceResponse.verification_url || "https://www.google.com/device";
    const directUrl = `${verifyUrl}?user_code=${encodeURIComponent(
      this.deviceResponse.user_code
    )}`;

    const btnRow = stepBox.createDiv({ cls: "gdrive-auth-button-row" });
    const openBtn = btnRow.createEl("button", {
      text: "Open Google Login in Browser",
      cls: "mod-cta",
    });
    openBtn.onclick = () => {
      window.open(directUrl, "_blank");
    };

    const cancelBtn = btnRow.createEl("button", {
      text: "Cancel",
    });
    cancelBtn.onclick = () => {
      this.cancelled = true;
      this.close();
    };

    this.statusEl = contentEl.createDiv({ cls: "gdrive-auth-polling-status" });
    this.statusEl.createDiv({ cls: "gdrive-auth-spinner" });
    const statusText = this.statusEl.createSpan({
      text: "Waiting for approval in browser...",
    });

    // Start background polling
    this.startPolling(statusText);
  }

  private async startPolling(statusTextSpan: HTMLElement) {
    try {
      const result = await GoogleOAuthDeviceFlow.pollForTokens(
        this.clientId,
        this.clientSecret,
        this.deviceResponse.device_code,
        this.deviceResponse.interval,
        this.deviceResponse.expires_in,
        () => this.cancelled,
        (text) => {
          statusTextSpan.setText(text);
        }
      );

      if (this.cancelled) return;

      new Notice("Google Drive connected successfully!");
      await this.onSuccess(result);
      this.close();
    } catch (err: any) {
      if (!this.cancelled) {
        new Notice(`Login failed: ${err.message}`);
        this.close();
      }
    }
  }

  onClose() {
    this.cancelled = true;
    this.contentEl.empty();
  }
}
