'use client';

import { useState, useMemo } from 'react';
import { getCountryName } from '@/lib/countries';
import { Globe, MapPin } from 'lucide-react';

interface CountryCount {
  country: string;
  count: number;
}

interface GeographicMapProps {
  data: CountryCount[];
  totalSessions?: number | null;
  isLoading?: boolean;
}

// Canonical Mercator/Equirectangular centroid coordinates for ISO-2 country codes
// Coordinates map to SVG viewBox 0 0 900 450
const COUNTRY_COORDINATES: Record<string, { x: number; y: number }> = {
  US: { x: 195, y: 145 },
  CA: { x: 210, y: 95 },
  MX: { x: 175, y: 185 },
  BR: { x: 315, y: 280 },
  AR: { x: 295, y: 335 },
  CL: { x: 275, y: 330 },
  CO: { x: 255, y: 230 },
  GB: { x: 435, y: 120 },
  FR: { x: 445, y: 140 },
  DE: { x: 465, y: 130 },
  NL: { x: 455, y: 125 },
  IT: { x: 468, y: 150 },
  ES: { x: 430, y: 155 },
  PL: { x: 485, y: 122 },
  UA: { x: 520, y: 125 },
  RU: { x: 620, y: 95 },
  SE: { x: 475, y: 90 },
  NO: { x: 460, y: 85 },
  FI: { x: 500, y: 80 },
  TR: { x: 515, y: 152 },
  IR: { x: 550, y: 170 },
  SA: { x: 530, y: 195 },
  AE: { x: 550, y: 192 },
  IL: { x: 518, y: 172 },
  EG: { x: 505, y: 182 },
  ZA: { x: 485, y: 315 },
  NG: { x: 450, y: 225 },
  KE: { x: 520, y: 240 },
  IN: { x: 615, y: 195 },
  PK: { x: 585, y: 182 },
  CN: { x: 680, y: 165 },
  JP: { x: 760, y: 160 },
  KR: { x: 725, y: 162 },
  TW: { x: 720, y: 195 },
  HK: { x: 700, y: 198 },
  TH: { x: 665, y: 215 },
  VN: { x: 680, y: 220 },
  ID: { x: 715, y: 260 },
  SG: { x: 685, y: 250 },
  MY: { x: 685, y: 245 },
  PH: { x: 735, y: 220 },
  AU: { x: 750, y: 315 },
  NZ: { x: 820, y: 360 },
};

export function GeographicMap({ data, totalSessions, isLoading }: GeographicMapProps) {
  const [hoveredCountry, setHoveredCountry] = useState<{
    code: string;
    name: string;
    count: number;
    percent: string;
    x: number;
    y: number;
  } | null>(null);

  // Compute total volume across all country buckets
  const totalCount = useMemo(() => {
    if (totalSessions && totalSessions > 0) return totalSessions;
    return data.reduce((acc, c) => acc + (c.count || 0), 0);
  }, [data, totalSessions]);

  const maxCount = useMemo(() => {
    return Math.max(...data.map(c => c.count || 0), 1);
  }, [data]);

  // Separate resolved countries from unknown/unresolved
  const { mappedPoints, unknownCount } = useMemo(() => {
    const points: Array<{
      code: string;
      name: string;
      count: number;
      percent: string;
      x: number;
      y: number;
      radius: number;
    }> = [];
    let unknown = 0;

    data.forEach(item => {
      const code = (item.country || '').toUpperCase().trim();
      const count = item.count || 0;
      if (count === 0) return;

      const pct = totalCount > 0 ? ((count / totalCount) * 100).toFixed(1) : '0.0';
      const name = getCountryName(code);

      if (COUNTRY_COORDINATES[code]) {
        const coord = COUNTRY_COORDINATES[code];
        // Dynamic radius from 5 to 24 px based on count proportion
        const radius = Math.max(5, Math.min(24, Math.round(5 + Math.sqrt(count / maxCount) * 19)));
        points.push({
          code,
          name,
          count,
          percent: pct,
          x: coord.x,
          y: coord.y,
          radius,
        });
      } else {
        unknown += count;
      }
    });

    return { mappedPoints: points, unknownCount: unknown };
  }, [data, totalCount, maxCount]);

  if (isLoading) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-gray-500 bg-gray-50/50 rounded-lg">
        <Globe className="w-10 h-10 text-primary-500 animate-spin mb-3" />
        <p className="text-sm font-medium text-gray-700">Loading authoritative geographic telemetry...</p>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="h-80 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 rounded-lg">
        <Globe className="w-12 h-12 text-gray-300 mb-2" />
        <p className="text-sm font-medium text-gray-600">No geographic telemetry recorded</p>
        <p className="text-xs text-gray-400 mt-1">Country centroids will appear as attacker sessions connect</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Informative Subheader */}
      <div className="flex flex-wrap items-center justify-between text-xs text-gray-500 px-1">
        <span>Country-level centroid aggregation from authoritative backend /stats telemetry</span>
        <span>{data.length} origin countries recorded</span>
      </div>

      {/* SVG Map Container */}
      <div className="relative bg-slate-950 rounded-xl p-4 overflow-hidden border border-slate-800 shadow-inner">
        <svg
          viewBox="0 0 900 450"
          className="w-full h-auto max-h-[380px] select-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Subtle World Map Latitude/Longitude Grid Lines */}
          <g stroke="#1e293b" strokeWidth="0.75" strokeDasharray="4 4">
            <line x1="0" y1="112" x2="900" y2="112" />
            <line x1="0" y1="225" x2="900" y2="225" />
            <line x1="0" y1="337" x2="900" y2="337" />
            <line x1="225" y1="0" x2="225" y2="450" />
            <line x1="450" y1="0" x2="450" y2="450" />
            <line x1="675" y1="0" x2="675" y2="450" />
          </g>

          {/* Continents Outline (Stylized Background Plate) */}
          <path
            d="M 120 70 L 290 65 L 280 120 L 320 180 L 260 210 L 280 260 L 320 380 L 260 380 L 220 220 L 150 180 L 80 130 Z"
            fill="#0f172a"
            stroke="#1e293b"
            strokeWidth="1"
            opacity="0.7"
          />
          <path
            d="M 400 80 L 520 60 L 530 110 L 460 160 L 400 130 Z"
            fill="#0f172a"
            stroke="#1e293b"
            strokeWidth="1"
            opacity="0.7"
          />
          <path
            d="M 420 170 L 540 170 L 520 330 L 460 330 L 410 220 Z"
            fill="#0f172a"
            stroke="#1e293b"
            strokeWidth="1"
            opacity="0.7"
          />
          <path
            d="M 540 70 L 820 65 L 810 180 L 700 240 L 580 230 L 540 150 Z"
            fill="#0f172a"
            stroke="#1e293b"
            strokeWidth="1"
            opacity="0.7"
          />
          <path
            d="M 700 280 L 820 280 L 800 370 L 710 360 Z"
            fill="#0f172a"
            stroke="#1e293b"
            strokeWidth="1"
            opacity="0.7"
          />

          {/* Attacker Country Centroid Bubbles */}
          {mappedPoints.map(point => {
            const isHovered = hoveredCountry?.code === point.code;
            return (
              <g
                key={point.code}
                className="cursor-pointer transition-all duration-200"
                onMouseEnter={() =>
                  setHoveredCountry({
                    code: point.code,
                    name: point.name,
                    count: point.count,
                    percent: point.percent,
                    x: point.x,
                    y: point.y,
                  })
                }
                onMouseLeave={() => setHoveredCountry(null)}
              >
                {/* Outer Glow Halo */}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.radius + 6}
                  fill="#ef4444"
                  opacity={isHovered ? 0.35 : 0.15}
                  className="animate-pulse"
                />

                {/* Primary Bubble */}
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.radius}
                  fill={isHovered ? '#f87171' : '#dc2626'}
                  stroke="#ffffff"
                  strokeWidth={isHovered ? 2 : 1}
                  opacity={0.9}
                />

                {/* Centroid Code Label */}
                <text
                  x={point.x}
                  y={point.y + 3}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize={Math.max(9, Math.min(12, point.radius * 0.9))}
                  fontFamily="monospace"
                  fontWeight="bold"
                  className="pointer-events-none select-none"
                >
                  {point.code}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Dynamic Tooltip */}
        {hoveredCountry && (
          <div
            className="absolute z-20 pointer-events-none bg-gray-900/95 text-white p-3 rounded-lg shadow-xl border border-gray-700 text-xs backdrop-blur-sm"
            style={{
              left: `${Math.min(80, Math.max(10, (hoveredCountry.x / 900) * 100))}%`,
              top: `${Math.min(75, Math.max(15, (hoveredCountry.y / 450) * 100))}%`,
              transform: 'translate(-50%, -120%)',
            }}
          >
            <div className="flex items-center gap-1.5 font-bold text-sm text-red-400">
              <MapPin className="w-3.5 h-3.5" />
              {hoveredCountry.name} ({hoveredCountry.code})
            </div>
            <div className="mt-1 space-y-0.5 text-gray-300">
              <div>
                <span className="text-gray-400">Recorded Sessions: </span>
                <span className="font-mono font-bold text-white">{hoveredCountry.count.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-gray-400">Share of Attacks: </span>
                <span className="font-mono font-bold text-white">{hoveredCountry.percent}%</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Breakdown List of Top Countries */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {data.slice(0, 8).map(c => {
          const full = getCountryName(c.country);
          const pct = totalCount > 0 ? ((c.count / totalCount) * 100).toFixed(1) : '0.0';
          return (
            <div
              key={c.country}
              className="p-3 bg-gray-50 rounded-lg border border-gray-200 flex flex-col justify-between"
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-sm text-gray-900 truncate" title={full}>
                  {full}
                </span>
                <span className="font-mono text-xs text-gray-500 font-semibold uppercase">{c.country}</span>
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <span className="text-base font-bold text-gray-900 font-mono">{c.count.toLocaleString()}</span>
                <span className="text-xs text-gray-500 font-mono">{pct}%</span>
              </div>
              <div className="w-full h-1.5 bg-gray-200 rounded-full mt-1.5 overflow-hidden">
                <div
                  className="h-full bg-red-600 rounded-full transition-all"
                  style={{ width: `${Math.min(100, Math.max(3, (c.count / maxCount) * 100))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {unknownCount > 0 && (
        <div className="text-xs text-gray-500 text-right pr-1">
          <span>Unresolved/Private IP sessions: </span>
          <span className="font-mono font-bold text-gray-700">{unknownCount.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
}
