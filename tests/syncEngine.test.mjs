// tests/syncEngine.test.ts
import { describe, it, beforeEach } from "node:test";
import * as assert from "node:assert/strict";

// src/md5.ts
function safeAdd(x, y) {
  const lsw = (x & 65535) + (y & 65535);
  const msw = (x >> 16) + (y >> 16) + (lsw >> 16);
  return msw << 16 | lsw & 65535;
}
function bitRotateLeft(num, cnt) {
  return num << cnt | num >>> 32 - cnt;
}
function md5cmn(q, a, b, x, s, t) {
  return safeAdd(bitRotateLeft(safeAdd(safeAdd(a, q), safeAdd(x, t)), s), b);
}
function md5ff(a, b, c, d, x, s, t) {
  return md5cmn(b & c | ~b & d, a, b, x, s, t);
}
function md5gg(a, b, c, d, x, s, t) {
  return md5cmn(b & d | c & ~d, a, b, x, s, t);
}
function md5hh(a, b, c, d, x, s, t) {
  return md5cmn(b ^ c ^ d, a, b, x, s, t);
}
function md5ii(a, b, c, d, x, s, t) {
  return md5cmn(c ^ (b | ~d), a, b, x, s, t);
}
function md5(buffer) {
  const bytes = new Uint8Array(buffer);
  const len = bytes.length;
  const nWords = (len + 8 >> 6) + 1;
  const words = new Int32Array(nWords * 16);
  for (let i = 0; i < len; i++) {
    words[i >> 2] |= bytes[i] << i % 4 * 8;
  }
  words[len >> 2] |= 128 << len % 4 * 8;
  words[nWords * 16 - 2] = len * 8;
  let a = 1732584193;
  let b = -271733879;
  let c = -1732584194;
  let d = 271733878;
  for (let i = 0; i < words.length; i += 16) {
    const olda = a;
    const oldb = b;
    const oldc = c;
    const oldd = d;
    a = md5ff(a, b, c, d, words[i], 7, -680876936);
    d = md5ff(d, a, b, c, words[i + 1], 12, -389564586);
    c = md5ff(c, d, a, b, words[i + 2], 17, 606105819);
    b = md5ff(b, c, d, a, words[i + 3], 22, -1044525330);
    a = md5ff(a, b, c, d, words[i + 4], 7, -176418897);
    d = md5ff(d, a, b, c, words[i + 5], 12, 1200080426);
    c = md5ff(c, d, a, b, words[i + 6], 17, -1473231341);
    b = md5ff(b, c, d, a, words[i + 7], 22, -45705983);
    a = md5ff(a, b, c, d, words[i + 8], 7, 1770035416);
    d = md5ff(d, a, b, c, words[i + 9], 12, -1958414417);
    c = md5ff(c, d, a, b, words[i + 10], 17, -42063);
    b = md5ff(b, c, d, a, words[i + 11], 22, -1990404162);
    a = md5ff(a, b, c, d, words[i + 12], 7, 1804603682);
    d = md5ff(d, a, b, c, words[i + 13], 12, -40341101);
    c = md5ff(c, d, a, b, words[i + 14], 17, -1502002290);
    b = md5ff(b, c, d, a, words[i + 15], 22, 1236535329);
    a = md5gg(a, b, c, d, words[i + 1], 5, -165796510);
    d = md5gg(d, a, b, c, words[i + 6], 9, -1069501632);
    c = md5gg(c, d, a, b, words[i + 11], 14, 643717713);
    b = md5gg(b, c, d, a, words[i], 20, -373897302);
    a = md5gg(a, b, c, d, words[i + 5], 5, -701558691);
    d = md5gg(d, a, b, c, words[i + 10], 9, 38016083);
    c = md5gg(c, d, a, b, words[i + 15], 14, -660478335);
    b = md5gg(b, c, d, a, words[i + 4], 20, -405537848);
    a = md5gg(a, b, c, d, words[i + 9], 5, 568446438);
    d = md5gg(d, a, b, c, words[i + 14], 9, -1019803690);
    c = md5gg(c, d, a, b, words[i + 3], 14, -187363961);
    b = md5gg(b, c, d, a, words[i + 8], 20, 1163531501);
    a = md5gg(a, b, c, d, words[i + 13], 5, -1444681467);
    d = md5gg(d, a, b, c, words[i + 2], 9, -51403784);
    c = md5gg(c, d, a, b, words[i + 7], 14, 1735328473);
    b = md5gg(b, c, d, a, words[i + 12], 20, -1926607734);
    a = md5hh(a, b, c, d, words[i + 5], 4, -378558);
    d = md5hh(d, a, b, c, words[i + 8], 11, -2022574463);
    c = md5hh(c, d, a, b, words[i + 11], 16, 1839030562);
    b = md5hh(b, c, d, a, words[i + 14], 23, -35309556);
    a = md5hh(a, b, c, d, words[i + 1], 4, -1530992060);
    d = md5hh(d, a, b, c, words[i + 4], 11, 1272893353);
    c = md5hh(c, d, a, b, words[i + 7], 16, -155497632);
    b = md5hh(b, c, d, a, words[i + 10], 23, -1094730640);
    a = md5hh(a, b, c, d, words[i + 13], 4, 681279174);
    d = md5hh(d, a, b, c, words[i], 11, -358537222);
    c = md5hh(c, d, a, b, words[i + 3], 16, -722521979);
    b = md5hh(b, c, d, a, words[i + 6], 23, 76029189);
    a = md5hh(a, b, c, d, words[i + 9], 4, -640364487);
    d = md5hh(d, a, b, c, words[i + 12], 11, -421815835);
    c = md5hh(c, d, a, b, words[i + 15], 16, 530742520);
    b = md5hh(b, c, d, a, words[i + 2], 23, -995338651);
    a = md5ii(a, b, c, d, words[i], 6, -198630844);
    d = md5ii(d, a, b, c, words[i + 7], 10, 1126891415);
    c = md5ii(c, d, a, b, words[i + 14], 15, -1416354905);
    b = md5ii(b, c, d, a, words[i + 5], 21, -57434055);
    a = md5ii(a, b, c, d, words[i + 12], 6, 1700485571);
    d = md5ii(d, a, b, c, words[i + 3], 10, -1894986606);
    c = md5ii(c, d, a, b, words[i + 10], 15, -1051523);
    b = md5ii(b, c, d, a, words[i + 1], 21, -2054922799);
    a = md5ii(a, b, c, d, words[i + 8], 6, 1873313359);
    d = md5ii(d, a, b, c, words[i + 15], 10, -30611744);
    c = md5ii(c, d, a, b, words[i + 6], 15, -1560198380);
    b = md5ii(b, c, d, a, words[i + 13], 21, 1309151649);
    a = md5ii(a, b, c, d, words[i + 4], 6, -145523070);
    d = md5ii(d, a, b, c, words[i + 11], 10, -1120210379);
    c = md5ii(c, d, a, b, words[i + 2], 15, 718787259);
    b = md5ii(b, c, d, a, words[i + 9], 21, -343485551);
    a = safeAdd(a, olda);
    b = safeAdd(b, oldb);
    c = safeAdd(c, oldc);
    d = safeAdd(d, oldd);
  }
  const hexChars = "0123456789abcdef";
  let output = "";
  const resultWords = [a, b, c, d];
  for (let i = 0; i < 4; i++) {
    const word = resultWords[i];
    for (let j = 0; j < 4; j++) {
      const byte = word >> j * 8 & 255;
      output += hexChars.charAt(byte >> 4 & 15) + hexChars.charAt(byte & 15);
    }
  }
  return output;
}

// src/syncEngine.ts
var SyncEngine = class {
  constructor(localFs, driveApi, db, settings) {
    this.localFs = localFs;
    this.driveApi = driveApi;
    this.db = db;
    this.settings = settings;
  }
  /**
   * Plans the synchronization actions by comparing local, remote, and previous sync state
   */
  async planSync(localEntities, remoteEntities) {
    const localMap = /* @__PURE__ */ new Map();
    for (const e of localEntities)
      localMap.set(e.key, e);
    const remoteMap = /* @__PURE__ */ new Map();
    for (const e of remoteEntities)
      remoteMap.set(e.key, e);
    const prevMap = this.db.getAllRecords();
    const allKeys = /* @__PURE__ */ new Set([
      ...localMap.keys(),
      ...remoteMap.keys(),
      ...prevMap.keys()
    ]);
    const decisions = [];
    for (const key of allKeys) {
      if (this.localFs.isIgnored(key)) {
        continue;
      }
      const local = localMap.get(key);
      const remote = remoteMap.get(key);
      const prev = prevMap.get(key);
      const isFolder = key.endsWith("/");
      if (!isFolder && !prev && local && remote && local.size === remote.size && remote.hash && !local.hash) {
        try {
          const content = await this.localFs.readFile(key);
          local.hash = md5(content);
        } catch (err) {
          console.warn(`Could not compute MD5 for local file "${key}":`, err);
        }
      }
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
    for (const d of decisions) {
      if (d.isFolder && (d.action === "delete_local_folder" || d.action === "delete_remote_folder")) {
        const folderKey = d.key;
        const hasActiveChildren = decisions.some((child) => {
          if (child.key === folderKey || !child.key.startsWith(folderKey)) {
            return false;
          }
          const isChildDeletion = child.action === "delete_local" || child.action === "delete_remote" || child.action === "delete_local_folder" || child.action === "delete_remote_folder" || child.action === "skip";
          return !isChildDeletion;
        });
        if (hasActiveChildren) {
          if (d.action === "delete_local_folder") {
            d.action = d.remoteEntity ? "equal" : "create_remote_folder";
            d.isChange = !d.remoteEntity;
            d.reason = "Folder deletion cancelled: folder contains active or modified notes";
          } else if (d.action === "delete_remote_folder") {
            d.action = d.localEntity ? "equal" : "create_local_folder";
            d.isChange = !d.localEntity;
            d.reason = "Folder deletion cancelled: folder contains active or modified notes";
          }
        }
      }
    }
    return decisions;
  }
  decideItem(key, isFolder, local, remote, prev, direction = "bidirectional", conflictAction = "keep_newer") {
    if (isFolder) {
      return this.decideFolder(key, local, remote, prev, direction);
    }
    return this.decideFile(key, local, remote, prev, direction, conflictAction);
  }
  decideFolder(key, local, remote, prev, direction = "bidirectional") {
    if (local && remote) {
      return {
        key,
        isFolder: true,
        action: "equal",
        reason: "Folder exists locally and remotely",
        isChange: false
      };
    }
    if (local && !remote) {
      if (prev) {
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
          isChange: true
        };
      } else {
        if (direction === "pull_only") {
          return { key, isFolder: true, action: "skip", reason: "Local folder created; pull only skips", isChange: false };
        }
        return {
          key,
          isFolder: true,
          action: "create_remote_folder",
          localEntity: local,
          reason: "Folder created locally",
          isChange: true
        };
      }
    }
    if (!local && remote) {
      if (prev) {
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
          isChange: true
        };
      } else {
        if (direction === "push_only") {
          return { key, isFolder: true, action: "skip", reason: "Remote folder created; push only skips", isChange: false };
        }
        return {
          key,
          isFolder: true,
          action: "create_local_folder",
          remoteEntity: remote,
          reason: "Folder created on Google Drive",
          isChange: true
        };
      }
    }
    return {
      key,
      isFolder: true,
      action: "skip",
      reason: "Folder no longer exists",
      isChange: false
    };
  }
  decideFile(key, local, remote, prev, direction = "bidirectional", conflictAction = "keep_newer") {
    if (local && remote) {
      const localUnchanged = prev && local.size === prev.localSize && Math.abs(local.mtime - prev.localMtime) <= 1500;
      const remoteUnchanged = prev && (prev.remoteHash && remote.hash ? remote.hash === prev.remoteHash : remote.size === prev.remoteSize && Math.abs(remote.mtime - (prev.remoteMtime ?? 0)) <= 1500);
      if (prev && localUnchanged && remoteUnchanged) {
        return {
          key,
          isFolder: false,
          action: "equal",
          localEntity: local,
          remoteEntity: remote,
          prevRecord: prev,
          reason: "Neither local nor remote file has changed since last sync",
          isChange: false
        };
      }
      const isIdentical = local.size === remote.size && (local.hash && remote.hash && local.hash === remote.hash || Math.abs(local.mtime - remote.mtime) <= 1500);
      if (isIdentical) {
        return {
          key,
          isFolder: false,
          action: "equal",
          localEntity: local,
          remoteEntity: remote,
          prevRecord: prev,
          reason: "File is identical on both sides",
          isChange: false
        };
      }
      if (localUnchanged && !remoteUnchanged) {
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
          isChange: true
        };
      }
      if (!localUnchanged && remoteUnchanged) {
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
          isChange: true
        };
      }
      if (direction === "push_only") {
        return {
          key,
          isFolder: false,
          action: "upload",
          localEntity: local,
          remoteEntity: remote,
          reason: "Push only mode overrides remote conflict",
          isChange: true
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
          isChange: true
        };
      }
      switch (conflictAction) {
        case "keep_remote":
          return {
            key,
            isFolder: false,
            action: "conflict_keep_remote",
            localEntity: local,
            remoteEntity: remote,
            reason: "Conflict: keep remote selected",
            isChange: true
          };
        case "keep_local":
          return {
            key,
            isFolder: false,
            action: "conflict_keep_local",
            localEntity: local,
            remoteEntity: remote,
            reason: "Conflict: keep local selected",
            isChange: true
          };
        case "create_conflict_copy":
          return {
            key,
            isFolder: false,
            action: "conflict_create_copy",
            localEntity: local,
            remoteEntity: remote,
            reason: "Conflict: creating conflict copy",
            isChange: true
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
              isChange: true
            };
          } else {
            return {
              key,
              isFolder: false,
              action: "conflict_keep_newer",
              localEntity: local,
              remoteEntity: remote,
              reason: "Conflict: remote is newer",
              isChange: true
            };
          }
      }
    }
    if (local && !remote) {
      if (prev) {
        const localModifiedSincePrev = local.size !== prev.localSize || Math.abs(local.mtime - prev.localMtime) > 1500;
        if (localModifiedSincePrev) {
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
            isChange: true
          };
        }
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
          isChange: true
        };
      } else {
        if (direction === "pull_only") {
          return { key, isFolder: false, action: "skip", reason: "Created locally; pull only skips", isChange: false };
        }
        return {
          key,
          isFolder: false,
          action: "upload",
          localEntity: local,
          reason: "New local file",
          isChange: true
        };
      }
    }
    if (!local && remote) {
      if (prev) {
        const remoteModifiedSincePrev = prev.remoteHash && remote.hash ? remote.hash !== prev.remoteHash : remote.size !== prev.remoteSize || Math.abs(remote.mtime - (prev.remoteMtime ?? 0)) > 1500;
        if (remoteModifiedSincePrev) {
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
            isChange: true
          };
        }
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
          isChange: true
        };
      } else {
        if (direction === "push_only") {
          return { key, isFolder: false, action: "skip", reason: "Created remotely; push only skips", isChange: false };
        }
        return {
          key,
          isFolder: false,
          action: "download",
          remoteEntity: remote,
          reason: "New file on Google Drive",
          isChange: true
        };
      }
    }
    return {
      key,
      isFolder: false,
      action: "skip",
      reason: "File removed from both sides",
      isChange: false
    };
  }
  /**
   * Executes the synchronized plan
   */
  async executePlan(decisions, onProgress) {
    this.checkSafetyGuard(decisions);
    const errors = [];
    let syncedCount = 0;
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
            syncTime: now
          });
        }
      }
    }
    await this.db.save();
    const activeChanges = decisions.filter((d) => d.isChange);
    const totalCount = activeChanges.length;
    const folderCreations = activeChanges.filter(
      (d) => d.action === "create_local_folder" || d.action === "create_remote_folder"
    );
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
          syncTime: Date.now()
        });
        syncedCount++;
        onProgress?.(syncedCount, totalCount, `Created folder: ${d.key}`, d.key);
      } catch (err) {
        errors.push({ key: d.key, error: err.message || String(err) });
      }
    }
    if (folderCreations.length > 0) {
      await this.db.save();
    }
    const fileOperations = activeChanges.filter(
      (d) => !d.isFolder && d.action !== "delete_local" && d.action !== "delete_remote"
    );
    const CONCURRENCY = 3;
    let fileOpIndex = 0;
    let completedOpsSinceSave = 0;
    const worker = async () => {
      while (fileOpIndex < fileOperations.length) {
        const d = fileOperations[fileOpIndex++];
        try {
          await this.executeFileOperation(d);
          syncedCount++;
          completedOpsSinceSave++;
          if (completedOpsSinceSave >= 5) {
            completedOpsSinceSave = 0;
            await this.db.save();
          }
          onProgress?.(
            syncedCount,
            totalCount,
            `Synced: ${d.key}`,
            d.key
          );
        } catch (err) {
          let errMsg = err.message || String(err);
          if (/[?:*\"<>|]/.test(d.key)) {
            errMsg = 'Filename contains characters not supported on this device (? : * " < > |)';
          }
          errors.push({ key: d.key, error: errMsg });
        }
      }
    };
    const workers = Array.from({ length: CONCURRENCY }, () => worker());
    await Promise.all(workers);
    await this.db.save();
    const fileDeletions = activeChanges.filter(
      (d) => !d.isFolder && (d.action === "delete_local" || d.action === "delete_remote")
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
      } catch (err) {
        errors.push({ key: d.key, error: err.message || String(err) });
      }
    }
    if (fileDeletions.length > 0) {
      await this.db.save();
    }
    const folderDeletions = activeChanges.filter(
      (d) => d.isFolder && (d.action === "delete_local_folder" || d.action === "delete_remote_folder")
    );
    folderDeletions.sort((a, b) => b.key.length - a.key.length);
    for (const d of folderDeletions) {
      try {
        let deleted = false;
        if (d.action === "delete_local_folder") {
          deleted = await this.localFs.deleteFolder(d.key);
        } else if (d.action === "delete_remote_folder") {
          deleted = await this.driveApi.rm(d.key);
        }
        if (deleted) {
          this.db.deleteRecord(d.key);
          syncedCount++;
          onProgress?.(syncedCount, totalCount, `Deleted folder: ${d.key}`, d.key);
        } else {
          console.warn(
            `Folder "${d.key}" was not deleted because it is not empty.`
          );
        }
      } catch (err) {
        errors.push({ key: d.key, error: err.message || String(err) });
      }
    }
    for (const d of decisions) {
      if (d.action === "skip" && !d.localEntity && !d.remoteEntity) {
        this.db.deleteRecord(d.key);
      }
    }
    await this.db.save();
    return { syncedCount, errors };
  }
  /**
   * Uploads a file with mid-upload modification guard (Typing-during-upload bug fix)
   */
  async uploadFileWithGuard(key, forcedMtime) {
    const now = Date.now();
    const statBefore = await this.localFs.stat(key);
    if (!statBefore) {
      return false;
    }
    const content = await this.localFs.readFile(key);
    const mtimeToUse = forcedMtime ?? statBefore.mtime;
    const uploaded = await this.driveApi.writeFile(key, content, mtimeToUse);
    const statAfter = await this.localFs.stat(key);
    const changedMidUpload = !statAfter || statAfter.mtime !== statBefore.mtime || statAfter.size !== statBefore.size;
    if (changedMidUpload) {
      console.warn(
        `File "${key}" was modified during upload. Recording pre-upload snapshot so next sync uploads the mid-upload edit.`
      );
      this.db.upsertRecord({
        key,
        isFolder: false,
        localSize: statBefore.size,
        localMtime: statBefore.mtime,
        remoteHash: uploaded.hash,
        remoteMtime: uploaded.mtime,
        remoteSize: uploaded.size,
        syncTime: now
      });
      return false;
    }
    this.db.upsertRecord({
      key,
      isFolder: false,
      localSize: statBefore.size,
      localMtime: statBefore.mtime,
      remoteHash: uploaded.hash,
      remoteMtime: uploaded.mtime,
      remoteSize: uploaded.size,
      syncTime: now
    });
    return true;
  }
  /**
   * Downloads a file with mid-sync local modification guard
   */
  async downloadFileWithGuard(d) {
    const now = Date.now();
    const statCurrent = await this.localFs.stat(d.key);
    const localModifiedMidSync = statCurrent && d.localEntity && (statCurrent.mtime !== d.localEntity.mtime || statCurrent.size !== d.localEntity.size);
    const localCreatedMidSync = statCurrent && !d.localEntity;
    if (localModifiedMidSync || localCreatedMidSync) {
      console.warn(
        `Local file "${d.key}" changed during sync download. Creating conflict copy.`
      );
      const remoteContent = await this.driveApi.readFile(d.key);
      const conflictKey = this.generateConflictPath(d.key);
      await this.localFs.writeFile(conflictKey, remoteContent);
      const conflictStat = await this.localFs.stat(conflictKey);
      this.db.upsertRecord({
        key: conflictKey,
        isFolder: false,
        localSize: remoteContent.byteLength,
        localMtime: conflictStat?.mtime ?? now,
        remoteHash: d.remoteEntity?.hash,
        remoteMtime: d.remoteEntity?.mtime,
        remoteSize: d.remoteEntity?.size ?? remoteContent.byteLength,
        syncTime: now
      });
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
        syncTime: now
      });
      return;
    }
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
      syncTime: now
    });
  }
  async executeFileOperation(d) {
    const now = Date.now();
    switch (d.action) {
      case "upload":
      case "conflict_keep_local": {
        await this.uploadFileWithGuard(d.key, d.localEntity?.mtime);
        break;
      }
      case "download":
      case "conflict_keep_remote": {
        await this.downloadFileWithGuard(d);
        break;
      }
      case "conflict_keep_newer": {
        if (d.localEntity && d.remoteEntity && d.localEntity.mtime >= d.remoteEntity.mtime) {
          await this.uploadFileWithGuard(d.key, d.localEntity.mtime);
        } else {
          await this.downloadFileWithGuard(d);
        }
        break;
      }
      case "conflict_create_copy": {
        const remoteContent = await this.driveApi.readFile(d.key);
        const conflictKey = this.generateConflictPath(d.key);
        await this.localFs.writeFile(conflictKey, remoteContent);
        const conflictStat = await this.localFs.stat(conflictKey);
        await this.uploadFileWithGuard(d.key, d.localEntity?.mtime);
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
          syncTime: now
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
            syncTime: now
          });
        }
        break;
      }
    }
  }
  generateConflictPath(originalKey) {
    const timestamp = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-").replace("T", "_").slice(0, 19);
    const lastDot = originalKey.lastIndexOf(".");
    if (lastDot > 0 && lastDot > originalKey.lastIndexOf("/")) {
      const base = originalKey.substring(0, lastDot);
      const ext = originalKey.substring(lastDot);
      return `${base}.sync-conflict-${timestamp}${ext}`;
    }
    return `${originalKey}.sync-conflict-${timestamp}`;
  }
  checkSafetyGuard(decisions) {
    const threshold = this.settings.protectModifyDeletePercentage;
    if (threshold <= 0 || threshold >= 100) {
      return;
    }
    const deletionCount = decisions.filter(
      (d) => d.action === "delete_local" || d.action === "delete_remote" || d.action === "delete_local_folder" || d.action === "delete_remote_folder"
    ).length;
    const totalTracked = this.db.count;
    if (totalTracked < 10) {
      return;
    }
    const percent = deletionCount / totalTracked * 100;
    if (percent > threshold) {
      throw new Error(
        `Safety Guard Abort: This sync run would delete ${deletionCount} items (${percent.toFixed(
          1
        )}% of your vault), which exceeds your safety limit of ${threshold}%. Please check your settings or manually verify.`
      );
    }
  }
};

// src/types.ts
var DEFAULT_SETTINGS = {
  googleDrive: {
    clientId: "",
    clientSecret: "",
    refreshToken: "",
    accessToken: "",
    accessTokenExpiresAtMs: 0,
    scope: "https://www.googleapis.com/auth/drive.file"
  },
  remoteVaultDir: "",
  syncDirection: "bidirectional",
  conflictAction: "create_conflict_copy",
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
    "~\\$"
  ],
  lastSyncTime: 0,
  lastSyncStatus: "idle",
  lastSyncError: ""
};

// tests/syncEngine.test.ts
var MockLocalFs = class {
  constructor() {
    this.files = /* @__PURE__ */ new Map();
    this.folders = /* @__PURE__ */ new Set();
    this.ignoredPatterns = [];
  }
  isIgnored(key) {
    return this.ignoredPatterns.some((re) => re.test(key));
  }
  async readFile(key) {
    const file = this.files.get(key);
    if (!file)
      throw new Error(`Local file not found: ${key}`);
    return file.content;
  }
  async writeFile(key, data) {
    const parent = key.substring(0, key.lastIndexOf("/") + 1);
    if (parent)
      this.folders.add(parent);
    this.files.set(key, {
      content: data,
      mtime: Date.now(),
      size: data.byteLength
    });
  }
  async mkdir(key) {
    const clean = key.endsWith("/") ? key : `${key}/`;
    this.folders.add(clean);
  }
  async deleteFile(key) {
    this.files.delete(key);
  }
  async isFolderEmpty(key) {
    const clean = key.endsWith("/") ? key : `${key}/`;
    for (const f of this.files.keys()) {
      if (f.startsWith(clean))
        return false;
    }
    for (const sub of this.folders) {
      if (sub !== clean && sub.startsWith(clean))
        return false;
    }
    return true;
  }
  async deleteFolder(key) {
    const clean = key.endsWith("/") ? key : `${key}/`;
    if (!await this.isFolderEmpty(clean)) {
      return false;
    }
    this.folders.delete(clean);
    return true;
  }
  async stat(key) {
    if (key.endsWith("/")) {
      if (this.folders.has(key)) {
        return { key, isFolder: true, size: 0, mtime: Date.now() };
      }
      return null;
    }
    const file = this.files.get(key);
    if (!file)
      return null;
    return {
      key,
      isFolder: false,
      size: file.size,
      mtime: file.mtime
    };
  }
};
var MockDriveApi = class {
  constructor() {
    this.files = /* @__PURE__ */ new Map();
    this.folders = /* @__PURE__ */ new Set();
  }
  clearCache() {
  }
  async readFile(key) {
    const file = this.files.get(key);
    if (!file)
      throw new Error(`Remote file not found: ${key}`);
    return file.content;
  }
  async writeFile(key, content, mtime) {
    const hash = md5(content);
    const m = mtime ?? Date.now();
    this.files.set(key, { content, mtime: m, size: content.byteLength, hash });
    return {
      key,
      isFolder: false,
      size: content.byteLength,
      mtime: m,
      hash,
      id: `drive-${key}`
    };
  }
  async mkdir(key) {
    const clean = key.endsWith("/") ? key : `${key}/`;
    this.folders.add(clean);
    return {
      key: clean,
      isFolder: true,
      size: 0,
      mtime: Date.now(),
      id: `drive-${clean}`
    };
  }
  async isFolderEmpty(key) {
    const clean = key.endsWith("/") ? key : `${key}/`;
    for (const f of this.files.keys()) {
      if (f.startsWith(clean))
        return false;
    }
    for (const sub of this.folders) {
      if (sub !== clean && sub.startsWith(clean))
        return false;
    }
    return true;
  }
  async rm(key) {
    if (key.endsWith("/")) {
      if (!await this.isFolderEmpty(key))
        return false;
      this.folders.delete(key);
      return true;
    }
    this.files.delete(key);
    return true;
  }
};
var MockLocalDb = class {
  constructor() {
    this.records = /* @__PURE__ */ new Map();
    this.saveCount = 0;
  }
  getRecord(key) {
    return this.records.get(key);
  }
  getAllRecords() {
    return new Map(this.records);
  }
  upsertRecord(record) {
    this.records.set(record.key, record);
  }
  deleteRecord(key) {
    this.records.delete(key);
  }
  async save() {
    this.saveCount++;
  }
  get count() {
    return this.records.size;
  }
};
function stringToBuffer(str) {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}
describe("SyncEngine Real Code Tests", () => {
  let localFs;
  let driveApi;
  let db;
  let settings;
  beforeEach(() => {
    localFs = new MockLocalFs();
    driveApi = new MockDriveApi();
    db = new MockLocalDb();
    settings = {
      ...DEFAULT_SETTINGS,
      conflictAction: "create_conflict_copy"
    };
  });
  describe("Folder Delete Bug Scenarios", () => {
    it("Scenario 1: A deletes folder F while B edits F/f.md -> edit beats folder delete", async () => {
      const bufOriginal = stringToBuffer("Original Content");
      const bufEdited = stringToBuffer("Edited Content By B");
      localFs.folders.add("F/");
      localFs.files.set("F/f.md", {
        content: bufEdited,
        mtime: 2e3,
        size: bufEdited.byteLength
      });
      db.upsertRecord({
        key: "F/",
        isFolder: true,
        localSize: 0,
        localMtime: 1e3,
        syncTime: 1e3
      });
      db.upsertRecord({
        key: "F/f.md",
        isFolder: false,
        localSize: bufOriginal.byteLength,
        localMtime: 1e3,
        remoteHash: md5(bufOriginal),
        syncTime: 1e3
      });
      const localEntities = [
        { key: "F/", isFolder: true, size: 0, mtime: 1e3 },
        { key: "F/f.md", isFolder: false, size: bufEdited.byteLength, mtime: 2e3 }
      ];
      const remoteEntities = [];
      const engine = new SyncEngine(localFs, driveApi, db, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);
      const fileDec = decisions.find((d) => d.key === "F/f.md");
      const folderDec = decisions.find((d) => d.key === "F/");
      assert.ok(fileDec, "File decision should exist");
      assert.equal(fileDec.action, "upload", "Edited file must win and be planned for upload");
      assert.ok(folderDec, "Folder decision should exist");
      assert.notEqual(
        folderDec.action,
        "delete_local_folder",
        "Folder must NOT be deleted locally because it contains an edited file"
      );
      assert.equal(
        folderDec.action,
        "create_remote_folder",
        "Folder must be recreated on Drive to contain the uploaded file"
      );
      await engine.executePlan(decisions);
      assert.ok(localFs.files.has("F/f.md"), "Local file must remain intact");
      assert.ok(localFs.folders.has("F/"), "Local folder must remain intact");
      assert.ok(driveApi.folders.has("F/"), "Remote folder must be created");
      assert.ok(driveApi.files.has("F/f.md"), "Remote file must be uploaded");
    });
    it("Scenario 2: A deletes folder F locally after B added F/new.md remotely -> new note saved", async () => {
      const bufNew = stringToBuffer("New Note Added By B");
      driveApi.folders.add("F/");
      driveApi.files.set("F/new.md", {
        content: bufNew,
        mtime: 2e3,
        size: bufNew.byteLength,
        hash: md5(bufNew)
      });
      db.upsertRecord({
        key: "F/",
        isFolder: true,
        localSize: 0,
        localMtime: 1e3,
        syncTime: 1e3
      });
      const localEntities = [];
      const remoteEntities = [
        { key: "F/", isFolder: true, size: 0, mtime: 1e3 },
        { key: "F/new.md", isFolder: false, size: bufNew.byteLength, mtime: 2e3, hash: md5(bufNew) }
      ];
      const engine = new SyncEngine(localFs, driveApi, db, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);
      const fileDec = decisions.find((d) => d.key === "F/new.md");
      const folderDec = decisions.find((d) => d.key === "F/");
      assert.ok(fileDec);
      assert.equal(fileDec.action, "download", "New remote note must be downloaded");
      assert.ok(folderDec);
      assert.notEqual(
        folderDec.action,
        "delete_remote_folder",
        "Remote folder F/ must NOT be deleted because it contains the new note"
      );
      assert.equal(
        folderDec.action,
        "create_local_folder",
        "Folder F/ must be recreated locally for the downloaded note"
      );
      await engine.executePlan(decisions);
      assert.ok(driveApi.folders.has("F/"), "Remote folder must remain on Drive");
      assert.ok(localFs.folders.has("F/"), "Local folder must be created");
      assert.ok(localFs.files.has("F/new.md"), "Local note must be downloaded");
    });
    it("Legitimate folder deletion: empty folder is deleted", async () => {
      localFs.folders.add("OldEmpty/");
      db.upsertRecord({
        key: "OldEmpty/",
        isFolder: true,
        localSize: 0,
        localMtime: 1e3,
        syncTime: 1e3
      });
      const localEntities = [{ key: "OldEmpty/", isFolder: true, size: 0, mtime: 1e3 }];
      const remoteEntities = [];
      const engine = new SyncEngine(localFs, driveApi, db, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);
      const folderDec = decisions.find((d) => d.key === "OldEmpty/");
      assert.ok(folderDec);
      assert.equal(folderDec.action, "delete_local_folder");
      await engine.executePlan(decisions);
      assert.equal(localFs.folders.has("OldEmpty/"), false, "Empty folder should be deleted");
      assert.equal(db.getRecord("OldEmpty/"), void 0, "DB record should be removed");
    });
  });
  describe("Problem A: Typing-During-Upload and Download Overwrite Guards", () => {
    it("Upload guard: detects mid-upload edit and defers snapshot to prevent data loss", async () => {
      const initialText = "Initial content";
      const initialBuf = stringToBuffer(initialText);
      const key = "Doc.md";
      localFs.files.set(key, {
        content: initialBuf,
        mtime: 1e3,
        size: initialBuf.byteLength
      });
      const localEntities = [
        { key, isFolder: false, size: initialBuf.byteLength, mtime: 1e3 }
      ];
      const remoteEntities = [];
      const engine = new SyncEngine(localFs, driveApi, db, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);
      const originalReadFile = localFs.readFile.bind(localFs);
      localFs.readFile = async (k) => {
        const res = await originalReadFile(k);
        const editedBuf = stringToBuffer("Initial content with mid-upload typing!");
        localFs.files.set(key, {
          content: editedBuf,
          mtime: 2500,
          // new mtime
          size: editedBuf.byteLength
        });
        return res;
      };
      await engine.executePlan(decisions);
      const record = db.getRecord(key);
      assert.ok(record, "Record should exist with pre-upload stat");
      assert.equal(
        record.localMtime,
        1e3,
        "Record must keep the old mtime (1000) instead of the new mid-upload mtime (2500)"
      );
      const newLocalEntities = [await localFs.stat(key)];
      const newRemoteEntities = [
        { key, isFolder: false, size: initialBuf.byteLength, mtime: 1e3, hash: md5(initialBuf) }
      ];
      const nextDecisions = await engine.planSync(newLocalEntities, newRemoteEntities);
      const nextOp = nextDecisions.find((d) => d.key === key);
      assert.ok(nextOp);
      assert.equal(nextOp.action, "upload", "Next sync must upload the mid-upload edit");
    });
    it("Download guard: creates conflict copy if local file changed while sync was running", async () => {
      const key = "Notes/today.md";
      const initialLocalBuf = stringToBuffer("Local initial draft");
      const remoteBuf = stringToBuffer("Remote modified version");
      localFs.files.set(key, {
        content: initialLocalBuf,
        mtime: 1e3,
        size: initialLocalBuf.byteLength
      });
      db.upsertRecord({
        key,
        isFolder: false,
        localSize: initialLocalBuf.byteLength,
        localMtime: 1e3,
        remoteHash: "old-hash",
        syncTime: 1e3
      });
      driveApi.files.set(key, {
        content: remoteBuf,
        mtime: 3e3,
        size: remoteBuf.byteLength,
        hash: md5(remoteBuf)
      });
      const localEntities = [
        { key, isFolder: false, size: initialLocalBuf.byteLength, mtime: 1e3 }
      ];
      const remoteEntities = [
        { key, isFolder: false, size: remoteBuf.byteLength, mtime: 3e3, hash: md5(remoteBuf) }
      ];
      const engine = new SyncEngine(localFs, driveApi, db, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);
      assert.equal(decisions[0].action, "download");
      localFs.files.set(key, {
        content: stringToBuffer("User typed important words!"),
        mtime: 4e3,
        size: stringToBuffer("User typed important words!").byteLength
      });
      await engine.executePlan(decisions);
      const localCurrent = localFs.files.get(key);
      const decoder = new TextDecoder();
      assert.equal(
        decoder.decode(localCurrent?.content),
        "User typed important words!",
        "Local edits must not be overwritten by download"
      );
      let conflictFileFound = false;
      for (const k of localFs.files.keys()) {
        if (k.includes(".sync-conflict-")) {
          conflictFileFound = true;
          break;
        }
      }
      assert.ok(conflictFileFound, "A conflict copy must be created when local file changed mid-sync");
    });
  });
  describe("Problem B: First-Sync Checksum Comparison", () => {
    it("Matches identical files with same size via MD5, preventing false conflict copies", async () => {
      const text = "Identical notes across both devices";
      const buf = stringToBuffer(text);
      const key = "Notes/welcome.md";
      const hash = md5(buf);
      localFs.files.set(key, { content: buf, mtime: 1e3, size: buf.byteLength });
      driveApi.files.set(key, { content: buf, mtime: 5e3, size: buf.byteLength, hash });
      const localEntities = [
        { key, isFolder: false, size: buf.byteLength, mtime: 1e3 }
      ];
      const remoteEntities = [
        { key, isFolder: false, size: buf.byteLength, mtime: 5e3, hash }
      ];
      const engine = new SyncEngine(localFs, driveApi, db, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);
      const dec = decisions.find((d) => d.key === key);
      assert.ok(dec);
      assert.equal(
        dec.action,
        "equal",
        "First-sync comparison must match identical files as equal instead of conflict"
      );
      assert.equal(dec.isChange, false);
      await engine.executePlan(decisions);
      const rec = db.getRecord(key);
      assert.ok(rec);
      assert.equal(rec.remoteHash, hash);
      for (const k of localFs.files.keys()) {
        assert.equal(k.includes(".sync-conflict-"), false);
      }
    });
  });
  describe("Incremental Database Saves", () => {
    it("Saves DB snapshot incrementally during sync operations", async () => {
      for (let i = 1; i <= 6; i++) {
        const buf = stringToBuffer(`Note content ${i}`);
        localFs.files.set(`note${i}.md`, { content: buf, mtime: 1e3, size: buf.byteLength });
      }
      const localEntities = await Promise.all(
        Array.from({ length: 6 }, (_, i) => localFs.stat(`note${i + 1}.md`))
      );
      const remoteEntities = [];
      const engine = new SyncEngine(localFs, driveApi, db, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);
      await engine.executePlan(decisions);
      assert.ok(db.saveCount >= 2, `db.save() should be called incrementally (called ${db.saveCount} times)`);
    });
  });
  describe("File Reconciliation & Edit-Beats-Delete", () => {
    it("Local edit beats remote delete", async () => {
      const key = "file.md";
      const bufOriginal = stringToBuffer("Original");
      const bufEdited = stringToBuffer("Local Edit");
      localFs.files.set(key, { content: bufEdited, mtime: 2e3, size: bufEdited.byteLength });
      db.upsertRecord({
        key,
        isFolder: false,
        localSize: bufOriginal.byteLength,
        localMtime: 1e3,
        syncTime: 1e3
      });
      const localEntities = [{ key, isFolder: false, size: bufEdited.byteLength, mtime: 2e3 }];
      const remoteEntities = [];
      const engine = new SyncEngine(localFs, driveApi, db, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);
      const dec = decisions.find((d) => d.key === key);
      assert.ok(dec);
      assert.equal(dec.action, "upload", "Local edit must win over remote deletion");
    });
    it("Remote edit beats local delete", async () => {
      const key = "file.md";
      const bufOriginal = stringToBuffer("Original");
      const bufEdited = stringToBuffer("Remote Edit");
      driveApi.files.set(key, {
        content: bufEdited,
        mtime: 2e3,
        size: bufEdited.byteLength,
        hash: md5(bufEdited)
      });
      db.upsertRecord({
        key,
        isFolder: false,
        localSize: bufOriginal.byteLength,
        localMtime: 1e3,
        remoteHash: md5(bufOriginal),
        syncTime: 1e3
      });
      const localEntities = [];
      const remoteEntities = [
        { key, isFolder: false, size: bufEdited.byteLength, mtime: 2e3, hash: md5(bufEdited) }
      ];
      const engine = new SyncEngine(localFs, driveApi, db, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);
      const dec = decisions.find((d) => d.key === key);
      assert.ok(dec);
      assert.equal(dec.action, "download", "Remote edit must win over local deletion");
    });
    it("Accidental mass deletion safety guard halts execution", async () => {
      for (let i = 0; i < 20; i++) {
        db.upsertRecord({
          key: `note${i}.md`,
          isFolder: false,
          localSize: 10,
          localMtime: 1e3,
          syncTime: 1e3
        });
      }
      const decisions = [];
      for (let i = 0; i < 10; i++) {
        decisions.push({
          key: `note${i}.md`,
          isFolder: false,
          action: "delete_local",
          isChange: true,
          reason: "Deleted on remote"
        });
      }
      const engine = new SyncEngine(localFs, driveApi, db, settings);
      await assert.rejects(
        async () => {
          await engine.executePlan(decisions);
        },
        /Safety Guard Abort/
      );
    });
  });
});
