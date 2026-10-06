import { VerificationReason } from "../utils/verificationReasons";
import { getVerificationChallenge, getResetToken, clearVerification, rememberResetToken } from "../utils/verification";
import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Trans, useTranslation } from "react-i18next";
import { clearStoredAuth, storeAuthResponse } from "../utils/auth";
import { useToastMessage } from "../components/ToastProvider";
import VerifyEmail_Core, { VerificationCodeForm, formatSeconds } from "../components/VerifyEmail_Core";
import "../styles/auth.css";

export default function VerifyEmailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [challengeId] = useState(getVerificationChallenge);
  const [, setMessage, , setMessageType] = useToastMessage("success");
  const handleStatus = useCallback((data) => {
    if (data.verified && data.reason === VerificationReason.PASSWORD_RECOVERY && getResetToken()) {
      navigate("/accounts/reset-password");
      return true;
    }
    return false;
  }, [navigate]);
  const finishVerification = (data, reason) => {
    if (data.reset_token) rememberResetToken(data.reset_token, challengeId);
    else clearVerification(challengeId);
    if (data.access || data.user) storeAuthResponse(data);
    else if (data.session_invalidated) clearStoredAuth();
    setMessageType("success");
    setMessage(data.detail || t("Email verified successfully."));
    setTimeout(() => navigate(data.redirect_to ||
      (reason === VerificationReason.PASSWORD_RECOVERY ? "/accounts/reset-password" : "/")), 700);
  };
  return <VerifyEmail_Core challengeId={challengeId} onVerified={finishVerification}
    onStatus={handleStatus} onCancelled={() => navigate("/accounts/login")}
    statusError="No pending verification was found. Please sign up or log in again.">
    {({ code, email, remaining, resendAfter, loading, submitting, resending, message, messageType, updateCode, submit, resend, cancelVerification, percent }) => (

    <div className="verification-page">
      <div className="verification-container">
        <h2>{t("Verify Your Email")}</h2>

        <p>
          {email ? (
            <Trans
              i18nKey="Please enter the 6-digit code we sent to email."
              values={{ email }}
              components={{ strong: <strong /> }}
            />
          ) : (
            t("Please enter the 6-digit code we sent to your email address.")
          )}
        </p>

        {message && (
          <div className={`auth-message ${messageType}`}>
            {message}
          </div>
        )}

        <VerificationCodeForm code={code} updateCode={updateCode} submit={submit}
          loading={loading} submitting={submitting} resending={resending} remaining={remaining}
          className="verification-form" verifyLabel="Verify" />

        <button
          className="resend-button"
          type="button"
          onClick={resend}
          disabled={submitting || resending || loading || resendAfter > 0}
        >
          {resending
            ? t("Sending...")
            : resendAfter > 0
              ? t("Resend available in {{time}}", { time: formatSeconds(resendAfter) })
              : t("Resend Code")}
        </button>

        <button type="button" onClick={cancelVerification} disabled={loading || submitting || resending}>
          {t("Cancel verification")}
        </button>
        <p className="auth-prompt">
          <Trans
            i18nKey="Need a different account? Sign up again"
            components={{
              signupLink: <Link to="/accounts/signup" />,
            }}
          />
        </p>
      </div>

      {!loading && (
        <div className="verification-countdown">
          {remaining > 0 ? (
            <>
              <Trans
                i18nKey="Verification code expires in time."
                values={{ time: formatSeconds(remaining) }}
                components={{ span: <span /> }}
              />

              <div className="verification-bar-bg">
                <div
                  className="verification-bar-fill"
                  style={{ width: `${percent}%` }}
                />
              </div>
            </>
          ) : (
            <div className="auth-message error">
              {t("Verification code has expired. Please resend the code.")}
            </div>
          )}
        </div>
      )}
    </div>
    )}
  </VerifyEmail_Core>;
}
