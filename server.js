import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const app = express();
const port = Number(process.env.PORT || 8000);
const auth0Domain = process.env.VITE_AUTH0_DOMAIN || '';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distDir = path.join(__dirname, 'dist');
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmail(email) {
  return typeof email === 'string' && emailPattern.test(email.trim());
}

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
