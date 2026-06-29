import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: '토론 AI 에이전트',
  description: '음성과 텍스트로 토론하고 즉시 피드백을 받아보세요',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
