/**
 * SimpleChart -- lightweight SVG chart components for the admin dashboard.
 * No external dependencies; pure React + inline SVG.
 */

import { useMemo } from 'react';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

const DEFAULT_COLORS = [
  '#7C3AED', // purple (primary accent)
  '#2563EB', // blue
  '#10B981', // emerald
  '#F59E0B', // amber
  '#EF4444', // red
  '#EC4899', // pink
  '#6366F1', // indigo
  '#14B8A6', // teal
];

function pickColor(index: number, explicit?: string): string {
  return explicit ?? DEFAULT_COLORS[index % DEFAULT_COLORS.length];
}

// ---------------------------------------------------------------------------
// Bar Chart (vertical)
// ---------------------------------------------------------------------------

interface BarChartProps {
  data: DataPoint[];
  height?: number;
  barWidth?: number;
  gap?: number;
  showValues?: boolean;
  className?: string;
}

export function BarChart({
  data,
  height = 200,
  barWidth = 40,
  gap = 12,
  showValues = true,
  className = '',
}: BarChartProps) {
  const maxVal = Math.max(...data.map(d => d.value), 1);
  const totalWidth = data.length * (barWidth + gap) - gap;
  const padding = { top: 20, bottom: 40, left: 10, right: 10 };
  const svgW = totalWidth + padding.left + padding.right;
  const svgH = height + padding.top + padding.bottom;
  const chartH = height;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className={`w-full ${className}`}
      preserveAspectRatio="xMidYMid meet">
      {data.map((d, i) => {
        const barH = (d.value / maxVal) * chartH;
        const x = padding.left + i * (barWidth + gap);
        const y = padding.top + (chartH - barH);
        const color = pickColor(i, d.color);
        return (
          <g key={d.label}>
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={barH}
              rx={4}
              fill={color}
              className="transition-all duration-300"
            />
            {showValues && (
              <text
                x={x + barWidth / 2}
                y={y - 6}
                textAnchor="middle"
                className="fill-neutral-600 text-[10px] font-medium">
                {d.value}
              </text>
            )}
            <text
              x={x + barWidth / 2}
              y={svgH - 8}
              textAnchor="middle"
              className="fill-neutral-500 text-[10px]">
              {d.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Horizontal Bar Chart
// ---------------------------------------------------------------------------

interface HorizontalBarChartProps {
  data: DataPoint[];
  height?: number;
  barHeight?: number;
  className?: string;
}

export function HorizontalBarChart({
  data,
  barHeight = 24,
  className = '',
}: HorizontalBarChartProps) {
  const maxVal = Math.max(...data.map(d => d.value), 1);

  return (
    <div className={`space-y-2 ${className}`}>
      {data.map((d, i) => {
        const pct = (d.value / maxVal) * 100;
        const color = pickColor(i, d.color);
        return (
          <div key={d.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-neutral-700 font-medium truncate">{d.label}</span>
              <span className="text-neutral-500 ml-2 flex-shrink-0">{d.value}</span>
            </div>
            <div className="w-full bg-neutral-100 rounded-full" style={{ height: barHeight / 2 }}>
              <div
                className="rounded-full transition-all duration-500"
                style={{ width: `${pct}%`, height: '100%', backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stacked Bar Chart (vertical)
// ---------------------------------------------------------------------------

export interface StackedBarGroup {
  label: string;
  segments: { label: string; value: number; color: string }[];
}

interface StackedBarChartProps {
  data: StackedBarGroup[];
  height?: number;
  barWidth?: number;
  gap?: number;
  className?: string;
}

export function StackedBarChart({
  data,
  height = 200,
  barWidth = 48,
  gap = 16,
  className = '',
}: StackedBarChartProps) {
  const maxVal = Math.max(
    ...data.map(g => g.segments.reduce((sum, s) => sum + s.value, 0)),
    1
  );
  const totalWidth = data.length * (barWidth + gap) - gap;
  const padding = { top: 10, bottom: 40, left: 10, right: 10 };
  const svgW = totalWidth + padding.left + padding.right;
  const svgH = height + padding.top + padding.bottom;
  const chartH = height;

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className={`w-full ${className}`}
      preserveAspectRatio="xMidYMid meet">
      {data.map((group, gi) => {
        const x = padding.left + gi * (barWidth + gap);
        let yOffset = 0;
        const totalGroupVal = group.segments.reduce((s, seg) => s + seg.value, 0);
        return (
          <g key={group.label}>
            {group.segments.map(seg => {
              const segH = (seg.value / maxVal) * chartH;
              const y = padding.top + chartH - yOffset - segH;
              yOffset += segH;
              return (
                <rect
                  key={seg.label}
                  x={x}
                  y={y}
                  width={barWidth}
                  height={Math.max(segH, 0)}
                  fill={seg.color}
                  rx={yOffset === segH ? 4 : 0}
                />
              );
            })}
            <text
              x={x + barWidth / 2}
              y={padding.top + chartH - (totalGroupVal / maxVal) * chartH - 6}
              textAnchor="middle"
              className="fill-neutral-600 text-[10px] font-medium">
              ${totalGroupVal.toLocaleString()}
            </text>
            <text
              x={x + barWidth / 2}
              y={svgH - 8}
              textAnchor="middle"
              className="fill-neutral-500 text-[10px]">
              {group.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Line Chart
// ---------------------------------------------------------------------------

interface LineChartProps {
  data: DataPoint[];
  height?: number;
  color?: string;
  showDots?: boolean;
  showArea?: boolean;
  formatValue?: (v: number) => string;
  className?: string;
}

export function LineChart({
  data,
  height = 200,
  color = '#7C3AED',
  showDots = true,
  showArea = true,
  formatValue = v => `$${v.toLocaleString()}`,
  className = '',
}: LineChartProps) {
  const padding = { top: 20, bottom: 40, left: 10, right: 10 };
  const chartW = 500;
  const svgW = chartW + padding.left + padding.right;
  const svgH = height + padding.top + padding.bottom;
  const chartH = height;

  const maxVal = Math.max(...data.map(d => d.value), 1);
  const minVal = Math.min(...data.map(d => d.value), 0);
  const range = maxVal - minVal || 1;

  const points = useMemo(() => {
    return data.map((d, i) => {
      const x = padding.left + (i / Math.max(data.length - 1, 1)) * chartW;
      const y = padding.top + chartH - ((d.value - minVal) / range) * chartH;
      return { x, y, ...d };
    });
  }, [data, chartW, chartH, minVal, range, padding.left, padding.top]);

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

  const areaPath = showArea
    ? `${linePath} L ${points[points.length - 1]?.x ?? 0} ${padding.top + chartH} L ${points[0]?.x ?? 0} ${padding.top + chartH} Z`
    : '';

  return (
    <svg
      viewBox={`0 0 ${svgW} ${svgH}`}
      className={`w-full ${className}`}
      preserveAspectRatio="xMidYMid meet">
      {/* Grid lines */}
      {[0, 0.25, 0.5, 0.75, 1].map(frac => {
        const y = padding.top + chartH * (1 - frac);
        return (
          <line
            key={frac}
            x1={padding.left}
            x2={padding.left + chartW}
            y1={y}
            y2={y}
            stroke="#E5E7EB"
            strokeWidth={0.5}
          />
        );
      })}

      {/* Area */}
      {showArea && <path d={areaPath} fill={color} opacity={0.08} />}

      {/* Line */}
      <path d={linePath} fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" />

      {/* Dots */}
      {showDots &&
        points.map(p => (
          <circle key={p.label} cx={p.x} cy={p.y} r={4} fill="white" stroke={color} strokeWidth={2} />
        ))}

      {/* X-axis labels */}
      {points.map((p, i) => {
        // Show every label or every other if too many
        if (data.length > 12 && i % 2 !== 0) return null;
        return (
          <text
            key={p.label}
            x={p.x}
            y={svgH - 8}
            textAnchor="middle"
            className="fill-neutral-500 text-[9px]">
            {p.label}
          </text>
        );
      })}

      {/* Value on last point */}
      {points.length > 0 && (
        <text
          x={points[points.length - 1].x}
          y={points[points.length - 1].y - 10}
          textAnchor="middle"
          className="fill-neutral-700 text-[11px] font-semibold">
          {formatValue(points[points.length - 1].value)}
        </text>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Donut Chart
// ---------------------------------------------------------------------------

interface DonutChartProps {
  data: DataPoint[];
  size?: number;
  thickness?: number;
  className?: string;
}

export function DonutChart({ data, size = 180, thickness = 32, className = '' }: DonutChartProps) {
  const total = data.reduce((sum, d) => sum + d.value, 0) || 1;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  let accumulated = 0;

  return (
    <div className={`flex items-center gap-6 ${className}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {data.map((d, i) => {
          const pct = d.value / total;
          const offset = circumference * (1 - pct);
          const rotation = (accumulated / total) * 360 - 90;
          accumulated += d.value;
          const color = pickColor(i, d.color);
          return (
            <circle
              key={d.label}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={thickness}
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              transform={`rotate(${rotation} ${center} ${center})`}
              className="transition-all duration-500"
            />
          );
        })}
        {/* Center label */}
        <text
          x={center}
          y={center - 6}
          textAnchor="middle"
          className="fill-neutral-800 text-lg font-bold">
          {total}
        </text>
        <text
          x={center}
          y={center + 12}
          textAnchor="middle"
          className="fill-neutral-500 text-[10px]">
          total
        </text>
      </svg>

      {/* Legend */}
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={d.label} className="flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: pickColor(i, d.color) }}
            />
            <span className="text-neutral-600">{d.label}</span>
            <span className="text-neutral-400 ml-auto">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Funnel Chart (horizontal steps)
// ---------------------------------------------------------------------------

export interface FunnelStep {
  label: string;
  value: number;
  color?: string;
}

interface FunnelChartProps {
  steps: FunnelStep[];
  className?: string;
}

export function FunnelChart({ steps, className = '' }: FunnelChartProps) {
  const maxVal = steps[0]?.value || 1;

  return (
    <div className={`space-y-3 ${className}`}>
      {steps.map((step, i) => {
        const pct = (step.value / maxVal) * 100;
        const conversionPct =
          i > 0 && steps[i - 1].value > 0
            ? ((step.value / steps[i - 1].value) * 100).toFixed(0)
            : null;
        const color = pickColor(i, step.color);

        return (
          <div key={step.label}>
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-neutral-700 font-medium">{step.label}</span>
              <div className="flex items-center gap-2">
                <span className="text-neutral-800 font-semibold">{step.value}</span>
                {conversionPct && (
                  <span className="text-neutral-400 text-[10px]">{conversionPct}%</span>
                )}
              </div>
            </div>
            <div className="w-full bg-neutral-100 rounded-full h-3">
              <div
                className="h-3 rounded-full transition-all duration-500"
                style={{ width: `${Math.max(pct, 2)}%`, backgroundColor: color }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
