export function getBackendBase() {
  return import.meta.env.VITE_BACKEND_URL ||
    (window.location.port === "5173" ? "http://localhost:8000" : "");
}
