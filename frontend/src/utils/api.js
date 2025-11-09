export async function fetchAvailability(date) {
  const res = await fetch(`/api/availability/?date=${date}`);
  return res.json();
}
