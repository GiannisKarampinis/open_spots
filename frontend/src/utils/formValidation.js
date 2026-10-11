export const PASSWORD_REQUIREMENTS_MESSAGE =
/* FIXME: After tsevre signup rules */  
"Use a password with at least 8 characters that is not commonly used or entirely numeric.";

export function validateReservationForm(form) {
  return form.name && form.date && form.time ? true : false;
}

export function getRequiredFieldErrors(
  form,
  requiredFields,
  message = "This field is required."
) {
  const errors = {};

  for (const field of requiredFields) {
    const value = String(form[field] ?? "");

    if (!value.trim()) {
      errors[field] = [message];
    }
  }

  return errors;
}

export function passwordsMatch(password, confirmation) {
  return password.trim() === confirmation.trim();
}
