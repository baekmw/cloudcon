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

    if (isSelected) return '#2b2b2b'
    if (isHovered) return '#7a7a7a'
    if (count >= 100) return '#b3b3b3'
    if (count >= 30) return '#c8c8c8'
    if (count >= 10) return '#dcdcdc'
    if (count > 0) return '#ededed'
    return '#f7f7f7'
  }

  return (
    <div className="w-full rounded-3xl bg-[var(--theme-white)] border border-[var(--theme-light)] shadow-[0_2px_12px_rgba(43,43,43,0.03)] p-4 sm:p-6 animate-fade-up">
      {/* 상단 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--theme-light)]/60">
        <div className="flex items-start sm:items-center gap-2.5 min-w-0">
          <div className="h-9 w-9 rounded-xl bg-[var(--theme-dark)] text-[var(--theme-white)] flex items-center justify-center shrink-0">
            <Compass className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] sm:text-[17px] font-extrabold text-[var(--theme-dark)] flex flex-wrap items-center gap-2 break-keep">
              <span className="whitespace-nowrap">대한민국 전국 클래식 공연 지도</span>
              {selectedRegion !== 'all' && (
                <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-full bg-[var(--theme-dark)] text-[var(--theme-white)] whitespace-nowrap shrink-0">
                  {activeRegionObj?.names[0] || selectedRegion}
                </span>
              )}
            </h3>
            <p className="text-[12px] text-[var(--theme-mid)] break-keep">
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
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--theme-dark)] hover:bg-[var(--theme-light)]/60 whitespace-nowrap shrink-0 transition-colors self-start sm:self-auto cursor-pointer"
          >
            <RotateCcw className="h-3.5 w-3.5 shrink-0" />
            전국 전체 보기
          </button>
        )}
      </div>

      {/* 본문: 좌측 정밀 대한민국 지도 SVG + 우측 시도/공연장 탐색 패널 */}
      <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* 좌측: 정밀 행정구역 폴리곤 지도 */}
        <div className="md:col-span-7 relative rounded-2xl bg-[var(--bg-subtle)] border border-[var(--theme-light)] p-3 sm:p-4 flex flex-col items-center justify-center overflow-hidden">
          <svg
            viewBox="30 5 415 500"
            className="w-full max-w-[400px] h-auto select-none drop-shadow-[0_6px_16px_rgba(43,43,43,0.06)]"
            role="img"
            aria-label="대한민국 17개 시도별 클래식 공연 지도"
          >
            {/* 제주도 구분 안내선 */}
            <path
              d="M 88 430 L 195 430 L 195 495 L 88 495 Z"
              fill="none"
              stroke="#b3b3b3"
              strokeWidth="1"
              strokeDasharray="4 4"
              rx="10"
            />

            {/* 17개 시도 정밀 폴리곤 */}
            {KOREA_REGIONS.map((region) => {
              const isSelected = selectedRegion === region.id
              return (
                <path
                  key={`poly-${region.id}`}
                  d={region.path}
                  fillRule="evenodd"
                  fill={getPolygonFill(region.id)}
                  stroke={isSelected ? '#2b2b2b' : '#ffffff'}
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
                    stroke="#b3b3b3"
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
                      stroke={isSelected ? '#2b2b2b' : '#b3b3b3'}
                      strokeWidth="1.1"
                    />
                  ) : null}

                  <circle
                    cx={region.pinX}
                    cy={region.pinY}
                    r={isSelected ? 3 : 2.2}
                    fill="#2b2b2b"
                  />

                  <rect
                    x={bx - pillWidth / 2}
                    y={by - 10.5}
                    width={pillWidth}
                    height={21}
                    rx={10.5}
                    fill={
                      isSelected || isHovered
                        ? '#2b2b2b'
                        : count > 0
                        ? '#ffffff'
                        : '#f5f5f5'
                    }
                    stroke={
                      isSelected || isHovered
                        ? '#2b2b2b'
                        : count > 0
                        ? '#2b2b2b'
                        : '#d4d4d4'
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
                        ? 'fill-[#2b2b2b]'
                        : 'fill-[#b3b3b3]'
                    }`}
                  >
                    {region.short}{' '}
                    <tspan
                      className={
                        isSelected || isHovered
                          ? 'fill-[#d4d4d4]'
                          : count > 0
                          ? 'fill-[#2b2b2b]'
                          : 'fill-[#b3b3b3]'
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
              <span className="text-[13px] font-bold text-[var(--theme-dark)] flex items-center gap-1.5 whitespace-nowrap">
                <MapPin className="h-4 w-4 text-[var(--theme-dark)] shrink-0" />
                지역 선택
              </span>
              <span className="text-[12px] text-[var(--theme-mid)] whitespace-nowrap shrink-0">
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
                    ? 'bg-[var(--theme-dark)] text-[var(--theme-white)] border-[var(--theme-dark)] shadow-xs'
                    : 'bg-[var(--bg-subtle)] text-[var(--text-secondary)] border-[var(--theme-light)] hover:border-[var(--theme-dark)] hover:text-[var(--theme-dark)]'
                }`}
              >
                <span className="whitespace-nowrap">전국</span>
                <span
                  className={`text-[11px] tabular-nums whitespace-nowrap ${
                    selectedRegion === 'all' ? 'text-[var(--theme-light)]' : 'text-[var(--theme-mid)]'
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
                        ? 'bg-[var(--theme-dark)] text-[var(--theme-white)] border-[var(--theme-dark)] shadow-xs'
                        : count > 0
                        ? 'bg-[var(--theme-white)] text-[var(--theme-dark)] border-[var(--theme-light)] hover:border-[var(--theme-dark)]'
                        : 'bg-[var(--bg-subtle)] text-[var(--theme-mid)] border-transparent hover:bg-[var(--theme-light)]/40'
                    }`}
                  >
                    <span className="whitespace-nowrap">{region.short}</span>
                    <span
                      className={`text-[11px] font-bold tabular-nums whitespace-nowrap ${
                        active
                          ? 'text-[var(--theme-light)]'
                          : count > 0
                          ? 'text-[var(--theme-dark)]'
                          : 'text-[var(--theme-mid)]'
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
          <div className="rounded-2xl bg-[var(--bg-subtle)] border border-[var(--theme-light)]/75 p-3.5">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-[12px] font-bold text-[var(--theme-dark)] flex items-center gap-1.5 whitespace-nowrap">
                <Building2 className="h-3.5 w-3.5 text-[var(--theme-dark)] shrink-0" />
                {selectedRegion === 'all'
                  ? '전국 주요 공연장'
                  : `${activeRegionObj?.short || selectedRegion} 주요 공연장`}
              </span>
              {selectedVenue && (
                <button
                  type="button"
                  onClick={() => onSelectVenue('')}
                  className="text-[11px] font-semibold text-[var(--theme-dark)] hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  필터 해제
                </button>
              )}
            </div>

            {topVenues.length === 0 ? (
              <p className="text-[12px] text-[var(--theme-mid)] py-2">
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
                          ? 'bg-[var(--theme-dark)] text-[var(--theme-white)] border-[var(--theme-dark)]'
                          : 'bg-[var(--theme-white)] text-[var(--text-secondary)] border-[var(--theme-light)] hover:border-[var(--theme-dark)] hover:text-[var(--theme-dark)]'
                      }`}
                    >
                      {venueName}{' '}
                      <span
                        className={
                          isVenueSelected ? 'text-[var(--theme-light)]' : 'text-[var(--theme-mid)]'
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
