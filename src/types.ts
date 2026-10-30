export interface HotchartOptions {
  colorMode: 'field' | 'manual';
  lowHue: number;
  lowSaturation: number;
  lowLightness: number;
  highHue: number;
  highSaturation: number;
  highLightness: number;
  minValue?: number;
  maxValue?: number;
  rowHeight: number;
  labelWidth: number;
}

export const defaults: HotchartOptions = {
  colorMode: 'field',
  lowHue: 220,
  lowSaturation: 90,
  lowLightness: 45,
  highHue: 28,
  highSaturation: 100,
  highLightness: 60,
  rowHeight: 12,
  labelWidth: 105,
};
