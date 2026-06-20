import axios from "axios";

const ACCESS_KEY = "access";
const LEGACY_ACCESS_KEY = "access_token";
const LEGACY_REFRESH_KEYS = ["refresh", "refresh_token"];
const USER_KEY = "user";

let accessToken = null;

function clearStoredTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  LEGACY_REFRESH_KEYS.forEach((key) => localStorage.removeItem(key));
}

export function getAccessToken() {
  return accessToken;
}

export function authHeaders() {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function readStoredUser() {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY));
  } catch {
    return null;
  }
}

export function storeAuthResponse(data) {
  if (data.access) {
    accessToken = data.access;
  }
  if (data.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }
  clearStoredTokens();
  window.dispatchEvent(new Event("auth:changed"));
}

export function clearStoredAuth() {
  accessToken = null;
  clearStoredTokens();
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("auth:changed"));
}

export async function refreshAccessToken() {
  const res = await axios.post("/api/token/refresh/", {}, { withCredentials: true });
  const access = res.data.access;
  if (!access) return null;

  accessToken = access;
  clearStoredTokens();
  window.dispatchEvent(new Event("auth:changed"));
  return access;
}

export async function logoutSession() {
  try {
    await axios.post("/api/v1/accounts/logout/", {}, { withCredentials: true });
  } finally {
    clearStoredAuth();
  }
}

export async function requestWithAuth(method, url, data = null, config = {}, options = {}) {
  let token = getAccessToken();
  if (!token) {
    try {
      token = await refreshAccessToken();
    } catch {
      clearStoredAuth();
      options.onUnauthenticated?.();
      return null;
    }
  }

  const requestConfig = {
    ...config,
    method,
    url,
    data,
    headers: { ...authHeaders(), ...(config.headers || {}) },
    withCredentials: true,
  };

  try {
    return await axios(requestConfig);
  } catch (err) {
    if (err.response?.status !== 401) {
      throw err;
    }

    try {
      const access = await refreshAccessToken();
      if (access) {
        return await axios({
          ...requestConfig,
          headers: { ...requestConfig.headers, Authorization: `Bearer ${access}` },
        });
      }
    } catch {
      clearStoredAuth();
      options.onUnauthenticated?.();
      return null;
    }

    clearStoredAuth();
    options.onUnauthenticated?.();
    return null;
  }
}

export function getWithAuth(url, config = {}, options = {}) {
  return requestWithAuth("get", url, null, config, options);
}

export function postWithAuth(url, data = {}, config = {}, options = {}) {
  return requestWithAuth("post", url, data, config, options);
}

export function patchWithAuth(url, data = {}, config = {}, options = {}) {
  return requestWithAuth("patch", url, data, config, options);
}
