import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  itemsPerPage: number;
  totalItems: number;
  startItem: number;
  endItem: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange: (size: number) => void;
  itemLabel?: string;
}

export default function PaginationControls({
  currentPage,
  totalPages,
  itemsPerPage,
  totalItems,
  startItem,
  endItem,
  onPageChange,
  onItemsPerPageChange,
  itemLabel = "items",
}: PaginationControlsProps) {
  if (totalItems === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-2 pt-2 md:flex-row md:items-center md:justify-between">
      <p className="text-xs text-muted-foreground">
        Showing {startItem}-{endItem} of {totalItems} {itemLabel}
      </p>

      <div className="flex items-center gap-2">
        <Select
          value={String(itemsPerPage)}
          onValueChange={(value) => onItemsPerPageChange(Number(value))}
        >
          <SelectTrigger className="h-8 w-[110px]" data-testid="select-items-per-page">
            <SelectValue placeholder="Rows" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">5 / page</SelectItem>
            <SelectItem value="10">10 / page</SelectItem>
            <SelectItem value="20">20 / page</SelectItem>
            <SelectItem value="50">50 / page</SelectItem>
          </SelectContent>
        </Select>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          data-testid="button-page-prev"
        >
          Previous
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {currentPage} / {totalPages}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          data-testid="button-page-next"
        >
          Next
        </Button>
      </div>
    </div>
  );
}
