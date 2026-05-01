import type { Metadata } from 'next'
import SvgIcons from '@/components/SvgIcons'
import './globals.css'

export const metadata: Metadata = {
  title: 'B-Attendance | 勤怠管理システム',
  description: '株式会社Backlly 勤怠管理システム',
  icons: { icon: '/favicon.png' },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="ja">
      <body>
        <SvgIcons />
        {children}
      </body>
    </html>
  )
}
