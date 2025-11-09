export function validateReservationForm(form) {
  return form.name && form.date && form.time ? true : false;
}
