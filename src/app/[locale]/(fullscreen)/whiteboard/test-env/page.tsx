'use client';

export default function TestEnvPage() {
  return (
    <div style={{ padding: 20, fontFamily: 'monospace' }}>
      <h1>Environment Variables Test</h1>
      <pre style={{ background: '#f5f5f5', padding: 20, borderRadius: 8 }}>
        {JSON.stringify({
          AI_PROVIDER: process.env.NEXT_PUBLIC_AI_PROVIDER,
          HAS_API_KEY: !!process.env.NEXT_PUBLIC_AI_API_KEY,
          API_KEY_PREFIX: process.env.NEXT_PUBLIC_AI_API_KEY?.substring(0, 10),
          API_ENDPOINT: process.env.NEXT_PUBLIC_CLAUDE_API_ENDPOINT,
        }, null, 2)}
      </pre>
    </div>
  );
}
