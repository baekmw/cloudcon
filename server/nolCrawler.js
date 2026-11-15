import { loadNolUpcoming, saveNolUpcoming } from "./storage.js";

const NOL_UPCOMING_API_URL = "https://nol.yanolja.com/ticket/display/api/upcoming";
const CLASSICAL_GENRE_CODE = "01004"; // NOL '클래식/오페라'

function stripHtml(value) {
  return String(value || "")
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

/**
 * NOL 티켓 오픈 데이터가 순수 클래식 공연인지 엄격 검증
 */
export function isNolClassicalConcert(notice) {
  if (!notice) return false;

  // 1. 장르 코드 검사 (01004 = 클래식/오페라)
  const isGenreCode = notice.goods_genre_code === CLASSICAL_GENRE_CODE;
  const isGenreName =
    notice.goods_genre_name === "클래식/오페라" ||
    (notice.goods_sub_genre_name &&
      notice.goods_sub_genre_name.includes("클래식"));

  if (!isGenreCode && !isGenreName) {
    return false;
  }

  // 2. 비클래식(뮤지컬, 무용/발레, 국악, 연극) 키워드 엄격 배제
  const title = (notice.title || "").toLowerCase();
  const subGenre = (notice.goods_sub_genre_name || "").toLowerCase();

  const excludedSubGenres = [
    "뮤지컬",
    "발레",
    "무용",
    "국악",
    "연극",
    "대중음악",
    "팬미팅",
  ];
  for (const ex of excludedSubGenres) {
    if (subGenre.includes(ex) && !subGenre.includes("클래식")) {
      return false;
    }
  }

  const excludedTitleKeywords = [
    "뮤지컬",
    "발레단",
    "국악관현악단",
    "마당놀이",
    "연극",
  ];
  for (const ex of excludedTitleKeywords) {
    if (title.includes(ex)) {
      return false;
    }
  }

  return true;
}

/**
 * NOL 단일 공지 항목을 Cloudcon 표준 공연 객체로 정규화
 */
export function mapNolNoticeToConcert(notice) {
  const goodsCode = String(notice.goods_code || notice.id || "").trim();
  const id = `nol-${goodsCode}`;

  const ticketDates = Array.isArray(notice.ticket_dates)
    ? notice.ticket_dates.map((td) => ({
        id: td.ticket_date_id,
        openAt: td.ticket_open_date,
        type: td.ticket_open_type,
        typeName: td.ticket_open_type_name || "일반 예매",
        otherName: td.ticket_other_open_name || "",
      }))
    : [];

  // 가장 가까운(또는 일반 예매) 티켓 오픈 일정 선택
  // ticketDates 중 미래의 오픈 일정이 있으면 가장 빠른 것, 없으면 첫 번째
  const nowStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();
  const sortedDates = [...ticketDates].sort((a, b) =>
    a.openAt.localeCompare(b.openAt)
  );
  const futureDates = sortedDates.filter((td) => td.openAt >= nowStr.slice(0, 19));
  const primaryTicketDate = futureDates[0] || sortedDates[0] || null;

  const bookingUrl = goodsCode
    ? `https://tickets.interpark.com/goods/${goodsCode}`
    : "https://nol.yanolja.com/ticket/display/upcoming?genre=classic_dance";

  const nolUrl = goodsCode
    ? `https://nol.yanolja.com/ticket/goods/${goodsCode}`
    : null;

  const poster =
    notice.goods_poster_image_url ||
    notice.open_notice_poster_image_url ||
    "";

  const detailImages = notice.open_notice_poster_image_url
    ? [notice.open_notice_poster_image_url]
    : [];

  const rawCast = stripHtml(notice.casting_info || "");
  const cast = rawCast.replace(/^\[아티스트\]\s*/i, "").trim();

  return {
    id,
    source: "nol",
    goodsCode,
    noticeId: notice.id,
    title: String(notice.title || "").trim(),
    venue: String(notice.venue_name || "").trim(),
    venueAddress: String(notice.venue_address || "").trim(),
    from: String(notice.goods_start_date || "").trim(),
    to: String(notice.goods_end_date || notice.goods_start_date || "").trim(),
    poster,
    images: detailImages,
    genre: "클래식",
    subGenre: notice.goods_sub_genre_name || "클래식",
    area: notice.goods_region_name || "",
    cast,
    story: stripHtml(notice.goods_introduce || notice.goods_info || ""),
    schedule: stripHtml(notice.goods_info || ""),
    price: stripHtml(notice.goods_discount || notice.goods_info || ""),
    state: "공연예정",
    openRun: false,
    visit: false,
    tickets: [
      {
        name: "인터파크 / NOL 티켓",
        url: bookingUrl,
      },
    ],
    ticketOpen: {
      openAt: primaryTicketDate ? primaryTicketDate.openAt : null,
      typeName: primaryTicketDate ? primaryTicketDate.typeName : "일반 예매",
      dates: ticketDates,
      bookingUrl,
      nolUrl,
      isUpcoming: primaryTicketDate ? primaryTicketDate.openAt >= nowStr.slice(0, 19) : false,
    },
  };
}

/**
 * NOL Upcoming Ticket Open API에서 클래식 공연 수집
 */
export async function fetchNolUpcomingClassical() {
  const allClassicalNotices = [];
  let cursor = null;
  let page = 1;
  const maxPages = 10;

  console.log("[NolCrawler] NOL 티켓오픈 클래식 공연 수집 시작...");

  while (page <= maxPages) {
    try {
      const response = await fetch(NOL_UPCOMING_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
          Referer:
            "https://nol.yanolja.com/ticket/display/upcoming?genre=classic_dance",
        },
        body: JSON.stringify({
          sort: "open",
          goods_genre_codes: [CLASSICAL_GENRE_CODE],
          cursor,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        console.warn(`[NolCrawler] HTTP error ${response.status}`);
        break;
      }

      const data = await response.json();
      const notices = Array.isArray(data.notices) ? data.notices : [];

      for (const notice of notices) {
        if (isNolClassicalConcert(notice)) {
          allClassicalNotices.push(notice);
        }
      }

      if (!data.summary?.next_cursor) {
        break;
      }
      cursor = data.summary.next_cursor;
      page += 1;
    } catch (err) {
      console.error("[NolCrawler] 수집 실패:", err.message);
      break;
    }
  }

  // 중복 제거 (goods_code 기준)
  const uniqueMap = new Map();
  for (const n of allClassicalNotices) {
    const concert = mapNolNoticeToConcert(n);
    if (!uniqueMap.has(concert.goodsCode)) {
      uniqueMap.set(concert.goodsCode, concert);
    }
  }

  const resultConcerts = [...uniqueMap.values()].sort((a, b) => {
    const aOpen = a.ticketOpen?.openAt || "9999";
    const bOpen = b.ticketOpen?.openAt || "9999";
    return aOpen.localeCompare(bOpen);
  });

  console.log(
    `[NolCrawler] 클래식 티켓오픈 공연 총 ${resultConcerts.length}건 수집 완료.`
  );

  // 로컬 파일 저장
  saveNolUpcoming({
    updatedAt: new Date().toISOString(),
    totalCount: resultConcerts.length,
    concerts: resultConcerts,
  });

  return resultConcerts;
}
