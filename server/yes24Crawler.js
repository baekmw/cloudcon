import { loadYes24Concerts, saveYes24Concerts } from "./storage.js";

const YES24_CLASSIC_URL = "https://m.ticket.yes24.com/Genre/List.aspx?genre=15459";
const YES24_AXLIST_URL = "https://m.ticket.yes24.com/Genre/Ajax/axList.aspx";

function stripHtml(val) {
  return String(val || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(Number(c)))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * YES24 버튼 텍스트에서 티켓 오픈 일시 파싱
 * 예: "11월 20일(금) 오후 2시 00분 티켓오픈" -> "2026-11-20T14:00:00"
 */
export function parseYes24OpenAt(btnText) {
  if (!btnText || !btnText.includes("티켓오픈")) return null;

  const match = btnText.match(
    /(\d{1,2})월\s*(\d{1,2})일(?:\([^)]*\))?\s*(오전|오후)?\s*(\d{1,2})시(?:\s*(\d{1,2})분)?/
  );
  if (!match) return null;

  const [, mStr, dStr, ampm, hStr, minStr] = match;
  const month = parseInt(mStr, 10);
  const day = parseInt(dStr, 10);
  let hour = parseInt(hStr, 10);
  const minute = minStr ? parseInt(minStr, 10) : 0;

  if (ampm === "오후" && hour < 12) hour += 12;
  if (ampm === "오전" && hour === 12) hour = 0;

  const now = new Date(Date.now() + 9 * 60 * 60 * 1000);
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth() + 1;

  let year = currentYear;
  if (month < currentMonth - 2) {
    year += 1;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const min = String(minute).padStart(2, "0");

  return `${year}-${mm}-${dd}T${hh}:${min}:00`;
}

/**
 * 개별 YES24 공연 상세 HTML 파싱
 */
export async function fetchYes24ProductDetail(perfId, basicInfo = {}) {
  const detailUrl = `https://m.ticket.yes24.com/Perf/Detail/PerfInfo.aspx?IdPerf=${perfId}`;

  try {
    const res = await fetch(detailUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      signal: AbortSignal.timeout(9000),
    });

    if (!res.ok) {
      console.warn(`[Yes24Crawler] Detail fetch failed for ${perfId}: ${res.status}`);
      return null;
    }

    const html = await res.text();

    // 1. Full Title
    const titleMatch = html.match(/class=["']gd_name["'][^>]*>([^<]+)<\/em>/i);
    const title = titleMatch ? stripHtml(titleMatch[1]) : basicInfo.title || "";

    // 2. Poster
    const posterMatch = html.match(
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i
    ) || html.match(/class=["']gd_img["'][\s\S]*?<img[^>]+src=["']([^"']+)["']/i);
    const poster = posterMatch ? posterMatch[1] : basicInfo.poster || "";

    // 3. Venue & Address
    const venueLinkMatch = html.match(/class=["']lnk_loca["'][^>]*>([\s\S]*?)<\/a>/i);
    let venue = venueLinkMatch ? stripHtml(venueLinkMatch[1]).replace(/>/g, "").trim() : basicInfo.venue || "";
    let venueAddress = "";

    // 4. Dates
    let from = basicInfo.from || "";
    let to = basicInfo.to || from || "";
    const dateMatch = html.match(/<dt>일시<\/dt>\s*<dd>([^<]+)<\/dd>/i);
    if (dateMatch) {
      const parts = dateMatch[1].split("~").map((s) => s.trim().replace(/\./g, "-"));
      from = parts[0] || from;
      to = parts[1] || from;
    }

    // 5. Runtime
    let runtime = "";
    const runtimeMatch = html.match(/<dt>관람시간<\/dt>\s*<dd>([^<]+)<\/dd>/i);
    if (runtimeMatch) runtime = stripHtml(runtimeMatch[1]);

    // 6. Age
    let age = "";
    const ageMatch = html.match(/<dt>관람등급<\/dt>\s*<dd>([^<]+)<\/dd>/i);
    if (ageMatch) age = stripHtml(ageMatch[1]);

    // 7. Schedule / Time
    let schedule = "";
    const timeMatch = html.match(/<dl\s+class=["']gd_time["']>\s*<dt>공연시간<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i);
    if (timeMatch) schedule = stripHtml(timeMatch[1]);

    // 8. Price
    let price = "";
    const priceMatch = html.match(/<dl\s+class=["']gd_priceDl["']>\s*<dt>티켓등급별\s*가격<\/dt>\s*<dd>([\s\S]*?)<\/dd>/i);
    if (priceMatch) {
      price = stripHtml(priceMatch[1]);
    }

    // 9. Button & Ticket Open Status
    const btnMatch = html.match(/class=["']gd_btn["'][\s\S]*?<\/div>/i);
    const btnText = btnMatch ? stripHtml(btnMatch[0]) : "";

    const openAt = parseYes24OpenAt(btnText);
    const bookingUrl = `http://ticket.yes24.com/Perf/${perfId}`;
    const mBookingUrl = `https://m.ticket.yes24.com/Perf/${perfId}`;

    const nowStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();

    let ticketOpen = null;
    if (openAt) {
      let openAtFormatted = openAt;
      try {
        const d = new Date(openAt);
        const days = ["일", "월", "화", "수", "목", "금", "토"];
        const dayName = days[d.getDay()];
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        openAtFormatted = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}(${dayName}) ${hh}:${mm}`;
      } catch {
        // fallback
      }

      ticketOpen = {
        openAt,
        openAtFormatted,
        typeName: "일반 예매",
        dates: [
          {
            id: perfId,
            openAt,
            type: 1,
            typeName: "일반 예매",
            otherName: "",
          },
        ],
        bookingUrl,
        mBookingUrl,
        source: "YES24",
        isUpcoming: openAt >= nowStr.slice(0, 19),
      };
    }

    const todayStr = nowStr.slice(0, 10);
    const state = openAt || (from && from > todayStr) ? "공연예정" : "공연중";

    // Area inference
    const area =
      venue.includes("예술의전당") ||
      venue.includes("롯데콘서트홀") ||
      venue.includes("세종문화회관") ||
      venue.includes("영산아트홀") ||
      venue.includes("금호아트홀") ||
      venue.includes("서초문화") ||
      venue.includes("소월아트홀") ||
      venue.includes("용산아트홀") ||
      venue.includes("서울")
        ? "서울"
        : venue.includes("경기") ||
          venue.includes("안산") ||
          venue.includes("평택") ||
          venue.includes("성남") ||
          venue.includes("고양")
        ? "경기"
        : venue.includes("부산") || venue.includes("낙동아트센터") || venue.includes("금정문화회관")
        ? "부산"
        : venue.includes("광주") || venue.includes("전남")
        ? "광주"
        : venue.includes("대구")
        ? "대구"
        : venue.includes("김해") || venue.includes("창원") || venue.includes("경남")
        ? "경남"
        : "서울";

    return {
      id: `yes24-${perfId}`,
      source: "yes24",
      yes24Id: String(perfId),
      title: title || `YES24 클래식 공연 (${perfId})`,
      venue: venue || "공연장 미정",
      venueAddress,
      from: from || "",
      to: to || from || "",
      runtime,
      schedule: schedule || (from ? `공연일: ${from}` : ""),
      price,
      age,
      poster,
      images: poster ? [poster] : [],
      genre: "클래식",
      subGenre: "클래식",
      area,
      cast: "",
      story: "",
      state,
      openRun: false,
      visit: false,
      tickets: [
        {
          name: "YES24 티켓",
          url: bookingUrl,
        },
      ],
      ticketOpen,
    };
  } catch (err) {
    console.error(`[Yes24Crawler] Error fetching detail ${perfId}:`, err.message);
    return null;
  }
}

/**
 * YES24 모바일 클래식 장르(15459) 정적 HTML 목록 및 개별 공연 정보 수집
 */
export async function fetchYes24Classical() {
  console.log(`[Yes24Crawler] YES24 클래식 공연 수집 시작: ${YES24_CLASSIC_URL}`);

  try {
    const res = await fetch(YES24_AXLIST_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "*/*",
      },
      body: "genre=15459&page=1&size=300&order=0",
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`YES24 목록 요청 실패 (${res.status})`);
    }

    const html = await res.text();
    const lis = html.match(/<li[\s\S]*?<\/li>/gi) || [];
    console.log(`[Yes24Crawler] YES24 목록에서 공연 항목 ${lis.length}건 발견.`);

    const basicItems = [];
    for (const li of lis) {
      const idMatch =
        li.match(/GoToPerfDetail\(['"]?(\d+)['"]?\)/i) ||
        li.match(/IdPerf=(\d+)/i);
      if (!idMatch) continue;

      const id = idMatch[1];
      const titleMatch = li.match(/class=["']goods_name["'][^>]*>([^<]+)<\/p>/i);
      const dateMatch = li.match(/class=["']yes_m["'][^>]*>([^<]+)<\/em>/i);
      const venueMatch = li.match(/class=["']goods_loca["'][^>]*>([\s\S]*?)<\/div>/i);
      const imgMatch = li.match(/<img[^>]+src=["']([^"']+)["']/i);

      const title = titleMatch ? stripHtml(titleMatch[1]) : "";
      const dateStr = dateMatch ? stripHtml(dateMatch[1]) : "";
      const venue = venueMatch ? stripHtml(venueMatch[1]) : "";
      const poster = imgMatch ? imgMatch[1] : "";

      let from = "";
      let to = "";
      if (dateStr) {
        const parts = dateStr.split("~").map((s) => s.trim().replace(/\./g, "-"));
        from = parts[0] || "";
        to = parts[1] || from;
      }

      basicItems.push({ id, title, from, to, venue, poster });
    }

    console.log(
      `[Yes24Crawler] ${basicItems.length}건의 공연 세부 정보 및 티켓 오픈 일정 수집 시작 (동시성 8)...`
    );

    const detailedConcerts = [];
    const concurrency = 8;

    for (let i = 0; i < basicItems.length; i += concurrency) {
      const batch = basicItems.slice(i, i + concurrency);
      const results = await Promise.all(
        batch.map((item) => fetchYes24ProductDetail(item.id, item))
      );

      for (const concert of results) {
        if (concert) {
          detailedConcerts.push(concert);
        }
      }

      // 서버 부하 방지용 짧은 간격 (80ms)
      await new Promise((r) => setTimeout(r, 80));
    }

    // 티켓 오픈 예정 공연 우선, 그 다음 공연일 순 정렬
    const sortedConcerts = detailedConcerts.sort((a, b) => {
      const aOpen = a.ticketOpen?.openAt || "9999";
      const bOpen = b.ticketOpen?.openAt || "9999";
      if (aOpen !== bOpen) return aOpen.localeCompare(bOpen);
      return (a.from || "9999").localeCompare(b.from || "9999");
    });

    const openCount = sortedConcerts.filter((c) => c.ticketOpen?.openAt).length;
    console.log(
      `[Yes24Crawler] YES24 수집 완료: 총 ${sortedConcerts.length}건 (티켓 오픈 예정 ${openCount}건).`
    );

    // 로컬 파일 저장 (Atomic Write)
    saveYes24Concerts({
      updatedAt: new Date().toISOString(),
      totalCount: sortedConcerts.length,
      concerts: sortedConcerts,
    });

    return sortedConcerts;
  } catch (err) {
    console.error("[Yes24Crawler] 크롤링 실패:", err.message);
    const existing = loadYes24Concerts();
    return existing.concerts || [];
  }
}
