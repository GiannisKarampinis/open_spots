import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChevronLeft, faChevronRight } from "@fortawesome/free-solid-svg-icons";
import { useTranslation } from "react-i18next";
import VenueCard from "./VenueCard";

export default function VenueSection({ title, venues }) {
  const { t } = useTranslation();
  const scrollRef = useRef(null);
  const [canScrollBack, setCanScrollBack] = useState(false);
  const [canScrollForward, setCanScrollForward] = useState(false);

  const updateScrollState = useCallback(() => {
    const element = scrollRef.current;
    if (!element) return;

    setCanScrollBack(element.scrollLeft > 2);
    setCanScrollForward(
      element.scrollLeft + element.clientWidth < element.scrollWidth - 2
    );
  }, []);

  useEffect(() => {
    updateScrollState();
    window.addEventListener("resize", updateScrollState);
    return () => window.removeEventListener("resize", updateScrollState);
  }, [venues, updateScrollState]);

  if (!venues.length) return null;

  const scroll = (direction) => {
    const element = scrollRef.current;
    if (!element) return;

    element.scrollBy({
      left: direction * Math.max(200, element.clientWidth * 0.8),
      behavior: "smooth",
    });
  };

  return (
    <section className="venue-section">
      <div className="venue-section-header">
        <h3 className="section-title">{title}</h3>

        <div className="venue-scroll-controls" aria-label={title}>
          <button
            type="button"
            onClick={() => scroll(-1)}
            disabled={!canScrollBack}
            aria-label={`${t("Previous")} ${title}`}
          >
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
          <button
            type="button"
            onClick={() => scroll(1)}
            disabled={!canScrollForward}
            aria-label={`${t("Next")} ${title}`}
          >
            <FontAwesomeIcon icon={faChevronRight} />
          </button>
        </div>
      </div>

      <div
        ref={scrollRef}
        className={`venue-scroll-container grid-mode${canScrollBack ? " can-scroll-back" : ""}${canScrollForward ? " can-scroll-forward" : ""}`}
        onScroll={updateScrollState}
      >
        {venues.map((venue) => (
          <VenueCard key={venue.id} venue={venue} />
        ))}
      </div>
    </section>
  );
}
