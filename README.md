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

1. Open Obsidian **Settings $\rightarrow$ Google Drive Sync**.
2. Under **Google Account**, click **Connect Account**.
3. A modal appears displaying your one-time **Device Code** (e.g., `ABCD-EFGH`).
4. Click **Open Google Login in Browser** (or navigate to `https://www.google.com/device` and enter the code).
5. Sign in to your Google Account and grant permission to manage your vault files.
6. Return to Obsidian: the modal will detect the authorization, display a success notification, and display your connected account email.

### (Optional) Setting Up Your Own Google Cloud OAuth Credentials

If you prefer to use your own Google Cloud project for full privacy and dedicated API quota:

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project (e.g., `Obsidian Sync`).
3. Enable the **Google Drive API**:
   - Go to **APIs & Services $\rightarrow$ Library**.
   - Search for **Google Drive API** and click **Enable**.
4. Configure the OAuth Consent Screen:
   - User Type: **External**.
   - App Name: `Obsidian Vault Sync`.
   - Add scope: `https://www.googleapis.com/auth/drive.file` (access only to files created or opened by this app).
   - Add your Google account email under **Test Users**.
5. Create OAuth Credentials:
   - Go to **APIs & Services $\rightarrow$ Credentials $\rightarrow$ Create Credentials $\rightarrow$ OAuth client ID**.
   - Application type: **TV and Limited Input devices** (or **Desktop app**).
   - Name: `Obsidian Client`.
6. Copy the **Client ID** (and Secret if provided).
7. In Obsidian under **Settings $\rightarrow$ Google Drive Sync $\rightarrow$ Advanced OAuth Credentials**, paste your **Client ID**.

---

## Configuration Settings

| Setting | Description | Default |
| :--- | :--- | :--- |
| **Remote Vault Directory** | Folder name/path on Google Drive (e.g. `Obsidian/Personal`). | Vault Name |
| **Sync on Startup** | Initiates sync 3 seconds after opening Obsidian. | `true` |
| **Periodic Sync** | Automatically syncs in the background every $N$ minutes. | `10 min` |
| **Sync on File Change** | Triggers sync a few seconds after saving/editing a note. | `false` |
| **File Change Delay** | Debounce delay before syncing modified files. | `5 seconds` |
| **Sync Direction** | `Bidirectional`, `Push Only`, or `Pull Only`. | `Bidirectional` |
| **Conflict Resolution** | `Keep Newer`, `Keep Local`, `Keep Remote`, or `Keep Both (Conflict Copy)`. | `Keep Newer` |
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
| **Exists** | **Exists** | *None* or Old | Identical ($size$ and $mtime$ match) | **No-op** (Mark equal) |
| **Modified** | Unchanged | Same as $R$ | Local edited | **Upload** to Google Drive |
| Unchanged | **Modified** | Same as $L$ | Remote edited | **Download** to local vault |
| **Modified** | **Modified** | Old | Both edited (Conflict) | Resolved via chosen **Conflict Rule** |
| **Exists** | *None* | Exists | Remote deleted | **Delete** locally |
| *None* | **Exists** | Exists | Local deleted | **Delete** on Google Drive |

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
