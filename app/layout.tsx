import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'B-Attendance | 勤怠管理システム',
  description: '株式会社Backlly 勤怠管理システム',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  )
}
