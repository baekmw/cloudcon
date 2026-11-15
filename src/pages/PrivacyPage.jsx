import { ArrowLeft, ShieldCheck, Mail, Lock, Trash2, CheckCircle2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '../components/ui/card.jsx'

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#f9fafb] py-10 px-4 sm:px-6">
      <div className="mx-auto max-w-[820px] space-y-6">
        {/* 상단 네비게이션 */}
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-[#6b7684] hover:text-[#191f28] transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            홈으로 돌아가기
          </Link>
        </div>

        {/* 헤더 */}
        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#e8f3ff] text-[#3182f6] text-[12px] font-bold">
            <ShieldCheck className="h-3.5 w-3.5" />
            개인정보보호법 준수
          </div>
          <h1 className="text-[26px] sm:text-[30px] font-extrabold text-[#191f28] tracking-tight">
            클라우드콘 개인정보 처리방침
          </h1>
          <p className="text-[14.5px] text-[#4e5968] leading-relaxed break-keep">
            클라우드콘(cloudcon, 이하 &lsquo;서비스&rsquo;)은 정보주체의 자유와 권리 보호를 위해 「개인정보 보호법」 및 관련 법령이 정한 바를 준수하며, 이용자의 개인정보를 안전하게 관리하고 있습니다. 본 방침을 통해 수집된 개인정보가 어떠한 용도와 방식으로 이용되고 보호되는지 안내해 드립니다.
          </p>
        </div>

        {/* 요약 박스 (라이트한 UX) */}
        <Card className="border-[#3182f6]/20 bg-[#f7faff] shadow-xs">
          <CardContent className="p-5 sm:p-6 space-y-3">
            <h2 className="text-[15px] font-bold text-[#191f28] flex items-center gap-2">
              <CheckCircle2 className="h-4.5 w-4.5 text-[#3182f6]" />
              3줄 핵심 요약
            </h2>
            <ul className="text-[13.5px] text-[#333d4b] space-y-1.5 leading-relaxed break-keep pl-1">
              <li>
                <strong>1. 최소 수집 원칙:</strong> 복잡한 회원가입 없이 오직 <strong>이메일 주소</strong>와 관심 있는 <strong>공연 키워드</strong>만을 수집합니다.
              </li>
              <li>
                <strong>2. 사용 목적:</strong> 등록하신 키워드의 클래식 공연 및 티켓 오픈 소식을 메일로 보내드리는 용도로만 사용됩니다.
              </li>
              <li>
                <strong>3. 즉시 파기 보장:</strong> 발송된 메일 하단의 <strong>[수신 거부]</strong> 또는 웹의 <strong>[서버에서 완전 삭제]</strong>를 누르시면 지체 없이 모든 데이터가 영구 파기됩니다.
              </li>
            </ul>
          </CardContent>
        </Card>

        {/* 상세 조항 카드 */}
        <Card className="border-[#e5e8eb] shadow-xs bg-white divide-y divide-[#f2f4f6]">
          {/* 제1조 */}
          <div className="p-6 sm:p-7 space-y-3">
            <h3 className="text-[17px] font-bold text-[#191f28]">
              제1조 (수집하는 개인정보 항목 및 수집 방법)
            </h3>
            <div className="text-[14px] text-[#4e5968] leading-relaxed space-y-2 break-keep">
              <p>
                서비스는 클래식 공연 알림 및 티켓 오픈 소식 제공을 위해 아래와 같은 최소한의 개인정보를 수집합니다.
              </p>
              <ul className="list-disc list-inside space-y-1 text-[#333d4b] pl-1">
                <li>
                  <strong>필수 수집 항목:</strong> 이메일 주소, 알림 희망 키워드(아티스트명, 작곡가명, 곡명, 공연장 등)
                </li>
                <li>
                  <strong>서비스 이용 과정에서 자동 생성되는 항목:</strong> 접속 로그, 쿠키(비회원 인증 세션 유지 목적), 서비스 방문 통계(개인을 식별할 수 없는 비식별 통계)
                </li>
                <li>
                  <strong>수집 방법:</strong> 서비스 내 알림 신청 페이지를 통한 이용자의 직접 입력 및 동의
                </li>
              </ul>
            </div>
          </div>

          {/* 제2조 */}
          <div className="p-6 sm:p-7 space-y-3">
            <h3 className="text-[17px] font-bold text-[#191f28]">
              제2조 (개인정보의 처리 목적)
            </h3>
            <div className="text-[14px] text-[#4e5968] leading-relaxed space-y-2 break-keep">
              <p>수집된 개인정보는 다음의 목적 이외의 용도로는 일체 이용되지 않습니다.</p>
              <ul className="list-disc list-inside space-y-1 text-[#333d4b] pl-1">
                <li>이용자가 지정한 관심 키워드와 매칭되는 신규 클래식 공연 정보 안내 메일 발송</li>
                <li>관심 공연의 티켓 오픈 일정(놀유니버스 등 예매처 오픈일) 사전 예고 메일 발송</li>
                <li>본인 확인(이메일 매직 링크 인증) 및 알림 키워드 수정·삭제 등 서비스 관리</li>
              </ul>
            </div>
          </div>

          {/* 제3조 */}
          <div className="p-6 sm:p-7 space-y-3">
            <h3 className="text-[17px] font-bold text-[#191f28]">
              제3조 (개인정보의 보유 및 이용 기간)
            </h3>
            <div className="text-[14px] text-[#4e5968] leading-relaxed space-y-2 break-keep">
              <p>
                서비스는 원칙적으로 개인정보의 수집 및 이용 목적이 달성되면 지체 없이 해당 정보를 파기합니다.
              </p>
              <ul className="list-disc list-inside space-y-1 text-[#333d4b] pl-1">
                <li>
                  <strong>보유 기간:</strong> 이용자가 알림 수신에 동의한 시점부터 <strong>알림 수신 거부(구독 해지) 또는 데이터 삭제를 요청할 때까지</strong>
                </li>
                <li>
                  <strong>즉시 파기:</strong> 이용자가 웹페이지의 &lsquo;서버에서 완전 삭제&rsquo; 기능을 실행하거나, 수신된 이메일 하단의 &lsquo;수신 거부&rsquo; 링크를 클릭하는 즉시 서버에 저장된 이메일과 모든 키워드가 영구 파기됩니다.
                </li>
              </ul>
            </div>
          </div>

          {/* 제4조 */}
          <div className="p-6 sm:p-7 space-y-3">
            <h3 className="text-[17px] font-bold text-[#191f28]">
              제4조 (개인정보의 파기 절차 및 방법)
            </h3>
            <div className="text-[14px] text-[#4e5968] leading-relaxed space-y-2 break-keep">
              <p>
                서비스는 개인정보 보유기간의 경과, 처리목적 달성 등 개인정보가 불필요하게 되었을 때에는 지체 없이 해당 개인정보를 파기합니다.
              </p>
              <ul className="list-disc list-inside space-y-1 text-[#333d4b] pl-1">
                <li>
                  <strong>파기 절차:</strong> 이용자가 수신 거부를 요청한 경우, 서버의 데이터베이스에서 해당 레코드를 즉시 영구 삭제 처리합니다.
                </li>
                <li>
                  <strong>파기 방법:</strong> 전자적 파일 형태로 기록·저장된 개인정보는 기록을 재생할 수 없도록 영구 삭제(Unlink/Overwrite)합니다.
                </li>
              </ul>
            </div>
          </div>

          {/* 제5조 */}
          <div className="p-6 sm:p-7 space-y-3">
            <h3 className="text-[17px] font-bold text-[#191f28]">
              제5조 (개인정보의 제3자 제공 및 처리 위탁)
            </h3>
            <div className="text-[14px] text-[#4e5968] leading-relaxed space-y-2 break-keep">
              <p>
                서비스는 이용자의 개인정보를 제3자에게 판매하거나 마케팅 목적으로 제공하지 않습니다. 원활한 이메일 발송 업무 처리를 위해 아래와 같이 전자우편 발송 서비스를 위탁하고 있습니다.
              </p>
              <div className="p-3.5 rounded-xl bg-[#f9fafb] border border-[#e5e8eb] text-[13px] text-[#333d4b] space-y-1">
                <p><strong>수탁 업체:</strong> Resend, Inc.</p>
                <p><strong>위탁 업무 내용:</strong> 알림 및 인증 이메일 발송 대행</p>
                <p><strong>보유 및 이용 기간:</strong> 메일 발송 완료 시까지</p>
              </div>
            </div>
          </div>

          {/* 제6조 */}
          <div className="p-6 sm:p-7 space-y-3">
            <h3 className="text-[17px] font-bold text-[#191f28]">
              제6조 (정보주체의 권리·의무 및 행사 방법)
            </h3>
            <div className="text-[14px] text-[#4e5968] leading-relaxed space-y-2 break-keep">
              <p>
                이용자는 언제든지 등록된 개인정보(이메일, 키워드)에 대해 다음과 같은 권리를 직접 행사할 수 있습니다.
              </p>
              <ul className="list-disc list-inside space-y-1 text-[#333d4b] pl-1">
                <li>
                  <strong>알림 키워드 수정·조회:</strong> 웹사이트 [알림] 페이지에서 언제든지 내 알림 목록을 확인하고 키워드를 추가하거나 삭제할 수 있습니다.
                </li>
                <li>
                  <strong>원클릭 수신 거부 및 영구 삭제:</strong> 발송된 모든 안내 이메일 하단에 배치된 &lsquo;수신 거부&rsquo; 버튼을 클릭하면 별도의 로그인 과정 없이 즉시 구독이 해지되고 데이터가 서버에서 완전히 삭제됩니다.
                </li>
                <li>
                  <strong>웹에서의 완전 삭제:</strong> 알림 페이지 내 &lsquo;서버에서 완전 삭제&rsquo; 버튼을 통해 언제든 직접 파기를 요청할 수 있습니다.
                </li>
              </ul>
            </div>
          </div>

          {/* 제7조 */}
          <div className="p-6 sm:p-7 space-y-3">
            <h3 className="text-[17px] font-bold text-[#191f28]">
              제7조 (개인정보의 안전성 확보 조치)
            </h3>
            <div className="text-[14px] text-[#4e5968] leading-relaxed space-y-2 break-keep">
              <p>서비스는 개인정보의 안전성 확보를 위해 다음과 같은 기술적·관리적 조치를 취하고 있습니다.</p>
              <ul className="list-disc list-inside space-y-1 text-[#333d4b] pl-1">
                <li>비인가자 접근 방지를 위한 이메일 인증(Magic Link) 기반 접근 제어</li>
                <li>인증 쿠키의 암호화(HttpOnly, SameSite) 및 전송 구간 보안 암호화(HTTPS) 적용</li>
                <li>서버 데이터 원자적 쓰기(Atomic File Write)를 통한 데이터 무결성 보장</li>
              </ul>
            </div>
          </div>

          {/* 제8조 */}
          <div className="p-6 sm:p-7 space-y-3">
            <h3 className="text-[17px] font-bold text-[#191f28]">
              제8조 (개인정보 보호책임자 및 문의처)
            </h3>
            <div className="text-[14px] text-[#4e5968] leading-relaxed space-y-2 break-keep">
              <p>
                서비스는 이용자의 개인정보를 보호하고 관련 고충을 처리하기 위하여 아래와 같이 담당자를 지정하고 있습니다.
              </p>
              <div className="p-4 rounded-xl bg-[#f9fafb] border border-[#e5e8eb] text-[13.5px] text-[#333d4b] space-y-1">
                <p><strong>서비스명:</strong> 클라우드콘 (cloudcon)</p>
                <p><strong>개인정보 보호책임자:</strong> 클라우드콘 운영팀</p>
                <p><strong>문의 이메일:</strong> <a href="mailto:cloudcon.official@gmail.com" className="text-[#3182f6] hover:underline">cloudcon.official@gmail.com</a></p>
              </div>
            </div>
          </div>

          {/* 제9조 */}
          <div className="p-6 sm:p-7 space-y-2">
            <h3 className="text-[17px] font-bold text-[#191f28]">
              제9조 (고지의 의무)
            </h3>
            <p className="text-[14px] text-[#4e5968] leading-relaxed break-keep">
              본 개인정보 처리방침은 관련 법령 또는 서비스 정책의 변경에 따라 수정될 수 있으며, 내용 변경이 있을 경우 웹사이트 공지를 통해 안내해 드립니다.
            </p>
            <p className="text-[13px] text-[#8b95a1] pt-1">
              시행일자: 2026년 11월 15일
            </p>
          </div>
        </Card>

        {/* 하단 링크 */}
        <div className="text-center pt-2 pb-6">
          <Link
            to="/alerts"
            className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-[#3182f6] text-white font-semibold text-[14px] hover:bg-[#1b64da] transition-colors"
          >
            알림 설정 페이지로 가기
          </Link>
        </div>
      </div>
    </main>
  )
}
