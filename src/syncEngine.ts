import type {
  ConflictAction,
  FsEntity,
  PluginSettings,
  ProgressCallback,
  SyncActionType,
  SyncDecision,
  SyncDirection,
  SyncRecord,
} from "./types";
import type { FsLocal } from "./localFs";
import type { GoogleDriveApi } from "./googleDriveApi";
import type { LocalDb } from "./localDb";

export class SyncEngine {
  private localFs: FsLocal;
  private driveApi: GoogleDriveApi;
  private db: LocalDb;
  private settings: PluginSettings;

  constructor(
    localFs: FsLocal,
    driveApi: GoogleDriveApi,
    db: LocalDb,
    settings: PluginSettings
  ) {
    this.localFs = localFs;
    this.driveApi = driveApi;
    this.db = db;
    this.settings = settings;
  }

  /**
   * Plans the synchronization actions by comparing local, remote, and previous sync state
   */
  public planSync(
    localEntities: FsEntity[],
    remoteEntities: FsEntity[]
  ): SyncDecision[] {
    const localMap = new Map<string, FsEntity>();
    for (const e of localEntities) localMap.set(e.key, e);

    const remoteMap = new Map<string, FsEntity>();
    for (const e of remoteEntities) remoteMap.set(e.key, e);

    const prevMap = this.db.getAllRecords();

    // Union of all keys
    const allKeys = new Set<string>([
      ...localMap.keys(),
      ...remoteMap.keys(),
      ...prevMap.keys(),
    ]);

    const decisions: SyncDecision[] = [];

    for (const key of allKeys) {
      if (this.localFs.isIgnored(key)) {
        continue;
      }

      const local = localMap.get(key);
      const remote = remoteMap.get(key);
      const prev = prevMap.get(key);
      const isFolder = key.endsWith("/");

      const decision = this.decideItem(
        key,
        isFolder,
        local,
        remote,
        prev,
        this.settings.syncDirection,
        this.settings.conflictAction
      );

      decisions.push(decision);
    }

    return decisions;
  }

  private decideItem(
    key: string,
    isFolder: boolean,
    local?: FsEntity,
    remote?: FsEntity,
    prev?: SyncRecord,
    direction: SyncDirection = "bidirectional",
    conflictAction: ConflictAction = "keep_newer"
  ): SyncDecision {
    if (isFolder) {
      return this.decideFolder(key, local, remote, prev, direction);
    }
    return this.decideFile(key, local, remote, prev, direction, conflictAction);
  }

  private decideFolder(
    key: string,
    local?: FsEntity,
    remote?: FsEntity,
    prev?: SyncRecord,
    direction: SyncDirection = "bidirectional"
  ): SyncDecision {
    if (local && remote) {
      return {
        key,
        isFolder: true,
        action: "equal",
        reason: "Folder exists locally and remotely",
        isChange: false,
      };
    }

    if (local && !remote) {
      if (prev) {
        // Deleted remotely
        if (direction === "push_only") {
          return { key, isFolder: true, action: "skip", reason: "Remote folder deleted; push only skips", isChange: false };
        }
        return {
          key,
          isFolder: true,
          action: "delete_local_folder",
          localEntity: local,
          prevRecord: prev,
          reason: "Folder was deleted on Google Drive",
          isChange: true,
        };
      } else {
        // Created locally
        if (direction === "pull_only") {
          return { key, isFolder: true, action: "skip", reason: "Local folder created; pull only skips", isChange: false };
        }
        return {
          key,
          isFolder: true,
          action: "create_remote_folder",
          localEntity: local,
          reason: "Folder created locally",
          isChange: true,
        };
      }
    }

    if (!local && remote) {
      if (prev) {
        // Deleted locally
        if (direction === "pull_only") {
          return { key, isFolder: true, action: "skip", reason: "Local folder deleted; pull only skips", isChange: false };
        }
        return {
          key,
          isFolder: true,
          action: "delete_remote_folder",
          remoteEntity: remote,
          prevRecord: prev,
          reason: "Folder was deleted locally",
          isChange: true,
        };
      } else {
        // Created remotely
        if (direction === "push_only") {
          return { key, isFolder: true, action: "skip", reason: "Remote folder created; push only skips", isChange: false };
        }
        return {
          key,
          isFolder: true,
          action: "create_local_folder",
          remoteEntity: remote,
          reason: "Folder created on Google Drive",
          isChange: true,
        };
      }
    }

    // Neither exists anymore
    return {
      key,
      isFolder: true,
      action: "skip",
      reason: "Folder no longer exists",
      isChange: false,
    };
  }

  private decideFile(
    key: string,
    local?: FsEntity,
    remote?: FsEntity,
    prev?: SyncRecord,
    direction: SyncDirection = "bidirectional",
    conflictAction: ConflictAction = "keep_newer"
  ): SyncDecision {
    // Case 1: Exists on both sides
    if (local && remote) {
      // Side-specific change detection against previous sync snapshot
      const localUnchanged =
        prev &&
        local.size === prev.localSize &&
        Math.abs(local.mtime - prev.localMtime) <= 1500;

      const remoteUnchanged =
        prev &&
        (prev.remoteHash && remote.hash
          ? remote.hash === prev.remoteHash
          : remote.size === prev.remoteSize &&
            Math.abs(remote.mtime - (prev.remoteMtime ?? 0)) <= 1500);

      // If both sides are known to be unchanged from prev sync, it is equal (no bounce)
      if (prev && localUnchanged && remoteUnchanged) {
        return {
          key,
          isFolder: false,
          action: "equal",
          localEntity: local,
          remoteEntity: remote,
          prevRecord: prev,
          reason: "Neither local nor remote file has changed since last sync",
          isChange: false,
        };
      }

      // Check if files are directly identical (same content/hash or size & mtime match)
      const isIdentical =
        local.size === remote.size &&
        ((local.hash && remote.hash && local.hash === remote.hash) ||
          Math.abs(local.mtime - remote.mtime) <= 1500);

      if (isIdentical) {
        return {
          key,
          isFolder: false,
          action: "equal",
          localEntity: local,
          remoteEntity: remote,
          prevRecord: prev,
          reason: "File is identical on both sides",
          isChange: false,
        };
      }

      if (localUnchanged && !remoteUnchanged) {
        // Remote modified
        if (direction === "push_only") {
          return { key, isFolder: false, action: "skip", reason: "Remote modified; push only skips", isChange: false };
        }
        return {
          key,
          isFolder: false,
          action: "download",
          localEntity: local,
          remoteEntity: remote,
          prevRecord: prev,
          reason: "Remote file was modified",
          isChange: true,
        };
      }

      if (!localUnchanged && remoteUnchanged) {
        // Local modified
        if (direction === "pull_only") {
          return { key, isFolder: false, action: "skip", reason: "Local modified; pull only skips", isChange: false };
        }
        return {
          key,
          isFolder: false,
          action: "upload",
          localEntity: local,
          remoteEntity: remote,
          prevRecord: prev,
          reason: "Local file was modified",
          isChange: true,
        };
      }

      // Conflict: Both changed or both newly created with differing content
      if (direction === "push_only") {
        return {
          key,
          isFolder: false,
          action: "upload",
          localEntity: local,
          remoteEntity: remote,
          reason: "Push only mode overrides remote conflict",
          isChange: true,
        };
      }
      if (direction === "pull_only") {
        return {
          key,
          isFolder: false,
          action: "download",
          localEntity: local,
          remoteEntity: remote,
          reason: "Pull only mode overrides local conflict",
          isChange: true,
        };
      }

      // Bidirectional conflict resolution
      switch (conflictAction) {
        case "keep_remote":
          return {
            key,
            isFolder: false,
            action: "conflict_keep_remote",
            localEntity: local,
            remoteEntity: remote,
            reason: "Conflict: keep remote selected",
            isChange: true,
          };
        case "keep_local":
          return {
            key,
            isFolder: false,
            action: "conflict_keep_local",
            localEntity: local,
            remoteEntity: remote,
            reason: "Conflict: keep local selected",
            isChange: true,
          };
        case "create_conflict_copy":
          return {
            key,
            isFolder: false,
            action: "conflict_create_copy",
            localEntity: local,
            remoteEntity: remote,
            reason: "Conflict: creating conflict copy",
            isChange: true,
          };
        case "keep_newer":
        default:
          if (local.mtime >= remote.mtime) {
            return {
              key,
              isFolder: false,
              action: "conflict_keep_newer",
              localEntity: local,
              remoteEntity: remote,
              reason: "Conflict: local is newer",
              isChange: true,
            };
          } else {
            return {
              key,
              isFolder: false,
              action: "conflict_keep_newer",
              localEntity: local,
              remoteEntity: remote,
              reason: "Conflict: remote is newer",
              isChange: true,
            };
          }
      }
    }

    // Case 2: Exists locally only
    if (local && !remote) {
      if (prev) {
        // Check if local was modified since prev sync
        const localModifiedSincePrev =
          local.size !== prev.localSize ||
          Math.abs(local.mtime - prev.localMtime) > 1500;

        if (localModifiedSincePrev) {
          // Local modification wins over remote deletion
          if (direction === "pull_only") {
            return { key, isFolder: false, action: "skip", reason: "Local modified but remote deleted; pull only skips", isChange: false };
          }
          return {
            key,
            isFolder: false,
            action: "upload",
            localEntity: local,
            prevRecord: prev,
            reason: "Local file was modified after remote deletion (edit wins over delete)",
            isChange: true,
          };
        }

        // Deleted remotely and local was untouched
        if (direction === "push_only") {
          return { key, isFolder: false, action: "skip", reason: "Deleted remotely; push only skips", isChange: false };
        }
        return {
          key,
          isFolder: false,
          action: "delete_local",
          localEntity: local,
          prevRecord: prev,
          reason: "File was deleted on Google Drive",
          isChange: true,
        };
      } else {
        // Created locally
        if (direction === "pull_only") {
          return { key, isFolder: false, action: "skip", reason: "Created locally; pull only skips", isChange: false };
        }
        return {
          key,
          isFolder: false,
          action: "upload",
          localEntity: local,
          reason: "New local file",
          isChange: true,
        };
      }
    }

    // Case 3: Exists remotely only
    if (!local && remote) {
      if (prev) {
        // Check if remote was modified since prev sync
        const remoteModifiedSincePrev = prev.remoteHash && remote.hash
          ? remote.hash !== prev.remoteHash
          : remote.size !== prev.remoteSize ||
            Math.abs(remote.mtime - (prev.remoteMtime ?? 0)) > 1500;

        if (remoteModifiedSincePrev) {
          // Remote modification wins over local deletion
          if (direction === "push_only") {
            return { key, isFolder: false, action: "skip", reason: "Remote modified but local deleted; push only skips", isChange: false };
          }
          return {
            key,
            isFolder: false,
            action: "download",
            remoteEntity: remote,
            prevRecord: prev,
            reason: "Remote file was modified after local deletion (edit wins over delete)",
            isChange: true,
          };
        }

        // Deleted locally and remote was untouched
        if (direction === "pull_only") {
          return { key, isFolder: false, action: "skip", reason: "Deleted locally; pull only skips", isChange: false };
        }
        return {
          key,
          isFolder: false,
          action: "delete_remote",
          remoteEntity: remote,
          prevRecord: prev,
          reason: "File was deleted locally",
          isChange: true,
        };
      } else {
        // Created remotely
        if (direction === "push_only") {
          return { key, isFolder: false, action: "skip", reason: "Created remotely; push only skips", isChange: false };
        }
        return {
          key,
          isFolder: false,
          action: "download",
          remoteEntity: remote,
          reason: "New file on Google Drive",
          isChange: true,
        };
      }
    }

    // Case 4: In prev records but gone from both
    return {
      key,
      isFolder: false,
      action: "skip",
      reason: "File removed from both sides",
      isChange: false,
    };
  }

  /**
   * Executes the synchronized plan
   */
  public async executePlan(
    decisions: SyncDecision[],
    onProgress?: ProgressCallback
  ): Promise<{ syncedCount: number; errors: { key: string; error: string }[] }> {
    // 1. Safety Guard Check: Protect against accidental mass deletion
    this.checkSafetyGuard(decisions);

    const errors: { key: string; error: string }[] = [];
    let syncedCount = 0;

    // Phase 0: Record baseline snapshots for matching ("equal") files and folders
    const now = Date.now();
    for (const d of decisions) {
      if (d.action === "equal") {
        const existing = this.db.getRecord(d.key);
        if (!existing) {
          this.db.upsertRecord({
            key: d.key,
            isFolder: d.isFolder,
            localSize: d.localEntity?.size ?? 0,
            localMtime: d.localEntity?.mtime ?? now,
            remoteHash: d.remoteEntity?.hash,
            remoteMtime: d.remoteEntity?.mtime,
            remoteSize: d.remoteEntity?.size,
            syncTime: now,
          });
        }
      }
    }

    // Filter decisions requiring changes
    const activeChanges = decisions.filter((d) => d.isChange);
    const totalCount = activeChanges.length;

    // Phase A: Create Folders (Local & Remote)
    const folderCreations = activeChanges.filter(
      (d) =>
        d.action === "create_local_folder" ||
        d.action === "create_remote_folder"
    );
    // Sort shallowest first
    folderCreations.sort((a, b) => a.key.length - b.key.length);

    for (const d of folderCreations) {
      try {
        if (d.action === "create_local_folder") {
          await this.localFs.mkdir(d.key);
        } else if (d.action === "create_remote_folder") {
          await this.driveApi.mkdir(d.key);
        }
        this.db.upsertRecord({
          key: d.key,
          isFolder: true,
          localSize: 0,
          localMtime: Date.now(),
          remoteMtime: Date.now(),
          remoteSize: 0,
          syncTime: Date.now(),
        });
        syncedCount++;
        onProgress?.(syncedCount, totalCount, `Created folder: ${d.key}`, d.key);
      } catch (err: any) {
        errors.push({ key: d.key, error: err.message || String(err) });
      }
    }

    // Phase B: File Transfers (Uploads, Downloads, Conflict resolution)
    const fileOperations = activeChanges.filter(
      (d) =>
        !d.isFolder &&
        d.action !== "delete_local" &&
        d.action !== "delete_remote"
    );

    // Concurrency pool (3 concurrent operations)
    const CONCURRENCY = 3;
    let fileOpIndex = 0;

    const worker = async () => {
      while (fileOpIndex < fileOperations.length) {
        const d = fileOperations[fileOpIndex++];
        try {
          await this.executeFileOperation(d);
          syncedCount++;
          onProgress?.(
            syncedCount,
            totalCount,
            `Synced: ${d.key}`,
            d.key
          );
        } catch (err: any) {
          errors.push({ key: d.key, error: err.message || String(err) });
        }
      }
    };

    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);

    // Phase C: File Deletions
    const fileDeletions = activeChanges.filter(
      (d) =>
        !d.isFolder &&
        (d.action === "delete_local" || d.action === "delete_remote")
    );

    for (const d of fileDeletions) {
      try {
        if (d.action === "delete_local") {
          await this.localFs.deleteFile(d.key);
        } else if (d.action === "delete_remote") {
          await this.driveApi.rm(d.key);
        }
        this.db.deleteRecord(d.key);
        syncedCount++;
        onProgress?.(syncedCount, totalCount, `Deleted: ${d.key}`, d.key);
      } catch (err: any) {
        errors.push({ key: d.key, error: err.message || String(err) });
      }
    }

    // Phase D: Folder Deletions (Deepest first)
    const folderDeletions = activeChanges.filter(
      (d) =>
        d.isFolder &&
        (d.action === "delete_local_folder" ||
          d.action === "delete_remote_folder")
    );
    folderDeletions.sort((a, b) => b.key.length - a.key.length);

    for (const d of folderDeletions) {
      try {
        if (d.action === "delete_local_folder") {
          await this.localFs.deleteFolder(d.key);
        } else if (d.action === "delete_remote_folder") {
          await this.driveApi.rm(d.key);
        }
        this.db.deleteRecord(d.key);
        syncedCount++;
        onProgress?.(syncedCount, totalCount, `Deleted folder: ${d.key}`, d.key);
      } catch (err: any) {
        errors.push({ key: d.key, error: err.message || String(err) });
      }
    }

    // Clean up any stale records from DB that no longer exist
    for (const d of decisions) {
      if (d.action === "skip" && !d.localEntity && !d.remoteEntity) {
        this.db.deleteRecord(d.key);
      }
    }

    // Persist snapshot records
    await this.db.save();

    return { syncedCount, errors };
  }

  private async executeFileOperation(d: SyncDecision): Promise<void> {
    const now = Date.now();

    switch (d.action) {
      case "upload":
      case "conflict_keep_local": {
        const content = await this.localFs.readFile(d.key);
        const uploaded = await this.driveApi.writeFile(
          d.key,
          content,
          d.localEntity?.mtime
        );
        const localStat = await this.localFs.stat(d.key);
        this.db.upsertRecord({
          key: d.key,
          isFolder: false,
          localSize: content.byteLength,
          localMtime: localStat?.mtime ?? d.localEntity?.mtime ?? now,
          remoteHash: uploaded.hash,
          remoteMtime: uploaded.mtime,
          remoteSize: uploaded.size,
          syncTime: now,
        });
        break;
      }

      case "download":
      case "conflict_keep_remote": {
        const content = await this.driveApi.readFile(d.key);
        await this.localFs.writeFile(d.key, content);
        const localStat = await this.localFs.stat(d.key);
        this.db.upsertRecord({
          key: d.key,
          isFolder: false,
          localSize: content.byteLength,
          localMtime: localStat?.mtime ?? now,
          remoteHash: d.remoteEntity?.hash,
          remoteMtime: d.remoteEntity?.mtime,
          remoteSize: d.remoteEntity?.size ?? content.byteLength,
          syncTime: now,
        });
        break;
      }

      case "conflict_keep_newer": {
        if (
          d.localEntity &&
          d.remoteEntity &&
          d.localEntity.mtime >= d.remoteEntity.mtime
        ) {
          const content = await this.localFs.readFile(d.key);
          const uploaded = await this.driveApi.writeFile(
            d.key,
            content,
            d.localEntity.mtime
          );
          const localStat = await this.localFs.stat(d.key);
          this.db.upsertRecord({
            key: d.key,
            isFolder: false,
            localSize: content.byteLength,
            localMtime: localStat?.mtime ?? d.localEntity.mtime,
            remoteHash: uploaded.hash,
            remoteMtime: uploaded.mtime,
            remoteSize: uploaded.size,
            syncTime: now,
          });
        } else {
          const content = await this.driveApi.readFile(d.key);
          await this.localFs.writeFile(d.key, content);
          const localStat = await this.localFs.stat(d.key);
          this.db.upsertRecord({
            key: d.key,
            isFolder: false,
            localSize: content.byteLength,
            localMtime: localStat?.mtime ?? now,
            remoteHash: d.remoteEntity?.hash,
            remoteMtime: d.remoteEntity?.mtime,
            remoteSize: d.remoteEntity?.size ?? content.byteLength,
            syncTime: now,
          });
        }
        break;
      }

      case "conflict_create_copy": {
        // 1. Download remote version as a conflict copy
        const remoteContent = await this.driveApi.readFile(d.key);
        const conflictKey = this.generateConflictPath(d.key);
        await this.localFs.writeFile(conflictKey, remoteContent);
        const conflictStat = await this.localFs.stat(conflictKey);

        // 2. Upload local version as the canonical version
        const localContent = await this.localFs.readFile(d.key);
        const uploaded = await this.driveApi.writeFile(
          d.key,
          localContent,
          d.localEntity?.mtime
        );
        const localStat = await this.localFs.stat(d.key);

        this.db.upsertRecord({
          key: d.key,
          isFolder: false,
          localSize: localContent.byteLength,
          localMtime: localStat?.mtime ?? d.localEntity?.mtime ?? now,
          remoteHash: uploaded.hash,
          remoteMtime: uploaded.mtime,
          remoteSize: uploaded.size,
          syncTime: now,
        });

        // 3. Upload the conflict copy to remote so other devices see both
        const uploadedConflict = await this.driveApi.writeFile(
          conflictKey,
          remoteContent,
          d.remoteEntity?.mtime
        );
        this.db.upsertRecord({
          key: conflictKey,
          isFolder: false,
          localSize: remoteContent.byteLength,
          localMtime: conflictStat?.mtime ?? now,
          remoteHash: uploadedConflict.hash,
          remoteMtime: uploadedConflict.mtime,
          remoteSize: uploadedConflict.size,
          syncTime: now,
        });
        break;
      }

      case "equal": {
        if (d.localEntity) {
          this.db.upsertRecord({
            key: d.key,
            isFolder: false,
            localSize: d.localEntity.size,
            localMtime: d.localEntity.mtime,
            remoteHash: d.remoteEntity?.hash,
            remoteMtime: d.remoteEntity?.mtime,
            remoteSize: d.remoteEntity?.size,
            syncTime: now,
          });
        }
        break;
      }
    }
  }

  private generateConflictPath(originalKey: string): string {
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .replace("T", "_")
      .slice(0, 19);

    const lastDot = originalKey.lastIndexOf(".");
    if (lastDot > 0 && lastDot > originalKey.lastIndexOf("/")) {
      const base = originalKey.substring(0, lastDot);
      const ext = originalKey.substring(lastDot);
      return `${base}.sync-conflict-${timestamp}${ext}`;
    }
    return `${originalKey}.sync-conflict-${timestamp}`;
  }

  private checkSafetyGuard(decisions: SyncDecision[]): void {
    const threshold = this.settings.protectModifyDeletePercentage;
    if (threshold <= 0 || threshold >= 100) {
      return; // Disabled
    }

    const deletionCount = decisions.filter(
      (d) =>
        d.action === "delete_local" ||
        d.action === "delete_remote" ||
        d.action === "delete_local_folder" ||
        d.action === "delete_remote_folder"
    ).length;

    const totalTracked = this.db.count;
    if (totalTracked < 10) {
      return; // Not enough files tracked yet for safety threshold
    }

    const percent = (deletionCount / totalTracked) * 100;
    if (percent > threshold) {
      throw new Error(
        `Safety Guard Abort: This sync run would delete ${deletionCount} items (${percent.toFixed(
          1
        )}% of your vault), which exceeds your safety limit of ${threshold}%. Please check your settings or manually verify.`
      );
    }
  }
}
