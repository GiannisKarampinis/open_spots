import { fetchAvailability } from "../utils/api.js";

global.fetch = jest.fn(() =>
  Promise.resolve({
    json: () => Promise.resolve({ tables: [1, 2, 3] }),
  })
);

test("fetchAvailability returns tables", async () => {
  const data = await fetchAvailability("2025-11-07");
  expect(data.tables).toContain(2);
});
