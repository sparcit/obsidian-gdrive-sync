import { requestUrl, type RequestUrlParam } from "obsidian";
import type { FsEntity, GoogleDriveConfig } from "./types";

const FOLDER_MIME = "application/vnd.google-apps.folder";

export class GoogleDriveApi {
  private config: GoogleDriveConfig;
  private vaultName: string;
  private remoteBaseDir: string;
  private onConfigUpdate: (updated: GoogleDriveConfig) => Promise<void>;

  private rootFolderId: string | null = null;
  private pathToEntity: Map<string, FsEntity> = new Map();
  private folderPathToId: Map<string, string> = new Map();

  constructor(
    config: GoogleDriveConfig,
    vaultName: string,
    remoteBaseDir: string,
    onConfigUpdate: (updated: GoogleDriveConfig) => Promise<void>
  ) {
    this.config = config;
    this.vaultName = vaultName;
    this.remoteBaseDir = remoteBaseDir.trim() || vaultName;
    this.onConfigUpdate = onConfigUpdate;
  }

  public updateConfig(newConfig: GoogleDriveConfig, newBaseDir?: string) {
    this.config = newConfig;
    if (newBaseDir !== undefined) {
      this.remoteBaseDir = newBaseDir.trim() || this.vaultName;
      this.clearCache();
    }
  }

  /**
   * Clears in-memory path and folder ID caches so stale IDs are never reused
   */
  public clearCache(): void {
    this.rootFolderId = null;
    this.pathToEntity.clear();
    this.folderPathToId.clear();
  }

  public static formatGoogleError(rawText: string, status?: number): string {
    try {
      const json = JSON.parse(rawText);
      const err = json.error;
      const code = typeof err === "string" ? err : err?.message || err?.status || "";
      const desc = json.error_description || (typeof err === "object" ? err?.message : "") || "";
      const full = `${code} ${desc}`;
      if (full.includes("invalid_grant")) {
        return "Google authorization expired or was revoked. Please reconnect your account in Settings.";
      }
      if (full.includes("invalid_client")) {
        return "Invalid Google Client ID or Client Secret. Please verify your credentials in Settings.";
      }
      if (full.includes("access_denied")) {
        return "Access denied on Google consent screen.";
      }
      if (
        full.includes("insufficientPermissions") ||
        full.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT")
      ) {
        return "Insufficient Google Drive permissions. Ensure the scope 'https://www.googleapis.com/auth/drive.file' is added in your Google Cloud Console.";
      }
      if (
        full.includes("rateLimitExceeded") ||
        full.includes("userRateLimitExceeded")
      ) {
        return "Google Drive API rate limit reached. Please wait a moment before syncing again.";
      }
      if (desc) return desc;
      if (err?.message) return err.message;
    } catch {
      // not JSON
    }
    if (rawText.includes("invalid_grant")) {
      return "Google authorization expired or was revoked. Please reconnect your account in Settings.";
    }
    if (rawText.includes("invalid_client")) {
      return "Invalid Google Client ID or Client Secret. Please verify your credentials in Settings.";
    }
    return rawText || `HTTP ${status || "unknown error"}`;
  }

  /**
   * Retrieves a valid access token, automatically refreshing if needed
   */
  public async getAccessToken(): Promise<string> {
    if (!this.config.refreshToken) {
      throw new Error("Google Drive is not authenticated. Please log in first.");
    }

    const now = Date.now();
    // Refresh if within 2 minutes of expiration
    if (
      this.config.accessToken &&
      this.config.accessTokenExpiresAtMs > now + 120_000
    ) {
      return this.config.accessToken;
    }

    // Refresh token request
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      grant_type: "refresh_token",
      refresh_token: this.config.refreshToken,
    });
    if (this.config.clientSecret) {
      params.append("client_secret", this.config.clientSecret);
    }

    const resp = await requestUrl({
      url: "https://oauth2.googleapis.com/token",
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (resp.status !== 200) {
      throw new Error(
        `Failed to refresh Google Drive access token: ${GoogleDriveApi.formatGoogleError(resp.text, resp.status)}`
      );
    }

    const data = resp.json;
    this.config.accessToken = data.access_token;
    const expiresIn = Number(data.expires_in) || 3600;
    this.config.accessTokenExpiresAtMs = now + expiresIn * 1000;

    await this.onConfigUpdate(this.config);
    return this.config.accessToken;
  }

  /**
   * Fetches user profile (email and display name)
   */
  public async getUserInfo(): Promise<{ email: string; name: string }> {
    const token = await this.getAccessToken();
    const resp = await requestUrl({
      url: "https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress)",
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (resp.status !== 200) {
      throw new Error(`Failed to get Google account info: ${resp.text}`);
    }

    const user = resp.json.user || {};
    return {
      email: user.emailAddress || "",
      name: user.displayName || "",
    };
  }

  /**
   * Initializes or locates the remote root folder for this vault on Google Drive
   */
  public async initRootFolder(): Promise<string> {
    if (this.rootFolderId) {
      return this.rootFolderId;
    }

    let segments = this.remoteBaseDir
      .split("/")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    // Strip leading "My Drive" or "MyDrive" if user entered full Drive path
    if (
      segments.length > 0 &&
      (segments[0].toLowerCase() === "my drive" ||
        segments[0].toLowerCase() === "mydrive")
    ) {
      segments = segments.slice(1);
    }

    let parentId = "root";
    let cumulativePath = "";

    for (const segment of segments) {
      cumulativePath = cumulativePath ? `${cumulativePath}/${segment}` : segment;
      let folderId = this.folderPathToId.get(cumulativePath);

      if (!folderId) {
        folderId = await this.findOrCreateFolder(segment, parentId);
        this.folderPathToId.set(cumulativePath, folderId);
      }
      parentId = folderId;
    }

    this.rootFolderId = parentId;
    this.folderPathToId.set("", parentId);
    return this.rootFolderId;
  }

  private async findOrCreateFolder(
    name: string,
    parentId: string
  ): Promise<string> {
    const token = await this.getAccessToken();
    const query = `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = '${FOLDER_MIME}' and trashed = false`;

    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      query
    )}&fields=files(id,name)&pageSize=10`;

    const searchResp = await requestUrl({
      url: searchUrl,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (searchResp.status === 200 && searchResp.json.files?.length > 0) {
      // Deduplicate: If multiple folders exist with the same name, take the newest
      const sorted = searchResp.json.files.sort((a: any, b: any) => {
        const tA = a.modifiedTime ? Date.parse(a.modifiedTime) : 0;
        const tB = b.modifiedTime ? Date.parse(b.modifiedTime) : 0;
        return tB - tA;
      });
      return sorted[0].id;
    }

    // Create folder
    const createResp = await requestUrl({
      url: "https://www.googleapis.com/drive/v3/files",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: [parentId],
      }),
    });

    if (createResp.status !== 200 && createResp.status !== 201) {
      throw new Error(`Failed to create remote folder "${name}": ${createResp.text}`);
    }

    return createResp.json.id;
  }

  /**
   * Recursively walks all files and folders inside the remote vault
   */
  public async walk(): Promise<FsEntity[]> {
    this.clearCache();
    const rootId = await this.initRootFolder();

    const allEntities: FsEntity[] = [];
    const queue: { folderId: string; folderPath: string }[] = [
      { folderId: rootId, folderPath: "" },
    ];

    while (queue.length > 0) {
      const { folderId, folderPath } = queue.shift()!;
      let pageToken: string | undefined = undefined;

      do {
        const token = await this.getAccessToken();
        const query = `'${folderId}' in parents and trashed = false`;
        let url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
          query
        )}&pageSize=1000&fields=nextPageToken,files(id,name,mimeType,size,modifiedTime,createdTime,md5Checksum)`;
        if (pageToken) {
          url += `&pageToken=${encodeURIComponent(pageToken)}`;
        }

        const resp = await requestUrl({
          url,
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (resp.status !== 200) {
          throw new Error(
            `Failed to list files in folder "${folderPath}": ${GoogleDriveApi.formatGoogleError(resp.text, resp.status)}`
          );
        }

        const files = resp.json.files || [];
        for (const file of files) {
          const isFolder = file.mimeType === FOLDER_MIME;
          const relativeKey = folderPath
            ? `${folderPath}/${file.name}`
            : file.name;
          const normalizedKey = isFolder ? `${relativeKey}/` : relativeKey;

          const entity: FsEntity = {
            key: normalizedKey,
            isFolder,
            size: isFolder ? 0 : Number(file.size) || 0,
            mtime: file.modifiedTime ? Date.parse(file.modifiedTime) : Date.now(),
            ctime: file.createdTime ? Date.parse(file.createdTime) : undefined,
            hash: file.md5Checksum,
            id: file.id,
            parentID: folderId,
          };

          // Handle duplicate file/folder names in the same parent on Google Drive
          const existing = this.pathToEntity.get(normalizedKey);
          if (existing) {
            // Keep the newer duplicate and skip the older one
            if (entity.mtime <= existing.mtime) {
              continue;
            }
            const idx = allEntities.findIndex((e) => e.key === normalizedKey);
            if (idx >= 0) allEntities.splice(idx, 1);
          }

          this.pathToEntity.set(normalizedKey, entity);
          allEntities.push(entity);

          if (isFolder) {
            this.folderPathToId.set(relativeKey, file.id);
            queue.push({ folderId: file.id, folderPath: relativeKey });
          }
        }

        pageToken = resp.json.nextPageToken;
      } while (pageToken);
    }

    return allEntities;
  }

  /**
   * Reads a file's binary content from Google Drive
   */
  public async readFile(key: string): Promise<ArrayBuffer> {
    const entity = this.pathToEntity.get(key);
    let fileId = entity?.id;

    if (!fileId) {
      // Lookup or search
      const resolved = await this.lookupEntity(key);
      if (!resolved || !resolved.id) {
        throw new Error(`Remote file not found: ${key}`);
      }
      fileId = resolved.id;
    }

    const token = await this.getAccessToken();
    const resp = await requestUrl({
      url: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (resp.status !== 200) {
      throw new Error(`Failed to download remote file "${key}": ${resp.status}`);
    }

    return resp.arrayBuffer;
  }

  /**
   * Uploads or updates a file on Google Drive
   */
  public async writeFile(
    key: string,
    content: ArrayBuffer,
    mtime?: number
  ): Promise<FsEntity> {
    await this.initRootFolder();
    const token = await this.getAccessToken();

    const existingEntity = this.pathToEntity.get(key) || (await this.lookupEntity(key));
    const parentId = await this.ensureParentFolderExists(key);
    const fileName = key.split("/").pop()!;

    const metadata: Record<string, any> = {
      name: fileName,
    };
    if (mtime) {
      metadata.modifiedTime = new Date(mtime).toISOString();
    }

    let resultFile: any;

    if (content.byteLength <= 5 * 1024 * 1024) {
      // Multi-part upload (<= 5MB)
      resultFile = await this.uploadMultipart(
        token,
        existingEntity?.id,
        parentId,
        metadata,
        content
      );
    } else {
      // Resumable upload (> 5MB)
      resultFile = await this.uploadResumable(
        token,
        existingEntity?.id,
        parentId,
        metadata,
        content
      );
    }

    const entity: FsEntity = {
      key,
      isFolder: false,
      size: Number(resultFile.size) || content.byteLength,
      mtime: resultFile.modifiedTime
        ? Date.parse(resultFile.modifiedTime)
        : mtime || Date.now(),
      ctime: resultFile.createdTime
        ? Date.parse(resultFile.createdTime)
        : undefined,
      hash: resultFile.md5Checksum,
      id: resultFile.id,
      parentID: parentId,
    };

    this.pathToEntity.set(key, entity);
    return entity;
  }

  /**
   * Creates a directory on Google Drive
   */
  public async mkdir(key: string): Promise<FsEntity> {
    await this.initRootFolder();
    const cleanKey = key.replace(/\/+$/, "");
    const existing = this.pathToEntity.get(`${cleanKey}/`);
    if (existing) {
      return existing;
    }

    const parentId = await this.ensureParentFolderExists(cleanKey);
    const folderName = cleanKey.split("/").pop()!;

    const token = await this.getAccessToken();
    const resp = await requestUrl({
      url: "https://www.googleapis.com/drive/v3/files?fields=id,name,mimeType,modifiedTime,createdTime",
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: folderName,
        mimeType: FOLDER_MIME,
        parents: [parentId],
      }),
    });

    if (resp.status !== 200 && resp.status !== 201) {
      throw new Error(`Failed to create remote folder "${cleanKey}": ${resp.text}`);
    }

    const folderId = resp.json.id;
    this.folderPathToId.set(cleanKey, folderId);

    const entity: FsEntity = {
      key: `${cleanKey}/`,
      isFolder: true,
      size: 0,
      mtime: resp.json.modifiedTime
        ? Date.parse(resp.json.modifiedTime)
        : Date.now(),
      ctime: resp.json.createdTime
        ? Date.parse(resp.json.createdTime)
        : undefined,
      id: folderId,
      parentID: parentId,
    };

    this.pathToEntity.set(`${cleanKey}/`, entity);
    return entity;
  }

  /**
   * Checks if a remote Google Drive folder is completely empty (no non-trashed children)
   */
  public async isFolderEmpty(key: string): Promise<boolean> {
    const entity = this.pathToEntity.get(key) || (await this.lookupEntity(key));
    if (!entity || !entity.id) {
      return true;
    }

    const token = await this.getAccessToken();
    const query = `'${entity.id}' in parents and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      query
    )}&pageSize=1&fields=files(id)`;

    const resp = await requestUrl({
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (resp.status === 200 && resp.json.files) {
      return resp.json.files.length === 0;
    }
    return true;
  }

  /**
   * Deletes (or trashes) a file or folder on Google Drive ONLY if folder is empty
   */
  public async rm(key: string, permanent = false): Promise<boolean> {
    const entity = this.pathToEntity.get(key) || (await this.lookupEntity(key));
    if (!entity || !entity.id) {
      return true;
    }

    // Safety guard: only delete remote folders if they are completely empty
    if (key.endsWith("/")) {
      const empty = await this.isFolderEmpty(key);
      if (!empty) {
        console.warn(
          `Skipped deleting remote folder "${key}" because it still contains active files on Google Drive.`
        );
        return false;
      }
    }

    const token = await this.getAccessToken();
    if (permanent) {
      const resp = await requestUrl({
        url: `https://www.googleapis.com/drive/v3/files/${entity.id}`,
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (resp.status !== 200 && resp.status !== 204) {
        throw new Error(
          `Failed to permanently delete "${key}": ${GoogleDriveApi.formatGoogleError(resp.text, resp.status)}`
        );
      }
    } else {
      // Trash file/folder
      const resp = await requestUrl({
        url: `https://www.googleapis.com/drive/v3/files/${entity.id}`,
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ trashed: true }),
      });
      if (resp.status !== 200) {
        throw new Error(
          `Failed to trash "${key}": ${GoogleDriveApi.formatGoogleError(resp.text, resp.status)}`
        );
      }
    }

    this.pathToEntity.delete(key);
    const cleanKey = key.replace(/\/+$/, "");
    this.folderPathToId.delete(cleanKey);
    return true;
  }

  private async ensureParentFolderExists(childKey: string): Promise<string> {
    const clean = childKey.replace(/\/+$/, "");
    const parts = clean.split("/");
    parts.pop(); // Remove file or folder name itself

    if (parts.length === 0) {
      return await this.initRootFolder();
    }

    let currentParentId = await this.initRootFolder();
    let currentPath = "";

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;
      let folderId = this.folderPathToId.get(currentPath);

      if (!folderId) {
        folderId = await this.findOrCreateFolder(part, currentParentId);
        this.folderPathToId.set(currentPath, folderId);
        this.pathToEntity.set(`${currentPath}/`, {
          key: `${currentPath}/`,
          isFolder: true,
          size: 0,
          mtime: Date.now(),
          id: folderId,
          parentID: currentParentId,
        });
      }
      currentParentId = folderId;
    }

    return currentParentId;
  }

  private async uploadMultipart(
    token: string,
    existingId: string | undefined,
    parentId: string,
    metadata: Record<string, any>,
    content: ArrayBuffer
  ): Promise<any> {
    const boundary = "-------GDRIVE_SYNC_" + Math.random().toString(36).substring(2);
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    if (!existingId) {
      metadata.parents = [parentId];
    }

    const metaPart =
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: application/octet-stream\r\n\r\n";

    const encoder = new TextEncoder();
    const metaBytes = encoder.encode(delimiter + metaPart);
    const closeBytes = encoder.encode(closeDelimiter);

    // Combine multipart buffers
    const combined = new Uint8Array(
      metaBytes.byteLength + content.byteLength + closeBytes.byteLength
    );
    combined.set(metaBytes, 0);
    combined.set(new Uint8Array(content), metaBytes.byteLength);
    combined.set(closeBytes, metaBytes.byteLength + content.byteLength);

    const isUpdate = !!existingId;
    const url = isUpdate
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,createdTime,md5Checksum`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,size,modifiedTime,createdTime,md5Checksum";

    const resp = await requestUrl({
      url,
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: combined.buffer,
    });

    if (resp.status !== 200 && resp.status !== 201) {
      throw new Error(`Multipart upload failed: ${resp.text}`);
    }

    return resp.json;
  }

  private async uploadResumable(
    token: string,
    existingId: string | undefined,
    parentId: string,
    metadata: Record<string, any>,
    content: ArrayBuffer
  ): Promise<any> {
    if (!existingId) {
      metadata.parents = [parentId];
    }

    const isUpdate = !!existingId;
    const startUrl = isUpdate
      ? `https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime,createdTime,md5Checksum`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,name,mimeType,size,modifiedTime,createdTime,md5Checksum";

    const initResp = await requestUrl({
      url: startUrl,
      method: isUpdate ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "application/octet-stream",
        "X-Upload-Content-Length": `${content.byteLength}`,
      },
      body: JSON.stringify(metadata),
    });

    if (initResp.status !== 200 && initResp.status !== 201) {
      throw new Error(`Resumable upload initialization failed: ${initResp.text}`);
    }

    const uploadUrl = initResp.headers["location"] || initResp.headers["Location"];
    if (!uploadUrl) {
      throw new Error("No upload Location header returned by Google Drive");
    }

    // Chunk size: 5MB multiples as required by Google Drive
    const chunkSize = 5 * 1024 * 1024;
    let offset = 0;
    const totalBytes = content.byteLength;
    let lastResult: any = null;

    while (offset < totalBytes) {
      const end = Math.min(offset + chunkSize, totalBytes);
      const chunk = content.slice(offset, end);
      const contentRange = `bytes ${offset}-${end - 1}/${totalBytes}`;

      const chunkResp = await requestUrl({
        url: uploadUrl,
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Length": `${chunk.byteLength}`,
          "Content-Range": contentRange,
        },
        body: chunk,
      });

      if (chunkResp.status === 200 || chunkResp.status === 201) {
        lastResult = chunkResp.json;
        break;
      } else if (chunkResp.status === 308) {
        // Resume Incomplete - continue to next chunk
        offset = end;
      } else {
        throw new Error(
          `Chunk upload failed at offset ${offset}: ${chunkResp.status} ${chunkResp.text}`
        );
      }
    }

    if (!lastResult) {
      throw new Error("Resumable upload did not complete with file metadata");
    }

    return lastResult;
  }

  private async lookupEntity(key: string): Promise<FsEntity | null> {
    const isFolder = key.endsWith("/");
    const cleanKey = key.replace(/\/+$/, "");
    const parts = cleanKey.split("/");
    const fileName = parts[parts.length - 1];

    const parentId = await this.ensureParentFolderExists(cleanKey);
    const token = await this.getAccessToken();

    const query = `'${parentId}' in parents and name = '${fileName.replace(
      /'/g,
      "\\'"
    )}' and trashed = false`;
    const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      query
    )}&fields=files(id,name,mimeType,size,modifiedTime,createdTime,md5Checksum)`;

    const resp = await requestUrl({
      url,
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (resp.status === 200 && resp.json.files?.length > 0) {
      const sorted = resp.json.files.sort((a: any, b: any) => {
        const tA = a.modifiedTime ? Date.parse(a.modifiedTime) : 0;
        const tB = b.modifiedTime ? Date.parse(b.modifiedTime) : 0;
        return tB - tA;
      });
      const file = sorted[0];
      const entity: FsEntity = {
        key,
        isFolder: file.mimeType === FOLDER_MIME,
        size: Number(file.size) || 0,
        mtime: file.modifiedTime ? Date.parse(file.modifiedTime) : Date.now(),
        ctime: file.createdTime ? Date.parse(file.createdTime) : undefined,
        hash: file.md5Checksum,
        id: file.id,
        parentID: parentId,
      };
      this.pathToEntity.set(key, entity);
      return entity;
    }

    return null;
  }
}
