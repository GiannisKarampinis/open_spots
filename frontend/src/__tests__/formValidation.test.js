import { validateReservationForm } from "../utils/formValidation.js";

describe("validateReservationForm", () => {
  test("returns false if any field is empty", () => {
    const form = { name: "", date: "2025-11-07", time: "19:00" };
    expect(validateReservationForm(form)).toBe(false);
  });

  test("returns true if all fields are filled", () => {
    const form = { name: "John", date: "2025-11-07", time: "19:00" };
    expect(validateReservationForm(form)).toBe(true);
  });
});
