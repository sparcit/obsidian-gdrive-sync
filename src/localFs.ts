import { normalizePath, TFile, TFolder, type Vault } from "obsidian";
import type { FsEntity } from "./types";

export class FsLocal {
  private vault: Vault;
  private syncConfigDir: boolean;
  private ignoredPatterns: RegExp[];

  constructor(
    vault: Vault,
    syncConfigDir = false,
    ignoredPatternStrings: string[] = []
  ) {
    this.vault = vault;
    this.syncConfigDir = syncConfigDir;
    this.ignoredPatterns = ignoredPatternStrings
      .map((pattern) => {
        try {
          return new RegExp(pattern);
        } catch (e) {
          console.error(`Invalid ignore pattern: ${pattern}`, e);
          return null;
        }
      })
      .filter((r): r is RegExp => r !== null);
  }

  /**
   * Check whether a path should be ignored from syncing
   */
  public isIgnored(path: string): boolean {
    const normalized = normalizePath(path);

    // Skip config dir unless explicitly enabled
    const configDir = this.vault.configDir || ".obsidian";
    if (
      !this.syncConfigDir &&
      (normalized === configDir || normalized.startsWith(`${configDir}/`))
    ) {
      return true;
    }

    // Always skip this plugin's own folder to prevent recursive write loops
    if (normalized.includes("obsidian-gdrive-sync")) {
      return true;
    }

    // Check custom regex patterns
    for (const re of this.ignoredPatterns) {
      if (re.test(normalized)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Recursively walks the local vault and gathers all files and folders
   */
  public async walk(): Promise<FsEntity[]> {
    const results: FsEntity[] = [];
    const queue: string[] = [""];

    while (queue.length > 0) {
      const currentFolder = queue.shift()!;
      let listed;
      try {
        listed = await this.vault.adapter.list(currentFolder);
      } catch (err) {
        console.warn(`Failed to list folder: "${currentFolder}"`, err);
        continue;
      }

      // Process folders
      for (const folderPath of listed.folders) {
        const normalized = normalizePath(folderPath);
        if (this.isIgnored(normalized)) {
          continue;
        }

        const stat = await this.vault.adapter.stat(normalized);
        const keyWithSlash = normalized.endsWith("/")
          ? normalized
          : `${normalized}/`;

        results.push({
          key: keyWithSlash,
          isFolder: true,
          size: 0,
          mtime: stat?.mtime ?? Date.now(),
          ctime: stat?.ctime,
        });

        queue.push(normalized);
      }

      // Process files
      for (const filePath of listed.files) {
        const normalized = normalizePath(filePath);
        if (this.isIgnored(normalized)) {
          continue;
        }

        const stat = await this.vault.adapter.stat(normalized);
        if (!stat) continue;

        results.push({
          key: normalized,
          isFolder: false,
          size: stat.size,
          mtime: stat.mtime,
          ctime: stat.ctime,
        });
      }
    }

    return results;
  }

  /**
   * Reads a file as binary ArrayBuffer
   */
  public async readFile(key: string): Promise<ArrayBuffer> {
    const normalized = normalizePath(key);
    return await this.vault.adapter.readBinary(normalized);
  }

  /**
   * Writes binary data using Obsidian's Vault API (notifies active editor tabs to avoid overwrites)
   */
  public async writeFile(key: string, data: ArrayBuffer): Promise<void> {
    const normalized = normalizePath(key);
    const parentFolder = this.getParentPath(normalized);

    if (parentFolder && !(await this.vault.adapter.exists(parentFolder))) {
      await this.vault.adapter.mkdir(parentFolder);
    }

    const abstractFile = this.vault.getAbstractFileByPath(normalized);
    if (abstractFile instanceof TFile) {
      await this.vault.modifyBinary(abstractFile, data);
    } else {
      await this.vault.createBinary(normalized, data);
    }
  }

  /**
   * Creates a directory if it does not already exist
   */
  public async mkdir(key: string): Promise<void> {
    const normalized = normalizePath(key.replace(/\/+$/, ""));
    if (!normalized) return;

    if (!(await this.vault.adapter.exists(normalized))) {
      await this.vault.adapter.mkdir(normalized);
    }
  }

  /**
   * Deletes a file safely via Obsidian's Vault API
   */
  public async deleteFile(key: string): Promise<void> {
    const normalized = normalizePath(key);
    const file = this.vault.getAbstractFileByPath(normalized);
    if (file instanceof TFile) {
      try {
        await this.vault.trash(file, true);
      } catch {
        await this.vault.adapter.remove(normalized);
      }
    } else if (await this.vault.adapter.exists(normalized)) {
      try {
        await this.vault.adapter.trashLocal(normalized);
      } catch {
        await this.vault.adapter.remove(normalized);
      }
    }
  }

  /**
   * Checks if a folder has zero files and zero subfolders
   */
  public async isFolderEmpty(key: string): Promise<boolean> {
    const normalized = normalizePath(key.replace(/\/+$/, ""));
    if (!normalized || !(await this.vault.adapter.exists(normalized))) {
      return true;
    }
    const listing = await this.vault.adapter.list(normalized);
    return listing.files.length === 0 && listing.folders.length === 0;
  }

  /**
   * Deletes a folder ONLY if it is completely empty
   */
  public async deleteFolder(key: string): Promise<boolean> {
    const normalized = normalizePath(key.replace(/\/+$/, ""));
    if (!normalized) return false;

    // Safety guard: only delete empty folders
    if (!(await this.isFolderEmpty(normalized))) {
      console.warn(
        `Skipped deleting local folder "${normalized}" because it is not empty.`
      );
      return false;
    }

    const folder = this.vault.getAbstractFileByPath(normalized);
    if (folder instanceof TFolder) {
      try {
        await this.vault.trash(folder, true);
        return true;
      } catch {
        await this.vault.adapter.rmdir(normalized, false);
        return true;
      }
    } else if (await this.vault.adapter.exists(normalized)) {
      await this.vault.adapter.rmdir(normalized, false);
      return true;
    }
    return false;
  }

  /**
   * Gets stats of a file or folder
   */
  public async stat(key: string): Promise<FsEntity | null> {
    const isFolder = key.endsWith("/");
    const normalized = normalizePath(key.replace(/\/+$/, ""));
    const stat = await this.vault.adapter.stat(normalized);
    if (!stat) return null;

    return {
      key: isFolder ? `${normalized}/` : normalized,
      isFolder: stat.type === "folder",
      size: stat.size,
      mtime: stat.mtime,
      ctime: stat.ctime,
    };
  }

  private getParentPath(path: string): string {
    const parts = path.split("/");
    parts.pop();
    return parts.join("/");
  }
}
