import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Claude Coder',
  description: 'AI-powered coding assistant with GitHub integration',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="bg-dark-900 text-gray-100 min-h-screen">
        {children}
      </body>
    </html>
  )
}
