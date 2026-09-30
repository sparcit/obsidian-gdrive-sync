# Obsidian Google Drive Sync

A robust, two-way synchronization community plugin for [Obsidian](https://obsidian.md) that syncs your vault with **Google Drive**, designed specifically to work seamlessly across **Android**, iOS, and Desktop (macOS, Windows, Linux).

This plugin extracts and adapts the pertinent architectural designs and sync reconciliation algorithms from [Remotely Save](https://github.com/remotely-save/remotely-save), providing a reliable, open-source Google Drive synchronization engine without requiring third-party bridge subscriptions.

---

## Key Features

- **Mobile & Android First Authentication**:
  - Employs **OAuth 2.0 Device Authorization Flow (RFC 8628)**.
  - No broken local redirects, deep links, or localhost server requirements on mobile.
  - Simply click "Connect", copy the code, sign in through your mobile browser, and Obsidian authenticates automatically.
  - Support for custom Google Cloud Console Client IDs or direct refresh tokens.
- **3-Way State Reconciliation Engine**:
  - Tracks previous sync snapshots (`mtime`, file size, MD5 checksum).
  - Accurately detects local vs remote modifications, additions, and deletions.
  - Safe folder ordering: creates parent directories first and removes empty folders last.
- **Accidental Mass Deletion Safeguard**:
  - Aborts sync and alerts you if a run would delete more than a set percentage (default 25%) of your vault, preventing accidental data loss from disconnected drives or sync anomalies.
- **Flexible Conflict Resolution**:
  - **Keep Newer**: Chooses the file with the most recent modification time.
  - **Keep Both / Create Conflict Copy**: Retains the local file and downloads the remote file as `filename.sync-conflict-TIMESTAMP.md`.
  - **Always Keep Local** or **Always Keep Remote**.
- **Automated Sync Triggers**:
  - **Sync on Startup**: Automatically synchronizes when you launch Obsidian on Android.
  - **Periodic Sync**: Runs at configurable intervals (e.g., every 5, 10, 15, 30 minutes).
  - **Sync on File Change**: Debounced background sync shortly after creating or editing a note.
- **Direct Google Drive v3 Integration**:
  - Preserves standard folder structures on Google Drive (notes remain standard Markdown files).
  - Multipart upload for files $\le 5\text{MB}$ and resumable chunked upload for larger attachments.
  - In-memory path and folder ID caching for high speed and minimal API quota consumption.

---

## Installation

### Method 1: Using Obsidian42 - BRAT (Recommended for Android & Desktop)

1. In Obsidian, install and enable the community plugin **Obsidian42 - BRAT**.
2. Open Obsidian Settings $\rightarrow$ **BRAT**.
3. Click **Add Beta plugin**.
4. Enter the repository URL: `https://github.com/sparcit/obsidian-gdrive-sync`.
5. Click **Add Plugin**. BRAT will download `manifest.json`, `main.js`, and `styles.css`.
6. Go to **Community Plugins** in Obsidian and enable **Google Drive Sync**.

### Method 2: Manual Installation on Android

1. Build the plugin locally using `npm run build`.
2. Locate your Obsidian vault directory on your Android device (e.g. using a file manager app like Solid Explorer or MiXplorer):
   ```
   /storage/emulated/0/Documents/<YourVaultName>/.obsidian/plugins/
   ```
   *(Note: On Android 11+, the path may be `/Android/data/md.obsidian/files/Documents/<YourVaultName>/.obsidian/plugins/`)*
3. Create a folder named `obsidian-gdrive-sync` inside `.obsidian/plugins/`.
4. Copy the following 3 files into that folder:
   - `main.js`
   - `manifest.json`
   - `styles.css`
5. In Obsidian on Android, navigate to **Settings $\rightarrow$ Community plugins**, click **Reload plugins**, and enable **Google Drive Sync**.

### Method 3: Manual Installation on Desktop

1. Copy `main.js`, `manifest.json`, and `styles.css` to:
   - **macOS**: `~/Documents/VaultName/.obsidian/plugins/obsidian-gdrive-sync/`
   - **Windows**: `%USERPROFILE%\Documents\VaultName\.obsidian\plugins\obsidian-gdrive-sync\`
   - **Linux**: `~/Documents/VaultName/.obsidian/plugins/obsidian-gdrive-sync/`
2. Restart Obsidian or reload plugins, and enable the plugin.

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
   - Scopes: Click **Add or Remove Scopes** and add:
     `https://www.googleapis.com/auth/drive.file`
     *(This grants the plugin access strictly to files/folders it creates or opens).*
   - **Important: Set Publishing Status to "In Production"**:
     On the OAuth consent screen dashboard, click **"Publish App"** to set the Publishing status to **In production**.
     > **Why this matters**: In "Testing" mode, Google automatically revokes refresh tokens after **7 days**, forcing you to sign in every week. Setting your app to "In production" keeps refresh tokens permanently valid. (Google verification is **not** required for personal use; you simply click "Advanced $\rightarrow$ Go to Obsidian Vault Sync (unsafe)" once when signing in on your browser).
4. Create Credentials:
   - Go to **APIs & Services $\rightarrow$ Credentials $\rightarrow$ Create Credentials $\rightarrow$ OAuth client ID**.
   - Application type: Select **"TVs and Limited Input devices"** (mandatory for Google Device Code flow).
   - Name: `Obsidian Device Client`.
   - Click **Create**. Copy both the **Client ID** and **Client Secret**.

### Step 2: Connect in Obsidian

1. In Obsidian, open **Settings $\rightarrow$ Google Drive Sync**.
2. Under **Google Account**, enter your **Google Client ID** and **Google Client Secret**.
3. Click **Connect Account**.
4. A modal appears displaying your one-time **Device Code** (e.g., `ABCD-EFGH`).
5. Click **Open Google Login in Browser** (or visit `https://www.google.com/device` and enter the code).
6. Sign in with your Google account and grant permission.
7. Return to Obsidian: the modal will confirm authorization and display your connected email.

---

## Configuration Settings

| Setting | Description | Default |
| :--- | :--- | :--- |
| **Remote Vault Directory** | Folder name/path on Google Drive (e.g. `Obsidian/MyVault` or `My Drive/Obsidian/MyVault`). Existing Drive folders are seamlessly reused without creating duplicates, and matching notes are paired via MD5 checksums. | Vault Name |
| **Sync on Startup** | Initiates sync 3 seconds after opening Obsidian. | `true` |
| **Periodic Sync** | Automatically syncs in the background every $N$ minutes. | `10 min` |
| **Sync on File Change** | Triggers sync a few seconds after saving/editing a note. | `false` |
| **File Change Delay** | Debounce delay before syncing modified files. | `5 seconds` |
| **Sync Direction** | `Bidirectional`, `Push Only`, or `Pull Only`. | `Bidirectional` |
| **Conflict Resolution** | `Keep Both (Conflict Copy)`, `Keep Newer`, `Keep Local`, or `Keep Remote`. | `Keep Both (Conflict Copy)` |
| **Accidental Deletion Guard**| Aborts sync if more than $X\%$ of files would be deleted. | `25%` |
| **Sync .obsidian Config** | Sync plugin configs, snippets, and hotkeys. | `false` |
| **Ignored Patterns** | Regex patterns of paths to exclude (`.git`, `.DS_Store`, etc.). | Standard set |

---

## Architecture: The 3-Way Reconciliation Matrix

The synchronization algorithm compares the current local state ($L$), the current remote Google Drive state ($R$), and the snapshot from the last successful sync ($P$):

| Local ($L$) | Remote ($R$) | Previous ($P$) | State | Action Taken |
| :---: | :---: | :---: | :--- | :--- |
| **New** | *None* | *None* | File created locally | **Upload** to Google Drive |
| *None* | **New** | *None* | File created on Drive | **Download** to local vault |
| **Exists** | **Exists** | Matches $L$ & $R$ | Unchanged on both sides | **No-op** (Equal, no network bounce) |
| **Modified** | Unchanged | Same as $R$ | Local edited | **Upload** to Google Drive |
| Unchanged | **Modified** | Same as $L$ | Remote edited | **Download** to local vault |
| **Modified** | **Modified** | Old | Both edited (Conflict) | Resolved via chosen **Conflict Rule** |
| Untouched | *None* | Exists | Remote deleted | **Delete** locally |
| **Modified** | *None* | Exists | Remote deleted, but local edited | **Upload** (Edit wins over delete!) |
| *None* | Untouched | Exists | Local deleted | **Delete** on Google Drive |
| *None* | **Modified** | Exists | Local deleted, but remote edited | **Download** (Edit wins over delete!) |

---

## Android Mobile Optimization Tips

- **Battery Optimization**: On Android, apps running in the background may be paused by the OS. It is recommended to exempt Obsidian from aggressive battery saver restrictions (*Settings $\rightarrow$ Apps $\rightarrow$ Obsidian $\rightarrow$ Battery $\rightarrow$ Unrestricted*).
- **Startup Sync**: Enabling **Sync on Startup** ensures that whenever you open Obsidian on your phone, you immediately get the latest updates from Google Drive before you start writing.
- **Ribbon Button**: Tap the sync ribbon icon on the left drawer anytime to trigger a quick manual synchronization.

---

## Development & Testing

To compile or modify the plugin:

```bash
# Install dependencies
npm install

# Run automated tests
npm test

# Build production bundle (main.js)
npm run build

# Start live file watcher for development
npm run dev
```

---

## License

MIT License. Inspired by and adapted from the open-source concepts of [Remotely Save](https://github.com/remotely-save/remotely-save).
