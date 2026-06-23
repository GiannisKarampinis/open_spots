import axios from "axios";

let csrfToken = null;

export async function ensureCsrfToken() {
  if (csrfToken) return csrfToken;

  const response = await axios.get("/api/v1/csrf/", { withCredentials: true });
  csrfToken = response.data?.csrfToken || null;
  return csrfToken;
}

export async function csrfPost(url, data, config = {}) {
  const token = await ensureCsrfToken();
  return axios.post(url, data, {
    ...config,
    withCredentials: true,
    headers: {
      ...(config.headers || {}),
      ...(token ? { "X-CSRFToken": token } : {}),
    },
  });
}
