import { validateReservationForm, getRequiredFieldErrors } from "../utils/formValidation.js";

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


describe("getRequiredFieldErrors", () => {
  test("reports missing and whitespace-only required values with the supplied message", () => {
    const form = { name: "   ", password: "\t ", email: null, optional: "" };
    expect(getRequiredFieldErrors(form, ["name", "password", "email", "missing"], "Required")).toEqual({
      name: ["Required"], password: ["Required"], email: ["Required"], missing: ["Required"],
    });
  });

  test("accepts populated values without modifying their spaces", () => {
    const form = { name: " Alex ", password: "  My passphrase!  ", guests: 0 };
    expect(getRequiredFieldErrors(form, ["name", "password", "guests"])).toEqual({});
    expect(form.password).toBe("  My passphrase!  ");
  });
});
