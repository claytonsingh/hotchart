import type { DataFrame, Field } from '@grafana/data';
import type { HotchartOptions } from './types';

export interface Sample {
  time: number;
  value: number | null;
}

export interface MetricRow {
  name: string;
  samples: Sample[];
  unit?: string;
  thresholds?: ColorStop[];
  thresholdMode?: 'absolute' | 'percentage';
}

export interface ColorStop {
  value: number | null;
  color: string;
}

export interface HslStop {
  value: number;
  hue: number;
  saturation: number;
  lightness: number;
}

export interface Reading {
  value: number | null;
  colorValue: number | null;
  alpha: number;
}

function timestamp(value: unknown): number | null {
  const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : Number(value);
  return Number.isFinite(time) ? time : null;
}

function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function fieldValue(field: Field, index: number): unknown {
  const values = field.values as unknown as { get?: (position: number) => unknown; [position: number]: unknown };
  return typeof values.get === 'function' ? values.get(index) : values[index];
}

function displayName(field: Field, frame: DataFrame, numericCount: number): string {
  if (field.config?.displayName) {
    return field.config.displayName;
  }
  if (field.config?.displayNameFromDS) {
    return field.config.displayNameFromDS;
  }
  if (numericCount === 1 && frame.name && frame.name !== field.name) {
    return frame.name;
  }
  const labels = Object.values(field.labels ?? {});
  return labels.length ? `${field.name} ${labels.join(' ')}` : field.name || frame.name || 'Metric';
}

function fieldSettings(field: Field): Pick<MetricRow, 'unit' | 'thresholds' | 'thresholdMode'> {
  return {
    unit: field.config?.unit,
    thresholds: field.config?.thresholds?.steps.map((step) => ({ value: step.value, color: step.color })),
    thresholdMode: field.config?.thresholds?.mode,
  };
}

export function extractRows(frames: DataFrame[]): MetricRow[] {
  const rows: MetricRow[] = [];
  for (const frame of frames) {
    const time = frame.fields.find((field) => field.type === 'time');
    if (!time) {
      continue;
    }
    const numericFields = frame.fields.filter((field) => field.type === 'number');
    const textFields = frame.fields.filter((field) => field.type === 'string');
    if (numericFields.length === 1 && textFields.length === 1) {
      const valueField = numericFields[0];
      const metricField = textFields[0];
      const grouped = new Map<string, Sample[]>();
      const length = Math.min(time.values.length, valueField.values.length, metricField.values.length);
      for (let i = 0; i < length; i++) {
        const at = timestamp(fieldValue(time, i));
        const metric = fieldValue(metricField, i);
        if (at === null || metric === null || metric === undefined || metric === '') {
          continue;
        }
        const name = String(metric);
        const samples = grouped.get(name) ?? [];
        samples.push({ time: at, value: numeric(fieldValue(valueField, i)) });
        grouped.set(name, samples);
      }
      for (const [name, samples] of grouped) {
        rows.push({ name, samples: sortedUnique(samples), ...fieldSettings(valueField) });
      }
      continue;
    }
    for (const field of numericFields) {
      const samples: Sample[] = [];
      const length = Math.min(time.values.length, field.values.length);
      for (let i = 0; i < length; i++) {
        const at = timestamp(fieldValue(time, i));
        if (at !== null) {
          samples.push({ time: at, value: numeric(fieldValue(field, i)) });
        }
      }
      rows.push({ name: displayName(field, frame, numericFields.length), samples: sortedUnique(samples), ...fieldSettings(field) });
    }
  }
  return rows;
}

function sortedUnique(samples: Sample[]): Sample[] {
  samples.sort((a, b) => a.time - b.time);
  const unique: Sample[] = [];
  for (const sample of samples) {
    if (unique.length && unique[unique.length - 1].time === sample.time) {
      unique[unique.length - 1] = sample;
    } else {
      unique.push(sample);
    }
  }
  return unique;
}

export function bounds(rows: MetricRow[], options: HotchartOptions): [number, number] {
  let observedMin = Infinity;
  let observedMax = -Infinity;
  for (const row of rows) {
    for (const sample of row.samples) {
      if (sample.value !== null) {
        observedMin = Math.min(observedMin, sample.value);
        observedMax = Math.max(observedMax, sample.value);
      }
    }
  }
  const min = options.minValue ?? (Number.isFinite(observedMin) ? observedMin : 0);
  const max = options.maxValue ?? (Number.isFinite(observedMax) ? observedMax : 1);
  return min <= max ? [min, max] : [max, min];
}

export function readingAt(samples: Sample[], time: number): Reading {
  if (!samples.length || time < samples[0].time || time > samples[samples.length - 1].time) {
    return { value: null, colorValue: null, alpha: 0 };
  }
  let left = 0;
  let right = samples.length - 1;
  while (left < right) {
    const mid = Math.ceil((left + right) / 2);
    if (samples[mid].time <= time) {
      left = mid;
    } else {
      right = mid - 1;
    }
  }
  const first = samples[left];
  const second = samples[Math.min(left + 1, samples.length - 1)];
  if (first.time === second.time) {
    return { value: first.value, colorValue: first.value, alpha: first.value === null ? 0 : 1 };
  }
  const fraction = (time - first.time) / (second.time - first.time);
  if (first.value !== null && second.value !== null) {
    const value = first.value + (second.value - first.value) * fraction;
    return { value, colorValue: value, alpha: 1 };
  }
  if (first.value !== null) {
    return { value: null, colorValue: first.value, alpha: 1 - fraction };
  }
  if (second.value !== null) {
    return { value: null, colorValue: second.value, alpha: fraction };
  }
  return { value: null, colorValue: null, alpha: 0 };
}

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function rgbToHsl(red: number, green: number, blue: number): Pick<HslStop, 'hue' | 'saturation' | 'lightness'> {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const high = Math.max(r, g, b);
  const low = Math.min(r, g, b);
  const delta = high - low;
  const lightness = (high + low) / 2;
  if (delta === 0) {
    return { hue: 0, saturation: 0, lightness: lightness * 100 };
  }
  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue = high === r ? ((g - b) / delta) % 6 : high === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = (hue * 60 + 360) % 360;
  return { hue, saturation: saturation * 100, lightness: lightness * 100 };
}

function parseColor(color: string): Pick<HslStop, 'hue' | 'saturation' | 'lightness'> | null {
  const hex = color.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? hex[1].split('').map((digit) => digit + digit).join('') : hex[1];
    return rgbToHsl(parseInt(digits.slice(0, 2), 16), parseInt(digits.slice(2, 4), 16), parseInt(digits.slice(4, 6), 16));
  }
  const rgb = color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  return rgb ? rgbToHsl(Number(rgb[1]), Number(rgb[2]), Number(rgb[3])) : null;
}

export function resolveStops(stops: ColorStop[] | undefined, mode: 'absolute' | 'percentage', min: number, max: number, resolveColor: (color: string) => string): HslStop[] {
  return (stops ?? [])
    .map((stop, index) => {
      const parsed = parseColor(resolveColor(stop.color));
      const base = index === 0 && (stop.value === null || !Number.isFinite(stop.value));
      const stepValue = base ? min : stop.value;
      const value = stepValue === null ? null : mode === 'percentage' && !base ? min + ((max - min) * stepValue) / 100 : stepValue;
      return parsed && value !== null && Number.isFinite(value) ? { value, ...parsed } : null;
    })
    .filter((stop): stop is HslStop => stop !== null)
    .sort((a, b) => a.value - b.value);
}

function interpolateHsl(low: HslStop, high: HslStop, ratio: number): Pick<HslStop, 'hue' | 'saturation' | 'lightness'> {
  const hueDelta = ((high.hue - low.hue + 540) % 360) - 180;
  return {
    hue: (low.hue + hueDelta * ratio + 360) % 360,
    saturation: low.saturation + (high.saturation - low.saturation) * ratio,
    lightness: low.lightness + (high.lightness - low.lightness) * ratio,
  };
}

export function colorAt(value: number, alpha: number, min: number, max: number, options: HotchartOptions, stops: HslStop[] = []): string {
  let hue: number;
  let saturation: number;
  let lightness: number;
  if (stops.length) {
    let index = 0;
    while (index < stops.length - 1 && value > stops[index + 1].value) {
      index++;
    }
    const low = stops[index];
    const high = stops[Math.min(index + 1, stops.length - 1)];
    const ratio = high.value === low.value ? 0 : clamp((value - low.value) / (high.value - low.value), 0, 1);
    ({ hue, saturation, lightness } = interpolateHsl(low, high, ratio));
  } else {
    const ratio = max === min ? 0.5 : clamp((value - min) / (max - min), 0, 1);
    const low: HslStop = { value: min, hue: options.lowHue, saturation: options.lowSaturation, lightness: options.lowLightness };
    const high: HslStop = { value: max, hue: options.highHue, saturation: options.highSaturation, lightness: options.highLightness };
    ({ hue, saturation, lightness } = interpolateHsl(low, high, ratio));
  }
  return `hsla(${hue}, ${saturation}%, ${lightness}%, ${clamp(alpha, 0, 1)})`;
}
