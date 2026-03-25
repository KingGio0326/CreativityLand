import { type NextRequest } from 'next/server'
import { supabase } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const ticker = request.nextUrl.searchParams.get('ticker') ?? 'AAPL'

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: object) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
        )
      }

      try {
        const { data: signal } = await supabase
          .from('signals')
          .select('*')
          .eq('ticker', ticker)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (signal?.reasoning) {
          const steps: string[] = typeof signal.reasoning === 'string'
            ? signal.reasoning.split(' | ')
            : Array.isArray(signal.reasoning)
              ? signal.reasoning
              : []

          for (const step of steps) {
            const colonIdx = step.indexOf(':')
            const agentName = colonIdx > 0
              ? step.substring(0, colonIdx).trim()
              : 'Orchestrator'
            const message = colonIdx > 0
              ? step.substring(colonIdx + 1).trim()
              : step

            send({ agent: agentName, message })
            await new Promise(r => setTimeout(r, 300))
          }
        } else {
          send({
            agent: 'Orchestrator',
            message: `No data available for ${ticker}. Run the bot first.`,
          })
        }

        send({
          agent: 'WeightedVote',
          message: `Final signal: ${signal?.signal ?? 'HOLD'}`,
          signal: signal?.signal ?? 'HOLD',
          confidence: signal?.confidence ?? 0,
          isFinal: true,
        })
      } catch (err) {
        send({
          agent: 'Orchestrator',
          message: `Error: ${String(err)}`,
        })
      }

      controller.close()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
