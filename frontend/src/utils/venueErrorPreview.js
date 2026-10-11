export function isVenueErrorPreviewEnabled() {
  return import.meta.env.DEV &&
    new URLSearchParams(window.location.search).get("previewErrors") === "1";
}
