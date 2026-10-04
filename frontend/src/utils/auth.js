import axios from "axios";
import { clearVerification } from "./verification";
import { clearCsrfToken, ensureCsrfToken, postWithCsrf } from "./csrf";

let accessToken     = null;
let currentUser     = null;
let refreshPromise  = null;

export function getAccessToken() {
  return accessToken;
}

export function getCurrentUser() {
  return currentUser;
}

export function storeAuthResponse(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new TypeError("Authentication response must be an object.");
  }

  if (data.access) { /* optional property access */
    accessToken = data.access;
  }

  if (data.user) { /* optional property user */
    currentUser = data.user;
  }

  window.dispatchEvent(new Event("auth:changed"));
}

export function clearStoredAuth() {
  accessToken = null;
  currentUser = null;
  clearCsrfToken();

  window.dispatchEvent(new Event("auth:changed"));
}

export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = postWithCsrf("/api/token/refresh/")
      .then((res) => {
        const access = res.data.access;

        if (!access) {
          throw new Error("Refresh response did not include an access token.");
        }

        accessToken = access;
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
    await postWithCsrf("/api/v1/accounts/logout/");
  } catch {
    // Ignore backend logout failure; frontend auth must still be cleared.
  } finally {
    clearVerification();
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

    let newAccess;
    try {
      newAccess = await refreshAccessToken();
    } catch {
      clearStoredAuth();
      options.onUnauthenticated?.();
      return null;
    }

    return axios({
      ...requestConfig,
      headers: {
        ...(requestConfig.headers || {}),
        Authorization: `Bearer ${newAccess}`,
        ...(csrfToken ? { "X-CSRFToken": csrfToken } : {}),
      },
    });
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
