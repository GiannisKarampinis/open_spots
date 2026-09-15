/////////////////////////////////////////////////////////////////////////////

// Tab-local bearer ID: never put verification credentials in URLs or logs.

// Each tab sends its challenge ID, so requests target the correct challenge.
// If both tabs use the same ID, they share one flow:
// completing the flow consumes the shared challenge; further confirmation
// from the other tab fails because it has already been consumed.

/////////////////////////////////////////////////////////////////////////////

const CHALLENGE_KEY 	= "openSpots.verificationChallenge";
const RESET_KEY 	= "openSpots.verificationResetToken";

export function getVerificationChallenge() {
  return sessionStorage.getItem(CHALLENGE_KEY) || "";
}

export function rememberVerification(data) {
// Assume that we requested an email change.
// The backend will create the challenge "abc123".
// Here we store the challenge ID in browser tab
// so the verification page knows which challenge your code belongs to.
// sessionStorage isolates each tab. When this tab switches challenges,
// discard the reset token belonging to its previous challenge.
  if (data?.challenge_id) {
    if (getVerificationChallenge() !== data.challenge_id) sessionStorage.removeItem(RESET_KEY);
    sessionStorage.setItem(CHALLENGE_KEY, data.challenge_id);
  }
}

export function clearVerification(id = getVerificationChallenge()) {
  if (getVerificationChallenge() === id) {
    sessionStorage.removeItem(CHALLENGE_KEY);
    sessionStorage.removeItem(RESET_KEY);
  }
}

export function verificationConfig(id) {
  return { headers: { "X-Verification-Challenge": id }, withCredentials: true };
}

export function rememberResetToken(token, id = getVerificationChallenge()) {
  rememberVerification({ challenge_id: id });
  sessionStorage.setItem(RESET_KEY, token);
}

export function getResetToken() {
  return sessionStorage.getItem(RESET_KEY) || "";
}
