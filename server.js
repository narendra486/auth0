import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const app = express();
const port = Number(process.env.PORT || 8000);
const auth0Domain = process.env.VITE_AUTH0_DOMAIN || '';
const auth0ClientId = process.env.VITE_AUTH0_CLIENT_ID || '';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const backChannelEvent = 'http://schemas.openid.net/event/backchannel-logout';
const revokedSubs = new Map();
const revokedSids = new Map();

const issuer = auth0Domain ? `https://${auth0Domain}/` : '';
const jwks = auth0Domain
  ? createRemoteJWKSet(new URL(`https://${auth0Domain}/.well-known/jwks.json`))
  : null;

app.use(express.urlencoded({ extended: false }));

function isValidEmail(email) {
  return typeof email === 'string' && emailPattern.test(email.trim());
}

function purgeExpiredRevocations() {
  const now = Math.floor(Date.now() / 1000);

  for (const [key, exp] of revokedSubs) {
    if (exp <= now) {
      revokedSubs.delete(key);
    }
  }

  for (const [key, exp] of revokedSids) {
    if (exp <= now) {
      revokedSids.delete(key);
    }
  }
}

function markRevoked(subject, sid, exp) {
  const expiry = Number.isFinite(exp) ? exp : Math.floor(Date.now() / 1000) + 3600;

  if (subject) {
    revokedSubs.set(subject, expiry);
  }

  if (sid) {
    revokedSids.set(sid, expiry);
  }
}

function isRevoked(user) {
  purgeExpiredRevocations();
  const sub = typeof user?.sub === 'string' ? user.sub : '';
  const sid = typeof user?.sid === 'string' ? user.sid : '';

  return (sub && revokedSubs.has(sub)) || (sid && revokedSids.has(sid));
}

async function verifyLogoutToken(logoutToken) {
  if (!logoutToken || !jwks || !issuer || !auth0ClientId) {
    throw new Error('logout_token_validation_not_configured');
  }

  const { payload } = await jwtVerify(logoutToken, jwks, {
    issuer,
    audience: auth0ClientId
  });

  if (payload.nonce) {
    throw new Error('logout_token_has_nonce');
  }

  const events = payload.events;
  if (!events || typeof events !== 'object' || !(backChannelEvent in events)) {
    throw new Error('logout_token_missing_event');
  }

  if (!payload.sub && !payload.sid) {
    throw new Error('logout_token_missing_sub_or_sid');
  }

  return payload;
}

app.post('/auth/backchannel-logout', async (req, res) => {
  const logoutToken = req.body?.logout_token;

  if (!logoutToken) {
    return res.status(400).json({
      ok: false,
      error: 'missing_logout_token'
    });
  }

  try {
    const payload = await verifyLogoutToken(logoutToken);
    markRevoked(payload.sub, payload.sid, payload.exp);

    return res.status(200).send('');
  } catch (err) {
    return res.status(400).json({
      ok: false,
      error: err instanceof Error ? err.message : 'invalid_logout_token'
    });
  }
});

app.get('/api/search', (req, res) => {
  const query = String(req.query.q || '').trim();
  const baseResults = ['demo result 1', 'demo result 2', 'demo result 3'];
  const results = query
    ? baseResults.map((item) => `${item} for "${query}"`)
    : baseResults;

  res.json({
    ok: true,
    endpoint: 'search',
    results
  });
});

app.get('/api/dummy/profile', async (req, res) => {
  const authHeader = req.get('authorization') || '';
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({
      ok: false,
      error: 'missing_bearer_token'
    });
  }

  if (!auth0Domain) {
    return res.status(500).json({
      ok: false,
      error: 'missing_auth0_domain'
    });
  }

  try {
    const response = await fetch(`https://${auth0Domain}/userinfo`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        ok: false,
        error: 'userinfo_request_failed'
      });
    }

    const user = await response.json();
    const email = typeof user?.email === 'string' ? user.email.trim() : '';

    if (isRevoked(user)) {
      return res.status(401).json({
        ok: false,
        error: 'session_revoked'
      });
    }

    if (!isValidEmail(email)) {
      return res.status(422).json({
        ok: false,
        error: 'invalid_email_claim'
      });
    }

    return res.json({
      ok: true,
      user: {
        sub: user?.sub || null,
        sid: user?.sid || null,
        name: user?.name || null,
        email,
        picture: user?.picture || null
      }
    });
  } catch {
    return res.status(502).json({
      ok: false,
      error: 'auth0_unreachable'
    });
  }
});

app.use(
  express.static(distDir, {
    etag: false,
    maxAge: 0
  })
);

app.get('*', (req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
