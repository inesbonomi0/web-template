import React, { useCallback, useEffect } from 'react';
import { useConfiguration } from '../../context/configurationContext';
import { Button } from '../../components';
import { propTypes } from '../../util/types';

import css from './MercadoPagoConnectSection.module.css';

/**
 * A simple section that lets providers connect their Mercado Pago account via OAuth.
 *
 * Props:
 * - currentUser (object): current user entity from Redux store.
 */
const MercadoPagoConnectSection = props => {
  const { currentUser } = props;
  const config = useConfiguration();

  // Read connection status from protectedData
  const protectedData = currentUser?.attributes?.profile?.protectedData || {};
  const isConnected = !!protectedData.mpAccessToken;

  // Helper to generate a random code verifier (43–128 chars).
  const generateCodeVerifier = () => {
    const array = new Uint32Array(64);
    window.crypto.getRandomValues(array);
    return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2))
      .join('')
      .slice(0, 128);
  };

  // Helper to base64url-encode a word array (from crypto-js SHA256)
  const base64UrlEncode = wordArray => {
    const base64 = window.btoa(String.fromCharCode.apply(null, wordArray));
    return base64
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  const generateCodeChallenge = async verifier => {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await window.crypto.subtle.digest('SHA-256', data);
    const byteArray = new Uint8Array(digest);
    let binary = '';
    byteArray.forEach(b => (binary += String.fromCharCode(b)));
    return window
      .btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  // Build authorization URL for Mercado Pago OAuth flow
  const buildAuthUrl = async () => {
    const clientId = process.env.REACT_APP_MP_APP_ID;
    if (!clientId) {
      // eslint-disable-next-line no-console
      console.error('Missing REACT_APP_MP_APP_ID env var.');
    }

    // redirect_uri must match the one configured in the MP application.
    const radix = 10;
    const devPort = parseInt(process.env.REACT_APP_DEV_API_SERVER_PORT || '', radix);
    const useDevApiServer = process.env.NODE_ENV === 'development' && !!devPort;

    const redirectUri = useDevApiServer
      ? `https://walrus-vocal-calf.ngrok-free.app/api/mp/oauth/callback`
      : `${config.marketplaceRootURL?.replace(/\/$/, '')}/api/mp/oauth/callback`;

    console.log('redirectUri', redirectUri);

    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    // Use a concise, URL-safe random string as state (no JSON)
    const state = codeVerifier.slice(0, 48); // first 48 chars is plenty random
    // Persist full codeVerifier in sessionStorage so the backend can retrieve it later
    sessionStorage.setItem(`mp_cv_${state}`, codeVerifier);

    const query = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      platform_id: 'mp',
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state,
    });

    return `https://auth.mercadopago.com/authorization?${query.toString()}`;
  };

  const handleConnectClick = useCallback(async () => {
    const authUrl = await buildAuthUrl();
    const width = 600;
    const height = 720;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;
    window.open(
      authUrl,
      'mpConnect',
      `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no`
    );
  }, []);

  // Listen for success message from the popup window
  useEffect(() => {
    const listener = event => {
      if (event?.data?.type === 'mp-connect-success') {
        // Simply reload the current page so that Redux store gets fresh currentUser data.
        window.location.reload();
      }
    };
    window.addEventListener('message', listener);
    return () => {
      window.removeEventListener('message', listener);
    };
  }, []);

  return (
    <div className={css.root}>
      {isConnected ? (
        <span className={css.connected}>Cuenta de Mercado Pago conectada ✅</span>
      ) : (
        <Button type="button" onClick={handleConnectClick} className={css.connectButton}>
          Conectar Mercado Pago
        </Button>
      )}
    </div>
  );
};

MercadoPagoConnectSection.propTypes = {
  currentUser: propTypes.currentUser,
};

export default MercadoPagoConnectSection;
