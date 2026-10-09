from pathlib import Path

from django.conf import settings
from django.contrib.staticfiles import finders
from django.template.loader import get_template
from django.test import SimpleTestCase
from django.urls import resolve, reverse


class ProjectLayoutTests(SimpleTestCase):
    def test_legacy_page_templates_and_filters_are_discoverable(self):
        for template in (Path(settings.BASE_DIR) / "legacy" / "templates").rglob("*.html"):
            name = template.relative_to(Path(settings.BASE_DIR) / "legacy" / "templates").as_posix()
            with self.subTest(template=name):
                self.assertEqual(Path(get_template(name).origin.name), template)

    def test_email_templates_stay_discoverable(self):
        for app in ("accounts", "venues", "emails_manager"):
            template_root = Path(settings.BASE_DIR) / app / "templates"
            for template in template_root.rglob("*.html"):
                with self.subTest(app=app, template=template.name):
                    get_template(template.relative_to(template_root).as_posix())

    def test_legacy_browser_assets_keep_their_public_paths(self):
        for name in ("base.css", "accounts/login.css", "venues/venue_list.css", "common/js/form_validation.js"):
            with self.subTest(asset=name):
                self.assertEqual(Path(finders.find(name)), Path(settings.BASE_DIR) / "legacy" / "static" / name)

    def test_legacy_and_api_routes_remain_registered(self):
        self.assertEqual(resolve(reverse("login")).func.view_class.__module__, "legacy.accounts.views")
        self.assertEqual(resolve(reverse("venue_list")).func.__module__, "legacy.venues.views")
        self.assertEqual(resolve(reverse("csrf-token")).func.__module__, "openspots.views")
