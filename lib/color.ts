/** Stable, well-separated hue per reference (golden-angle walk). */
export function hueForIndex(index: number): number {
  return (index * 137.508 + 24) % 360;
}

export function refColor(hue: number, alpha = 1): string {
  return `hsla(${hue.toFixed(1)}, 75%, 62%, ${alpha})`;
}
