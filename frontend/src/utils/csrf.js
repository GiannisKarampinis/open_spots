import axios from "axios";

let cachedCsrfToken = null;

export async function ensureCsrfToken(options = {}) {
  const { fresh = false } = options;

  if (!fresh && cachedCsrfToken) {
    return cachedCsrfToken;
  }

  const response = await axios.get("/api/v1/csrf/", {
    withCredentials: true,
  });

  const token = response.data.csrfToken;

  if (!token || typeof token !== "string") {
    throw new Error("CSRF endpoint did not return a valid csrfToken.");
  }

  cachedCsrfToken = token;
  return cachedCsrfToken;
}

export function clearCsrfToken() {
  cachedCsrfToken = null;
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
