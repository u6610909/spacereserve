import { createHash, randomBytes } from 'node:crypto';

import { ConfidentialClientApplication } from '@azure/msal-node';
import { type Role, type User } from '@prisma/client';

import { config, getSecrets } from '../../config';
import { ServiceUnavailableError, UnauthorizedError } from '../../lib/errors';
import { signAccessToken } from '../../lib/jwt';
import { getPrisma } from '../../lib/prisma';

const SCOPES = ['openid', 'profile', 'email'];

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export interface Pkce {
  state: string;
  codeVerifier: string;
  codeChallenge: string;
}

/** Fresh state + PKCE pair for one login attempt (MASTER_PROMPT §8 / CLAUDE.md). */
export function generatePkce(): Pkce {
  const state = base64url(randomBytes(16));
  const codeVerifier = base64url(randomBytes(32));
  const codeChallenge = base64url(createHash('sha256').update(codeVerifier).digest());
  return { state, codeVerifier, codeChallenge };
}

let msalClient: ConfidentialClientApplication | undefined;

/**
 * `undefined` when AD isn't configured yet (still blocked — see CLAUDE.md
 * "Still blocked": personal Entra tenant + app registration). Callers turn
 * that into a clear 503 rather than a confusing MSAL error.
 */
function getMsalClient(): ConfidentialClientApplication | undefined {
  const secrets = getSecrets();
  if (!config.adTenantId || !secrets.adClientId || !secrets.adClientSecret) return undefined;

  if (!msalClient) {
    msalClient = new ConfidentialClientApplication({
      auth: {
        clientId: secrets.adClientId,
        clientSecret: secrets.adClientSecret,
        authority: `https://login.microsoftonline.com/${config.adTenantId}`,
      },
    });
  }
  return msalClient;
}

export async function buildAuthCodeUrl(pkce: Pkce): Promise<string> {
  const client = getMsalClient();
  if (!client) {
    throw new ServiceUnavailableError(
      'Microsoft sign-in is not configured yet (no AD tenant/client id). See CLAUDE.md "Still blocked".',
    );
  }
  if (!config.adRedirectUri) {
    throw new ServiceUnavailableError('AD_REDIRECT_URI is not configured.');
  }

  return client.getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: config.adRedirectUri,
    state: pkce.state,
    codeChallenge: pkce.codeChallenge,
    codeChallengeMethod: 'S256',
  });
}

interface OidcClaims {
  oid: string;
  email: string;
  name: string;
}

async function exchangeCodeForClaims(code: string, codeVerifier: string): Promise<OidcClaims> {
  const client = getMsalClient();
  if (!client) {
    throw new ServiceUnavailableError('Microsoft sign-in is not configured yet.');
  }
  if (!config.adRedirectUri) {
    throw new ServiceUnavailableError('AD_REDIRECT_URI is not configured.');
  }

  const result = await client.acquireTokenByCode({
    code,
    codeVerifier,
    scopes: SCOPES,
    redirectUri: config.adRedirectUri,
  });

  const claims = result.idTokenClaims as { oid?: string; preferred_username?: string; email?: string; name?: string };
  if (!claims.oid) {
    throw new UnauthorizedError('AD did not return an object id (oid) claim');
  }

  return {
    oid: claims.oid,
    email: claims.email ?? claims.preferred_username ?? '',
    name: claims.name ?? claims.email ?? claims.preferred_username ?? 'Unknown',
  };
}

async function upsertUser(adObjectId: string, email: string, name: string): Promise<User> {
  return getPrisma().user.upsert({
    where: { adObjectId },
    update: { email, name },
    create: { adObjectId, email, name },
  });
}

export async function completeLogin(code: string, codeVerifier: string): Promise<{ user: User; token: string }> {
  const claims = await exchangeCodeForClaims(code, codeVerifier);
  const user = await upsertUser(claims.oid, claims.email, claims.name);
  const token = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  return { user, token };
}

/**
 * Dev-only path around the whole OIDC dance — see auth.controller.ts for the
 * production guard. `adObjectId` is deterministic per email so repeated calls
 * reuse the same seeded user instead of creating a new one each time.
 */
export async function devLogin(email: string, name: string, role: Role): Promise<{ user: User; token: string }> {
  const adObjectId = `dev:${email}`;
  const user = await getPrisma().user.upsert({
    where: { adObjectId },
    update: { email, name, role },
    create: { adObjectId, email, name, role },
  });
  const token = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  return { user, token };
}

export async function reissueToken(userId: string): Promise<{ user: User; token: string }> {
  const user = await getPrisma().user.findUniqueOrThrow({ where: { id: userId } });
  const token = signAccessToken({ sub: user.id, email: user.email, role: user.role });
  return { user, token };
}

export async function getUserById(userId: string): Promise<User> {
  return getPrisma().user.findUniqueOrThrow({ where: { id: userId } });
}
