import { execSync } from 'child_process';
import { config } from 'dotenv';
import * as fs from 'fs';
import * as jwt from 'jsonwebtoken';
import * as path from 'path';

// Load environment variables from .env file
config();

const requiredEnvVars = [
  'ANTHROPIC_API_KEY',
  'EDITOR_INSTRUCTION',
  'INTERACTIVE',
  'ACTOR',
  'EMAIL',
  'APP_ID',
  'APP_PRIVATE_KEY'
];

// Function to generate GitHub App JWT token
async function generateGitHubAppToken() {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now - 60, // Issued 60 seconds ago
    exp: now + (10 * 60), // Expires in 10 minutes
    iss: process.env.APP_ID
  };

  try {
    if (!process.env.APP_PRIVATE_KEY) {
      throw new Error('APP_PRIVATE_KEY environment variable is required');
    }

    const token = jwt.sign(payload, process.env.APP_PRIVATE_KEY, {
      algorithm: 'RS256'
    });

    // Exchange JWT for installation token
    const response = await fetch('https://api.github.com/app/installations', {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get installations: ${response.statusText}`);
    }

    const installations = await response.json();
    if (!installations.length) {
      throw new Error('No installations found for this GitHub App');
    }

    const installationId = installations[0].id;
    const accessResponse = await fetch(
      `https://api.github.com/app/installations/${installationId}/access_tokens`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (!accessResponse.ok) {
      throw new Error(`Failed to get access token: ${accessResponse.statusText}`);
    }

    const { token: installationToken } = await accessResponse.json();
    return installationToken;
  } catch (error) {
    console.error('Error generating GitHub App token:', error);
    throw error;
  }
}

// Check for required environment variables
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`Missing required environment variable: ${envVar}`);
    process.exit(1);
  }
}

// Configure Git
async function configureGit() {
  try {
    const token = await generateGitHubAppToken();

    execSync(`git config --global user.name "${process.env.ACTOR}"`);
    execSync(`git config --global user.email "${process.env.EMAIL}"`);
    execSync('git config --global credential.helper store');

    // Create git credentials file
    const homeDir = process.env.HOME || process.env.USERPROFILE;
    if (!homeDir) {
      throw new Error('Could not determine home directory');
    }

    const gitCredentialsPath = path.join(homeDir, '.git-credentials');
    fs.writeFileSync(
      gitCredentialsPath,
      `https://${process.env.ACTOR}:${token}@github.com\n`
    );

    console.log('Git configuration completed successfully');
    return token;
  } catch (error) {
    console.error('Error configuring git:', error);
    process.exit(1);
  }
}

async function main() {
  // Default repository URL from the workflow
  const repoUrl = "https://github.com/ubiquity/.ubiquity-os.git";

  try {
    // Configure git first and get the token
    const token = await configureGit();

    // Run the start script with the repository URL
    console.log('Running start script...');
    execSync(`bun run start "${repoUrl}"`, {
      stdio: 'inherit',
      env: {
        ...process.env,
        // Ensure these specific environment variables are set
        ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
        EDITOR_INSTRUCTION: process.env.EDITOR_INSTRUCTION,
        INTERACTIVE: process.env.INTERACTIVE,
        ACTOR: process.env.ACTOR,
        EMAIL: process.env.EMAIL,
        AUTH_TOKEN: token, // Use the GitHub App token instead of AUTH_TOKEN
        USE_MOCK_CLAUDE_RESPONSE: 'true' // Short circuit Claude response in tests
      }
    });

    console.log('Script completed successfully');
  } catch (error) {
    console.error('Error running script:', error);
    process.exit(1);
  }
}

main().catch(console.error);
