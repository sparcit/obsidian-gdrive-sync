import type { Plugin } from "obsidian";
import type { SyncRecord } from "./types";

export class LocalDb {
  private plugin: Plugin;
  private records: Map<string, SyncRecord> = new Map();
  private isLoaded = false;

  constructor(plugin: Plugin) {
    this.plugin = plugin;
  }

  public async load(): Promise<void> {
    if (this.isLoaded) return;

    try {
      const data = await this.plugin.loadData();
      if (data && data.syncRecords) {
        this.records.clear();
        for (const [key, raw] of Object.entries(
          data.syncRecords as Record<string, any>
        )) {
          const record: SyncRecord = {
            key: raw.key,
            isFolder: raw.isFolder,
            localSize: raw.localSize ?? raw.size ?? 0,
            localMtime: raw.localMtime ?? raw.mtime ?? 0,
            remoteHash: raw.remoteHash ?? raw.hash,
            remoteMtime: raw.remoteMtime ?? raw.mtime,
            remoteSize: raw.remoteSize ?? raw.size,
            syncTime: raw.syncTime ?? 0,
          };
          this.records.set(key, record);
        }
      }
    } catch (err) {
      console.warn("Failed to load sync records from local database", err);
    }

    this.isLoaded = true;
  }

  public async save(): Promise<void> {
    try {
      const currentData = (await this.plugin.loadData()) || {};
      const recordsObj: Record<string, SyncRecord> = {};
      for (const [key, record] of this.records.entries()) {
        recordsObj[key] = record;
      }
      currentData.syncRecords = recordsObj;
      await this.plugin.saveData(currentData);
    } catch (err) {
      console.error("Failed to save sync records to local database", err);
    }
  }

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

  public clear(): void {
    this.records.clear();
  }

  public get count(): number {
    return this.records.size;
  }
}
