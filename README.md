# Obsidian Google Drive Sync

A robust, two-way synchronization community plugin for [Obsidian](https://obsidian.md) that syncs your vault with **Google Drive**, designed specifically to work seamlessly across **Android**, iOS, and Desktop (macOS, Windows, Linux).

This plugin extracts and adapts the pertinent architectural designs and sync reconciliation algorithms from [Remotely Save](https://github.com/remotely-save/remotely-save), providing a reliable, open-source Google Drive synchronization engine without requiring third-party bridge subscriptions.

---

## Key Features

- **Mobile & Android-First Authentication**:
  - Employs **OAuth 2.0 Device Authorization Flow (RFC 8628)**.
  - No broken local redirects, deep links, or localhost server requirements on mobile.
  - Simply click "Connect", copy the code, sign in through your mobile browser, and Obsidian authenticates automatically.
  - Support for custom Google Cloud Console Client IDs or direct refresh tokens.
- **3-Way State Reconciliation Engine**:
  - Tracks previous sync snapshots (`mtime`, file size, MD5 checksum) in local metadata.
  - Accurately detects local vs remote modifications, additions, and deletions.
  - **Edit Beats Delete**: Edits always take precedence over deletions for both individual notes and entire folder trees.
- **Empty-Folder Verification & Child-Edit Safety**:
  - Folders are only deleted locally or remotely if completely empty.
  - If a folder was deleted on one device while notes inside it were modified or added on another, the deletion is cancelled and the folder is preserved.
  - Stale Google Drive folder ID caches are cleared at the start of every sync run to prevent syncing into trashed folders.
- **Typing-During-Upload & Download Overwrite Guards**:
  - Protects against autosave races: if you type on your phone while a note is uploading, the plugin detects the mid-upload modification and defers the snapshot update, ensuring the new edit is cleanly uploaded on the next sync.
  - Protects against download overwrites: if a note was edited locally while a sync download was in flight, the download creates a `.sync-conflict-...` copy instead of overwriting your typed words.
- **First-Sync MD5 Checksum Matching**:
  - When syncing a device that already has your notes, the plugin computes local MD5 checksums and matches them against Google Drive without prior history.
  - Identical files are paired as matching (`equal`), preventing false conflict copies or redundant network transfers.
- **Obsidian Editor Buffer Integration**:
  - Uses Obsidian's native `vault.modifyBinary` and `vault.createBinary` functions, notifying open editor tabs so active notes reload cleanly and never overwrite downloads upon autosave.
- **Accidental Mass Deletion Safeguard**:
  - Aborts sync and alerts you if a run would delete more than a set percentage (default 25%) of your vault, preventing accidental data loss from disconnected drives or sync anomalies.
- **Default "Keep Both" Conflict Resolution**:
  - Defaults to **Keep Both / Create Conflict Copy**: retains the canonical note and saves the conflicting version as `filename.sync-conflict-TIMESTAMP.md`.
  - Also supports **Keep Newer**, **Always Keep Local**, and **Always Keep Remote**.
- **Automated Sync Triggers**:
  - **Sync on Startup**: Automatically synchronizes when you launch Obsidian on Android (with a 3-second settle delay).
  - **Periodic Sync**: Runs at configurable intervals (e.g., every 5, 10, 15, 30 minutes).
  - **Sync on File Change**: Debounced background sync shortly after creating or editing a note.
- **Direct Google Drive v3 Integration**:
  - Preserves standard folder structures on Google Drive (notes remain standard Markdown files).
  - Multipart upload for files $\le 5\text{MB}$ and resumable chunked upload for larger attachments.
  - In-memory path and folder ID caching with automatic deduplication of duplicate Drive items (picks newest non-trashed).

---

## Installation

### Method 1: Using Obsidian42 - BRAT (Recommended for Android & Desktop)

1. In Obsidian on your phone or desktop, install and enable the community plugin **Obsidian42 - BRAT** (*Settings $\rightarrow$ Community plugins $\rightarrow$ Browse*).
2. Open Obsidian Settings $\rightarrow$ **BRAT**.
3. Click **Add Beta plugin**.
4. Enter the repository URL or shorthand:
   ```text
   sparcit/obsidian-gdrive-sync
   ```
5. Click **Add Plugin**. BRAT will download `manifest.json`, `main.js`, and `styles.css` directly from the latest release.
6. Go to **Community Plugins** in Obsidian and enable **Google Drive Sync**.

---

### Method 2: Manual Installation on Android

1. Download or build the 3 plugin files (`main.js`, `manifest.json`, `styles.css`).
2. Locate your Obsidian vault directory on your Android device:
   - **How to check your exact path**: In Obsidian on your phone, open the left drawer, tap the **Vault Switcher** icon at the bottom. Your exact storage path is displayed below your vault name.
   - **Standard Documents Path (Most Common)**:
     ```text
     /storage/emulated/0/Documents/<YourVaultName>/
     ```
   - **App Storage Path (Scoped Storage)**:
     ```text
     /storage/emulated/0/Android/data/md.obsidian/files/Documents/<YourVaultName>/
     ```
3. Open a file manager app (e.g. Solid Explorer, MiXplorer, or connect your phone to your computer via USB in MTP/File Transfer mode).
4. **Make sure "Show hidden files" is enabled** in your file manager settings (folders starting with `.` are hidden by default on Android).
5. Navigate into `<YourVaultName>/.obsidian/plugins/`.
6. Create a folder named `obsidian-gdrive-sync` and copy `main.js`, `manifest.json`, and `styles.css` into it.
7. In Obsidian on Android, navigate to **Settings $\rightarrow$ Community plugins**, tap **Reload plugins**, and enable **Google Drive Sync**.

---

### Method 3: Manual Installation on Desktop

1. Copy `main.js`, `manifest.json`, and `styles.css` to your vault's plugin directory:
   - **macOS**: `~/Documents/<VaultName>/.obsidian/plugins/obsidian-gdrive-sync/`
   - **Windows**: `%USERPROFILE%\Documents\<VaultName>\.obsidian\plugins\obsidian-gdrive-sync\`
   - **Linux**: `~/Documents/<VaultName>/.obsidian/plugins/obsidian-gdrive-sync/`
2. Restart Obsidian or reload plugins, and enable **Google Drive Sync**.

---

## Getting Started & Authentication

To connect Obsidian with your Google Drive, you will set up your own free Google Cloud OAuth 2.0 credentials. This gives you dedicated API quota and complete privacy:

### Step 1: Set Up Google Cloud OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create a project (e.g., `Obsidian Sync`).
2. Enable the **Google Drive API**:
   - Navigate to **APIs & Services $\rightarrow$ Library**.
   - Search for **Google Drive API** and click **Enable**.
3. Configure the **OAuth Consent Screen**:
   - User Type: Select **External** and click **Create**.
   - App Name: `Obsidian Vault Sync` (enter your email for user support and developer contact).
   - **Important: Choose the Correct OAuth Scope**:
     Click **Add or Remove Scopes** and add one of the following:
     - **For Preexisting Folders (Recommended)**:
       `https://www.googleapis.com/auth/drive`
       > **Why this matters**: Google's restricted `drive.file` scope *only* grants access to files and folders created by this specific application. If you want the plugin to access, read, or sync an **existing** folder in your Google Drive (such as `Obsidian/MyVault` or `My Drive/Obsidian/MyVault`), you **must** use `https://www.googleapis.com/auth/drive`.
     - **For Sandboxed Vaults Created Entirely by the Plugin**:
       `https://www.googleapis.com/auth/drive.file`
       *(Use this only if you want the plugin strictly quarantined to files it creates itself and do not need to access existing Drive files).*
   - **Important: Set Publishing Status to "In Production"**:
     On the OAuth consent screen dashboard, click **"Publish App"** to set the Publishing status to **In production**.
     > **Why this matters**: In "Testing" mode, Google automatically revokes refresh tokens after **7 days**, forcing you to re-authenticate every week. Setting your app to "In production" keeps refresh tokens permanently valid. (Google verification is **not** required for personal use; you simply click "Advanced $\rightarrow$ Go to Obsidian Vault Sync (unsafe)" once when signing in).
4. Create Credentials:
   - Go to **APIs & Services $\rightarrow$ Credentials $\rightarrow$ Create Credentials $\rightarrow$ OAuth client ID**.
   - Application type: Select **"TVs and Limited Input devices"** (mandatory for Google Device Code flow on mobile).
   - Name: `Obsidian Device Client`.
   - Click **Create**. Copy both the **Client ID** and **Client Secret**.

---

### Step 2: Connect in Obsidian

1. In Obsidian, open **Settings $\rightarrow$ Google Drive Sync**.
2. Under **Google Account**:
   - Enter your **Google Client ID** and **Google Client Secret**.
   - Set **Google Drive OAuth Scope**:
     - Select **Full Drive Access** (`https://www.googleapis.com/auth/drive`) if using an existing folder.
     - Select **App-Created Files Only** (`https://www.googleapis.com/auth/drive.file`) if starting fresh.
3. Click **Connect Account**.
4. A modal appears displaying your one-time **Device Code** (e.g., `ABCD-EFGH`).
5. Click **Open Google Login in Browser** (or visit [https://www.google.com/device](https://www.google.com/device) and enter the code).
6. Sign in with your Google account and grant permission.
7. Return to Obsidian: the modal will confirm authorization and display your connected email address.

---

## Configuration Settings

| Setting | Description | Default |
| :--- | :--- | :--- |
| **Remote Vault Directory** | Folder path on Google Drive (e.g. `Obsidian/MyVault` or `My Drive/Obsidian/MyVault`). Existing Drive folders are seamlessly reused without creating duplicates, and matching notes are paired via MD5 checksums. | Vault Name |
| **Google Drive OAuth Scope** | `Full Drive Access` (for existing folders) or `App-Created Files Only` (sandboxed). | `Full Drive Access` |
| **Sync on Startup** | Initiates sync 3 seconds after opening Obsidian. | `true` |
| **Periodic Sync** | Automatically syncs in the background every $N$ minutes. | `10 min` |
| **Sync on File Change** | Triggers sync a few seconds after saving/editing a note. | `false` |
| **File Change Delay** | Debounce delay before syncing modified files. | `5 seconds` |
| **Sync Direction** | `Bidirectional`, `Push Only`, or `Pull Only`. | `Bidirectional` |
| **Conflict Resolution** | `Keep Both (Conflict Copy)`, `Keep Newer`, `Keep Local`, or `Keep Remote`. | `Keep Both (Conflict Copy)` |
| **Accidental Deletion Guard**| Aborts sync if more than $X\%$ of files would be deleted in a single run. | `25%` |
| **Sync .obsidian Config** | Sync plugin configs, snippets, and hotkeys (excluding workspace cache). | `false` |
| **Ignored Patterns** | Regex patterns of paths to exclude (`.git`, `.DS_Store`, etc.). | Standard set |

---

## Architecture: The 3-Way Reconciliation Matrix

The synchronization algorithm compares the current local state ($L$), the current remote Google Drive state ($R$), and the snapshot from the last successful sync ($P$):

| Local ($L$) | Remote ($R$) | Previous ($P$) | State | Action Taken |
| :---: | :---: | :---: | :--- | :--- |
| **New** | *None* | *None* | File created locally | **Upload** to Google Drive |
| *None* | **New** | *None* | File created on Drive | **Download** to local vault |
| **Exists** | **Exists** | *None* (First Sync) | Same size & MD5 hash | **Equal** (No-op, establishes baseline snapshot) |
| **Exists** | **Exists** | Matches $L$ & $R$ | Unchanged on both sides | **Equal** (No-op, no network bounce) |
| **Modified** | Unchanged | Same as $R$ | Local edited | **Upload** to Google Drive |
| Unchanged | **Modified** | Same as $L$ | Remote edited | **Download** to local vault |
| **Modified** | **Modified** | Old | Both edited (Conflict) | Resolved via chosen **Conflict Rule** (default: Keep Both) |
| Untouched | *None* | Exists | Remote deleted | **Delete** locally (only if folder/file empty) |
| **Modified** | *None* | Exists | Remote deleted, but local edited | **Upload** (Edit wins over delete!) |
| *None* | Untouched | Exists | Local deleted | **Delete** on Google Drive (only if folder/file empty) |
| *None* | **Modified** | Exists | Local deleted, but remote edited | **Download** (Edit wins over delete!) |

---

## Android Mobile Optimization Tips

- **Battery Optimization**: On Android, background timers may be paused by the OS. It is recommended to exempt Obsidian from battery optimization (*Settings $\rightarrow$ Apps $\rightarrow$ Obsidian $\rightarrow$ Battery $\rightarrow$ Unrestricted*).
- **Startup Sync**: Enabling **Sync on Startup** ensures that whenever you open Obsidian on your phone, you immediately receive the latest notes from Google Drive before you start typing.
- **Ribbon Button**: Tap the sync ribbon icon on the left drawer anytime to trigger a quick manual synchronization.

---

## Development & Testing

To compile or modify the plugin:

```bash
# Install dependencies
npm install

# Run automated tests (runs bundled real-code unit tests)
npm test

# Build production bundle (main.js)
npm run build

# Start live file watcher for development
npm run dev
```

---

## License

MIT License. Inspired by and adapted from the open-source concepts of [Remotely Save](https://github.com/remotely-save/remotely-save).
