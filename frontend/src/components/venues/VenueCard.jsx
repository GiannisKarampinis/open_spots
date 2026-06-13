import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faLocationDot, faChair, faStar } from "@fortawesome/free-solid-svg-icons";
import { Link } from "react-router-dom";

export default function VenueCard({ venue }) {
  return (
    <Link className="venue-link" to={`/venues/venue/${venue.id}`}>
      <div className={`venue-card ${venue.is_full ? "full" : "available"}`}>
        {venue.first_image && (<img src={venue.first_image} alt={venue.name} />)}

        <div className="venue-card-content">
          <h3>{venue.name}</h3>

          <div className="venue-info">
            <div className="venue-info-item">
              <FontAwesomeIcon icon={faLocationDot} />
              <span>{venue.location}</span>
            </div>

            <div className="venue-info-item">
              <FontAwesomeIcon
                icon={faChair}
                className={
                  venue.is_full ? "chair-full" : "chair-available"
                }
              />
            </div>

            {venue.average_rating > 0 ? (
              <div className="venue-info-item rating">
                <FontAwesomeIcon icon={faStar} />
                <span>{venue.average_rating.toFixed(1)}</span>
              </div>
            ) : (
              <div className="venue-info-item rating muted">New</div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
