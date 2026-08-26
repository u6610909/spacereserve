import type { CookieOptions, RequestHandler } from 'express';

import { config } from '../../config';
import { BadRequestError, NotFoundError, UnauthorizedError } from '../../lib/errors';

import { buildAuthCodeUrl, completeLogin, devLogin, generatePkce, getUserById, reissueToken } from './auth.service';

import type { Role, User } from '@prisma/client';

const PKCE_COOKIE_MAX_AGE_MS = 10 * 60 * 1000; // login must complete within 10 minutes
const SESSION_COOKIE_MAX_AGE_MS = 60 * 60 * 1000; // matches the 1h JWT

// `secure: true` cookies are dropped by browsers over plain HTTP, so this
// only flips on in production where the app sits behind HTTPS (Nginx + the
// existing cert — CLAUDE.md's SSL section).
const baseCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: config.isProduction,
  sameSite: 'lax',
  signed: true,
};

function sanitizeUser(user: User) {
  return { id: user.id, email: user.email, name: user.name, role: user.role };
}

export const login: RequestHandler = async (_req, res, next) => {
  try {
    const pkce = generatePkce();
    const url = await buildAuthCodeUrl(pkce);

    res.cookie('oidc_state', pkce.state, { ...baseCookieOptions, maxAge: PKCE_COOKIE_MAX_AGE_MS });
    res.cookie('oidc_verifier', pkce.codeVerifier, { ...baseCookieOptions, maxAge: PKCE_COOKIE_MAX_AGE_MS });
    res.redirect(url);
  } catch (err) {
    next(err);
  }
};

export const callback: RequestHandler = async (req, res, next) => {
  try {
    const { code, state, error, error_description: errorDescription, mode } = req.query as {
      code?: string;
      state?: string;
      error?: string;
      error_description?: string;
      mode?: string;
    };

    if (error) {
      throw new BadRequestError(`Microsoft sign-in failed: ${error}`, { errorDescription });
    }

    const expectedState = req.signedCookies?.oidc_state as string | undefined;
    const codeVerifier = req.signedCookies?.oidc_verifier as string | undefined;
    res.clearCookie('oidc_state', baseCookieOptions);
    res.clearCookie('oidc_verifier', baseCookieOptions);

    if (!code || !state || !expectedState || !codeVerifier) {
      throw new BadRequestError('Missing code/state — start over at /auth/login');
    }
    if (state !== expectedState) {
      throw new UnauthorizedError('State mismatch — possible CSRF, start over at /auth/login');
    }

    const { user, token } = await completeLogin(code, codeVerifier);

    if (mode === 'json') {
      res.status(200).json({ token });
      return;
    }

    res.cookie('session', token, { ...baseCookieOptions, maxAge: SESSION_COOKIE_MAX_AGE_MS });
    res.status(200).json({ status: 'ok', user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};

/** Hard-disabled in production (MASTER_PROMPT §5) — 404s rather than 403 so its existence isn't revealed. */
export const devLoginController: RequestHandler = async (req, res, next) => {
  try {
    if (config.isProduction) {
      next(new NotFoundError());
      return;
    }
    const { email, name, role } = req.body as { email: string; name: string; role: Role };
    const { user, token } = await devLogin(email, name, role);

    res.cookie('session', token, { ...baseCookieOptions, maxAge: SESSION_COOKIE_MAX_AGE_MS });
    res.status(200).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};

export const me: RequestHandler = async (req, res, next) => {
  try {
    const user = await getUserById(req.user!.id);
    res.status(200).json({ user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};

/** Re-issues while the current token is still valid — not refresh-token rotation (Settled design decisions). */
export const refresh: RequestHandler = async (req, res, next) => {
  try {
    const { user, token } = await reissueToken(req.user!.id);
    res.cookie('session', token, { ...baseCookieOptions, maxAge: SESSION_COOKIE_MAX_AGE_MS });
    res.status(200).json({ token, user: sanitizeUser(user) });
  } catch (err) {
    next(err);
  }
};
