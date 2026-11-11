import { describe, expect, it } from 'vitest';
import { selectedTimeRange, tooltipLeft } from './interaction';

describe('panel interaction', () => {
  it('converts either drag direction into an absolute Grafana time range', () => {
    expect(selectedTimeRange(20, 80, 100, 1000, 2000)).toEqual({ from: 1200, to: 1800 });
    expect(selectedTimeRange(80, 20, 100, 1000, 2000)).toEqual({ from: 1200, to: 1800 });
    expect(selectedTimeRange(20, 23, 100, 1000, 2000)).toBeNull();
  });

  it('flips the tooltip left when its right edge would leave the plot', () => {
    expect(tooltipLeft(30, 400, 180)).toBe(42);
    expect(tooltipLeft(208, 400, 180)).toBe(220);
    expect(tooltipLeft(209, 400, 180)).toBe(17);
    expect(tooltipLeft(350, 400, 180)).toBe(158);
    expect(tooltipLeft(80, 200, 180)).toBe(0);
  });
});
