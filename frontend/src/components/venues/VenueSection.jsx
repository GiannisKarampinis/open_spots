import VenueCard from "./VenueCard";

export default function VenueSection({ title, venues }) {
  return (
    <>
      <h3 className="section-title">{title}</h3>

      <div className="venue-scroll-container grid-mode">
        {venues.map((venue) => (
          <VenueCard key={venue.id} venue={venue} />
        ))}
      </div>
    </>
  );
}
