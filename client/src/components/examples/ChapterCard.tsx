import ChapterCard from "../ChapterCard";

export default function ChapterCardExample() {
  return (
    <div className="max-w-sm">
      <ChapterCard
        id="1"
        name="YSP Manila"
        location="Manila, Metro Manila"
        contact="09171234567"
        email="manila@youthservice.ph"
        representative="Juan Dela Cruz"
      />
    </div>
  );
}
