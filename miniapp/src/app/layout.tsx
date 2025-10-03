import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'SweetChain Missions',
  description: 'Mission-driven onchain match-3 mini app'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
