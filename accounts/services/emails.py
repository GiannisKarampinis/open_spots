def send_verification_code(user):
    # Import locally to avoid circular imports
    from emails_manager.utils   import send_email_with_template
    from emails_manager.models  import EmailVerificationCode
    from emails_manager.utils   import _build_site_url

    # 1. Remove old codes
    EmailVerificationCode.objects.filter(user=user).delete()

    # 2. Generate and save new code
    code = EmailVerificationCode.generate_code()
    
    EmailVerificationCode.objects.create(user=user, code=code)

    # 3. Prepare template context
    context = {
        "title":        "Verify your email",
        "intro":        "Use the code below to verify your OpenSpots account email.",
        "code":         code,
        "verify_url":   _build_site_url("/accounts/confirm-code/"),
    }

    # 4. Determine email target
    subject     = "Your OpenSpots Verification Code"
    recipient   = user.unverified_email or user.email

    # 5. Send email using the common helper
    send_email_with_template(
        subject         =   subject,
        recipient       =   recipient,
        template_base   =   "verification_code",
        context         =   context,
        async_send      =   True,  # keep async sending
    )
