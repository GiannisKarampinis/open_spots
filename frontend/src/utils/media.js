export function mediaUrl(value) {
  if (!value) return "";

  const url = String(value).trim();

  if (!url) return "";

  // Already absolute URL from backend/storage
  if (url.startsWith("http://") || url.startsWith("https://")) {
    const mediaIndex = url.indexOf("/media/");
    return mediaIndex >= 0 ? url.slice(mediaIndex) : url;
  }

  // Already correct Django media path
  if (url.startsWith("/media/")) {
    return url;
  }

  // Missing leading slash
  if (url.startsWith("media/")) {
    return `/${url}`;
  }

  // Backend returned relative file path like:
  // venues/1/menu/pizza.jpg
  return `/media/${url.replace(/^\/+/, "")}`;
}