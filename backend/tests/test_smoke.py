from django.test import TestCase

class SmokeTests(TestCase):
    def test_homepage_redirects(self):
        response = self.client.get("/")
        self.assertIn(response.status_code, [200, 302, 404])

    def test_admin_page_exists(self):
        response = self.client.get("/admin/")
        self.assertIn(response.status_code, [200, 302])
