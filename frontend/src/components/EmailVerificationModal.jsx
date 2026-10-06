import { clearVerification } from "../utils/verification";
import { Trans, useTranslation } from "react-i18next";
import { storeAuthResponse } from "../utils/auth";
import VerifyEmail_Core, { VerificationCodeForm, formatSeconds } from "./VerifyEmail_Core";

export default function EmailVerificationModal({ onClose, onVerified, onCancelled, onExpired, challengeId }) {
  const { t } = useTranslation();
  const finishVerification = (data) => {
    clearVerification(challengeId);
    storeAuthResponse(data);
    onVerified(data.profile, data.detail);
  };
  return <VerifyEmail_Core challengeId={challengeId} onVerified={finishVerification}
    onCancelled={onCancelled} onExpired={onExpired} initialMessageType="error">
    {({ code, email, remaining, resendAfter, loading, submitting, resending, message, messageType, updateCode, submit, resend, cancelVerification, percent }) => (

    <div className="email-verification-backdrop" role="presentation">
      <section className="email-verification-modal" role="dialog" aria-modal="true" aria-labelledby="email-verification-title">
        <button type="button" className="email-verification-close" onClick={onClose} aria-label={t("Close")}>×</button>
        <h2 id="email-verification-title">{t("Verify Your New Email")}</h2>
        <p>
          <Trans
            i18nKey="profile.emailVerification.instructions"
            values={{ email }}
            components={{ strong: <strong /> }}
          />
        </p>
        {message && <div className={`auth-message ${messageType}`}>{message}</div>}
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
    )}
  </VerifyEmail_Core>;
}
