import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export async function POST(req: NextRequest) {
  try {
    const { system, messages } = await req.json()
    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      system,
      messages,
    })
    const text = response.content
      .map((c: { type: string; text?: string }) =>
        c.type === 'text' ? c.text : ''
      )
      .join('')
    return NextResponse.json({ text })
  } catch (e) {
    console.error(e)
    return NextResponse.json({ error: 'API error' }, { status: 500 })
  }
}
