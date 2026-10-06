import { useEffect, useState } from "react";

// Recheck as soon as the next reservation starts, including after returning to a tab.
export default function useReservationClock(reservations) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => setNow(Date.now()), [reservations]);
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    const next = reservations.map((item) => Date.parse(item?.starts_at))
      .filter((start) => Number.isFinite(start) && start >= now)
      .sort((a, b) => a - b)[0];
    const timer = next === undefined ? null : setTimeout(refresh, Math.max(0, Math.min(next - Date.now() + 1, 2147483647)));
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [reservations, now]);
  return now;
}
