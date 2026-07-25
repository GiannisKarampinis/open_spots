export function mediaUrl(value) {
  if (!value) return value;

  const mediaIndex = value.indexOf("/media/");
  if (mediaIndex >= 0) {
    return value.slice(mediaIndex);
  }

  return value;
}
