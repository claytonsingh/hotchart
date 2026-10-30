import { describe, expect, it } from 'vitest';
import { selectedTimeRange } from './interaction';

describe('panel interaction', () => {
  it('converts either drag direction into an absolute Grafana time range', () => {
    expect(selectedTimeRange(20, 80, 100, 1000, 2000)).toEqual({ from: 1200, to: 1800 });
    expect(selectedTimeRange(80, 20, 100, 1000, 2000)).toEqual({ from: 1200, to: 1800 });
    expect(selectedTimeRange(20, 23, 100, 1000, 2000)).toBeNull();
  });
});
