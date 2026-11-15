import "dotenv/config";
import {
  loadSubscribers,
  saveSubscribers,
  loadYes24Concerts,
  saveYes24Concerts,
} from "../server/storage.js";
import {
  sendConcertAlertEmail,
  canSendBatchEmail,
} from "../server/emailService.js";
import { doesConcertMatchKeyword } from "../server/batchCron.js";

async function main() {
  console.log("=== [1] 사용자 알림 키워드 확인 ===");
  const subscribers = loadSubscribers();
  const email = "bmw06004@gmail.com";
  const sub = subscribers[email];

  if (!sub) {
    console.error(`오류: ${email} 구독자를 찾을 수 없습니다.`);
    process.exit(1);
  }

  console.log(`구독자: ${email}`);
  console.log(`등록된 키워드:`, sub.keywords);
  console.log(`인증 여부:`, sub.verified);

  const testKeyword = sub.keywords.includes("라흐마니노프")
    ? "라흐마니노프"
    : sub.keywords[0];

  console.log(`\n=== [2] 가짜 테스트용 공연 데이터 생성 (매칭 키워드: '${testKeyword}') ===`);
  const fakeConcertId = `test-fake-${Date.now()}`;
  const fakeConcert = {
    id: fakeConcertId,
    source: "yes24",
    yes24Id: "99999",
    title: `[테스트 알림] ${testKeyword} 특별 초청 연주회`,
    venue: "예술의전당 콘서트홀",
    venueAddress: "서울특별시 서초구 남부순환로 2406",
    from: "2026-12-25",
    to: "2026-12-25",
    runtime: "총 100분 (인터미션 15분 포함)",
    schedule: "2026년 12월 25일(금) 오후 7시 30분",
    price: "R석 120,000원 / S석 90,000원 / A석 60,000원",
    age: "초등학생 이상 관람가",
    poster: "https://tkfile.yes24.com/upload2/PerfBlog/202611/20261112/20261112-61126.jpg",
    images: ["https://tkfile.yes24.com/upload2/PerfBlog/202611/20261112/20261112-61126.jpg"],
    genre: "클래식",
    subGenre: "클래식",
    area: "서울",
    cast: "피아노 임윤찬, 지휘 마르쿠스 슈텐츠, 연주 서울시립교향악단",
    story: "클라우드콘 알림 기능 검증을 위한 테스트 공연 안내입니다.",
    state: "공연예정",
    openRun: false,
    visit: false,
    tickets: [
      { name: "YES24 티켓", url: "http://ticket.yes24.com/Perf/61126" }
    ],
    programs: [
      {
        composer: "Sergei Rachmaninoff",
        composerKo: "라흐마니노프",
        composerShort: "라흐마니노프",
        title: "Piano Concerto No.2 in C minor, Op.18",
        titleKo: "피아노 협주곡 2번 C단조, 작품 18",
        searchingWord: `${testKeyword} 피아노 협주곡`
      }
    ]
  };

  // 1. 임시 데이터 yes24_concerts.json에 주입
  console.log(`\n=== [3] yes24_concerts.json에 가짜 공연 임시 주입 ===`);
  const yes24List = loadYes24Concerts();
  yes24List.unshift(fakeConcert);
  saveYes24Concerts(yes24List);
  console.log(`가짜 공연 주입 완료 (ID: ${fakeConcertId})`);

  try {
    // 2. 키워드 매칭 검증
    console.log(`\n=== [4] 매칭 로직 검증 및 이메일 발송 실행 ===`);
    const isMatched = doesConcertMatchKeyword(fakeConcert, fakeConcert.programs, testKeyword);
    console.log(`키워드 '${testKeyword}' 매칭 여부: ${isMatched}`);

    if (!isMatched) {
      throw new Error(`키워드 '${testKeyword}'가 매칭되지 않았습니다.`);
    }

    if (!canSendBatchEmail()) {
      throw new Error("오늘의 배치 이메일 발송 한도(80통)를 초과했습니다.");
    }

    const matchedItems = [
      {
        concert: fakeConcert,
        matchedKeywords: [testKeyword],
      }
    ];

    console.log(`${email} 앞으로 알림 메일 발송 중...`);
    const sendResult = await sendConcertAlertEmail(email, sub.manageToken, matchedItems);
    console.log("발송 결과:", JSON.stringify(sendResult, null, 2));

    if (sendResult.ok) {
      console.log(`성공: ${email} 주소로 테스트 알림 메일이 전송되었습니다!`);
    } else {
      console.error(`발송 실패:`, sendResult.error || sendResult.reason);
    }
  } finally {
    // 3. 임시 데이터 완벽 삭제
    console.log(`\n=== [5] 가짜 테스트용 데이터 정리 및 삭제 ===`);
    const currentList = loadYes24Concerts();
    const cleanedList = currentList.filter((c) => c.id !== fakeConcertId);
    saveYes24Concerts(cleanedList);
    console.log(`yes24_concerts.json에서 가짜 공연(${fakeConcertId}) 완전 삭제 완료.`);

    // notifiedIds에서도 가짜 ID 정리
    const currentSubs = loadSubscribers();
    if (currentSubs[email]) {
      currentSubs[email].notifiedIds = (currentSubs[email].notifiedIds || []).filter(
        (id) => id !== fakeConcertId
      );
      saveSubscribers(currentSubs);
      console.log(`구독자 notifiedIds에서 가짜 ID 정리 완료.`);
    }
  }

  console.log("\n=== 모든 작업 완료 ===");
}

main().catch((err) => {
  console.error("실행 오류:", err);
  process.exit(1);
});
