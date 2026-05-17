import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

export type SocialAuthProvider = 'google' | 'apple' | 'azure';

export const SOCIAL_PROVIDER_LABELS: Record<SocialAuthProvider, string> = {
  google: 'Google',
  apple: 'Apple',
  azure: 'Microsoft',
};

const getSingleParam = (value: unknown) => {
  if (Array.isArray(value)) return value[0] ? String(value[0]) : '';
  return value ? String(value) : '';
};

const parseAuthParamsFromUrl = (url: string) => {
  const parsed = Linking.parse(url);
  const queryParams = parsed.queryParams || {};

  const hashParams: Record<string, string> = {};
  const hashIndex = url.indexOf('#');

  if (hashIndex >= 0) {
    const hash = url.slice(hashIndex + 1);
    const searchParams = new URLSearchParams(hash);

    searchParams.forEach((value, key) => {
      hashParams[key] = value;
    });
  }

  return {
    code: getSingleParam(queryParams.code) || hashParams.code || '',
    accessToken:
      getSingleParam(queryParams.access_token) || hashParams.access_token || '',
    refreshToken:
      getSingleParam(queryParams.refresh_token) || hashParams.refresh_token || '',
    error:
      getSingleParam(queryParams.error) ||
      hashParams.error ||
      getSingleParam(queryParams.error_description) ||
      hashParams.error_description ||
      '',
  };
};

export const getAuthRedirectUrl = () => {
  return Linking.createURL('auth/callback');
};

export const signInWithSocialProvider = async (provider: SocialAuthProvider) => {
  const redirectTo = getAuthRedirectUrl();

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider,
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams:
        provider === 'google'
          ? {
              access_type: 'offline',
              prompt: 'select_account',
            }
          : undefined,
    },
  });

  if (error) throw error;

  if (!data?.url) {
    throw new Error('Supabase не вернул OAuth URL.');
  }

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo, {
    showInRecents: true,
    preferEphemeralSession: false,
  });

  if (result.type === 'cancel' || result.type === 'dismiss') {
    return {
      cancelled: true,
    };
  }

  if (result.type !== 'success' || !result.url) {
    throw new Error('OAuth вход не был завершён.');
  }

  const params = parseAuthParamsFromUrl(result.url);

  if (params.error) {
    throw new Error(params.error);
  }

  if (params.code) {
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
      params.code
    );

    if (exchangeError) throw exchangeError;

    return {
      cancelled: false,
    };
  }

  if (params.accessToken && params.refreshToken) {
    const { error: sessionError } = await supabase.auth.setSession({
      access_token: params.accessToken,
      refresh_token: params.refreshToken,
    });

    if (sessionError) throw sessionError;

    return {
      cancelled: false,
    };
  }

  throw new Error('Не удалось получить сессию после OAuth входа.');
};
