import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PanelProps } from '@grafana/data';
import { useTheme2 } from '@grafana/ui';
import { bounds, colorAt, extractRows, readingAt, resolveStops } from './model';
import { selectedTimeRange } from './interaction';
import { defaults, HotchartOptions } from './types';

interface Hover {
  x: number;
  y: number;
  row: number;
  time: number;
  value: number | null;
}

interface Selection {
  pointerId: number;
  startX: number;
  endX: number;
}

function formatTime(time: number): string {
  return new Date(time).toLocaleString([], { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
}

function formatValue(value: number, unit?: string): string {
  const percent = unit === 'percentunit';
  const formatted = new Intl.NumberFormat(undefined, { maximumFractionDigits: 5 }).format(percent ? value * 100 : value);
  return percent ? `${formatted}%` : formatted;
}

export const HotchartPanel: React.FC<PanelProps<HotchartOptions>> = ({ data, width, height, options, timeRange, onChangeTimeRange }) => {
  const theme = useTheme2();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hover, setHover] = useState<Hover | null>(null);
  const [selection, setSelection] = useState<Selection | null>(null);
  const selectionRef = useRef<Selection | null>(null);
  const settings = { ...defaults, ...options };
  const rows = useMemo(() => extractRows(data.series), [data.series]);
  const fieldThresholds = settings.colorMode === 'field' ? rows[0]?.thresholds : undefined;
  const thresholdMode = rows[0]?.thresholdMode ?? 'absolute';
  const unit = rows[0]?.unit;
  const [min, max] = useMemo(() => {
    const [observedMin, observedMax] = bounds(rows, settings);
    const lastThreshold = thresholdMode === 'absolute' ? fieldThresholds?.reduce((last, step) => step.value !== null && Number.isFinite(step.value) ? Math.max(last, step.value) : last, -Infinity) : undefined;
    const lower = settings.minValue ?? (fieldThresholds?.length && unit === 'percentunit' ? 0 : observedMin);
    const upper = settings.maxValue ?? (lastThreshold !== undefined && Number.isFinite(lastThreshold) ? lastThreshold : observedMax);
    return lower < upper ? [lower, upper] : [lower, Math.max(lower + 1, observedMax)];
  }, [rows, settings.minValue, settings.maxValue, fieldThresholds, thresholdMode, unit]);
  const stops = useMemo(() => settings.colorMode === 'field' ? resolveStops(fieldThresholds, thresholdMode, min, max, theme.visualization.getColorByName) : [], [settings.colorMode, fieldThresholds, thresholdMode, min, max, theme]);
  const start = timeRange.from.valueOf();
  const end = timeRange.to.valueOf();
  const rowHeight = Math.max(8, settings.rowHeight);
  const labelWidth = Math.min(Math.max(60, settings.labelWidth), Math.max(60, width - 80));
  const plotWidth = Math.max(1, width - labelWidth - 18);
  const plotHeight = rows.length * rowHeight;
  const legend = useMemo(() => {
    const anchors = [min, ...stops.map((stop) => stop.value).filter((value) => value > min && value < max), max];
    const steps = anchors.flatMap((anchor, segment) => segment === anchors.length - 1 ? [] : Array.from({ length: 9 }, (_, index) => {
      const value = anchor + ((anchors[segment + 1] - anchor) * index) / 8;
      const ratio = max === min ? 0 : ((value - min) / (max - min)) * 100;
      return `${colorAt(value, 1, min, max, settings, stops)} ${ratio}%`;
    }));
    return `linear-gradient(to right, ${steps.join(', ')})`;
  }, [min, max, stops, settings.lowHue, settings.lowSaturation, settings.lowLightness, settings.highHue, settings.highSaturation, settings.highLightness]);

  useEffect(() => {
    const element = canvas.current;
    const context = element?.getContext('2d');
    if (!element || !context || end <= start || plotHeight === 0) {
      return;
    }
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    element.width = Math.ceil(plotWidth * scale);
    element.height = Math.ceil(plotHeight * scale);
    context.setTransform(scale, 0, 0, scale, 0, 0);
    context.clearRect(0, 0, plotWidth, plotHeight);
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
      const y = rowIndex * rowHeight + (rowHeight >= 12 ? 1 : 0);
      const bandHeight = Math.max(1, rowHeight - (rowHeight >= 12 ? 2 : 1));
      const samples = rows[rowIndex].samples;
      for (let x = 0; x < plotWidth; x++) {
        const time = start + ((x + 0.5) / plotWidth) * (end - start);
        const reading = readingAt(samples, time);
        if (reading.colorValue === null || reading.alpha <= 0) {
          continue;
        }
        context.fillStyle = colorAt(reading.colorValue, reading.alpha, min, max, settings, stops);
        context.fillRect(x, y, 1, bandHeight);
      }
    }
  }, [rows, start, end, plotWidth, plotHeight, rowHeight, min, max, stops, settings.lowHue, settings.lowSaturation, settings.lowLightness, settings.highHue, settings.highSaturation, settings.highLightness]);

  const tickCount = Math.max(2, Math.floor(plotWidth / 105) + 1);
  const ticks = Array.from({ length: tickCount }, (_, index) => start + (index / (tickCount - 1)) * (end - start));
  const pointerX = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return Math.max(0, Math.min(plotWidth, event.clientX - bounds.left));
  };
  const updateSelection = (next: Selection | null) => {
    selectionRef.current = next;
    setSelection(next);
  };
  const onPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 || end <= start) {
      return;
    }
    const x = pointerX(event);
    updateSelection({ pointerId: event.pointerId, startX: x, endX: x });
    setHover(null);
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = selectionRef.current;
    if (active && active.pointerId === event.pointerId) {
      updateSelection({ ...active, endX: pointerX(event) });
      return;
    }
    if (end <= start) {
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(0, Math.min(plotWidth - 1, event.clientX - bounds.left));
    const y = event.clientY - bounds.top;
    const row = Math.floor(y / rowHeight);
    if (row < 0 || row >= rows.length) {
      setHover(null);
      return;
    }
    const time = start + (x / plotWidth) * (end - start);
    setHover({ x, y, row, time, value: readingAt(rows[row].samples, time).value });
  };
  const onPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const active = selectionRef.current;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const range = selectedTimeRange(active.startX, pointerX(event), plotWidth, start, end);
    updateSelection(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (range) {
      onChangeTimeRange(range);
    }
  };
  const onPointerCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (selectionRef.current?.pointerId === event.pointerId) {
      updateSelection(null);
    }
  };

  if (!rows.length) {
    return <div style={{ color: theme.colors.text.secondary, padding: 16 }}>Add a time series query with at least one numeric field.</div>;
  }

  return (
    <div style={{ width, height, display: 'flex', flexDirection: 'column', color: theme.colors.text.primary, fontFamily: theme.typography.fontFamily, overflow: 'hidden' }}>
      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflowY: 'auto' }}>
        <div style={{ width: labelWidth, flexShrink: 0 }}>
          {rows.map((row, index) => (
            <div key={index} title={row.name} style={{ height: rowHeight, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 7, boxSizing: 'border-box', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontSize: Math.min(11, Math.max(8, rowHeight - 1)), lineHeight: 1, textAlign: 'right' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{row.name}</span>
            </div>
          ))}
        </div>
        <div style={{ position: 'relative', width: plotWidth, height: plotHeight, flexShrink: 0 }}>
          <canvas ref={canvas} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel} onPointerLeave={() => setHover(null)} style={{ width: plotWidth, height: plotHeight, display: 'block', cursor: 'crosshair', touchAction: 'none' }} />
          {selection && Math.abs(selection.endX - selection.startX) >= 2 && (
            <div style={{ position: 'absolute', left: Math.min(selection.startX, selection.endX), top: 0, width: Math.abs(selection.endX - selection.startX), height: plotHeight, pointerEvents: 'none', background: theme.colors.primary.transparent, borderLeft: `1px solid ${theme.colors.primary.main}`, borderRight: `1px solid ${theme.colors.primary.main}` }} />
          )}
          {hover && (
            <div style={{ position: 'absolute', left: Math.min(hover.x + 12, Math.max(0, plotWidth - 165)), top: Math.max(0, hover.y - 58), pointerEvents: 'none', zIndex: 2, minWidth: 140, padding: '7px 9px', borderRadius: 4, background: theme.colors.background.secondary, border: `1px solid ${theme.colors.border.weak}`, boxShadow: '0 3px 12px rgba(0, 0, 0, 0.3)', fontSize: 12 }}>
              <strong>{rows[hover.row].name}</strong><br />
              {formatTime(hover.time)}<br />
              {hover.value === null ? 'No data' : formatValue(hover.value, rows[hover.row].unit)}
            </div>
          )}
        </div>
      </div>
      <div style={{ display: 'flex', flexShrink: 0, paddingRight: 18, fontSize: 10, color: theme.colors.text.secondary }}>
        <div style={{ width: labelWidth, flexShrink: 0 }} />
        <div style={{ width: plotWidth, position: 'relative', height: 25, borderTop: `1px solid ${theme.colors.border.weak}` }}>
          {ticks.map((time, index) => (
            <span key={index} style={{ position: 'absolute', left: `${(index / (tickCount - 1)) * 100}%`, transform: index === 0 ? 'none' : index === tickCount - 1 ? 'translateX(-100%)' : 'translateX(-50%)', paddingTop: 4, whiteSpace: 'nowrap' }}>{formatTime(time)}</span>
          ))}
        </div>
      </div>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, height: 27, fontSize: 11, color: theme.colors.text.secondary }}>
        <span>{formatValue(min, unit)}</span>
        <div aria-label="Color scale" style={{ width: Math.min(220, Math.max(60, plotWidth - 100)), height: 9, borderRadius: 3, background: legend }} />
        <span>{formatValue(max, unit)}</span>
      </div>
    </div>
  );
};
