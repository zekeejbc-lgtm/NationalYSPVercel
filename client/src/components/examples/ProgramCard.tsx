import ProgramCard from "../ProgramCard";
import educationImage from "@assets/generated_images/education_program_teaching_children.png";

export default function ProgramCardExample() {
  return (
    <div className="max-w-sm">
      <ProgramCard
        id="1"
        title="Education Program"
        description="Providing quality education and tutoring to underprivileged children in rural communities across the Philippines."
        image={educationImage}
        onClick={() => console.error("Program clicked")}
      />
    </div>
  );
}
