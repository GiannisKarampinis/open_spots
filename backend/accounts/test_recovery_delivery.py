from unittest.mock import patch
from django.contrib.auth import get_user_model
from django.test import TestCase
from accounts.models import VerificationReason
from accounts.services.challenges import begin_challenge, close_challenge
from accounts.tasks import deliver_recovery_code


class RecoveryDeliveryTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="delivery", email="delivery@example.com")

    @patch("accounts.tasks.deliver_recovery_code.apply_async")
    @patch("accounts.services.challenges.send_email_with_template")
    def test_real_and_decoy_requests_queue_after_commit_without_smtp(self, mail, queue):
        with self.captureOnCommitCallbacks(execute=True):
            begin_challenge(self.user, VerificationReason.PASSWORD_RECOVERY, self.user.email)
            begin_challenge(None, VerificationReason.PASSWORD_RECOVERY, "unknown@example.com")
            queue.assert_not_called()
            mail.assert_not_called()
        self.assertEqual(queue.call_count, 2)
        mail.assert_not_called()
        for call in queue.call_args_list:
            self.assertNotIn(call.kwargs["args"][1], call.kwargs["argsrepr"])

    @patch("accounts.tasks.deliver_recovery_code.apply_async")
    @patch("accounts.services.challenges.send_email_with_template")
    def test_worker_skips_decoys_and_closed_or_replaced_codes(self, mail, queue):
        with self.captureOnCommitCallbacks(execute=True):
            real = begin_challenge(self.user, VerificationReason.PASSWORD_RECOVERY, self.user.email)
            begin_challenge(None, VerificationReason.PASSWORD_RECOVERY, "unknown@example.com")
        real_args = queue.call_args_list[0].kwargs["args"]
        decoy_args = queue.call_args_list[1].kwargs["args"]
        deliver_recovery_code.run(*decoy_args)
        deliver_recovery_code.run(real_args[0], real_args[1], "obsolete-hash")
        close_challenge(real)
        deliver_recovery_code.run(*real_args)
        mail.assert_not_called()
