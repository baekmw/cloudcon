import { useMemo, useState } from 'react'
import { MapPin, Building2, RotateCcw, Compass } from 'lucide-react'
import { KOREA_MAP_PROVINCES } from '../lib/koreaMapPaths.js'

export const KOREA_REGIONS = KOREA_MAP_PROVINCES

// UI 버튼 표시 순서 (수도권 -> 강원/충청 -> 호남 -> 영남 -> 제주)
const DISPLAY_ORDER_IDS = [
  '서울',
  '경기',
  '인천',
  '강원',
  '대전',
  '세종',
  '충남',
  '충북',
  '광주',
  '전북',
  '전남',
  '부산',
  '대구',
  '울산',
  '경북',
  '경남',
  '제주',
]

export function matchConcertRegion(concertArea, regionId) {
  if (!regionId || regionId === 'all') return true
  const region = KOREA_REGIONS.find((r) => r.id === regionId)
  if (!region) return concertArea === regionId
  const clean = String(concertArea || '').trim()
  return region.names.some((n) => clean === n || clean.startsWith(n))
}

export function findRegionIdByArea(concertArea) {
  const clean = String(concertArea || '').trim()
  if (!clean) return null
  for (const r of KOREA_REGIONS) {
    if (r.names.some((n) => clean === n || clean.startsWith(n))) {
      return r.id
    }
  }
  return null
}

export default function MapExplorer({
  concerts = [],
  selectedRegion = 'all',
  selectedVenue = '',
  onSelectRegion,
  onSelectVenue,
}) {
  const [hoveredRegion, setHoveredRegion] = useState(null)

  const orderedRegions = useMemo(() => {
    const byId = new Map(KOREA_REGIONS.map((r) => [r.id, r]))
    return DISPLAY_ORDER_IDS.map((id) => byId.get(id)).filter(Boolean)
  }, [])

  // 지역별 공연 수 집계
  const regionCounts = useMemo(() => {
    const counts = {}
    for (const r of KOREA_REGIONS) {
      counts[r.id] = 0
    }
    for (const c of concerts) {
      const rid = findRegionIdByArea(c.area)
      if (rid && counts[rid] !== undefined) {
        counts[rid] += 1
      }
    }
    return counts
  }, [concerts])

  // 선택된 지역 내 주요 공연장(venue) 상위 목록 집계
  const topVenues = useMemo(() => {
    const venueMap = new Map()
    for (const c of concerts) {
      if (!matchConcertRegion(c.area, selectedRegion)) continue
      const v = String(c.venue || '').trim()
      if (!v) continue
      const shortVenue = v.replace(/\s*\([^)]*\)\s*$/, '').trim() || v
      venueMap.set(shortVenue, (venueMap.get(shortVenue) || 0) + 1)
    }
    return [...venueMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
  }, [concerts, selectedRegion])

  const activeRegionObj = useMemo(
    () => KOREA_REGIONS.find((r) => r.id === selectedRegion),
    [selectedRegion]
  )

  function getPolygonFill(regionId) {
    const isSelected = selectedRegion === regionId
    const isHovered = hoveredRegion === regionId
    const count = regionCounts[regionId] || 0

    if (isSelected) return '#3182f6'
    if (isHovered) return '#8cc0ff'
    if (count >= 100) return '#bddaff'
    if (count >= 30) return '#d6e9ff'
    if (count >= 10) return '#e6f2ff'
    if (count > 0) return '#f2f7ff'
    return '#eef1f5'
  }

  return (
    <div className="w-full rounded-3xl bg-white border border-[#e5e8eb] shadow-[0_2px_12px_rgba(0,0,0,0.03)] p-4 sm:p-6 animate-fade-up">
      {/* 상단 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#f2f4f6]">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-[#e8f3ff] text-[#3182f6] flex items-center justify-center shrink-0">
            <Compass className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] sm:text-[17px] font-extrabold text-[#191f28] flex flex-wrap items-center gap-2 break-keep">
              <span className="whitespace-nowrap">대한민국 전국 클래식 공연 지도</span>
              {selectedRegion !== 'all' && (
                <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full bg-[#3182f6] text-white whitespace-nowrap shrink-0">
                  {activeRegionObj?.names[0] || selectedRegion}
                </span>
              )}
            </h3>
            <p className="text-[12px] text-[#8b95a1] break-keep">
              지도 위의 지역을 클릭하거나 우측에서 지역·공연장을 선택해 보세요
            </p>
          </div>
        </div>

        {selectedRegion !== 'all' && (
          <button
            type="button"
            onClick={() => {
              onSelectRegion('all')
              onSelectVenue('')
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-[#f2f4f6] text-[#4e5968] hover:text-[#191f28] hover:bg-[#e5e8eb] whitespace-nowrap shrink-0 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            전국 전체 보기
          </button>
        )}
      </div>

      {/* 본문: 좌측 정밀 대한민국 지도 SVG + 우측 시도/공연장 탐색 패널 */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* 좌측: 정밀 행정구역 폴리곤 지도 */}
        <div className="md:col-span-7 relative rounded-2xl bg-gradient-to-b from-[#f8fbff] to-[#f1f6fc] border border-[#e5edf7] p-3 sm:p-4 flex flex-col items-center justify-center overflow-hidden">
          <svg
            viewBox="30 5 415 500"
            className="w-full max-w-[400px] h-auto select-none drop-shadow-[0_6px_16px_rgba(25,31,40,0.06)]"
            role="img"
            aria-label="대한민국 17개 시도별 클래식 공연 지도"
          >
            {/* 제주도 구분 안내선 */}
            <path
              d="M 88 430 L 195 430 L 195 495 L 88 495 Z"
              fill="none"
              stroke="#d5e0ee"
              strokeWidth="1"
              strokeDasharray="4 4"
              rx="10"
            />

            {/* 17개 시도 정밀 폴리곤 (빈틈없이 맞물리는 TopoJSON 기반 경계) */}
            {KOREA_REGIONS.map((region) => {
              const isSelected = selectedRegion === region.id
              return (
                <path
                  key={`poly-${region.id}`}
                  d={region.path}
                  fillRule="evenodd"
                  fill={getPolygonFill(region.id)}
                  stroke={isSelected ? '#1b64da' : '#ffffff'}
                  strokeWidth={isSelected ? '1.8' : '1.1'}
                  strokeLinejoin="round"
                  onMouseEnter={() => setHoveredRegion(region.id)}
                  onMouseLeave={() => setHoveredRegion(null)}
                  onClick={() => {
                    const next = selectedRegion === region.id ? 'all' : region.id
                    onSelectRegion(next)
                    onSelectVenue('')
                  }}
                  className="transition-colors duration-150 cursor-pointer"
                />
              )
            })}

            {/* 외곽선 강조를 위한 얇은 오버레이 테두리 */}
            {KOREA_REGIONS.map((region) => {
              const isSelected = selectedRegion === region.id
              const isHovered = hoveredRegion === region.id
              if (!isSelected && !isHovered) {
                return (
                  <path
                    key={`outline-${region.id}`}
                    d={region.path}
                    fillRule="evenodd"
                    fill="none"
                    stroke="#94b2d8"
                    strokeWidth="0.65"
                    strokeLinejoin="round"
                     className="pointer-events-none"
                  />
                )
              }
              return null
            })}

            {/* 각 시도 위치 위 인터랙티브 마커 배지 */}
            {KOREA_REGIONS.map((region) => {
              const count = regionCounts[region.id] || 0
              const isSelected = selectedRegion === region.id
              const isHovered = hoveredRegion === region.id
              const bx = region.pinX + (region.labelOffset?.dx || 0)
              const by = region.pinY + (region.labelOffset?.dy || 0)
              const labelText = `${region.short} ${count}`
              const pillWidth = Math.max(44, labelText.length * 7.2 + 13)

              return (
                <g
                  key={`pin-${region.id}`}
                  onMouseEnter={() => setHoveredRegion(region.id)}
                  onMouseLeave={() => setHoveredRegion(null)}
                  onClick={() => {
                    const next = selectedRegion === region.id ? 'all' : region.id
                    onSelectRegion(next)
                    onSelectVenue('')
                  }}
                  className="cursor-pointer"
                >
                  {(region.labelOffset?.dx || region.labelOffset?.dy) ? (
                    <line
                      x1={region.pinX}
                      y1={region.pinY}
                      x2={bx}
                      y2={by}
                      stroke={isSelected ? '#191f28' : '#7b95b8'}
                      strokeWidth="1.1"
                    />
                  ) : null}

                  <circle
                    cx={region.pinX}
                    cy={region.pinY}
                    r={isSelected ? 3 : 2.2}
                    fill={isSelected ? '#191f28' : '#3182f6'}
                  />

                  <rect
                    x={bx - pillWidth / 2}
                    y={by - 10.5}
                    width={pillWidth}
                    height={21}
                    rx={10.5}
                    fill={
                      isSelected
                        ? '#191f28'
                        : isHovered
                        ? '#3182f6'
                        : count > 0
                        ? '#ffffff'
                        : '#f4f6f8'
                    }
                    stroke={
                      isSelected
                        ? '#191f28'
                        : isHovered
                        ? '#3182f6'
                        : count > 0
                        ? '#3182f6'
                        : '#d1d6db'
                    }
                    strokeWidth={isSelected || isHovered ? '1.6' : '1.1'}
                  />

                  <text
                    x={bx}
                    y={by + 3.5}
                    textAnchor="middle"
                    className={`text-[10px] font-bold tabular-nums ${
                      isSelected || isHovered
                        ? 'fill-white'
                        : count > 0
                        ? 'fill-[#191f28]'
                        : 'fill-[#8b95a1]'
                    }`}
                  >
                    {region.short}{' '}
                    <tspan
                      className={
                        isSelected || isHovered
                          ? 'fill-[#90c2ff]'
                          : count > 0
                          ? 'fill-[#3182f6]'
                          : 'fill-[#b0b8c1]'
                      }
                    >
                      {count}
                    </tspan>
                  </text>
                </g>
              )
            })}
          </svg>
        </div>

        {/* 우측: 지역 선택 그리드 & 주요 공연장 필터 */}
        <div className="md:col-span-5 flex flex-col justify-between self-stretch space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[13px] font-bold text-[#191f28] flex items-center gap-1.5 whitespace-nowrap">
                <MapPin className="h-4 w-4 text-[#3182f6] shrink-0" />
                지역 선택
              </span>
              <span className="text-[12px] text-[#8b95a1] whitespace-nowrap shrink-0">
                전체 {concerts.length}건
              </span>
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => {
                  onSelectRegion('all')
                  onSelectVenue('')
                }}
                className={`px-2.5 py-2 rounded-xl text-[12px] font-bold flex items-center justify-between gap-1 whitespace-nowrap transition-all cursor-pointer border ${
                  selectedRegion === 'all'
                    ? 'bg-[#3182f6] text-white border-[#3182f6] shadow-xs'
                    : 'bg-[#f9fafb] text-[#4e5968] border-[#e5e8eb] hover:border-[#3182f6]/50 hover:text-[#191f28]'
                }`}
              >
                <span className="whitespace-nowrap">전국</span>
                <span
                  className={`text-[11px] tabular-nums whitespace-nowrap ${
                    selectedRegion === 'all' ? 'text-white/90' : 'text-[#8b95a1]'
                  }`}
                >
                  {concerts.length}
                </span>
              </button>

              {orderedRegions.map((region) => {
                const count = regionCounts[region.id] || 0
                const active = selectedRegion === region.id
                return (
                  <button
                    key={region.id}
                    type="button"
                    onClick={() => {
                      const next = active ? 'all' : region.id
                      onSelectRegion(next)
                      onSelectVenue('')
                    }}
                    className={`px-2.5 py-2 rounded-xl text-[12px] font-semibold flex items-center justify-between gap-1 whitespace-nowrap transition-all cursor-pointer border ${
                      active
                        ? 'bg-[#3182f6] text-white border-[#3182f6] shadow-xs'
                        : count > 0
                        ? 'bg-white text-[#191f28] border-[#e5e8eb] hover:border-[#3182f6]/60'
                        : 'bg-[#f9fafb] text-[#b0b8c1] border-transparent hover:bg-[#f2f4f6]'
                    }`}
                  >
                    <span className="whitespace-nowrap">{region.short}</span>
                    <span
                      className={`text-[11px] font-bold tabular-nums whitespace-nowrap ${
                        active
                          ? 'text-white'
                          : count > 0
                          ? 'text-[#3182f6]'
                          : 'text-[#b0b8c1]'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* 해당 지역의 대표 공연장 빠른 필터 */}
          <div className="rounded-2xl bg-[#f9fafb] border border-[#f2f4f6] p-3.5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[12px] font-bold text-[#4e5968] flex items-center gap-1.5 whitespace-nowrap">
                <Building2 className="h-3.5 w-3.5 text-[#3182f6] shrink-0" />
                {selectedRegion === 'all'
                  ? '전국 주요 공연장'
                  : `${activeRegionObj?.short || selectedRegion} 주요 공연장`}
              </span>
              {selectedVenue && (
                <button
                  type="button"
                  onClick={() => onSelectVenue('')}
                  className="text-[11px] font-semibold text-[#3182f6] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  필터 해제
                </button>
              )}
            </div>

            {topVenues.length === 0 ? (
              <p className="text-[12px] text-[#8b95a1] py-2">
                해당 지역에 등록된 공연장이 없습니다.
              </p>
            ) : (
              <div className="flex flex-wrap gap-1.5 max-h-[150px] overflow-y-auto pr-1">
                {topVenues.map(([venueName, vCount]) => {
                  const isVenueSelected = selectedVenue === venueName
                  return (
                    <button
                      key={venueName}
                      type="button"
                      onClick={() =>
                        onSelectVenue(isVenueSelected ? '' : venueName)
                      }
                      className={`px-2.5 py-1 rounded-lg text-[11.5px] font-medium whitespace-nowrap transition-all cursor-pointer border ${
                        isVenueSelected
                          ? 'bg-[#191f28] text-white border-[#191f28]'
                          : 'bg-white text-[#4e5968] border-[#e5e8eb] hover:border-[#3182f6] hover:text-[#191f28]'
                      }`}
                    >
                      {venueName}{' '}
                      <span
                        className={
                          isVenueSelected ? 'text-[#90c2ff]' : 'text-[#8b95a1]'
                        }
                      >
                        {vCount}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
