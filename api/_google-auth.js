const crypto = require('crypto');

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function normalizePrivateKey(value) {
  if (!value) return '';
  return String(value)
    .replace(/\\n/g, '\n')
    .replace(/^"|"$/g, '')
    .trim();
}

let cachedToken = null;

async function getGoogleAccessToken(scopes) {
  const clientEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY);

  if (!clientEmail || !privateKey) {
    throw new Error('Service Account não configurada. Defina GOOGLE_SERVICE_ACCOUNT_EMAIL e GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY na Vercel.');
  }

  const scopeString = Array.isArray(scopes) ? scopes.join(' ') : String(scopes || '');
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && cachedToken.exp > now + 60 && cachedToken.scopeString === scopeString) {
    return cachedToken.access_token;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claimSet = {
    iss: clientEmail,
    scope: scopeString,
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now
  };

  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claimSet))}`;
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey);
  const jwt = `${signingInput}.${base64url(signature)}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt
    })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || 'Não foi possível autenticar a Service Account no Google.');
  }

  cachedToken = {
    access_token: data.access_token,
    exp: now + Number(data.expires_in || 3600),
    scopeString
  };
  return data.access_token;
}

module.exports = { getGoogleAccessToken };
