const { google } = require('googleapis');

import { GOOGLE_WORKSPACE_SCOPES, type GoogleOAuthEnv } from './types';

export const DEFAULT_GOOGLE_REDIRECT_URI = 'http://127.0.0.1:3000/oauth2callback';

export class GoogleWorkspaceConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GoogleWorkspaceConfigurationError';
  }
}

export function readGoogleOAuthEnv(env: NodeJS.ProcessEnv = process.env): GoogleOAuthEnv {
  const clientId = env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim();
  const refreshToken = env.GOOGLE_REFRESH_TOKEN?.trim();

  if (!clientId || !clientSecret || !refreshToken) {
    throw new GoogleWorkspaceConfigurationError(
      'Google Workspace is not connected yet. Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN to your environment, then try again.',
    );
  }

  return {
    clientId,
    clientSecret,
    refreshToken,
  };
}

export function createOAuthClient(
  env: Pick<GoogleOAuthEnv, 'clientId' | 'clientSecret'>,
  redirectUri = DEFAULT_GOOGLE_REDIRECT_URI,
) {
  return new google.auth.OAuth2(env.clientId, env.clientSecret, redirectUri);
}

export function generateConsentUrl(redirectUri = DEFAULT_GOOGLE_REDIRECT_URI): string {
  const env = readGoogleOAuthEnv({
    ...process.env,
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN || 'placeholder-refresh-token',
  });
  const oauthClient = createOAuthClient(env, redirectUri);

  return oauthClient.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [...GOOGLE_WORKSPACE_SCOPES],
  });
}

export async function exchangeCodeForRefreshToken(
  code: string,
  redirectUri = DEFAULT_GOOGLE_REDIRECT_URI,
): Promise<string> {
  const env = readGoogleOAuthEnv({
    ...process.env,
    GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN || 'placeholder-refresh-token',
  });
  const oauthClient = createOAuthClient(env, redirectUri);
  const { tokens } = await oauthClient.getToken(code.trim());

  if (!tokens.refresh_token) {
    throw new GoogleWorkspaceConfigurationError(
      'Google did not return a refresh token. Run the consent step again and make sure Google shows the permission screen.',
    );
  }

  return tokens.refresh_token;
}

export async function createAuthorizedClient() {
  const env = readGoogleOAuthEnv();
  const oauthClient = createOAuthClient(env);
  oauthClient.setCredentials({ refresh_token: env.refreshToken });
  await oauthClient.getAccessToken();
  return oauthClient;
}

export function getFriendlyGoogleErrorMessage(error: unknown): string {
  if (error instanceof GoogleWorkspaceConfigurationError) {
    return error.message;
  }

  const rawMessage = extractErrorMessage(error);
  const normalized = rawMessage.toLowerCase();

  if (
    normalized.includes('invalid_grant') ||
    normalized.includes('token has been expired or revoked') ||
    normalized.includes('reauth')
  ) {
    return 'Your Google connection expired — run the setup again to refresh it.';
  }

  if (normalized.includes('invalid_client') || normalized.includes('unauthorized_client')) {
    return 'Google rejected this app setup. Double-check GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, then try again.';
  }

  if (
    normalized.includes('insufficient authentication scopes') ||
    normalized.includes('request had insufficient authentication scopes')
  ) {
    return 'Google signed you in, but this connection is missing one or more permissions. Run the setup again and approve every requested permission.';
  }

  if (normalized.includes('the caller does not have permission') || normalized.includes('not found')) {
    return 'This Google account does not have access to that classroom, file, sheet, or calendar item.';
  }

  return rawMessage || 'Google Workspace request failed. Please try again in a moment.';
}

function extractErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  if (error && typeof error === 'object') {
    const maybeError = error as {
      response?: { data?: { error?: string; error_description?: string; message?: string } | string };
      errors?: Array<{ message?: string }>;
      message?: string;
    };

    const responseData = maybeError.response?.data;
    if (typeof responseData === 'string' && responseData.trim()) {
      return responseData;
    }

    if (responseData && typeof responseData === 'object') {
      const nestedMessage = responseData.error_description || responseData.message || responseData.error;
      if (nestedMessage) {
        return nestedMessage;
      }
    }

    const firstNestedMessage = maybeError.errors?.find(item => item.message)?.message;
    if (firstNestedMessage) {
      return firstNestedMessage;
    }

    if (maybeError.message) {
      return maybeError.message;
    }
  }

  return 'Unknown Google Workspace error.';
}

async function runCli(): Promise<void> {
  const [command, value, redirectUri] = process.argv.slice(2);

  if (command === 'consent-url') {
    console.log(generateConsentUrl(redirectUri));
    return;
  }

  if (command === 'exchange-code') {
    if (!value) {
      throw new GoogleWorkspaceConfigurationError(
        'Paste the code from the browser URL after the exchange-code command.',
      );
    }

    const refreshToken = await exchangeCodeForRefreshToken(value, redirectUri);
    console.log(refreshToken);
    return;
  }

  console.log([
    'Google Workspace OAuth helper',
    '',
    'Usage:',
    '  node dist/auth.js consent-url [redirectUri]',
    '  node dist/auth.js exchange-code <code> [redirectUri]',
    '',
    `Default redirect URI: ${DEFAULT_GOOGLE_REDIRECT_URI}`,
  ].join('\n'));
}

if (require.main === module) {
  runCli().catch(error => {
    console.error(getFriendlyGoogleErrorMessage(error));
    process.exitCode = 1;
  });
}
