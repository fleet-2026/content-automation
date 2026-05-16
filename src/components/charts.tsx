"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const tooltipStyle = {
  background: "#3d322a",
  border: "1px solid #5a4a3d",
  borderRadius: 8,
  fontSize: 12,
  color: "#f5ebe1",
};

const labelStyle = { color: "#ede0d4" };
const itemStyle = { color: "#f5ebe1" };

export function FollowerGrowthChart({
  data,
}: {
  data: { date: string; followers: number }[];
}) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#b58a5a" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#b58a5a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#d4c4b4" />
          <XAxis dataKey="date" stroke="#8b7765" fontSize={11} />
          <YAxis stroke="#8b7765" fontSize={11} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={labelStyle} itemStyle={itemStyle} />
          <Area type="monotone" dataKey="followers" stroke="#b58a5a" fill="url(#g)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BestTimeChart({ data }: { data: { hour: number; avgER: number }[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#d4c4b4" />
          <XAxis
            dataKey="hour"
            tickFormatter={(h: number) => `${h}h`}
            stroke="#8b7765"
            fontSize={11}
          />
          <YAxis stroke="#8b7765" fontSize={11} />
          <Tooltip
            contentStyle={tooltipStyle}
            labelStyle={labelStyle}
            itemStyle={itemStyle}
            formatter={(v: number) => [`${v.toFixed(2)}%`, "Engagement"]}
            labelFormatter={(h: number) => `${h}:00`}
          />
          <Bar dataKey="avgER" fill="#a8b39d" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
