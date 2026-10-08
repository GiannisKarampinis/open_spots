import { useEffect, useRef } from "react";
import { clearVerification } from "../utils/verification";
import { Trans, useTranslation } from "react-i18next";
import { storeAuthResponse } from "../utils/auth";
import "../styles/email-verification-modal.css";
import VerifyEmail_Core, { VerificationCodeForm, formatSeconds } from "./VerifyEmail_Core";

export default function EmailVerificationModal({ onClose, onVerified, onCancelled, onExpired, challengeId, verificationType = "account", venueEmail, returnFocusRef }) {
  const { t } = useTranslation();
  const dialogRef = useRef(null);
  const busyRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previousFocus = returnFocusRef?.current || document.activeElement;
    const dialog = dialogRef.current;
    const focusable = () => [...dialog.querySelectorAll('button:not(:disabled), input:not(:disabled), [tabindex="0"]')];
    dialog.focus();
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) onCloseRef.current();
      } else if (event.key === "Tab") {
        const elements = focusable();
        const first = elements[0];
        const last = elements[elements.length - 1];
        if (!first) { event.preventDefault(); dialog.focus(); return; }
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
          event.preventDefault(); last.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog)) {
          event.preventDefault(); first.focus();
        }
      }
    };
    const onFocusIn = (event) => {
      if (!dialog.contains(event.target)) (focusable()[0] || dialog).focus();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("focusin", onFocusIn);
      Promise.resolve().then(() => {
        if (!previousFocus?.isConnected) return;
        if (!previousFocus.disabled) previousFocus.focus();
        else previousFocus.parentElement?.querySelector("input:not(:disabled)")?.focus();
      });
    };
  }, [returnFocusRef]);

  const isVenue = verificationType === "venue";
  const finishVerification = (data) => {
    if (isVenue) {
      onVerified(data);
      return;
    }
    clearVerification(challengeId);
    storeAuthResponse(data);
    onVerified(data.profile, data.detail);
  };
  return <VerifyEmail_Core challengeId={challengeId} onVerified={finishVerification}
    onCancelled={onCancelled} onExpired={onExpired} initialMessageType="error"
    inlineMessages
    confirmUrl={isVenue ? "/api/v1/venues/verification/confirm/" : undefined}
    resendUrl={isVenue ? "/api/v1/venues/verification/send/" : undefined}
    resendPayload={isVenue ? { email: venueEmail } : undefined}>
    {({ code, email, remaining, resendAfter, loading, submitting, resending, message, messageType, updateCode, submit, resend, cancelVerification, percent }) => {
      busyRef.current = submitting || resending;
      return (

    <div className="email-verification-backdrop" role="presentation">
      <section ref={dialogRef} tabIndex={-1} className="email-verification-modal" role="dialog" aria-modal="true" aria-labelledby="email-verification-title">
        <button type="button" className="email-verification-close" onClick={onClose} disabled={submitting || resending} aria-label={t("Close")}>×</button>
        <h2 id="email-verification-title">{t(isVenue ? "Verify Your Email" : "Verify Your New Email")}</h2>
        <p>
          <Trans
            i18nKey={isVenue ? "venue.emailVerification.instructions" : "profile.emailVerification.instructions"}
            defaults={isVenue ? "Enter the verification code sent to <strong>{{email}}</strong> to verify your venue owner email." : undefined}
            values={{ email }}
            components={{ strong: <strong /> }}
          />
        </p>
        {message && <div className={`auth-message ${messageType}`} role={messageType === "error" ? "alert" : "status"}>{message}</div>}
        <VerificationCodeForm code={code} updateCode={updateCode} submit={submit}
          loading={loading} submitting={submitting} resending={resending} remaining={remaining}
          className="email-verification-form" verifyLabel="Verify Email" />
        <button className="email-verification-resend" type="button" onClick={resend} disabled={loading || submitting || resending || resendAfter > 0}>
          {resending
            ? t("Sending...")
            : resendAfter > 0
              ? t("Resend available in {{time}}", { time: formatSeconds(resendAfter) })
              : t("Resend Code")}
        </button>
        <button type="button" onClick={cancelVerification} disabled={loading || submitting || resending}>
          {t("Cancel verification")}
        </button>
        {!loading && (
          <div className="email-verification-countdown">
            {remaining > 0 ? (
              <>
                <span>{t("Code expires in {{time}}", { time: formatSeconds(remaining) })}</span>
                <div className="email-verification-bar"><span style={{ width: `${percent}%` }} /></div>
              </>
            ) : t("Verification code has expired. Please resend the code.")}
          </div>
        )}
      </section>
    </div>
    );
    }}
  </VerifyEmail_Core>;
}
