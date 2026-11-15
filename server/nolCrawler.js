import { loadNolUpcoming, saveNolUpcoming } from "./storage.js";

const PUBLIC_UPCOMING_URL =
  "https://nol.yanolja.com/ticket/display/upcoming?genre=classic_dance";

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
 * 정적 HTML에서 텍스트 정규화
 */
function cleanText(val) {
  return stripHtml(val).replace(/\s+/g, " ").trim();
}

/**
 * 일반 사용자가 브라우저에서 보는 개별 공연 상세 정적 HTML 페이지(GET) 크롤링
 */
export async function fetchPublicProductHtml(goodsCode) {
  const url = `https://nol.yanolja.com/ticket/products/${goodsCode}`;

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      console.warn(`[NolCrawler] Failed to fetch product page ${goodsCode} (${res.status})`);
      return null;
    }

    const html = await res.text();

    // 0. 장르 검증: 정적 HTML의 <title> 태그에 '클래식'이 포함되어 있는지 엄격 검증
    const titleTagMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const titleTagText = titleTagMatch ? stripHtml(titleTagMatch[1]) : "";
    if (!titleTagText.includes("클래식")) {
      // 클래식 공연이 아니면 제외 (콘서트, 뮤지컬, 무용 등)
      return null;
    }

    // 1. 공연 제목 (Title)
    const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    const ogTitleMatch = html.match(
      /<meta\s+property=["']og:title["']\s+content=["']([^"']+)["']/i
    );
    let title = h1Match
      ? cleanText(h1Match[1])
      : ogTitleMatch
      ? cleanText(ogTitleMatch[1])
      : "";
    title = title.replace(/\s*클래식.*일정 및 예매 \| NOL.*$/i, "").trim();

    // 2. 포스터 이미지 (Poster)
    const ogImgMatch = html.match(
      /<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i
    );
    const poster = ogImgMatch ? ogImgMatch[1] : "";

    // 3. 공연 장소 (Venue)
    let venue = "";
    const venueLabelMatch = html.match(
      /id=["']venue-label["'][^>]*>장소<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i
    );
    if (venueLabelMatch) {
      venue = cleanText(venueLabelMatch[1]);
    }
    if (!venue) {
      const venueSecMatch = html.match(
        /<section[^>]*>[\s\S]*?<h2[^>]*>장소<\/h2>\s*<h3[^>]*>([\s\S]*?)<\/h3>/i
      );
      if (venueSecMatch) venue = cleanText(venueSecMatch[1]);
    }
    if (!venue) {
      const venueNoticeMatch = html.match(
        /(?:공연\s*장소|공연장소|장소)\s*:\s*([^<\n\r]+)/i
      );
      if (venueNoticeMatch) venue = cleanText(venueNoticeMatch[1]);
    }

    // 4. 공연장 주소 (Venue Address)
    let venueAddress = "";
    const venueSectionMatch = html.match(/id=["']venue["'][\s\S]*?<\/section>/i);
    if (venueSectionMatch) {
      const addrMatch = venueSectionMatch[0].match(
        /(?:<span|<p)[^>]*>([^<]*(?:특별시|광역시|특별자치시|도|시|구|군|로|길|번지)[^<]*)(?:<\/span>|<\/p>)/i
      );
      if (addrMatch) {
        const candidate = cleanText(addrMatch[1]);
        if (!candidate.includes("통신판매") && !candidate.includes("놀유니버스")) {
          venueAddress = candidate;
        }
      }
    }
    if (!venueAddress) {
      const addressMatch = html.match(
        /<section[^>]*>[\s\S]*?<h2[^>]*>장소<\/h2>[\s\S]*?(?:<p|<span)[^>]*>([^<]+(?:로|길|번지|구|동)[^<]*)(?:<\/p>|<\/span>)/i
      );
      if (addressMatch) {
        const candidate = cleanText(addressMatch[1]);
        if (!candidate.includes("통신판매") && !candidate.includes("놀유니버스")) {
          venueAddress = candidate;
        }
      }
    }

    // 5. 공연 기간 (Performance Dates)
    let from = "";
    let to = "";
    const datesMatch = html.match(
      /id=["']dates-label["'][^>]*>기간<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i
    );
    if (datesMatch) {
      const text = cleanText(datesMatch[1]);
      const parts = text.split("~").map((s) => s.trim().replace(/\./g, "-"));
      from = parts[0] || "";
      to = parts[1] || from;
    }
    if (!from) {
      const dateNoticeMatch = html.match(
        /(?:공연\s*기간|기간)\s*:\s*(\d{4}[.-]\d{2}[.-]\d{2})(?:\s*~\s*(\d{4}[.-]\d{2}[.-]\d{2}))?/i
      );
      if (dateNoticeMatch) {
        from = dateNoticeMatch[1].replace(/\./g, "-");
        to = (dateNoticeMatch[2] || from).replace(/\./g, "-");
      }
    }

    // 6. 공연 시간 및 러닝타임 (Time / Schedule / Runtime)
    let runtime = "";
    const durationMatch = html.match(
      /id=["']duration-label["'][^>]*>시간<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i
    );
    if (durationMatch) {
      runtime = cleanText(durationMatch[1]);
    }

    let showTime = "";
    const operatingTimeMatch = html.match(
      /운영\s*시간<\/h3>\s*<p[^>]*>([\s\S]*?)<\/p>/i
    );
    if (operatingTimeMatch) {
      showTime = cleanText(operatingTimeMatch[1]);
    }
    if (!showTime) {
      const scheduleNoticeMatch = html.match(
        /(?:공연\s*일시|공연일시|관람일시|(?:^|\n)\s*-\s*일시)\s*:\s*([^<\n\r]+)/i
      );
      if (scheduleNoticeMatch) {
        showTime = cleanText(scheduleNoticeMatch[1]);
      }
    }

    const scheduleDisplay = [showTime, runtime ? `(러닝타임 ${runtime})` : ""]
      .filter(Boolean)
      .join(" ");

    // 7. 티켓 가격 (Price)
    const priceParts = [];
    const priceBlockMatch = html.match(
      /<dl\b[^>]*aria-label=["']티켓\s*가격\s*정보["'][^>]*>([\s\S]*?)<\/dl>/i
    );
    if (priceBlockMatch) {
      const itemRegex =
        /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi;
      let pm;
      while ((pm = itemRegex.exec(priceBlockMatch[1])) !== null) {
        const seat = cleanText(pm[1]);
        const cost = cleanText(pm[2]).replace(/\s*원/g, "원");
        if (seat && cost) {
          priceParts.push(`${seat} ${cost}`);
        }
      }
    }
    if (priceParts.length === 0) {
      const priceNoticeMatch = html.match(
        /(?:티켓\s*가격|티켓가격|가격)\s*:\s*([^\n\r<]+)/i
      );
      if (priceNoticeMatch) {
        const pText = cleanText(priceNoticeMatch[1]);
        if (pText.includes("원") || pText.includes("무료")) {
          priceParts.push(pText);
        }
      }
    }
    const price = priceParts.length > 0 ? priceParts.join(" / ") : "오픈 시 예매처 공개";

    // 8. 관람 연령 (Age rating)
    let age = "";
    const ageMatch = html.match(
      /id=["']age-rating-label["'][^>]*>연령<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/i
    );
    if (ageMatch) {
      age = cleanText(ageMatch[1]);
    }

    // 9. 티켓 예매 오픈 일시 (Ticket Open Datetime)
    let openAt = "";
    const timeTagMatch = html.match(
      /<time\s+dateTime=["']([^"']+)["'][^>]*>([\s\S]*?)<\/time>/i
    );
    if (timeTagMatch) {
      openAt = timeTagMatch[1].replace(/\.000\+09:00$/, "+09:00").slice(0, 19);
    }
    if (!openAt) {
      const openNoticeMatch = html.match(
        /티켓\s*(?:예매\s*)?오픈\s*(?:안내)?\s*:\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일[^\d]*(\d{1,2})시(?:\s*(\d{1,2})분)?/i
      );
      if (openNoticeMatch) {
        const [, yyyy, mm, dd, hh, min] = openNoticeMatch;
        openAt = `${yyyy}-${String(mm).padStart(2, "0")}-${String(
          dd
        ).padStart(2, "0")}T${String(hh).padStart(2, "0")}:${String(
          min || 0
        ).padStart(2, "0")}:00`;
      }
    }

    // 10. 출연진 (Cast)
    let cast = "";
    const castNoticeMatch = html.match(
      /(?:\[아티스트\]|\[출연진\]|출연진|출연|아티스트)\s*[:\n]\s*([^\n\r<]+(?:\n[^\n\r<]+)?)/i
    );
    if (castNoticeMatch) {
      cast = cleanText(castNoticeMatch[1]);
    }
    if (!cast) {
      const musicianMatch = html.match(
        /((?:지휘\s*[^<\n]+|연주\s*[^<\n]+|[가-힣]{2,4}\s*\((?:피아노|바이올린|첼로|지휘|소프라노|테너)\)[^<\n]*))/i
      );
      if (musicianMatch) {
        cast = cleanText(musicianMatch[1]);
      }
    }

    const bookingUrl = `https://tickets.interpark.com/goods/${goodsCode}`;
    const nolUrl = `https://nol.yanolja.com/ticket/products/${goodsCode}`;
    const nowStr = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString();

    return {
      id: `nol-${goodsCode}`,
      source: "nol",
      goodsCode,
      title: title || `클래식 공연 (${goodsCode})`,
      venue: venue || "공연장 미정",
      venueAddress,
      from: from || "",
      to: to || from || "",
      runtime,
      schedule: scheduleDisplay || (from ? `공연일: ${from}` : ""),
      price,
      age,
      poster,
      images: poster ? [poster] : [],
      genre: "클래식",
      subGenre: "클래식",
      area:
        venueAddress.includes("서울") ||
        venue.includes("예술의전당") ||
        venue.includes("롯데콘서트홀") ||
        venue.includes("KBS홀") ||
        venue.includes("세종문화회관")
          ? "서울"
          : venueAddress.includes("경기")
          ? "경기"
          : venueAddress.includes("인천")
          ? "인천"
          : venueAddress.includes("부산")
          ? "부산"
          : venueAddress.includes("대구")
          ? "대구"
          : "서울",
      cast,
      story: `NOL 단독 오픈 클래식 공연입니다.`,
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
        openAt: openAt || null,
        typeName: "일반 예매",
        dates: openAt
          ? [
              {
                id: goodsCode,
                openAt,
                type: 1,
                typeName: "일반 예매",
                otherName: "",
              },
            ]
          : [],
        bookingUrl,
        nolUrl,
        isUpcoming: openAt ? openAt >= nowStr.slice(0, 19) : false,
      },
    };
  } catch (err) {
    console.error(`[NolCrawler] Error parsing product ${goodsCode}:`, err.message);
    return null;
  }
}

/**
 * 일반 사용자가 브라우저에서 접속하는 정적 공개 목록 페이지(GET)를 크롤링
 * (백엔드 API 호출을 전면 배제하고 정적 HTML 페이지만 사용)
 */
export async function fetchNolUpcomingClassical() {
  console.log(`[NolCrawler] 정적 공개 HTML 크롤링 시작: ${PUBLIC_UPCOMING_URL}`);

  try {
    const response = await fetch(PUBLIC_UPCOMING_URL, {
      method: "GET",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      throw new Error(`목록 페이지 요청 실패 (${response.status})`);
    }

    const html = await response.text();

    // 1. 공개 목록 페이지에서 카드의 링크(/ticket/products/{goodsCode}) 파싱
    const cardRegex =
      /<a\s+[^>]*href=["'](\/ticket\/products\/(\d+))["'][^>]*>([\s\S]*?)<\/a>/gi;
    let match;
    const goodsCodes = [];
    const seen = new Set();

    while ((match = cardRegex.exec(html)) !== null) {
      const goodsCode = match[2];
      if (!seen.has(goodsCode)) {
        seen.add(goodsCode);
        goodsCodes.push(goodsCode);
      }
    }

    console.log(
      `[NolCrawler] 공개 화면에서 티켓 상품 링크 ${goodsCodes.length}개 발견. 개별 정적 페이지 조회 시작...`
    );

    // 2. 각 공개 상품 페이지를 순차 조회하며 클래식 공연만 추출 (시간, 가격, 장소 상세 파싱)
    const classicalConcerts = [];

    for (const code of goodsCodes) {
      const concert = await fetchPublicProductHtml(code);
      if (concert) {
        classicalConcerts.push(concert);
      }
      // 일반 브라우징 간격 준수 (200ms)
      await new Promise((r) => setTimeout(r, 200));
    }

    const sortedConcerts = classicalConcerts.sort((a, b) => {
      const aOpen = a.ticketOpen?.openAt || "9999";
      const bOpen = b.ticketOpen?.openAt || "9999";
      return aOpen.localeCompare(bOpen);
    });

    console.log(
      `[NolCrawler] 정적 HTML 크롤링 완료: 순수 클래식 공연 ${sortedConcerts.length}건 확보.`
    );

    // 로컬 파일 저장 (Atomic Write)
    saveNolUpcoming({
      updatedAt: new Date().toISOString(),
      totalCount: sortedConcerts.length,
      concerts: sortedConcerts,
    });

    return sortedConcerts;
  } catch (err) {
    console.error("[NolCrawler] 정적 HTML 크롤링 실패:", err.message);
    const existing = loadNolUpcoming();
    return existing.concerts || [];
  }
}
