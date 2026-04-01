import { useEffect, useMemo, useState } from "react";

interface UsePaginationOptions {
  initialPage?: number;
  pageSize?: number;
  resetKey?: string | number;
}

export function usePagination<T>(items: T[], options: UsePaginationOptions = {}) {
  const { initialPage = 1, pageSize = 10, resetKey } = options;
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [itemsPerPage, setItemsPerPage] = useState(pageSize);

  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));

  useEffect(() => {
    setCurrentPage(1);
  }, [resetKey, itemsPerPage]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    const end = start + itemsPerPage;
    return items.slice(start, end);
  }, [items, currentPage, itemsPerPage]);

  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  return {
    currentPage,
    totalPages,
    itemsPerPage,
    setCurrentPage,
    setItemsPerPage,
    paginatedItems,
    totalItems,
    startItem,
    endItem,
    canGoPrevious: currentPage > 1,
    canGoNext: currentPage < totalPages,
  };
}
