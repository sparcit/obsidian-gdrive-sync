import { describe, it, beforeEach } from "node:test";
import * as assert from "node:assert/strict";
import { SyncEngine } from "../src/syncEngine";
import { md5 } from "../src/md5";
import { DEFAULT_SETTINGS, type FsEntity, type PluginSettings, type SyncRecord } from "../src/types";

// In-memory test mock for FsLocal
class MockLocalFs {
  public files = new Map<string, { content: ArrayBuffer; mtime: number; size: number }>();
  public folders = new Set<string>();
  public ignoredPatterns: RegExp[] = [];

  public isIgnored(key: string): boolean {
    return this.ignoredPatterns.some((re) => re.test(key));
  }

  public async readFile(key: string): Promise<ArrayBuffer> {
    const file = this.files.get(key);
    if (!file) throw new Error(`Local file not found: ${key}`);
    return file.content;
  }

  public async writeFile(key: string, data: ArrayBuffer): Promise<void> {
    const parent = key.substring(0, key.lastIndexOf("/") + 1);
    if (parent) this.folders.add(parent);
    this.files.set(key, {
      content: data,
      mtime: Date.now(),
      size: data.byteLength,
    });
  }

  public async mkdir(key: string): Promise<void> {
    const clean = key.endsWith("/") ? key : `${key}/`;
    this.folders.add(clean);
  }

  public async deleteFile(key: string): Promise<void> {
    this.files.delete(key);
  }

  public async isFolderEmpty(key: string): Promise<boolean> {
    const clean = key.endsWith("/") ? key : `${key}/`;
    for (const f of this.files.keys()) {
      if (f.startsWith(clean)) return false;
    }
    for (const sub of this.folders) {
      if (sub !== clean && sub.startsWith(clean)) return false;
    }
    return true;
  }

  public async deleteFolder(key: string): Promise<boolean> {
    const clean = key.endsWith("/") ? key : `${key}/`;
    if (!(await this.isFolderEmpty(clean))) {
      return false;
    }
    this.folders.delete(clean);
    return true;
  }

  public async stat(key: string): Promise<FsEntity | null> {
    if (key.endsWith("/")) {
      if (this.folders.has(key)) {
        return { key, isFolder: true, size: 0, mtime: Date.now() };
      }
      return null;
    }
    const file = this.files.get(key);
    if (!file) return null;
    return {
      key,
      isFolder: false,
      size: file.size,
      mtime: file.mtime,
    };
  }
}

// In-memory test mock for GoogleDriveApi
class MockDriveApi {
  public files = new Map<string, { content: ArrayBuffer; mtime: number; size: number; hash: string }>();
  public folders = new Set<string>();

  public clearCache(): void {}

  public async readFile(key: string): Promise<ArrayBuffer> {
    const file = this.files.get(key);
    if (!file) throw new Error(`Remote file not found: ${key}`);
    return file.content;
  }

  public async writeFile(key: string, content: ArrayBuffer, mtime?: number): Promise<FsEntity> {
    const hash = md5(content);
    const m = mtime ?? Date.now();
    this.files.set(key, { content, mtime: m, size: content.byteLength, hash });
    return {
      key,
      isFolder: false,
      size: content.byteLength,
      mtime: m,
      hash,
      id: `drive-${key}`,
    };
  }

  public async mkdir(key: string): Promise<FsEntity> {
    const clean = key.endsWith("/") ? key : `${key}/`;
    this.folders.add(clean);
    return {
      key: clean,
      isFolder: true,
      size: 0,
      mtime: Date.now(),
      id: `drive-${clean}`,
    };
  }

  public async isFolderEmpty(key: string): Promise<boolean> {
    const clean = key.endsWith("/") ? key : `${key}/`;
    for (const f of this.files.keys()) {
      if (f.startsWith(clean)) return false;
    }
    for (const sub of this.folders) {
      if (sub !== clean && sub.startsWith(clean)) return false;
    }
    return true;
  }

  public async rm(key: string): Promise<boolean> {
    if (key.endsWith("/")) {
      if (!(await this.isFolderEmpty(key))) return false;
      this.folders.delete(key);
      return true;
    }
    this.files.delete(key);
    return true;
  }
}

// In-memory test mock for LocalDb
class MockLocalDb {
  public records = new Map<string, SyncRecord>();
  public saveCount = 0;

  public getRecord(key: string): SyncRecord | undefined {
    return this.records.get(key);
  }

  public getAllRecords(): Map<string, SyncRecord> {
    return new Map(this.records);
  }

  public upsertRecord(record: SyncRecord): void {
    this.records.set(record.key, record);
  }

  public deleteRecord(key: string): void {
    this.records.delete(key);
  }

  public async save(): Promise<void> {
    this.saveCount++;
  }

  public get count(): number {
    return this.records.size;
  }
}

function stringToBuffer(str: string): ArrayBuffer {
  const encoder = new TextEncoder();
  return encoder.encode(str).buffer;
}

describe("SyncEngine Real Code Tests", () => {
  let localFs: MockLocalFs;
  let driveApi: MockDriveApi;
  let db: MockLocalDb;
  let settings: PluginSettings;

  beforeEach(() => {
    localFs = new MockLocalFs();
    driveApi = new MockDriveApi();
    db = new MockLocalDb();
    settings = {
      ...DEFAULT_SETTINGS,
      conflictAction: "create_conflict_copy",
    };
  });

  describe("Folder Delete Bug Scenarios", () => {
    it("Scenario 1: A deletes folder F while B edits F/f.md -> edit beats folder delete", async () => {
      // Setup initial state: F/ and F/f.md were previously synced
      const bufOriginal = stringToBuffer("Original Content");
      const bufEdited = stringToBuffer("Edited Content By B");

      localFs.folders.add("F/");
      localFs.files.set("F/f.md", {
        content: bufEdited,
        mtime: 2000,
        size: bufEdited.byteLength,
      });

      // DB has record of previous sync when it was at mtime 1000
      db.upsertRecord({
        key: "F/",
        isFolder: true,
        localSize: 0,
        localMtime: 1000,
        syncTime: 1000,
      });
      db.upsertRecord({
        key: "F/f.md",
        isFolder: false,
        localSize: bufOriginal.byteLength,
        localMtime: 1000,
        remoteHash: md5(bufOriginal),
        syncTime: 1000,
      });

      // On Drive: A deleted F/ and F/f.md (empty remote entities)
      const localEntities: FsEntity[] = [
        { key: "F/", isFolder: true, size: 0, mtime: 1000 },
        { key: "F/f.md", isFolder: false, size: bufEdited.byteLength, mtime: 2000 },
      ];
      const remoteEntities: FsEntity[] = [];

      const engine = new SyncEngine(localFs as any, driveApi as any, db as any, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);

      // Verify planning:
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

      // Execute plan
      await engine.executePlan(decisions);

      // Verify execution: local files must NOT be deleted, and remote folder + file must exist
      assert.ok(localFs.files.has("F/f.md"), "Local file must remain intact");
      assert.ok(localFs.folders.has("F/"), "Local folder must remain intact");
      assert.ok(driveApi.folders.has("F/"), "Remote folder must be created");
      assert.ok(driveApi.files.has("F/f.md"), "Remote file must be uploaded");
    });

    it("Scenario 2: A deletes folder F locally after B added F/new.md remotely -> new note saved", async () => {
      const bufNew = stringToBuffer("New Note Added By B");

      // On Drive: F/ and F/new.md exist
      driveApi.folders.add("F/");
      driveApi.files.set("F/new.md", {
        content: bufNew,
        mtime: 2000,
        size: bufNew.byteLength,
        hash: md5(bufNew),
      });

      // DB had prior record of F/ (which A deleted locally)
      db.upsertRecord({
        key: "F/",
        isFolder: true,
        localSize: 0,
        localMtime: 1000,
        syncTime: 1000,
      });

      // Local entities: empty (A deleted F locally)
      const localEntities: FsEntity[] = [];
      const remoteEntities: FsEntity[] = [
        { key: "F/", isFolder: true, size: 0, mtime: 1000 },
        { key: "F/new.md", isFolder: false, size: bufNew.byteLength, mtime: 2000, hash: md5(bufNew) },
      ];

      const engine = new SyncEngine(localFs as any, driveApi as any, db as any, settings);
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

      // Execute plan
      await engine.executePlan(decisions);

      // Verify: F/ on Drive must NOT be trashed, and F/new.md must be downloaded locally
      assert.ok(driveApi.folders.has("F/"), "Remote folder must remain on Drive");
      assert.ok(localFs.folders.has("F/"), "Local folder must be created");
      assert.ok(localFs.files.has("F/new.md"), "Local note must be downloaded");
    });

    it("Legitimate folder deletion: empty folder is deleted", async () => {
      // Local folder empty, deleted on Drive
      localFs.folders.add("OldEmpty/");
      db.upsertRecord({
        key: "OldEmpty/",
        isFolder: true,
        localSize: 0,
        localMtime: 1000,
        syncTime: 1000,
      });

      const localEntities: FsEntity[] = [{ key: "OldEmpty/", isFolder: true, size: 0, mtime: 1000 }];
      const remoteEntities: FsEntity[] = [];

      const engine = new SyncEngine(localFs as any, driveApi as any, db as any, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);

      const folderDec = decisions.find((d) => d.key === "OldEmpty/");
      assert.ok(folderDec);
      assert.equal(folderDec.action, "delete_local_folder");

      await engine.executePlan(decisions);
      assert.equal(localFs.folders.has("OldEmpty/"), false, "Empty folder should be deleted");
      assert.equal(db.getRecord("OldEmpty/"), undefined, "DB record should be removed");
    });
  });

  describe("Problem A: Typing-During-Upload and Download Overwrite Guards", () => {
    it("Upload guard: detects mid-upload edit and defers snapshot to prevent data loss", async () => {
      const initialText = "Initial content";
      const initialBuf = stringToBuffer(initialText);
      const key = "Doc.md";

      localFs.files.set(key, {
        content: initialBuf,
        mtime: 1000,
        size: initialBuf.byteLength,
      });

      const localEntities: FsEntity[] = [
        { key, isFolder: false, size: initialBuf.byteLength, mtime: 1000 },
      ];
      const remoteEntities: FsEntity[] = [];

      const engine = new SyncEngine(localFs as any, driveApi as any, db as any, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);

      // Simulate mid-upload edit: while readFile/writeFile is happening, user edits the file
      const originalReadFile = localFs.readFile.bind(localFs);
      localFs.readFile = async (k: string) => {
        const res = await originalReadFile(k);
        // Simulate user typing mid-upload
        const editedBuf = stringToBuffer("Initial content with mid-upload typing!");
        localFs.files.set(key, {
          content: editedBuf,
          mtime: 2500, // new mtime
          size: editedBuf.byteLength,
        });
        return res;
      };

      await engine.executePlan(decisions);

      // The mid-upload guard should NOT have recorded the new mtime (2500) in DB
      const record = db.getRecord(key);
      assert.ok(record, "Record should exist with pre-upload stat");
      assert.equal(
        record.localMtime,
        1000,
        "Record must keep the old mtime (1000) instead of the new mid-upload mtime (2500)"
      );

      // On the subsequent sync, the new edit (mtime 2500) will be detected as new/modified
      const newLocalEntities = [await localFs.stat(key)!];
      const newRemoteEntities = [
        { key, isFolder: false, size: initialBuf.byteLength, mtime: 1000, hash: md5(initialBuf) },
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
        mtime: 1000,
        size: initialLocalBuf.byteLength,
      });

      db.upsertRecord({
        key,
        isFolder: false,
        localSize: initialLocalBuf.byteLength,
        localMtime: 1000,
        remoteHash: "old-hash",
        syncTime: 1000,
      });

      driveApi.files.set(key, {
        content: remoteBuf,
        mtime: 3000,
        size: remoteBuf.byteLength,
        hash: md5(remoteBuf),
      });

      const localEntities: FsEntity[] = [
        { key, isFolder: false, size: initialLocalBuf.byteLength, mtime: 1000 },
      ];
      const remoteEntities: FsEntity[] = [
        { key, isFolder: false, size: remoteBuf.byteLength, mtime: 3000, hash: md5(remoteBuf) },
      ];

      const engine = new SyncEngine(localFs as any, driveApi as any, db as any, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);

      // Initial decision was download because local had not changed at scan time
      assert.equal(decisions[0].action, "download");

      // Now simulate user typing locally while download is in flight
      localFs.files.set(key, {
        content: stringToBuffer("User typed important words!"),
        mtime: 4000,
        size: stringToBuffer("User typed important words!").byteLength,
      });

      await engine.executePlan(decisions);

      // User's local file must NOT have been overwritten
      const localCurrent = localFs.files.get(key);
      const decoder = new TextDecoder();
      assert.equal(
        decoder.decode(localCurrent?.content),
        "User typed important words!",
        "Local edits must not be overwritten by download"
      );

      // A conflict copy must have been created
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

      // Local file has mtime 1000, remote has mtime 5000 (different times, same size)
      localFs.files.set(key, { content: buf, mtime: 1000, size: buf.byteLength });
      driveApi.files.set(key, { content: buf, mtime: 5000, size: buf.byteLength, hash });

      // No history in DB yet (fresh setup)
      const localEntities: FsEntity[] = [
        { key, isFolder: false, size: buf.byteLength, mtime: 1000 },
      ];
      const remoteEntities: FsEntity[] = [
        { key, isFolder: false, size: buf.byteLength, mtime: 5000, hash },
      ];

      const engine = new SyncEngine(localFs as any, driveApi as any, db as any, settings);
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

      // Baseline record stored
      const rec = db.getRecord(key);
      assert.ok(rec);
      assert.equal(rec.remoteHash, hash);

      // No conflict copies created
      for (const k of localFs.files.keys()) {
        assert.equal(k.includes(".sync-conflict-"), false);
      }
    });
  });

  describe("Incremental Database Saves", () => {
    it("Saves DB snapshot incrementally during sync operations", async () => {
      // 6 files to trigger batch save (every 5 files)
      for (let i = 1; i <= 6; i++) {
        const buf = stringToBuffer(`Note content ${i}`);
        localFs.files.set(`note${i}.md`, { content: buf, mtime: 1000, size: buf.byteLength });
      }

      const localEntities = await Promise.all(
        Array.from({ length: 6 }, (_, i) => localFs.stat(`note${i + 1}.md`)!)
      );
      const remoteEntities: FsEntity[] = [];

      const engine = new SyncEngine(localFs as any, driveApi as any, db as any, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);

      await engine.executePlan(decisions);

      // db.save() must have been called multiple times (Phase 0, batch interval, end of phase B, final)
      assert.ok(db.saveCount >= 2, `db.save() should be called incrementally (called ${db.saveCount} times)`);
    });
  });

  describe("File Reconciliation & Edit-Beats-Delete", () => {
    it("Local edit beats remote delete", async () => {
      const key = "file.md";
      const bufOriginal = stringToBuffer("Original");
      const bufEdited = stringToBuffer("Local Edit");

      localFs.files.set(key, { content: bufEdited, mtime: 2000, size: bufEdited.byteLength });
      db.upsertRecord({
        key,
        isFolder: false,
        localSize: bufOriginal.byteLength,
        localMtime: 1000,
        syncTime: 1000,
      });

      const localEntities: FsEntity[] = [{ key, isFolder: false, size: bufEdited.byteLength, mtime: 2000 }];
      const remoteEntities: FsEntity[] = [];

      const engine = new SyncEngine(localFs as any, driveApi as any, db as any, settings);
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
        mtime: 2000,
        size: bufEdited.byteLength,
        hash: md5(bufEdited),
      });
      db.upsertRecord({
        key,
        isFolder: false,
        localSize: bufOriginal.byteLength,
        localMtime: 1000,
        remoteHash: md5(bufOriginal),
        syncTime: 1000,
      });

      const localEntities: FsEntity[] = [];
      const remoteEntities: FsEntity[] = [
        { key, isFolder: false, size: bufEdited.byteLength, mtime: 2000, hash: md5(bufEdited) },
      ];

      const engine = new SyncEngine(localFs as any, driveApi as any, db as any, settings);
      const decisions = await engine.planSync(localEntities, remoteEntities);

      const dec = decisions.find((d) => d.key === key);
      assert.ok(dec);
      assert.equal(dec.action, "download", "Remote edit must win over local deletion");
    });

    it("Accidental mass deletion safety guard halts execution", async () => {
      // 20 items tracked in DB
      for (let i = 0; i < 20; i++) {
        db.upsertRecord({
          key: `note${i}.md`,
          isFolder: false,
          localSize: 10,
          localMtime: 1000,
          syncTime: 1000,
        });
      }

      // 10 deletions planned (50% of vault, limit is 25%)
      const decisions: any[] = [];
      for (let i = 0; i < 10; i++) {
        decisions.push({
          key: `note${i}.md`,
          isFolder: false,
          action: "delete_local",
          isChange: true,
          reason: "Deleted on remote",
        });
      }

      const engine = new SyncEngine(localFs as any, driveApi as any, db as any, settings);
      await assert.rejects(
        async () => {
          await engine.executePlan(decisions);
        },
        /Safety Guard Abort/
      );
    });
  });
});
