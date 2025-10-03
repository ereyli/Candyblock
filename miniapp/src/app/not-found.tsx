'use client';
import Link from 'next/link';

export default function NotFound() {
  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px 16px'
    }}>
      <div style={{
        background: 'rgba(15,23,42,0.82)', color: '#e2e8f0',
        border: '1px solid rgba(148,163,184,0.18)', borderRadius: 16,
        padding: 24, maxWidth: 520, textAlign: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800 }}>Page not found</h1>
        <p style={{ margin: '10px 0 16px 0', opacity: 0.8 }}>The page you’re looking for doesn’t exist.</p>
        <Link href="/" style={{
          display: 'inline-block', padding: '10px 14px', borderRadius: 12,
          background: 'linear-gradient(135deg,#38bdf8,#3b82f6)', color: '#0f172a', fontWeight: 700
        }}>Back to game</Link>
      </div>
    </main>
  );
}
