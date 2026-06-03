import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import './LandingPage.css'

function CheckIcon() {
  return (
    <svg viewBox="0 0 10 10" fill="none" aria-hidden="true">
      <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function AppMockup() {
  return (
    <div className="lp-mockup-frame">
      <div className="lp-mockup-bar">
        <span className="lp-mockup-dot" style={{ background: 'oklch(0.65 0.18 25)' }} />
        <span className="lp-mockup-dot" style={{ background: 'oklch(0.75 0.18 80)' }} />
        <span className="lp-mockup-dot" style={{ background: 'oklch(0.60 0.18 145)' }} />
        <span style={{ marginLeft: '0.5rem', fontSize: '0.7rem', color: 'oklch(0.55 0.015 210)' }}>
          파싱 결과 확인
        </span>
      </div>
      <svg
        viewBox="0 0 560 340"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="AI 파싱 결과 화면 미리보기"
        style={{ display: 'block', width: '100%' }}
      >
        <rect width="560" height="340" fill="oklch(0.967 0.007 210)" />

        {/* Left panel label */}
        <text x="24" y="30" fontSize="10" fill="oklch(0.44 0.022 215)" fontFamily="sans-serif" fontWeight="600">
          파싱 결과
        </text>

        {/* Fields */}
        {[
          { label: '품번', value: '85310-AA000', confidence: 0.97, y: 44 },
          { label: '고객코드', value: 'HMC-001', confidence: 0.95, y: 84 },
          { label: '수량', value: '500 EA', confidence: 0.88, y: 124 },
          { label: '납기일', value: '2026-06-30', confidence: 0.72, y: 164 },
          { label: '납품처', value: '울산 1공장', confidence: 0.61, y: 204 },
        ].map(({ label, value, confidence, y }) => {
          const bg =
            confidence >= 0.9
              ? 'oklch(0.93 0.08 145)'
              : confidence >= 0.7
              ? 'oklch(0.95 0.10 85)'
              : 'oklch(0.93 0.08 25)'
          const text =
            confidence >= 0.9
              ? 'oklch(0.30 0.10 145)'
              : confidence >= 0.7
              ? 'oklch(0.35 0.12 75)'
              : 'oklch(0.35 0.14 25)'
          const pct = Math.round(confidence * 100)
          return (
            <g key={label}>
              <text x="24" y={y + 14} fontSize="9" fill="oklch(0.50 0.022 215)" fontFamily="sans-serif" fontWeight="600">
                {label}
              </text>
              <rect x="24" y={y + 20} width="320" height="26" rx="5" fill={bg} />
              <text x="34" y={y + 38} fontSize="10.5" fill={text} fontFamily="sans-serif" fontWeight="600">
                {value}
              </text>
              <rect x="350" y={y + 20} width="48" height="26" rx="5"
                fill={confidence >= 0.9 ? 'oklch(0.87 0.12 145)' : confidence >= 0.7 ? 'oklch(0.88 0.14 85)' : 'oklch(0.87 0.12 25)'} />
              <text x="374" y={y + 38} fontSize="9.5" fill={text} fontFamily="sans-serif" fontWeight="700" textAnchor="middle">
                {pct}%
              </text>
            </g>
          )
        })}

        {/* Right panel — summary */}
        <rect x="430" y="16" width="114" height="90" rx="8" fill="oklch(1.000 0.000 0)" stroke="oklch(0.90 0.010 210)" strokeWidth="1" />
        <text x="445" y="34" fontSize="8.5" fill="oklch(0.44 0.022 215)" fontFamily="sans-serif" fontWeight="600">생성 예정 문서</text>
        {['생산의뢰서', 'Invoice', 'Packing List'].map((doc, i) => (
          <g key={doc}>
            <rect x="442" y={44 + i * 18} width="7" height="7" rx="2" fill="oklch(0.42 0.19 210)" />
            <text x="454" y={52 + i * 18} fontSize="9" fill="oklch(0.30 0.025 215)" fontFamily="sans-serif">
              {doc}
            </text>
          </g>
        ))}

        {/* Save button */}
        <rect x="24" y="252" width="120" height="32" rx="7" fill="oklch(0.61 0.14 25)" opacity="0.4" />
        <text x="84" y="272" fontSize="10" fill="oklch(0.80 0.010 215)" fontFamily="sans-serif" textAnchor="middle">
          저장 (빨간 항목 수정 후)
        </text>
        <rect x="152" y="252" width="96" height="32" rx="7" fill="oklch(0.42 0.19 210)" />
        <text x="200" y="272" fontSize="10" fill="#fff" fontFamily="sans-serif" textAnchor="middle" fontWeight="600">
          확인 완료
        </text>

        {/* Legend */}
        {[
          { color: 'oklch(0.87 0.12 145)', label: '신뢰도 높음 (90%+)', x: 24 },
          { color: 'oklch(0.88 0.14 85)', label: '확인 권장 (70-89%)', x: 158 },
          { color: 'oklch(0.87 0.12 25)', label: '수정 필요 (70% 미만)', x: 296 },
        ].map(({ color, label, x }) => (
          <g key={label}>
            <rect x={x} y="302" width="10" height="10" rx="2" fill={color} />
            <text x={x + 14} y="312" fontSize="8" fill="oklch(0.50 0.022 215)" fontFamily="sans-serif">
              {label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  )
}

const PROBLEMS = [
  {
    title: '발주서마다 양식이 달라 매번 처음부터 옮겨야 한다',
    detail: '고객사별로 다른 양식, 다른 표기 방식. 담당자가 직접 읽고 엑셀에 입력하는 시간이 건당 20~40분.',
  },
  {
    title: '숫자 하나 틀리면 서류 전체를 다시 만든다',
    detail: '품번 오기, 수량 단위 혼동, 납기 연도 실수. 사소한 오류 하나가 생산 지연과 재작업으로 이어진다.',
  },
  {
    title: '선적 때마다 Invoice와 Packing List를 처음부터 친다',
    detail: '생산의뢰서에 이미 있는 데이터를 다시 입력. 반복 작업인데 실수 위험은 매번 똑같다.',
  },
]

const WHO_ITEMS = [
  '고객사마다 발주서 양식이 제각각인 경우',
  '담당자 한 명이 여러 고객사 발주를 처리하는 경우',
  '발주 접수부터 생산의뢰 전달까지 시간이 걸리는 경우',
  '선적할 때마다 Invoice와 Packing List를 수작업으로 작성하는 경우',
  '자동차부품, 전자부품, 기계, 금형 등 제조·무역 업종',
  '직원 30~200명 규모 중소 제조사',
]

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.classList.add('lp-js')
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('lp-visible')
          }
        })
      },
      { threshold: 0.12 }
    )
    root.querySelectorAll('.lp-reveal').forEach((el) => observer.observe(el))
    return () => observer.disconnect()
  }, [])

  return (
    <div className="lp" ref={rootRef}>
      {/* ── Mobile Nav Overlay ── */}
      {menuOpen && (
        <div className="lp-mobile-nav" role="dialog" aria-modal="true" aria-label="모바일 메뉴">
          <div className="lp-mobile-nav-header">
            <div className="lp-logo">발주자동화</div>
            <button
              className="lp-mobile-close"
              onClick={() => setMenuOpen(false)}
              aria-label="메뉴 닫기"
            >
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <path d="M3 3l16 16M19 3L3 19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <nav className="lp-mobile-links" aria-label="모바일 메뉴">
            <a href="#features" onClick={() => setMenuOpen(false)}>기능</a>
            <a href="#how" onClick={() => setMenuOpen(false)}>작동 방식</a>
            <a href="#cta" onClick={() => setMenuOpen(false)}>도입 문의</a>
          </nav>
          <Link to="/login" className="lp-mobile-login" onClick={() => setMenuOpen(false)}>
            로그인
          </Link>
        </div>
      )}

      {/* ── Header ── */}
      <header className="lp-header">
        <div className="lp-container lp-header-inner">
          <div className="lp-logo">발주자동화</div>
          <nav className="lp-nav" aria-label="주요 메뉴">
            <a href="#features">기능</a>
            <a href="#how">작동 방식</a>
            <a href="#cta">도입 문의</a>
          </nav>
          <Link to="/login" className="lp-btn-outline">로그인</Link>
          <button
            className="lp-hamburger"
            onClick={() => setMenuOpen(true)}
            aria-label="메뉴 열기"
            aria-expanded={menuOpen}
          >
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              <path d="M3 5h16M3 11h16M3 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      </header>

      {/* ── Hero ── */}
      <section className="lp-hero" aria-label="서비스 소개">
        <div className="lp-container">
          <div className="lp-hero-inner">
            <div className="lp-hero-text">
              <div className="lp-hero-badge">AI 기반 발주 문서 자동화</div>
              <h1 className="lp-hero-title">
                발주서 받으면,<br />
                문서는 자동으로
              </h1>
              <p className="lp-hero-sub">
                PDF 발주서를 올리면 AI가 품번, 수량, 납기를 읽어내고
                생산의뢰서와 Invoice, Packing List를 즉시 만듭니다.
                수작업 없이, 오류 없이.
              </p>
              <div className="lp-hero-actions">
                <a href="#cta" className="lp-btn-primary">도입 문의하기</a>
                <a href="#how" className="lp-btn-ghost">작동 방식 보기</a>
              </div>
            </div>
            <div className="lp-hero-mockup">
              <AppMockup />
            </div>
          </div>
        </div>
      </section>

      {/* ── Problems ── */}
      <section className="lp-problems" id="problems" aria-label="문제 상황">
        <div className="lp-container">
          <div className="lp-reveal">
            <h2 className="lp-section-title">지금 이런 방식이라면</h2>
            <p className="lp-section-sub">
              발주서 한 장을 처리하는 데 걸리는 시간과 실수 위험이
              생각보다 훨씬 크다.
            </p>
          </div>
          <div className="lp-problem-list">
            {PROBLEMS.map(({ title, detail }, i) => (
              <div key={i} className={`lp-problem-item lp-reveal lp-reveal-d${i + 1}`}>
                <div className="lp-problem-num">문제 {i + 1}</div>
                <p className="lp-problem-text">{title}</p>
                <p className="lp-problem-detail">{detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="lp-how" id="how" aria-label="작동 방식">
        <div className="lp-container">
          <div className="lp-reveal">
            <h2 className="lp-section-title">3단계로 끝납니다</h2>
            <p className="lp-section-sub">
              업로드부터 문서 다운로드까지, 담당자가 확인하는 시간 포함해 5분이면 충분합니다.
            </p>
          </div>
          <div className="lp-steps" role="list">
            {[
              {
                num: '1',
                title: '발주서 업로드',
                desc: 'PDF 파일을 드래그해서 올립니다. 고객사별 양식이 달라도 상관없습니다.',
              },
              {
                num: '2',
                title: 'AI 파싱 확인',
                desc: '추출된 품번, 수량, 납기를 신뢰도 색상으로 확인하고 필요한 항목만 수정합니다.',
              },
              {
                num: '3',
                title: '문서 다운로드',
                desc: '생산의뢰서, Invoice, Packing List를 Excel 파일로 즉시 받습니다.',
              },
            ].map(({ num, title, desc }, i) => (
              <div key={num} className={`lp-step lp-reveal lp-reveal-d${i + 1}`} role="listitem">
                <div className="lp-step-num" aria-label={`${num}단계`}>{num}</div>
                <div>
                  <div className="lp-step-title">{title}</div>
                  <p className="lp-step-desc">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ── */}
      <section className="lp-features" id="features" aria-label="핵심 기능">
        <div className="lp-container">
          <div className="lp-reveal">
            <h2 className="lp-section-title">세 가지 문서, 한 번의 업로드로</h2>
            <p className="lp-section-sub">
              발주서 한 장에서 시작해 생산 현장과 선적 담당자에게 각각 필요한 서류를 자동으로 만듭니다.
            </p>
          </div>

          <div className="lp-feature-grid">
            {/* Main feature — AI parsing */}
            <div className="lp-feature-main lp-reveal">
              <div className="lp-feat-label">AI 파싱</div>
              <div className="lp-feat-title">고객사 양식이 달라도<br />정확하게 읽어냅니다</div>
              <p className="lp-feat-desc">
                품번, 수량, 납기, 납품처를 자동 추출하고 신뢰도를 색상으로 표시합니다.
                70% 미만 항목은 빨간색으로 표시해 수정을 유도하고, 확인 전에는 저장이 안 됩니다.
              </p>
              <div className="lp-feat-visual">
                <div className="lp-confidence-rows" aria-label="신뢰도 예시">
                  {[
                    { label: '품번', pct: 97, color: 'oklch(0.50 0.18 145)' },
                    { label: '수량', pct: 88, color: 'oklch(0.58 0.18 85)' },
                    { label: '납기일', pct: 72, color: 'oklch(0.58 0.18 85)' },
                    { label: '납품처', pct: 61, color: 'oklch(0.55 0.18 25)' },
                  ].map(({ label, pct, color }) => (
                    <div key={label} className="lp-conf-row">
                      <span className="lp-conf-label">{label}</span>
                      <div className="lp-conf-bar-wrap">
                        <div
                          className="lp-conf-bar"
                          style={{ width: `${pct}%`, background: color }}
                        />
                      </div>
                      <span className="lp-conf-pct">{pct}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Side feature 1 — 생산의뢰서 */}
            <div className="lp-feature-side lp-reveal lp-reveal-d1">
              <div className="lp-feat-label">생산의뢰서</div>
              <div className="lp-feat-title">납기 역산부터 Excel 출력까지</div>
              <p className="lp-feat-desc">
                납기일에서 출하 준비일과 생산 리드타임을 자동으로 역산해 생산 시작일을 계산합니다.
                수량·납기 변경 이력도 자동으로 기록됩니다.
              </p>
            </div>

            {/* Side feature 2 — 선적서류 */}
            <div className="lp-feature-side lp-reveal lp-reveal-d2">
              <div className="lp-feat-label">Invoice &amp; Packing List</div>
              <div className="lp-feat-title">선적 서류를 다시 입력할 필요가 없습니다</div>
              <p className="lp-feat-desc">
                생산의뢰서 데이터를 그대로 가져와 Invoice와 Packing List를 자동으로 작성합니다.
                서류 번호(INV-, PKL-)도 자동 생성됩니다.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Who it's for ── */}
      <section className="lp-who" aria-label="도입 대상">
        <div className="lp-container">
          <div className="lp-reveal">
            <h2 className="lp-section-title">이런 곳에 맞습니다</h2>
            <p className="lp-section-sub">
              업종이나 규모보다, 발주서를 받아 생산 문서와 선적 서류를 만드는 흐름이 있다면
              바로 쓸 수 있습니다.
            </p>
          </div>
          <div className="lp-who-grid">
            {WHO_ITEMS.map((text, i) => (
              <div key={i} className={`lp-who-item lp-reveal lp-reveal-d${(i % 4) + 1}`}>
                <div className="lp-who-check" aria-hidden="true"><CheckIcon /></div>
                <p className="lp-who-text">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="lp-cta" id="cta" aria-label="도입 문의">
        <div className="lp-container">
          <div className="lp-cta-inner">
            <div className="lp-reveal">
              <h2 className="lp-cta-title">도입 전에 직접 확인해 보세요</h2>
              <p className="lp-cta-sub">
                실제 발주서 샘플로 데모를 진행해 드립니다.<br />
                업종과 양식에 맞게 파싱 정확도를 먼저 확인할 수 있습니다.
              </p>
            </div>
            <div className="lp-cta-action lp-reveal lp-reveal-d1">
              <a href="mailto:sylee1573@gmail.com" className="lp-cta-email">
                sylee1573@gmail.com
              </a>
              <p className="lp-cta-note">영업일 기준 1일 이내 답변 드립니다</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="lp-footer">
        <div className="lp-container lp-footer-inner">
          <div className="lp-footer-logo">발주자동화</div>
          <p className="lp-footer-copy">© 2026 발주자동화. All rights reserved.</p>
          <a href="mailto:sylee1573@gmail.com" className="lp-footer-link">
            sylee1573@gmail.com
          </a>
        </div>
      </footer>
    </div>
  )
}
