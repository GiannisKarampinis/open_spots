import axios from "axios";

const ACCESS_KEY = "access";
const LEGACY_ACCESS_KEY = "access_token";
const LEGACY_REFRESH_KEYS = ["refresh", "refresh_token"];
const USER_KEY = "user";

let accessToken = null;
let refreshPromise = null;
let cachedCsrfToken = null;

function clearStoredTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(LEGACY_ACCESS_KEY);
  LEGACY_REFRESH_KEYS.forEach((key) => localStorage.removeItem(key));
}

export async function ensureCsrfToken(options = {}) {
  const { fresh = false } = options;

  if (!fresh && cachedCsrfToken) {
    return cachedCsrfToken;
  }

  const res = await axios.get("/api/v1/csrf/", {
    withCredentials: true,
  });

  const token = res.data.csrfToken;

  if (!token || typeof token !== "string") {
    throw new Error("CSRF endpoint did not return a valid csrfToken.");
  }

  cachedCsrfToken = token;
  return cachedCsrfToken;
}

export async function postWithCsrf(url, data = {}, config = {}) {
  const csrfToken = await ensureCsrfToken({ fresh: true });

  return axios.post(url, data, {
    ...config,
    withCredentials: true,
    headers: {
      ...(config.headers || {}),
      "X-CSRFToken": csrfToken,
    },
  });
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
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
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
  cachedCsrfToken = null;

  clearStoredTokens();
  localStorage.removeItem(USER_KEY);

  window.dispatchEvent(new Event("auth:changed"));
}

export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = axios
      .post("/api/token/refresh/", {}, { withCredentials: true })
      .then((res) => {
        const access = res.data.access;

        if (!access) {
          throw new Error("Refresh response did not include an access token.");
        }

        accessToken = access;
        clearStoredTokens();

        window.dispatchEvent(new Event("auth:changed"));
        return access;
      })
      .catch((err) => {
        clearStoredAuth();
        throw err;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }

  return refreshPromise;
}

export async function logoutSession() {
  try {
    await axios.post(
      "/api/v1/accounts/logout/",
      {},
      {
        withCredentials: true,
      }
    );
  } catch {
    // Ignore backend logout failure; frontend auth must still be cleared.
  } finally {
    clearStoredAuth();
  }
}

export async function requestWithAuth(
  method,
  url,
  data = null,
  config = {},
  options = {}
) {
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

  const needsCsrf = ["post", "patch", "put", "delete"].includes(
    method.toLowerCase()
  );

  const csrfToken = needsCsrf
    ? await ensureCsrfToken({ fresh: true })
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