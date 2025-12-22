(function () {
  document.addEventListener("DOMContentLoaded", function () {
    if (window.__venueEmailVerifyInit) return;
        window.__venueEmailVerifyInit = true;

    
    const cfg = window.venueVerifyConfig || {};
    const t = (cfg.i18n || {});

    const popover   = document.getElementById("verifyPopover");
    const msgEl     = document.getElementById("verifyMsg");
    const codeInput = document.getElementById("codeInput");

    const openBtn   = document.getElementById("openVerifyPopover");
    const closeBtn  = document.getElementById("closeVerifyPopover");

    const sendBtn   = document.getElementById("sendCodeBtn");
    const verifyBtn = document.getElementById("verifyCodeBtn");

    const verifyButton = openBtn; // same element
    if (!popover || !msgEl || !codeInput || !openBtn || !sendBtn || !verifyBtn) return;

    const submitBtn = document.getElementById("submitApplicationBtn");
    const emailInput = document.getElementById("id_admin_email");

    const VERIFY_DEFAULT_TEXT =
      (verifyButton && verifyButton.textContent.trim()) || t.verifyEmail || "Verify Email";

    let verifiedEmail = null;

    // restore verified state after server re-render
    if (cfg.initial?.emailVerified && cfg.initial?.verifiedEmail) {
      verifiedEmail = String(cfg.initial.verifiedEmail).toLowerCase();
      // Only mark verified if current input email matches
      if (adminEmailValue().toLowerCase() === verifiedEmail) {
        markVerified();
      }
    }

    function getCSRFToken() {
      return document.querySelector('[name=csrfmiddlewaretoken]')?.value || "";
    }

    function adminEmailValue() {
      return emailInput ? emailInput.value.trim() : "";
    }

    function showMsg(text, ok = true) {
      msgEl.textContent = text;
      msgEl.classList.remove("is-error", "is-success");
      msgEl.classList.add(ok ? "is-success" : "is-error");
    }

    function openPopover() {
      popover.style.display = "block";
      popover.setAttribute("aria-hidden", "false");
      showMsg("", true);
      codeInput.value = "";
      codeInput.focus();
    }
    window.openVenueVerifyPopover = openPopover; /* Expose to global for convenience, to use it in the Submit Button */

    function closePopover() {
      popover.style.display = "none";
      popover.setAttribute("aria-hidden", "true");
    }

    function markVerified() {
      const e = adminEmailValue();
      if (e) verifiedEmail = e.toLowerCase();

      verifyButton.classList.add("is-verified");
      verifyButton.textContent = t.verified || "Verified";
      verifyButton.disabled = true;

      if (submitBtn) submitBtn.disabled = false;
    }

    function resetVerificationUI() {
      verifyButton.classList.remove("is-verified");
      verifyButton.textContent = VERIFY_DEFAULT_TEXT;
      verifyButton.disabled = false;

      if (submitBtn) submitBtn.disabled = true;
    }

    openBtn.addEventListener("click", function (e) {
      e.preventDefault();
      openPopover();
    });

    closeBtn?.addEventListener("click", function (e) {
      e.preventDefault();
      closePopover();
    });

    document.addEventListener("click", function (e) {
      const wrapper = popover.closest(".email-verify-wrapper");
      if (!wrapper) return;
      if (!wrapper.contains(e.target)) closePopover();
    });

    sendBtn.addEventListener("click", async function () {
      const email = adminEmailValue();
      if (!email) {
        showMsg(t.enterEmailFirst || "Enter admin email first.", false);
        return;
      }

      const formData = new FormData();
      formData.append("email", email);

      const res = await fetch(cfg.sendUrl, {
        method: "POST",
        headers: { "X-CSRFToken": getCSRFToken() },
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showMsg(data.error || (t.failedSend || "Failed to send code."), false);
        return;
      }

      showMsg(t.codeSent || "Code sent. Check your inbox.", true);
    });

    verifyBtn.addEventListener("click", async function () {
      const code = (codeInput.value || "").trim();
      if (!/^\d{6}$/.test(code)) {
        showMsg(t.enterValidCode || "Enter a valid 6-digit code.", false);
        return;
      }

      const formData = new FormData();
      formData.append("code", code);

      const res = await fetch(cfg.verifyUrl, {
        method: "POST",
        headers: { "X-CSRFToken": getCSRFToken() },
        body: formData,
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        showMsg(data.error || (t.verifyFailed || "Verification failed."), false);
        return;
      }

      showMsg(t.verifiedOk || "Email verified ✅", true);
      markVerified();
      setTimeout(closePopover, 400);
    });

    emailInput?.addEventListener("input", function () {
      if (!verifiedEmail) return;
      if (adminEmailValue().toLowerCase() !== verifiedEmail) {
        resetVerificationUI();
        verifiedEmail = null;
      }
    });
  });
})();
