import axios from "axios";

const ACCESS_KEY = "access";
const REFRESH_KEY = "refresh";
const LEGACY_ACCESS_KEY = "access_token";
const LEGACY_REFRESH_KEY = "refresh_token";
const USER_KEY = "user";

let accessToken = localStorage.getItem(ACCESS_KEY) || localStorage.getItem(LEGACY_ACCESS_KEY) || null;

function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) {
    return parts.pop().split(";").shift();
  }
  return "";
}

export async function ensureCsrfToken() {
  let token = getCookie("csrftoken");

  if (!token) {
    await axios.get("/api/v1/csrf/", { withCredentials: true });
    token = getCookie("csrftoken");
  }

  return token;
}

export function getAccessToken() {
  return accessToken || localStorage.getItem(ACCESS_KEY) || localStorage.getItem(LEGACY_ACCESS_KEY);
}

export function getRefreshToken() {
  return localStorage.getItem(REFRESH_KEY) || localStorage.getItem(LEGACY_REFRESH_KEY);
}

export function authHeaders() {
  const token = getAccessToken();

  return token ? { Authorization: `Bearer ${token}` } : {};
}

export function readStoredUser() {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function storeAuthResponse(data) {
  if (data.access) {
    accessToken = data.access;
    localStorage.setItem(ACCESS_KEY, data.access);
    localStorage.removeItem(LEGACY_ACCESS_KEY);
  }

  if (data.refresh) {
    localStorage.setItem(REFRESH_KEY, data.refresh);
    localStorage.removeItem(LEGACY_REFRESH_KEY);
  }

  if (data.user) {
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
  }

  window.dispatchEvent(new Event("auth:changed"));
}

export function clearStoredAuth() {
  accessToken = null;

  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  localStorage.removeItem(LEGACY_REFRESH_KEY);
  localStorage.removeItem(USER_KEY);

  window.dispatchEvent(new Event("auth:changed"));
}

export async function refreshAccessToken() {
  const refresh = getRefreshToken();

  if (!refresh) {
    throw new Error("No refresh token available.");
  }

  const res = await axios.post(
    "/api/token/refresh/",
    { refresh },
    { withCredentials: true }
  );

  const access = res.data.access;

  if (!access) {
    throw new Error("Refresh response did not include an access token.");
  }

  accessToken = access;
  localStorage.setItem(ACCESS_KEY, access);
  localStorage.removeItem(LEGACY_ACCESS_KEY);

  window.dispatchEvent(new Event("auth:changed"));

  return access;
}

export async function logoutSession() {
  try {
    await axios.post("/api/v1/accounts/logout/", {}, { withCredentials: true });
  } catch {
    // Ignore backend logout failure; frontend auth must still be cleared.
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

  const csrfToken = ["post", "patch", "put", "delete"].includes(method.toLowerCase())
    ? await ensureCsrfToken()
    : "";

  const requestConfig = {
    ...config,
    method,
    url,
    data,
    headers: {
      ...(config.headers || {}),
      Authorization: `Bearer ${token}`,
      ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
    },
    withCredentials: true,
  };

  try {
    return await axios(requestConfig);
  } catch (err) {
    if (err.response?.status !== 401) {
      throw err;
    }

    try {
      const newAccess = await refreshAccessToken();

      return await axios({
        ...requestConfig,
        headers: {
          ...(requestConfig.headers || {}),
          Authorization: `Bearer ${newAccess}`,
          ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
        },
      });
    } catch {
      clearStoredAuth();
      options.onUnauthenticated?.();
      return null;
    }
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