import { memo, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Path, Stop } from 'react-native-svg';
import { useTheme } from '../../theme/ThemeContext';
import { label } from '../../theme/tokens';

export interface AreaChartPoint {
  label: string;
  value: number;
}

function compact(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
  }
  if (value >= 1_000) {
    return `${Math.round(value / 1_000)}K`;
  }
  return String(Math.round(value));
}

/**
 * Minimal dependency-free area chart (single series) in the style of the
 * design reference: gradient fill, left value axis, hour labels below.
 */
export const AreaChart = memo(function AreaChart({
  data,
  color,
  height = 110,
  accessibilityLabel,
}: {
  data: AreaChartPoint[];
  color: string;
  height?: number;
  /** Spoken summary of the series for screen readers. */
  accessibilityLabel?: string;
}) {
  const { mode } = useTheme();
  const [width, setWidth] = useState(0);

  const max = useMemo(
    () => Math.max(...data.map((point) => point.value), 1),
    [data],
  );
  const ticks = [max, max / 2, 0];
  const peak = useMemo(
    () =>
      data.reduce(
        (best, point) => (point.value > best.value ? point : best),
        data[0] ?? { label: '', value: 0 },
      ),
    [data],
  );

  const plotWidth = Math.max(width - 34, 0);
  const paths = useMemo(() => {
    if (plotWidth <= 0 || data.length < 2) {
      return null;
    }
    const step = plotWidth / (data.length - 1);
    const yFor = (value: number) => 4 + (1 - value / max) * (height - 8);
    const points = data.map(
      (point, index) => `${(index * step).toFixed(1)},${yFor(point.value).toFixed(1)}`,
    );
    const line = `M${points.join(' L')}`;
    const area = `${line} L${plotWidth},${height} L0,${height} Z`;
    return { line, area };
  }, [data, plotWidth, max, height]);
  // Cap x-axis labels (~8) so long ranges like 30 days stay readable.
  const labelStride = Math.max(1, Math.ceil(data.length / 8));

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={
        accessibilityLabel ??
        (peak.label ? `${compact(peak.value)} peak at ${peak.label}` : undefined)
      }
    >
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 34, height, justifyContent: 'space-between', paddingVertical: 2 }}>
          {ticks.map((tick, index) => (
            <Text
              key={index}
              style={{ fontSize: 10, fontVariant: ['tabular-nums'], color: label(mode, 0.35) }}
            >
              {compact(tick)}
            </Text>
          ))}
        </View>
        <View
          style={{ flex: 1, height }}
          onLayout={(event) => setWidth(event.nativeEvent.layout.width + 34)}
        >
          {paths ? (
            <Svg width={plotWidth} height={height}>
              <Defs>
                <LinearGradient id="areaFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="5%" stopColor={color} stopOpacity={0.4} />
                  <Stop offset="95%" stopColor={color} stopOpacity={0} />
                </LinearGradient>
              </Defs>
              <Path d={paths.area} fill="url(#areaFill)" />
              <Path
                d={paths.line}
                fill="none"
                stroke={color}
                strokeWidth={2}
                strokeLinejoin="round"
              />
            </Svg>
          ) : null}
        </View>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          marginLeft: 34,
          marginTop: 4,
        }}
      >
        {data
          .filter((_, index) => index % labelStride === 0)
          .map((point, index) => (
            <Text
              key={`${point.label}-${index}`}
              style={{ fontSize: 10, fontVariant: ['tabular-nums'], color: label(mode, 0.35) }}
            >
              {point.label}
            </Text>
          ))}
      </View>
    </View>
  );
});
