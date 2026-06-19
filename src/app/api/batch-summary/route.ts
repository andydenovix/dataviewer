import { NextRequest, NextResponse } from 'next/server';

// Add ANTHROPIC_API_KEY=sk-ant-... to .env.local to enable AI summaries.
const API_KEY = process.env.ANTHROPIC_API_KEY;

export async function POST(req: NextRequest) {
  if (!API_KEY) {
    return NextResponse.json({ error: 'No API key configured' }, { status: 503 });
  }

  const body = await req.json();
  const {
    total, pass, fail, warn,
    avgConc, avg280, avg230,
    operator, instrument,
    dateFrom, dateTo,
  } = body;

  const passPct = total > 0 ? Math.round((pass / total) * 100) : 0;

  const prompt = [
    'Write a 2–3 sentence professional QC batch summary for a lab report. Be concise and factual.',
    '',
    `Run period: ${dateFrom ?? 'unknown'} to ${dateTo ?? 'unknown'}`,
    operator    ? `Operator: ${operator}`     : null,
    instrument  ? `Instrument: ${instrument}` : null,
    `Total samples: ${total}`,
    `Results: ${pass} pass (${passPct}%), ${warn} warning, ${fail} fail`,
    avgConc != null ? `Mean concentration: ${Number(avgConc).toFixed(2)} ng/µL` : null,
    avg280  != null ? `Mean 260/280: ${Number(avg280).toFixed(3)}`              : null,
    avg230  != null ? `Mean 260/230: ${Number(avg230).toFixed(3)}`              : null,
  ].filter(Boolean).join('\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': API_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 250,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return NextResponse.json({ error: `Anthropic API error: ${res.status} — ${text.slice(0, 200)}` }, { status: 502 });
  }

  const data = await res.json();
  const summary = data?.content?.[0]?.text ?? '';
  return NextResponse.json({ summary });
}
