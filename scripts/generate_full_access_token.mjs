import http from "node:http";
import https from "node:https";
import { exec } from "node:child_process";
import readline from "node:readline";

/**
 * Helper to obtain a Google OAuth Refresh Token with full drive access (https://www.googleapis.com/auth/drive).
 * Requires an OAuth Client ID created as "Desktop app" in Google Cloud Console.
 */

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question) {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  console.log("\n=== Google Drive Full-Access Token Generator ===");
  console.log("Note: Requires an OAuth Client ID created as 'Desktop app' in Google Cloud Console.\n");

  const clientId = (await ask("Enter your Google Client ID: ")).trim();
  const clientSecret = (await ask("Enter your Google Client Secret: ")).trim();

  if (!clientId || !clientSecret) {
    console.error("Client ID and Client Secret are required.");
    process.exit(1);
  }

  const port = 8085;
  const redirectUri = `http://127.0.0.1:${port}/oauth2callback`;
  const scope = "https://www.googleapis.com/auth/drive";

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    if (url.pathname === "/oauth2callback") {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(`<h2>Authorization Error</h2><p>${error}</p>`);
        console.error("\nAuthorization failed:", error);
        server.close();
        process.exit(1);
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<h2>Success!</h2><p>You can close this window and return to your terminal.</p>");
        server.close();

        // Exchange code for tokens
        try {
          const tokenData = await exchangeCodeForTokens(clientId, clientSecret, code, redirectUri);
          console.log("\n=======================================================");
          console.log("SUCCESS! Your permanent Google Drive Refresh Token is:\n");
          console.log(tokenData.refresh_token);
          console.log("=======================================================\n");
          console.log("Next steps:");
          console.log("1. Open Obsidian -> Settings -> Google Drive Sync.");
          console.log("2. Expand 'Manual Token Entry (Alternative)'.");
          console.log("3. Paste this Refresh Token into 'Manual Refresh Token'.");
          console.log("4. Paste your Client ID and Client Secret, then tap Sync Now!\n");
          process.exit(0);
        } catch (e) {
          console.error("Failed to exchange authorization code for token:", e);
          process.exit(1);
        }
      }
    }
  });

  server.listen(port, () => {
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=${encodeURIComponent(scope)}&` +
      `access_type=offline&` +
      `prompt=consent`;

    console.log(`\nOpening your browser for authorization...`);
    console.log(`If it doesn't open automatically, visit this URL:\n${authUrl}\n`);
    exec(`open "${authUrl}" 2>/dev/null || xdg-open "${authUrl}" 2>/dev/null`);
  });
}

function exchangeCodeForTokens(clientId, clientSecret, code, redirectUri) {
  return new Promise((resolve, reject) => {
    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    });

    const req = https.request(
      "https://oauth2.googleapis.com/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
      (res) => {
        let body = "";
        res.on("data", (chunk) => (body += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(body);
            if (json.error) {
              reject(new Error(json.error_description || json.error));
            } else {
              resolve(json);
            }
          } catch (e) {
            reject(new Error("Invalid JSON response from Google: " + body));
          }
        });
      }
    );

    req.on("error", reject);
    req.write(params.toString());
    req.end();
  });
}

main().catch(console.error);
