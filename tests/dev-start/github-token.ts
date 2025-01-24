import * as jwt from "jsonwebtoken";
import { GITHUB_OWNER, Installation } from "./constants";
import { getRequiredEnvVar } from "./env-utils";

export async function generateGitHubAppToken(): Promise<string> {
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
        Accept: "application/vnd.github.machine-man-preview+json",
      },
    });

    if (!installationsResponse.ok) {
      throw new Error(`Failed to get installations: ${installationsResponse.statusText}`);
    }

    const installations = await installationsResponse.json();
    if (!installations.length) {
      throw new Error("No installations found for this GitHub App");
    }

    // Find the specific installation for the target repository
    const installationId =
      installations.find((i: Installation) => i.account?.login === GITHUB_OWNER || (i.target_type === "Organization" && i.account?.type === "Organization"))
        ?.id || installations[0].id;

    console.log("Using installation ID:", installationId);
    process.env.INSTALLATION_ID = installationId.toString();

    const accessResponse = await fetch(`https://api.github.com/app/installations/${installationId}/access_tokens`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.machine-man-preview+json",
      },
      body: JSON.stringify({
        permissions: {
          contents: "write" // Only need contents write permission for branch deletion
        },
        repository_selection: "selected" // Specify we want access to selected repositories
      }),
    });

    if (!accessResponse.ok) {
      throw new Error(`Failed to get access token: ${accessResponse.statusText}`);
    }

    const tokenResponse = await accessResponse.json();
    // Verify we have the necessary permissions
    const requiredPermissions = ['contents'];
    const missingPermissions = requiredPermissions.filter(
      perm => !tokenResponse.permissions[perm] || tokenResponse.permissions[perm] !== 'write'
    );

    if (missingPermissions.length > 0) {
      throw new Error(`Token missing required write permissions: ${missingPermissions.join(', ')}`);
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
