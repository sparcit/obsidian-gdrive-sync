import { describe, it } from "node:test";
import assert from "node:assert/strict";

// Mock implementation of SyncEngine's decision logic for isolated testing
class TestSyncDecider {
  constructor(settings = {}) {
    this.settings = {
      syncDirection: "bidirectional",
      conflictAction: "keep_newer",
      protectModifyDeletePercentage: 25,
      ...settings,
    };
  }

  decideFile(key, local, remote, prev) {
    const direction = this.settings.syncDirection;
    const conflictAction = this.settings.conflictAction;

    if (local && remote) {
      const isIdentical =
        local.size === remote.size &&
        (Math.abs(local.mtime - remote.mtime) <= 1500 ||
          (local.hash && remote.hash && local.hash === remote.hash));

      if (isIdentical) {
        return { key, action: "equal", isChange: false };
      }

      const localUnchanged =
        prev &&
        local.size === prev.size &&
        Math.abs(local.mtime - prev.mtime) <= 1500;

      const remoteUnchanged =
        prev &&
        remote.size === prev.size &&
        (Math.abs(remote.mtime - prev.mtime) <= 1500 ||
          (prev.hash && remote.hash && prev.hash === remote.hash));

      if (localUnchanged && !remoteUnchanged) {
        if (direction === "push_only") return { key, action: "skip", isChange: false };
        return { key, action: "download", isChange: true };
      }

      if (!localUnchanged && remoteUnchanged) {
        if (direction === "pull_only") return { key, action: "skip", isChange: false };
        return { key, action: "upload", isChange: true };
      }

      // Conflict
      if (direction === "push_only") return { key, action: "upload", isChange: true };
      if (direction === "pull_only") return { key, action: "download", isChange: true };

      switch (conflictAction) {
        case "keep_remote":
          return { key, action: "conflict_keep_remote", isChange: true };
        case "keep_local":
          return { key, action: "conflict_keep_local", isChange: true };
        case "create_conflict_copy":
          return { key, action: "conflict_create_copy", isChange: true };
        case "keep_newer":
        default:
          return { key, action: "conflict_keep_newer", isChange: true };
      }
    }

    if (local && !remote) {
      if (prev) {
        if (direction === "push_only") return { key, action: "skip", isChange: false };
        return { key, action: "delete_local", isChange: true };
      } else {
        if (direction === "pull_only") return { key, action: "skip", isChange: false };
        return { key, action: "upload", isChange: true };
      }
    }

    if (!local && remote) {
      if (prev) {
        if (direction === "pull_only") return { key, action: "skip", isChange: false };
        return { key, action: "delete_remote", isChange: true };
      } else {
        if (direction === "push_only") return { key, action: "skip", isChange: false };
        return { key, action: "download", isChange: true };
      }
    }

    return { key, action: "skip", isChange: false };
  }

  decideFolder(key, local, remote, prev) {
    const direction = this.settings.syncDirection;
    if (local && remote) {
      return { key, action: "equal", isChange: false };
    }
    if (local && !remote) {
      if (prev) {
        if (direction === "push_only") return { key, action: "skip", isChange: false };
        return { key, action: "delete_local_folder", isChange: true };
      }
      if (direction === "pull_only") return { key, action: "skip", isChange: false };
      return { key, action: "create_remote_folder", isChange: true };
    }
    if (!local && remote) {
      if (prev) {
        if (direction === "pull_only") return { key, action: "skip", isChange: false };
        return { key, action: "delete_remote_folder", isChange: true };
      }
      if (direction === "push_only") return { key, action: "skip", isChange: false };
      return { key, action: "create_local_folder", isChange: true };
    }
    return { key, action: "skip", isChange: false };
  }
}

describe("Sync Reconciliation Matrix", () => {
  const decider = new TestSyncDecider();

  it("should upload newly created local file", () => {
    const local = { key: "note.md", size: 100, mtime: 1000 };
    const res = decider.decideFile("note.md", local, undefined, undefined);
    assert.equal(res.action, "upload");
    assert.equal(res.isChange, true);
  });

  it("should download newly created remote file", () => {
    const remote = { key: "remote.md", size: 200, mtime: 1500 };
    const res = decider.decideFile("remote.md", undefined, remote, undefined);
    assert.equal(res.action, "download");
    assert.equal(res.isChange, true);
  });

  it("should detect identical files and do nothing", () => {
    const local = { key: "same.md", size: 300, mtime: 2000, hash: "abc" };
    const remote = { key: "same.md", size: 300, mtime: 2000, hash: "abc" };
    const res = decider.decideFile("same.md", local, remote, undefined);
    assert.equal(res.action, "equal");
    assert.equal(res.isChange, false);
  });

  it("should upload when local file was modified since last sync", () => {
    const prev = { key: "note.md", size: 100, mtime: 1000 };
    const remote = { key: "note.md", size: 100, mtime: 1000 };
    const local = { key: "note.md", size: 150, mtime: 2000 }; // local edited

    const res = decider.decideFile("note.md", local, remote, prev);
    assert.equal(res.action, "upload");
    assert.equal(res.isChange, true);
  });

  it("should download when remote file was modified since last sync", () => {
    const prev = { key: "note.md", size: 100, mtime: 1000 };
    const local = { key: "note.md", size: 100, mtime: 1000 };
    const remote = { key: "note.md", size: 180, mtime: 2500 }; // remote edited

    const res = decider.decideFile("note.md", local, remote, prev);
    assert.equal(res.action, "download");
    assert.equal(res.isChange, true);
  });

  it("should delete locally when file was deleted on Google Drive", () => {
    const prev = { key: "deleted_on_drive.md", size: 100, mtime: 1000 };
    const local = { key: "deleted_on_drive.md", size: 100, mtime: 1000 };

    const res = decider.decideFile("deleted_on_drive.md", local, undefined, prev);
    assert.equal(res.action, "delete_local");
    assert.equal(res.isChange, true);
  });

  it("should delete on Google Drive when file was deleted locally", () => {
    const prev = { key: "deleted_locally.md", size: 100, mtime: 1000 };
    const remote = { key: "deleted_locally.md", size: 100, mtime: 1000 };

    const res = decider.decideFile("deleted_locally.md", undefined, remote, prev);
    assert.equal(res.action, "delete_remote");
    assert.equal(res.isChange, true);
  });

  it("should resolve conflict with conflict_create_copy", () => {
    const copyDecider = new TestSyncDecider({ conflictAction: "create_conflict_copy" });
    const prev = { key: "conflict.md", size: 100, mtime: 1000 };
    const local = { key: "conflict.md", size: 120, mtime: 1500 };
    const remote = { key: "conflict.md", size: 130, mtime: 1600 };

    const res = copyDecider.decideFile("conflict.md", local, remote, prev);
    assert.equal(res.action, "conflict_create_copy");
    assert.equal(res.isChange, true);
  });

  it("should handle folder creation locally -> create remote folder", () => {
    const local = { key: "NewFolder/", isFolder: true };
    const res = decider.decideFolder("NewFolder/", local, undefined, undefined);
    assert.equal(res.action, "create_remote_folder");
    assert.equal(res.isChange, true);
  });

  it("should handle folder deletion on remote -> delete local folder", () => {
    const prev = { key: "OldFolder/", isFolder: true };
    const local = { key: "OldFolder/", isFolder: true };
    const res = decider.decideFolder("OldFolder/", local, undefined, prev);
    assert.equal(res.action, "delete_local_folder");
    assert.equal(res.isChange, true);
  });
});
