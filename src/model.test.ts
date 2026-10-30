import { describe, expect, it } from 'vitest';
import type { DataFrame } from '@grafana/data';
import { bounds, colorAt, extractRows, readingAt, resolveStops } from './model';
import { defaults } from './types';

describe('metric rows', () => {
  it('extracts one row per numeric field and sorts samples by time', () => {
    const frames = [{
      fields: [
        { name: 'Time', type: 'time', values: [20, 10] },
        { name: 'CPU', type: 'number', values: [80, 20], labels: { host: 'a' }, config: {} },
        { name: 'Memory', type: 'number', values: [50, null], config: {} },
      ],
    }] as unknown as DataFrame[];
    const rows = extractRows(frames);
    expect(rows).toHaveLength(2);
    expect(rows[0].name).toContain('a');
    expect(rows[0].samples).toEqual([{ time: 10, value: 20 }, { time: 20, value: 80 }]);
    expect(rows[1].samples[0].value).toBeNull();
    expect(bounds(rows, defaults)).toEqual([20, 80]);
  });

  it('interpolates values and fades to and from null samples', () => {
    const samples = [{ time: 0, value: 10 }, { time: 10, value: null }, { time: 20, value: 30 }, { time: 30, value: 50 }];
    expect(readingAt(samples, 5)).toEqual({ value: null, colorValue: 10, alpha: 0.5 });
    expect(readingAt(samples, 15)).toEqual({ value: null, colorValue: 30, alpha: 0.5 });
    expect(readingAt(samples, 25)).toEqual({ value: 40, colorValue: 40, alpha: 1 });
    expect(readingAt(samples, -1).alpha).toBe(0);
  });

  it('groups a time, metric, value table into metric rows', () => {
    const frames = [{
      fields: [
        { name: 'Time', type: 'time', values: [10, 10, 20, 20] },
        { name: 'IP', type: 'string', values: ['1.1.1.1', '8.8.8.8', '1.1.1.1', '8.8.8.8'] },
        { name: 'Packet loss', type: 'number', values: [0, 10, 1, 9], config: {} },
      ],
    }] as unknown as DataFrame[];
    const rows = extractRows(frames);
    expect(rows.map((row) => row.name)).toEqual(['1.1.1.1', '8.8.8.8']);
    expect(rows[0].samples).toEqual([{ time: 10, value: 0 }, { time: 20, value: 1 }]);
  });

  it('maps equal and out-of-range values to valid colors', () => {
    expect(colorAt(5, 1, 5, 5, defaults)).toMatch(/^hsla\(/);
    expect(colorAt(100, 2, 0, 10, defaults)).toContain(', 1)');
  });

  it('uses a frame name as the row label for one value field', () => {
    const frames = [{
      name: '1.1.1.1',
      fields: [
        { name: 'Time', type: 'time', values: [10] },
        { name: 'Value', type: 'number', values: [0.0001], config: { unit: 'percentunit' } },
      ],
    }] as unknown as DataFrame[];
    const row = extractRows(frames)[0];
    expect(row.name).toBe('1.1.1.1');
    expect(row.unit).toBe('percentunit');
  });

  it('reads Grafana 8 vector-backed field values', () => {
    const vector = (values: unknown[]) => ({ length: values.length, get: (index: number) => values[index] });
    const frames = [{
      name: '8.8.4.4',
      fields: [
        { name: 'Time', type: 'time', values: vector([10, 20]) },
        { name: 'Value', type: 'number', values: vector([0, 0.1]), config: {} },
      ],
    }] as unknown as DataFrame[];
    expect(extractRows(frames)[0].samples).toEqual([{ time: 10, value: 0 }, { time: 20, value: 0.1 }]);
  });

  it('interpolates between packet loss thresholds and supports percentage mode', () => {
    const raw = [
      { value: null, color: '#008000' },
      { value: 0.0001, color: '#bfb469' },
      { value: 0.1, color: '#ff0000' },
    ];
    const stops = resolveStops(raw, 'absolute', 0, 0.1, (color) => color);
    expect(stops.map((stop) => stop.value)).toEqual([0, 0.0001, 0.1]);
    expect(colorAt(0.0001, 1, 0, 0.1, defaults, stops)).toBe(colorAt(0.0001, 1, 0, 0.1, defaults, [stops[1]]));
    const relative = resolveStops([{ value: null, color: '#008000' }, { value: 50, color: '#ff0000' }], 'percentage', 0, 0.1, (color) => color);
    expect(relative.map((stop) => stop.value)).toEqual([0, 0.05]);
    const infiniteBase = resolveStops([{ value: -Infinity, color: '#008000' }, { value: 0.1, color: '#ff0000' }], 'absolute', 0, 0.1, (color) => color);
    expect(infiniteBase[0].value).toBe(0);
  });
});
