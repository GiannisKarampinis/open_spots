from decimal import Decimal
from io import BytesIO

import requests
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from PIL import Image

from venues.models import Venue, VenueImage


# Real venue names and locations are used to make the development home page feel
# representative. The downloaded photos are illustrative fixtures, not claims
# that a particular photo depicts the named venue.
VENUES = [
    ("A for Athens", "bar", "Miaouli 2, Monastiraki, Athens", "37.976273", "23.725772", 4.5, False, 101),
    ("Couleur Locale", "bar", "Normanou 3, Monastiraki, Athens", "37.977184", "23.724263", 4.4, False, 106),
    ("six d.o.g.s", "bar", "Avramiotou 6-8, Athens", "37.977030", "23.728620", 4.3, True, 119),
    ("Little Kook", "cafe", "Karaiskaki 17, Psyrri, Athens", "37.978196", "23.723153", 4.2, False, 225),
    ("Mokka Specialty Coffee", "cafe", "Athinas 44, Athens", "37.981158", "23.726940", 4.7, False, 312),
    ("The Clumsies", "bar", "Praxitelous 30, Athens", "37.979362", "23.730454", 4.6, True, 431),
    ("Nolan", "restaurant", "Voulis 31, Athens", "37.975448", "23.732888", 4.5, False, 488),
    ("Kuzina", "restaurant", "Adrianou 9, Thissio, Athens", "37.976527", "23.720746", 4.4, False, 493),
    ("O Thanasis", "restaurant", "Mitropoleos 69, Monastiraki, Athens", "37.975879", "23.725619", 4.3, True, 532),
    ("Varoulko Seaside", "restaurant", "Akti Koumoundourou 54, Piraeus", "37.936081", "23.660543", 4.6, False, 635),
    ("Hytra", "restaurant", "Leoforos Andrea Syngrou 107-109, Athens", "37.957379", "23.720276", 4.6, False, 674),
    ("Birdman", "restaurant", "Voulis 35, Athens", "37.975199", "23.732597", 4.5, True, 835),
    ("Cookoovaya", "restaurant", "Chatzigianni Mexi 2A, Athens", "37.976768", "23.750355", 4.4, False, 237),
    ("Seychelles", "restaurant", "Keramikou 49, Athens", "37.982411", "23.715828", 4.5, False, 1003),
    ("Mani Mani", "restaurant", "Falirou 10, Athens", "37.966840", "23.728605", 4.6, False, 1011),
    ("CTC Urban Gastronomy", "restaurant", "Plateon 15, Athens", "37.981381", "23.712582", 4.7, False, 1015),
    ("Soil", "restaurant", "Ferekydou 5, Athens", "37.968903", "23.743327", 4.7, True, 1024),
    ("Spondi", "restaurant", "Pyrronos 5, Athens", "37.961948", "23.741072", 4.6, False, 1025),
    ("Ta Karamanlidika Tou Fani", "restaurant", "Sokratous 1, Athens", "37.980532", "23.726386", 4.7, False, 1035),
    ("Delta Restaurant", "restaurant", "Leoforos Syngrou 364, Kallithea", "37.940491", "23.690715", 4.8, False, 1043),
    ("Bolivar Beach Bar", "beach_bar", "Poseidonos Avenue, Alimos", "37.913402", "23.707341", 4.3, False, 866),
    ("Island Athens Riviera", "beach_bar", "Athinas Avenue, Vari", "37.818493", "23.804768", 4.4, False, 883),
    ("Akanthus Summer", "beach_bar", "Poseidonos Avenue, Alimos", "37.912190", "23.706061", 4.2, True, 903),
    ("Krabo", "beach_bar", "Thespidos, Vouliagmeni", "37.802221", "23.786652", 4.5, False, 944),
    ("Astir Beach", "other", "Apollonos 40, Vouliagmeni", "37.806307", "23.766651", 4.4, False, 1036),
    ("Stavros Niarchos Foundation Cultural Center", "other", "Leoforos Syngrou 364, Kallithea", "37.940491", "23.690715", 4.8, False, 1040),
    ("Technopolis City of Athens", "other", "Pireos 100, Gazi, Athens", "37.978531", "23.713393", 4.5, True, 1059),
    ("Athens Concert Hall", "other", "Vasilissis Sofias & Kokkali, Athens", "37.981339", "23.755228", 4.7, False, 1074),
]

DESCRIPTIONS = {
    "cafe": "A popular Athens coffee stop with a distinctive atmosphere and a central location.",
    "bar": "A well-known Athens drinking spot, ideal for cocktails, music, and evenings with friends.",
    "restaurant": "A notable Greek dining destination serving carefully prepared food in a welcoming setting.",
    "beach_bar": "An Athens Riviera destination for seaside drinks, food, music, and sunset views.",
    "other": "A landmark Athens destination for culture, events, entertainment, and memorable days out.",
}


class Command(BaseCommand):
    help = "Seed 28 real Greek venue listings with illustrative photos for homepage testing."

    def add_arguments(self, parser):
        parser.add_argument(
            "--refresh-images",
            action="store_true",
            help="Replace the fixture image on venues that already have one.",
        )

    @staticmethod
    def _download_image(image_id):
        url = f"https://picsum.photos/id/{image_id}/1200/800"
        try:
            response = requests.get(url, timeout=25)
            response.raise_for_status()
            image = Image.open(BytesIO(response.content)).convert("RGB")
            image.thumbnail((1200, 800))
            output = BytesIO()
            image.save(output, format="WEBP", quality=86, method=6)
            return ContentFile(output.getvalue(), name=f"homepage-{image_id}.webp")
        except (requests.RequestException, OSError) as exc:
            raise CommandError(f"Could not download fixture image {image_id}: {exc}") from exc

    def handle(self, *args, **options):
        created_count = 0
        updated_count = 0
        image_count = 0

        for name, kind, location, lat, lon, rating, is_full, image_id in VENUES:
            with transaction.atomic():
                venue, created = Venue.objects.update_or_create(
                    name=name,
                    defaults={
                        "kind": kind,
                        "location": location,
                        "description": DESCRIPTIONS[kind],
                        "average_rating": rating,
                        "is_full": is_full,
                        "latitude": Decimal(lat),
                        "longitude": Decimal(lon),
                    },
                )
                created_count += int(created)
                updated_count += int(not created)

                existing = venue.images.filter(
                    approved=True,
                    marked_for_deletion=False,
                )
                if options["refresh_images"]:
                    existing.delete()

                if not existing.exists():
                    VenueImage.objects.create(
                        venue=venue,
                        image=self._download_image(image_id),
                        order=0,
                        approved=True,
                        marked_for_deletion=False,
                    )
                    image_count += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"Homepage fixtures ready: {created_count} created, "
                f"{updated_count} updated, {image_count} images added."
            )
        )
        self.stdout.write(
            "The venue records use real names and locations; their photos are "
            "illustrative development fixtures from Picsum."
        )
