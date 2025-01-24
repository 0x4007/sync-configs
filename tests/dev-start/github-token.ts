import * as jwt from "jsonwebtoken";
import { Installation } from "./constants";
import { getRequiredEnvVar } from "./env-utils";

const GITHUB_ACCEPT_HEADER = "application/vnd.github.machine-man-preview+json";

export async function generateGitHubAppToken(owner: string, repo: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 60 seconds ago
    exp: now + 10 * 60, // Expires in 10 minutes
    iss: getRequiredEnvVar("APP_ID"),
  };

  try {
    const privateKey = getRequiredEnvVar("APP_PRIVATE_KEY");
    const token = jwt.sign(payload, privateKey, {
      algorithm: "RS256",
    });

    // Exchange JWT for installation token
    const installationsResponse = await fetch("https://api.github.com/app/installations", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: GITHUB_ACCEPT_HEADER,
      },
    });

    if (!installationsResponse.ok) {
      throw new Error(`Failed to get installations: ${installationsResponse.statusText}`);
    }

    const installations = await installationsResponse.json();
    if (!installations.length) {
      throw new Error("No installations found for this GitHub App");
    }

    // First try to find installation specifically for this repository
    const repoInstallationResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}/installation`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: GITHUB_ACCEPT_HEADER,
      },
    });

    let installationId: number;
    if (repoInstallationResponse.ok) {
      const repoInstallation = await repoInstallationResponse.json();
      installationId = repoInstallation.id;
      console.log(`Found repository-specific installation ID: ${installationId}`);
    } else {
      // Fallback to finding org installation
      const orgInstallation = installations.find(
        (i: Installation) => i.account?.login === owner || (i.target_type === "Organization" && i.account?.type === "Organization")
      );

      if (!orgInstallation) {
        throw new Error(`No installation found for repository ${owner}/${repo} or organization ${owner}`);
      }

      installationId = orgInstallation.id;
      console.log(`Using organization installation ID: ${installationId}`);
    }
    process.env.APP_INSTALLATION_ID = installationId.toString();

    const accessResponse = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: GITHUB_ACCEPT_HEADER,
      },
      body: JSON.stringify({
        permissions: {
          contents: "write",
          pull_requests: "write",
        },
        repository_selection: "selected", // Specify we want access to selected repositories
      }),
    });

    if (!accessResponse.ok) {
      throw new Error(`Failed to get access token: ${accessResponse.statusText}`);
    }

    const tokenResponse = await accessResponse.json();
    // Verify we have the necessary permissions
    const requiredPermissions = ["contents", "pull_requests"];
    const missingPermissions = requiredPermissions.filter((perm) => !tokenResponse.permissions[perm] || tokenResponse.permissions[perm] !== "write");

    if (missingPermissions.length > 0) {
      throw new Error(`Token missing required write permissions: ${missingPermissions.join(", ")}`);
    }

    console.log("Installation token response:", {
      permissions: tokenResponse.permissions,
      repository_selection: tokenResponse.repository_selection,
      token: tokenResponse.token ? "[REDACTED]" : undefined,
      token_type: tokenResponse.token_type,
      expires_at: tokenResponse.expires_at,
    });
    return tokenResponse.token;
  } catch (error) {
    console.error("Error generating GitHub App token:", error);
    throw error;
  }
}
