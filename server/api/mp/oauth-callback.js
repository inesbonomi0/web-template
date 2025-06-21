const https = require('https');
const querystring = require('querystring');
const { getSdk, handleError } = require('../../api-util/sdk');

// Environment variables required for Mercado Pago OAuth
const MP_APP_ID = process.env.MP_APP_ID;
const MP_APP_SECRET = process.env.MP_APP_SECRET;
const MARKETPLACE_ROOT_URL = process.env.REACT_APP_MARKETPLACE_ROOT_URL;

// Helper to build redirect URI that was used in the initial OAuth request
const buildRedirectUri = () => {
  // The redirect URI must match the one registered in the Mercado Pago application settings
  // and the one that was used when initiating the OAuth flow. We construct it dynamically to
  // work both in local development (proxy server) and in production.
  const radix = 10;
  const DEV_PORT = parseInt(process.env.REACT_APP_DEV_API_SERVER_PORT || '', radix);
  const useDevApiServer = process.env.NODE_ENV === 'development' && !!DEV_PORT;

  if (useDevApiServer) {
    return `http://localhost:${DEV_PORT}/api/mp/oauth/callback`;
  }

  // Fallback to marketplace root URL coming from env – trailing slash trimmed.
  const root = MARKETPLACE_ROOT_URL ? MARKETPLACE_ROOT_URL.replace(/\/$/, '') : '';
  return `${root}/api/mp/oauth/callback`;
};

// Exchange authorization code -> access_token at Mercado Pago
const exchangeCodeForToken = (code, redirectUri) => {
  return new Promise((resolve, reject) => {
    const postData = querystring.stringify({
      grant_type: 'authorization_code',
      client_id: MP_APP_ID,
      client_secret: MP_APP_SECRET,
      code,
      redirect_uri: redirectUri,
    });

    const requestOptions = {
      hostname: 'api.mercadopago.com',
      path: '/oauth/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    };

    const req = https.request(requestOptions, res => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(json);
          } else {
            reject(new Error(`MP token exchange failed: ${JSON.stringify(json)}`));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
};

module.exports = async (req, res) => {
  const { code, state } = req.query || {};

  if (!code) {
    res
      .status(400)
      .json({ error: 'Missing "code" query parameter.' })
      .end();
    return;
  }

  try {
    const redirectUri = buildRedirectUri();
    const tokenResponse = await exchangeCodeForToken(code, redirectUri);

    const { access_token, refresh_token, public_key, user_id, expires_in, scope } = tokenResponse;

    // Persist credentials to current user's protectedData
    const sdk = getSdk(req, res);
    const currentUser = await sdk.currentUser.show();
    const protectedData = currentUser.data.attributes.profile?.protectedData || {};

    const updatedProtectedData = {
      ...protectedData,
      mpAccessToken: access_token,
      mpRefreshToken: refresh_token,
      mpPublicKey: public_key,
      mpUserId: user_id,
      mpScope: scope,
      mpExpiresIn: expires_in,
    };

    await sdk.currentUser.updateProfile({ protectedData: updatedProtectedData });

    // Return a minimal HTML page that closes the popup/window and notifies the opener.
    res.set('Content-Type', 'text/html');
    res.status(200).send(`<!DOCTYPE html>
<html>
<head><title>Mercado Pago Connected</title></head>
<body>
<script>
  if (window.opener) {
    window.opener.postMessage({ type: 'mp-connect-success', state: ${JSON.stringify(
      state || null
    )} }, '*');
  }
  window.close();
</script>
<p>Mercado Pago account connected. You can close this window.</p>
</body>
</html>`);
  } catch (e) {
    handleError(res, e);
  }
};
