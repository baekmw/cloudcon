/**
 * Fast & Lightweight Classical Concert Matcher
 * DB 전체 검색: 제목, 프로그램(AI가 생성한 searchingWord, 작곡가, 곡명, 악장 포함), 출연진, 상세소개, 공연장 단순 포함 여부 검사
 * 클래식 대표 약어(베9, 라피협2 등) 지원
 */

const CLASSICAL_ABBREVIATIONS = {
  베9: ["베9", "베토벤교향곡9", "베토벤교향곡제9", "베토벤9", "베토벤합창"],
  베5: ["베5", "베토벤교향곡5", "베토벤교향곡제5", "운명교향곡"],
  베3: ["베3", "베토벤교향곡3", "영웅교향곡"],
  베7: ["베7", "베토벤교향곡7"],
  라피협2: ["라피협2", "라흐마니노프피아노협주곡2", "라흐마니노프피아노협주곡제2"],
  라피협3: ["라피협3", "라흐마니노프피아노협주곡3"],
  차피협1: ["차피협1", "차이콥스키피아노협주곡1", "차이코프스키피아노협주곡1"],
  차피협: ["차피협", "차이콥스키피아노협주곡", "차이코프스키피아노협주곡"],
  차바협: ["차바협", "차이콥스키바이올린협주곡", "차이코프스키바이올린협주곡"],
  멘바협: ["멘바협", "멘델스존바이올린협주곡"],
  브바협: ["브바협", "브람스바이올린협주곡"],
  시바협: ["시바협", "시벨리우스바이올린협주곡"],
  황제: ["황제", "피아노협주곡5번"],
  사계: ["사계", "비발디사계"],
  신세계: ["신세계", "신세계로부터"],
};

export function matchConcertClassical(concert, query, programs = []) {
  if (!query || !query.trim()) return { matched: true, score: 0 };

  const qClean = query.trim().toLowerCase().replace(/\s+/g, "");

  // 확장 키워드 후보 (약어 사전 포함)
  const queryCandidates = CLASSICAL_ABBREVIATIONS[qClean] || [qClean];

  const titleClean = (concert.title || "").toLowerCase().replace(/\s+/g, "");
  const castClean = (concert.cast || "").toLowerCase().replace(/\s+/g, "");
  const venueClean = (concert.venue || "").toLowerCase().replace(/\s+/g, "");
  const areaClean = (concert.area || "").toLowerCase().replace(/\s+/g, "");
  const storyClean = (concert.story || "").toLowerCase().replace(/\s+/g, "");

  const targetPrograms = (Array.isArray(programs) && programs.length > 0)
    ? programs
    : (Array.isArray(concert.programs) ? concert.programs : []);

  for (const needle of queryCandidates) {
    // 1. 공연명 매칭
    if (titleClean.includes(needle)) {
      return { matched: true, score: 100, reason: "공연 제목에서 찾음" };
    }

    // 2. 진행 프로그램 매칭 (AI searchingWord, 작곡가, 곡명, 작품번호, 악장)
    for (const p of targetPrograms) {
      const progText = [
        p.composer,
        p.composerKo,
        p.composerShort,
        p.title,
        p.titleKo,
        p.genre,
        p.searchingWord,
        ...(p.movements || []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .replace(/\s+/g, "");

      if (progText.includes(needle)) {
        return {
          matched: true,
          score: 95,
          reason: "연주 프로그램에서 찾음",
          matchedProgram: p,
        };
      }
    }

    // 3. 출연진 매칭
    if (castClean.includes(needle)) {
      return { matched: true, score: 85, reason: "출연진에서 찾음" };
    }

    // 4. 상세소개 매칭
    if (storyClean && storyClean.includes(needle)) {
      return { matched: true, score: 75, reason: "공연 소개글에서 찾음" };
    }

    // 5. 공연장 및 지역 매칭
    if (venueClean.includes(needle) || areaClean.includes(needle)) {
      return { matched: true, score: 70, reason: "공연장 위치에서 찾음" };
    }
  }

  // 특수 매칭: 베토벤 9번 등 복합어 대응 (공연명에 '베토벤'과 '9' 또는 '합창'이 함께 있는 경우)
  if (qClean === "베9") {
    if (titleClean.includes("베토벤") && (titleClean.includes("9") || titleClean.includes("합창"))) {
      return { matched: true, score: 98, reason: "공연 제목에서 찾음" };
    }
  }

  // 특수 매칭: 라피협 / 라피협2
  if (qClean.startsWith("라피협")) {
    const isRachPiano = (titleClean.includes("라흐마니노프") && titleClean.includes("피아노협주곡")) ||
      (titleClean.includes("라흐마니노프") && titleClean.includes("피아노") && titleClean.includes("협주곡"));
    if (isRachPiano) {
      return { matched: true, score: 98, reason: "공연 제목에서 찾음" };
    }
  }

  // 특수 매칭: 차피협 / 차피협1
  if (qClean.startsWith("차피협")) {
    const isTchaikPiano = (titleClean.includes("차이") && titleClean.includes("피아노협주곡")) ||
      (titleClean.includes("차이") && titleClean.includes("피아노") && titleClean.includes("협주곡"));
    if (isTchaikPiano) {
      return { matched: true, score: 98, reason: "공연 제목에서 찾음" };
    }
  }

  return { matched: false, score: 0, reason: null };
}
