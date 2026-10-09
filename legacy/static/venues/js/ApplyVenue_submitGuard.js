(() => {
  const cfg = window.submitGuardConfig || {};

  const submitBtn = document.getElementById(cfg.submitBtnId || "submitApplicationBtn");
  const wrap      = document.getElementById(cfg.wrapId || "submitGuardWrap");
  const hint      = document.getElementById(cfg.hintId || "submitHint");

  if (!submitBtn || !wrap) return;

  function showSubmitHint(msg) {
    if (!hint) return;
    hint.innerHTML = `<li>${msg}</li>`;
    hint.classList.remove("is-hidden");
  }

  function hideSubmitHint() {
    if (!hint) return;
    hint.classList.add("is-hidden");
  }

  function ensureGuard() {
    const existing = wrap.querySelector(".submit-guard");
    if (existing) existing.remove();

    if (submitBtn.disabled) {
      const guard = document.createElement("div");
      guard.className = "submit-guard";
      guard.addEventListener("click", () => {
        showSubmitHint(cfg.message || "Please verify your email.");
        if (typeof window.openVenueVerifyPopover === "function") {
            window.openVenueVerifyPopover();
        } else {
            document.getElementById("openVerifyPopover")?.click();
        }
      });
      wrap.appendChild(guard);
    } else {
      hideSubmitHint();
    }
  }

  ensureGuard();

  const obs = new MutationObserver(ensureGuard);
  obs.observe(submitBtn, { attributes: true, attributeFilter: ["disabled"] });
})();
