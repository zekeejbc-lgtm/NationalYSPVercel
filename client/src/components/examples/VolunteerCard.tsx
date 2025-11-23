import VolunteerCard from "../VolunteerCard";

export default function VolunteerCardExample() {
  return (
    <div className="max-w-md">
      <VolunteerCard
        id="1"
        eventName="Community Clean-up Drive"
        date={new Date("2024-12-15")}
        chapter="YSP Manila"
        sdgs={[11, 13, 15]}
        contactName="Maria Santos"
        contactPhone="09171234567"
        contactEmail="maria@youthservice.ph"
      />
    </div>
  );
}
