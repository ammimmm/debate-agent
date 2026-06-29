'use client'
import { useState, useRef, useEffect, useCallback } from 'react'

type Message = { role: 'user' | 'assistant'; content: string }
type Feedback = {
  pronunciation: { score: number; comment: string }
  structure: { score: number; comment: string }
  logic: { score: number; comment: string }
}
type Turn = { role: 'user' | 'ai'; text: string; feedback?: Feedback; tip?: string }

const PRESET_TOPICS = [
  'AI가 인간의 일자리를 대체하는 것은 사회적으로 이롭다',
  '사형제도는 폐지되어야 한다',
  '원격근무는 사무실 근무보다 생산성이 높다',
  '소셜미디어는 민주주의에 해롭다',
  '대학 교육은 더 이상 필수적이지 않다',
  '동물실험은 전면 금지되어야 한다',
]

async function callAPI(system: string, messages: Message[]): Promise<string> {
  const res = await fetch('/api/debate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ system, messages }),
  })
  const data = await res.json()
  if (data.error) throw new Error(data.error)
  return data.text
}

function cleanForSpeech(text: string): string {
  return text
    .replace(/#{1,6}\s*/g, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`(.+?)`/g, '$1')
    .replace(/\[(.+?)\]\(.+?\)/g, '$1')
    .trim()
}

function speak(text: string) {
  if (typeof window === 'undefined' || !window.speechSynthesis) return
  window.speechSynthesis.cancel()
  const utter = new SpeechSynthesisUtterance(cleanForSpeech(text))
  utter.lang = 'ko-KR'
  utter.rate = 1.05
  window.speechSynthesis.speak(utter)
}

export default function DebateAgent() {
  const [phase, setPhase] = useState<'topic' | 'debate' | 'final'>('topic')
  const [topic, setTopic] = useState('')
  const [customTopic, setCustomTopic] = useState('')
  const [turns, setTurns] = useState<Turn[]>([])
  const [history, setHistory] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [finalData, setFinalData] = useState<{ scores: { p: number; s: number; l: number }; summary: string } | null>(null)
  const [scoreAccum, setScoreAccum] = useState<{ p: number[]; s: number[]; l: number[] }>({ p: [], s: [], l: [] })
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const chatRef = useRef<HTMLDivElement>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recogRef = useRef<any>(null)

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [turns])

  const addTurn = (turn: Turn) => setTurns(prev => [...prev, turn])

  const startDebate = async () => {
    const t = customTopic.trim() || topic
    if (!t) { alert('주제를 선택하거나 입력해주세요.'); return }
    setTurns([])
    setHistory([])
    setScoreAccum({ p: [], s: [], l: [] })
    setPhase('debate')
    setLoading(true)
    setStatus('AI가 반대 입장을 준비 중...')

    const system = `당신은 토론 AI입니다. 주제: "${t}"에 대해 항상 반대 입장을 취합니다. 반대 입장의 핵심 논거를 2~3문장으로만 간결하게 말하세요. 절대 3문장을 넘지 마세요. 한국어로 답하세요. 중요: 마크다운 문법(**, *, #, ## 등)을 절대 사용하지 마세요. 일반 텍스트로만 작성하세요.`
    const initMsg: Message[] = [{ role: 'user', content: '토론을 시작합니다. 반대 입장의 핵심 주장을 먼저 말씀해주세요.' }]
    try {
      const reply = await callAPI(system, initMsg)
      addTurn({ role: 'ai', text: reply })
      setHistory([{ role: 'assistant', content: reply }])
      if (ttsEnabled) speak(reply)
    } catch {
      addTurn({ role: 'ai', text: '오류가 발생했습니다. 페이지를 새로고침해주세요.' })
    }
    setLoading(false)
    setStatus('')
  }

  const sendMessage = useCallback(async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    addTurn({ role: 'user', text: msg })

    const newHistory: Message[] = [...history, { role: 'user', content: msg }]
    setHistory(newHistory)
    setLoading(true)
    setStatus('AI가 반론과 피드백을 생성 중...')

    const system = `당신은 토론 AI이자 토론 코치입니다. 주제: "${topic || customTopic}"에서 반대 입장입니다.
중요: 마크다운 문법(**, *, #, ## 등)을 절대 사용하지 마세요. 모든 텍스트는 일반 텍스트로만 작성하세요.
사용자의 발언에 대해 다음 형식으로 정확히 JSON을 반환하세요 (마크다운 없이 순수 JSON만):
{
  "rebuttal": "반론 내용 (2~3문장, 날카롭고 논리적으로, 절대 3문장 초과 금지, 마크다운 절대 금지)",
  "feedback": {
    "pronunciation": { "score": 1에서10사이정수, "comment": "발음/명확성 피드백 1문장" },
    "structure": { "score": 1에서10사이정수, "comment": "문장 구성/논리 구조 피드백 1문장" },
    "logic": { "score": 1에서10사이정수, "comment": "논거의 타당성/설득력 피드백 1문장" }
  },
  "tip": "다음 발언을 위한 한 줄 조언"
}`

    const apiMsgs: Message[] = [
      ...newHistory.slice(0, -1),
      { role: 'user', content: `내 발언: "${msg}"\n\n위 형식의 JSON으로 반론과 피드백을 주세요.` },
    ]

    try {
      const raw = await callAPI(system, apiMsgs)
      let parsed: { rebuttal: string; feedback?: Feedback; tip?: string }
      try {
        parsed = JSON.parse(raw.replace(/```json|```/g, '').trim())
      } catch {
        parsed = { rebuttal: raw }
      }
      if (parsed.feedback) {
        setScoreAccum(prev => ({
          p: [...prev.p, parsed.feedback!.pronunciation.score],
          s: [...prev.s, parsed.feedback!.structure.score],
          l: [...prev.l, parsed.feedback!.logic.score],
        }))
      }
      addTurn({ role: 'ai', text: parsed.rebuttal, feedback: parsed.feedback, tip: parsed.tip })
      setHistory(prev => [...prev, { role: 'assistant', content: parsed.rebuttal }])
      if (ttsEnabled) speak(parsed.rebuttal)
    } catch {
      addTurn({ role: 'ai', text: '응답 오류가 발생했습니다. 다시 시도해주세요.' })
    }
    setLoading(false)
    setStatus('')
  }, [input, loading, history, topic, customTopic])

  const endDebate = async () => {
    const userTurns = turns.filter(t => t.role === 'user')
    if (userTurns.length === 0) { alert('최소 1회 이상 발언 후 종료해주세요.'); return }
    setLoading(true)
    setStatus('종합 피드백 생성 중...')

    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0
    const scores = { p: avg(scoreAccum.p), s: avg(scoreAccum.s), l: avg(scoreAccum.l) }

    const system = '당신은 토론 코치입니다.'
    const msgs: Message[] = [{
      role: 'user',
      content: `주제 "${topic || customTopic}"에 대한 찬성 측 토론 ${userTurns.length}회를 마쳤습니다. 발언들: ${JSON.stringify(userTurns.map(t => t.text))}. 종합 피드백 2-3문장. 잘한 점 1가지, 개선할 점 1가지 포함.`,
    }]
    let summary = ''
    try {
      summary = await callAPI(system, msgs)
    } catch {
      summary = '종합 피드백 생성 중 오류가 발생했습니다.'
    }
    setFinalData({ scores, summary })
    setPhase('final')
    setLoading(false)
    setStatus('')
  }

  const toggleMic = () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = window as any
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition
    if (!SR) { alert('Chrome 브라우저를 사용해주세요.'); return }
    if (isRecording) { recogRef.current?.stop(); return }
    const recog = new SR()
    recog.lang = 'ko-KR'
    recog.continuous = false
    recog.interimResults = true
    recog.onstart = () => { setIsRecording(true); setStatus('음성 인식 중... 발언을 마치면 잠시 멈추세요') }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    recog.onresult = (e: any) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transcript = Array.from(e.results as any[]).map((r: any) => r[0].transcript).join('')
      setInput(transcript)
    }
    recog.onend = () => {
      setIsRecording(false)
      setStatus('')
      setInput(prev => { if (prev.trim()) { sendMessage(prev.trim()); return '' } return prev })
    }
    recog.onerror = () => { setIsRecording(false); setStatus('') }
    recogRef.current = recog
    recog.start()
  }

  const reset = () => {
    setPhase('topic')
    setTurns([])
    setHistory([])
    setTopic('')
    setCustomTopic('')
    setFinalData(null)
    setScoreAccum({ p: [], s: [], l: [] })
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-medium text-gray-900">토론 AI 에이전트</h1>
          <p className="text-sm text-gray-500 mt-1">음성 또는 텍스트로 토론하고 즉시 피드백을 받아보세요</p>
        </div>

        {/* Topic Phase */}
        {phase === 'topic' && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <p className="text-xs text-gray-400 uppercase tracking-widest font-medium">토론 주제 선택</p>
            <select
              value={topic}
              onChange={e => setTopic(e.target.value)}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">주제를 선택하세요...</option>
              {PRESET_TOPICS.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <input
              type="text"
              value={customTopic}
              onChange={e => setCustomTopic(e.target.value)}
              placeholder="직접 주제 입력..."
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
            <button
              onClick={startDebate}
              className="w-full py-3 rounded-xl bg-blue-50 border-2 border-blue-200 text-blue-700 font-medium text-sm hover:bg-blue-100 transition-colors"
            >
              토론 시작 →
            </button>
          </div>
        )}

        {/* Debate Phase */}
        {phase === 'debate' && (
          <div className="space-y-3">
            {/* Topic Banner */}
            <div className="bg-white rounded-2xl border border-gray-200 p-4">
              <p className="text-xs text-gray-400 uppercase tracking-widest mb-2">토론 주제</p>
              <p className="font-medium text-gray-900 text-base leading-snug">{topic || customTopic}</p>
              <div className="flex gap-2 mt-3">
                <span className="flex-1 text-center py-1.5 rounded-lg bg-blue-50 text-blue-700 text-xs font-medium">나 — 찬성 입장</span>
                <span className="flex-1 text-center py-1.5 rounded-lg bg-red-50 text-red-600 text-xs font-medium">AI — 반대 입장</span>
                <button
                  onClick={() => { if (!ttsEnabled) { window.speechSynthesis?.cancel() }; setTtsEnabled(v => !v) }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${ttsEnabled ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100 text-gray-400 border-gray-200'}`}
                  title="AI 음성 on/off"
                >
                  {ttsEnabled ? '🔊 음성 ON' : '🔇 음성 OFF'}
                </button>
              </div>
            </div>

            {/* Chat */}
            <div ref={chatRef} className="bg-white rounded-2xl border border-gray-200 p-4 min-h-72 max-h-96 overflow-y-auto space-y-4">
              {turns.map((turn, i) => (
                <div key={i} className={`flex flex-col gap-1 ${turn.role === 'user' ? 'items-end' : 'items-start'}`}>
                  <p className="text-xs text-gray-400">{turn.role === 'user' ? '나 (찬성)' : 'AI (반대)'}</p>
                  <div className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${
                    turn.role === 'user'
                      ? 'bg-blue-500 text-white rounded-br-sm'
                      : 'bg-gray-100 text-gray-800 rounded-bl-sm border border-gray-200'
                  }`}>
                    {turn.text}
                  </div>
                  {turn.feedback && (
                    <div className="max-w-[88%] mt-1 bg-green-50 border border-green-200 rounded-xl p-3 text-xs space-y-1.5">
                      <p className="font-medium text-green-700 mb-2">발언 피드백</p>
                      {(['pronunciation', 'structure', 'logic'] as const).map(k => (
                        <div key={k} className="flex gap-2 text-green-800">
                          <span className="font-medium min-w-[52px]">{k === 'pronunciation' ? '발음' : k === 'structure' ? '문장구성' : '논리'}</span>
                          <span className="font-medium text-blue-600">{turn.feedback![k].score}/10</span>
                          <span>{turn.feedback![k].comment}</span>
                        </div>
                      ))}
                      {turn.tip && (
                        <div className="pt-1.5 mt-1 border-t border-green-200 text-green-600">
                          💡 {turn.tip}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex items-start gap-2">
                  <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm text-gray-500 animate-pulse">
                    {status}
                  </div>
                </div>
              )}
            </div>

            {/* Input */}
            <div className="bg-white rounded-2xl border border-gray-200 p-3 space-y-2">
              <div className="flex gap-2 items-end">
                <button
                  onClick={toggleMic}
                  className={`w-11 h-11 rounded-full border flex items-center justify-center text-lg flex-shrink-0 transition-all ${
                    isRecording
                      ? 'bg-red-50 border-red-300 text-red-500 animate-pulse'
                      : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                  }`}
                  title="음성 입력"
                >
                  🎤
                </button>
                <textarea
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
                  placeholder="발언을 입력하거나 마이크를 누르세요..."
                  rows={2}
                  className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
                <button
                  onClick={() => sendMessage()}
                  disabled={loading || !input.trim()}
                  className="h-11 px-4 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                >
                  발언 →
                </button>
              </div>
              <div className="flex justify-between items-center px-1">
                <p className="text-xs text-gray-400">마이크 버튼: 음성 인식 / 엔터: 전송</p>
                <button onClick={endDebate} disabled={loading} className="text-xs text-gray-400 underline hover:text-red-400 disabled:opacity-40">
                  토론 종료 및 종합 피드백
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Final Phase */}
        {phase === 'final' && finalData && (
          <div className="bg-white rounded-2xl border border-gray-200 p-6 space-y-4">
            <div>
              <h2 className="text-lg font-medium text-gray-900">토론 종합 피드백</h2>
              <p className="text-xs text-gray-400 mt-1">주제: {topic || customTopic}</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: '발음·명확성', val: finalData.scores.p },
                { label: '문장 구성', val: finalData.scores.s },
                { label: '논리성', val: finalData.scores.l },
              ].map(({ label, val }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-medium text-blue-600">{val}</p>
                  <p className="text-xs text-gray-500 mt-1">{label}</p>
                </div>
              ))}
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-xs text-gray-500 mb-1">종합 점수</p>
              <p className="text-3xl font-medium text-blue-600">
                {Math.round((finalData.scores.p + finalData.scores.s + finalData.scores.l) / 3)}
                <span className="text-sm text-gray-400">/10</span>
              </p>
            </div>
            <p className="text-sm text-gray-700 leading-relaxed">{finalData.summary}</p>
            <button
              onClick={reset}
              className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              새 토론 시작
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
