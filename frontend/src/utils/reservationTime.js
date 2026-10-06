export function isReservationUpcoming(reservation, now = Date.now()) {
  if (!reservation?.starts_at) return false;
  const start = Date.parse(reservation.starts_at);
  return Number.isFinite(start) && start >= now;
}
