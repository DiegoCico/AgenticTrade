import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { PerformancePoint, PerformanceRange } from "../../types/portfolio";
import { compactMoney, money } from "../../utils/formatters";

type PerformanceChartProps = {
  points: PerformancePoint[];
  range: PerformanceRange;
};

export function PerformanceChart({ points, range }: PerformanceChartProps) {
  return (
    <div className="chart-panel" aria-label="Portfolio performance chart">
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart data={points} key={range} margin={{ top: 14, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="portfolioGain" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.3} />
              <stop offset="92%" stopColor="var(--accent)" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 8" vertical={false} />
          <XAxis axisLine={false} dataKey="label" tick={{ fill: "var(--muted)", fontSize: 12 }} tickLine={false} />
          <YAxis
            axisLine={false}
            domain={["dataMin - 600", "dataMax + 600"]}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
            tickFormatter={(value) => compactMoney.format(Number(value))}
            tickLine={false}
            width={54}
          />
          <Tooltip
            contentStyle={{
              background: "var(--panel-strong)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              color: "var(--text)",
            }}
            cursor={{ stroke: "var(--accent)", strokeDasharray: "4 6" }}
            formatter={(value) => [money.format(Number(value)), "Portfolio"]}
            labelStyle={{ color: "var(--muted)" }}
          />
          <Area
            animationDuration={700}
            animationEasing="ease-out"
            dataKey="value"
            fill="url(#portfolioGain)"
            isAnimationActive
            stroke="var(--accent)"
            strokeWidth={3}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
