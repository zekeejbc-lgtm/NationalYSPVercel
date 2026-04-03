const BASE_COMPARISON_COLORS = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#06b6d4",
  "#f97316",
  "#0f766e",
  "#ec4899",
  "#84cc16",
];

export function getComparisonColor(index: number): string {
  if (index < BASE_COMPARISON_COLORS.length) {
    return BASE_COMPARISON_COLORS[index];
  }

  const hue = Math.round((index * 137.508) % 360);
  return `hsl(${hue} 68% 45%)`;
}