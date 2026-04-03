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

  const hasMultiplePages = totalPages > 1;
  const pageSizeOptions = Array.from(new Set([5, 10, 20, 50, itemsPerPage])).sort((a, b) => a - b);

  return (
    <div className="flex flex-col gap-2 pt-2 md:flex-row md:items-center md:justify-between">
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground whitespace-nowrap">Rows per page</span>
        <Select
          value={String(itemsPerPage)}
          onValueChange={(value) => onItemsPerPageChange(Number(value))}
        >
          <SelectTrigger className="h-8 w-[88px]" data-testid="select-items-per-page">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)}>{size}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2 md:justify-end">
        <p className="text-xs text-muted-foreground whitespace-nowrap">
          Showing {startItem}-{endItem} of {totalItems} {itemLabel}
        </p>

        {hasMultiplePages && (
          <>
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
            <span className="text-xs text-muted-foreground whitespace-nowrap">
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
          </>
        )}
      </div>
    </div>
  );
}
