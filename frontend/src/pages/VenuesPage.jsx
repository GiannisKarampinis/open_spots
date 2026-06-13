import { useEffect, useState } from "react";
import axios from "axios";
import "../styles/venue_list.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faFilter } from "@fortawesome/free-solid-svg-icons";
import VenueSection from "../components/venues/VenueSection";

export default function VenuesPage() {
  const [grouped, setGrouped] = useState({
    cafe_bar: [],
    restaurants: [],
    beach_bar: [],
    other: [],
  });

  const [kind, setKind] = useState("");
  const [availability, setAvailability] = useState("");

  useEffect(() => {
    fetchVenues();
  }, [kind, availability]);

  const fetchVenues = async () => {
    try {
      const res = await axios.get(
        "/api/v1/venues/",
        {
          params: { kind, availability },
        }
      );

      const grouped = res.data.results;

      setGrouped({
        cafe_bar: grouped.cafe_bar || [],
        restaurants: grouped.restaurants || [],
        beach_bar: grouped.beach_bar || [],
        other: grouped.other || [],
      });

    } catch (err) {
      console.error("Error fetching venues:", err);
    }
  };
  return (
    <div className="page-container">
      <h2>Explore & Reserve Your Perfect Spot</h2>

      <div className="filter-form">
        <div className="filter-wrapper sticky-filter">
          <FontAwesomeIcon
            icon={faFilter}
            className="filter-icon"
          />

          <select
            className="filter-menu"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            <option value="">All Venues</option>
            <option value="restaurant">Restaurants</option>
            <option value="cafe">Cafes & Bars</option>
            <option value="beach_bar">Beach Bars</option>
          </select>

          <select
            className="filter-menu"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          >
            <option value="">All</option>
            <option value="available">Available</option>
            <option value="full">Full</option>
          </select>
        </div>
      </div>

      <VenueSection
        title="Cafes & Bars"
        venues={grouped.cafe_bar}
      />

      <VenueSection
        title="Restaurants"
        venues={grouped.restaurants}
      />

      <VenueSection
        title="Beach Bars"
        venues={grouped.beach_bar}
      />

      <VenueSection
        title="Other Venues"
        venues={grouped.other}
      />
    </div>
  );
}
