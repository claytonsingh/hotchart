import { FieldConfigProperty, PanelPlugin } from '@grafana/data';
import { HotchartPanel } from './panel';
import { defaults, HotchartOptions } from './types';

export const plugin = new PanelPlugin<HotchartOptions>(HotchartPanel).useFieldConfig({
  standardOptions: {
    [FieldConfigProperty.Thresholds]: {},
    [FieldConfigProperty.Unit]: {},
    [FieldConfigProperty.Decimals]: {},
    [FieldConfigProperty.DisplayName]: {},
  },
}).setPanelOptions((builder) =>
  builder
    .addRadio({ path: 'colorMode', name: 'Gradient source', defaultValue: defaults.colorMode, settings: { options: [{ label: 'Field thresholds', value: 'field' }, { label: 'Manual HSL', value: 'manual' }] } })
    .addSliderInput({ path: 'lowHue', name: 'Low hue', defaultValue: defaults.lowHue, settings: { min: 0, max: 360, step: 1 }, showIf: (config) => config.colorMode === 'manual' })
    .addSliderInput({ path: 'lowSaturation', name: 'Low saturation', defaultValue: defaults.lowSaturation, settings: { min: 0, max: 100, step: 1 }, showIf: (config) => config.colorMode === 'manual' })
    .addSliderInput({ path: 'lowLightness', name: 'Low lightness', defaultValue: defaults.lowLightness, settings: { min: 0, max: 100, step: 1 }, showIf: (config) => config.colorMode === 'manual' })
    .addSliderInput({ path: 'highHue', name: 'High hue', defaultValue: defaults.highHue, settings: { min: 0, max: 360, step: 1 }, showIf: (config) => config.colorMode === 'manual' })
    .addSliderInput({ path: 'highSaturation', name: 'High saturation', defaultValue: defaults.highSaturation, settings: { min: 0, max: 100, step: 1 }, showIf: (config) => config.colorMode === 'manual' })
    .addSliderInput({ path: 'highLightness', name: 'High lightness', defaultValue: defaults.highLightness, settings: { min: 0, max: 100, step: 1 }, showIf: (config) => config.colorMode === 'manual' })
    .addNumberInput({ path: 'minValue', name: 'Scale minimum', description: 'Leave empty to use the lowest observed value.' })
    .addNumberInput({ path: 'maxValue', name: 'Scale maximum', description: 'Leave empty to use the highest observed value.' })
    .addSliderInput({ path: 'rowHeight', name: 'Row height', defaultValue: defaults.rowHeight, settings: { min: 8, max: 120, step: 1 } })
    .addSliderInput({ path: 'labelWidth', name: 'Label width', defaultValue: defaults.labelWidth, settings: { min: 60, max: 300, step: 1 } })
);
