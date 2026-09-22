/**
 * Types and interfaces for Obsidian Google Drive Sync
 */

export interface GoogleDriveConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAtMs: number;
  scope: string;
  userEmail?: string;
  userDisplayName?: string;
}

export type SyncDirection = "bidirectional" | "push_only" | "pull_only";

export type ConflictAction =
  | "keep_newer"
  | "keep_remote"
  | "keep_local"
  | "create_conflict_copy";

export interface PluginSettings {
  googleDrive: GoogleDriveConfig;
  remoteVaultDir: string;
  syncDirection: SyncDirection;
  conflictAction: ConflictAction;
  syncOnStartup: boolean;
  periodicSyncIntervalMinutes: number;
  syncOnSave: boolean;
  syncOnSaveDelaySeconds: number;
  syncConfigDir: boolean;
  protectModifyDeletePercentage: number;
  ignoredPatterns: string[];
  lastSyncTime: number;
  lastSyncStatus: "idle" | "syncing" | "success" | "error";
  lastSyncError: string;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  googleDrive: {
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    accessToken: "",
    accessTokenExpiresAtMs: 0,
    scope: "https://www.googleapis.com/auth/drive.file",
  },
  remoteVaultDir: "",
  syncDirection: "bidirectional",
  conflictAction: "keep_newer",
  syncOnStartup: true,
  periodicSyncIntervalMinutes: 10,
  syncOnSave: false,
  syncOnSaveDelaySeconds: 5,
  syncConfigDir: false,
  protectModifyDeletePercentage: 25,
  ignoredPatterns: [
    "^\\.git/",
    "^\\.trash/",
    "^\\.obsidian/workspace(\\.json)?",
    "\\.DS_Store$",
    "^desktop\\.ini$",
    "thumbs\\.db$",
    "~\\$",
  ],
  lastSyncTime: 0,
  lastSyncStatus: "idle",
  lastSyncError: "",
};

export interface FsEntity {
  /** Relative normalized path inside the vault, e.g. "Notes/Daily/today.md" or "Notes/Daily/" */
  key: string;
  isFolder: boolean;
  size: number;
  mtime: number;
  ctime?: number;
  hash?: string;
  id?: string;
  parentID?: string;
}

export interface SyncRecord {
  key: string;
  isFolder: boolean;
  localSize: number;
  localMtime: number;
  remoteHash?: string;
  remoteMtime?: number;
  remoteSize?: number;
  syncTime: number;
  // Legacy backward-compatibility fields
  size?: number;
  mtime?: number;
  hash?: string;
}

export type SyncActionType =
  | "upload"
  | "download"
  | "delete_local"
  | "delete_remote"
  | "create_remote_folder"
  | "create_local_folder"
  | "delete_remote_folder"
  | "delete_local_folder"
  | "conflict_keep_newer"
  | "conflict_keep_local"
  | "conflict_keep_remote"
  | "conflict_create_copy"
  | "equal"
  | "skip";

export interface SyncDecision {
  key: string;
  isFolder: boolean;
  action: SyncActionType;
  localEntity?: FsEntity;
  remoteEntity?: FsEntity;
  prevRecord?: SyncRecord;
  reason: string;
  isChange: boolean;
}

export type SyncTrigger = "manual" | "startup" | "timer" | "save" | "ribbon";

export type ProgressCallback = (
  current: number,
  total: number,
  message: string,
  key?: string
) => void;

export interface DeviceCodeResponse {
  device_code: string;
  user_code: string;
  verification_url: string;
  expires_in: number;
  interval: number;
}
