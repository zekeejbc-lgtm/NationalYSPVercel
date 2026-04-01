import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LayoutGrid, Table2 } from "lucide-react";

export type ViewMode = "table" | "tile";

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  className?: string;
  testIdPrefix?: string;
}

export default function ViewModeToggle({
  value,
  onChange,
  className,
  testIdPrefix = "view-mode",
}: ViewModeToggleProps) {
  return (
    <div
      className={cn("inline-flex items-center gap-1 rounded-lg border bg-muted/30 p-1", className)}
      role="group"
      aria-label="View mode"
    >
      <Button
        type="button"
        size="sm"
        variant={value === "table" ? "secondary" : "ghost"}
        onClick={() => onChange("table")}
        data-testid={`${testIdPrefix}-table`}
      >
        <Table2 className="h-4 w-4" />
        Table
      </Button>
      <Button
        type="button"
        size="sm"
        variant={value === "tile" ? "secondary" : "ghost"}
        onClick={() => onChange("tile")}
        data-testid={`${testIdPrefix}-tile`}
      >
        <LayoutGrid className="h-4 w-4" />
        Tile
      </Button>
    </div>
  );
}