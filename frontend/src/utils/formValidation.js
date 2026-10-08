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
