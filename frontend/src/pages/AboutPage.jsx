import { useTranslation } from "react-i18next";
import "../styles/about.css";

export default function AboutPage() {
  const { t } = useTranslation();

  return (
    <section className="about">
      <h2>{t("About Us")}</h2>

      <p>
        {t(
          "By developing real-time booking technology, we redefine reservations for hospitality venues. Our mission is simple: make bookings seamless for customers, while structured, reliable, and measurable for businesses."
        )}
      </p>

      <p>
        {t(
          "OpenSpots is designed to manage reservations for on-site experiences — giving businesses full visibility over availability, demand, and customer flow, while offering customers a smooth way to secure their spot."
        )}
      </p>

      <h3>{t("Our Core Principles")}</h3>

      <ul>
        <li>
          <span aria-hidden="true">▣</span>
          <h4>
            {t("Real-time availability")}
            <br />
            {t("management")}
          </h4>
          {t(
            "Booking slots reflect actual capacity at any given moment, reducing double bookings, manual updates, and operational friction."
          )}
        </li>

        <li>
          <span aria-hidden="true">☷</span>
          <h4>
            {t("Structured")}
            <br />
            {t("operational control")}
          </h4>
          {t(
            "Scheduling centralizing bookings in one system that supports daily scheduling, capacity planning, and coordination across teams."
          )}
        </li>

        <li>
          <span aria-hidden="true">▥</span>
          <h4>
            {t("Data-driven")}
            <br />
            {t("insight")}
          </h4>
          {t(
            "Converting booking activity into clear, usable information that supports forecasting, performance analysis, and smarter business decisions."
          )}
        </li>
      </ul>

      <p>
        {t(
          "At OpenSpots, we see bookings not simply as confirmations, but as a critical layer of business infrastructure — connecting physical spaces with digital access in a controlled and measurable way."
        )}
      </p>

      <p>
        {t(
          "Our objective is to provide a stable, adaptable, and modern system that supports growth while maintaining operational clarity."
        )}
      </p>
    </section>
  );
}