export function selectedTimeRange(left: number, right: number, width: number, start: number, end: number): { from: number; to: number } | null {
  if (width <= 0 || end <= start || Math.abs(right - left) < 5) {
    return null;
  }
  const first = Math.max(0, Math.min(width, Math.min(left, right)));
  const last = Math.max(0, Math.min(width, Math.max(left, right)));
  if (last - first < 5) {
    return null;
  }
  return { from: Math.round(start + (first / width) * (end - start)), to: Math.round(start + (last / width) * (end - start)) };
}

export function tooltipLeft(mouseX: number, plotWidth: number, tooltipWidth: number, offset = 12): number {
  if (mouseX + offset + tooltipWidth <= plotWidth) {
    return mouseX + offset;
  }
  return Math.max(0, mouseX - offset - tooltipWidth);
}
