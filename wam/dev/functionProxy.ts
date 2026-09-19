import { createHmac } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

// Dev-server only (`vite` / `pnpm dev:wam`): lets the WAM run outside Desk by
// signing Function calls the same way AppStore does, using the fake local
// SIGNING_KEY from the repo's .dev.vars. Never part of a production build.
const workerOrigin = process.env.WORKER_ORIGIN ?? 'http://127.0.0.1:8797'

function signingKey(): Buffer {
  const candidates = [
    resolve(dirname(fileURLToPath(import.meta.url)), '../../.dev.vars'),
    resolve(process.cwd(), '../.dev.vars'),
    resolve(process.cwd(), '.dev.vars'),
  ]
  const file = candidates.find((path) => existsSync(path))
  if (!file) throw new Error('.dev.vars not found; see HACKATHON.ko.md')
  const vars = readFileSync(file, 'utf8')
  const hex = /^SIGNING_KEY=(\w+)/m.exec(vars)?.[1]
  if (!hex) throw new Error('SIGNING_KEY missing in .dev.vars')
  return Buffer.from(hex, 'hex')
}

function readBody(request: NodeJS.ReadableStream): Promise<string> {
  return new Promise((done, fail) => {
    let body = ''
    request.on('data', (chunk) => (body += chunk))
    request.on('end', () => done(body))
    request.on('error', fail)
  })
}

export function devFunctionProxy(): Plugin {
  return {
    name: 'channel-dev-function-proxy',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/function', async (request, response) => {
        try {
          const { managerId, channelId, name, params } = JSON.parse(
            await readBody(request)
          )
          const body = JSON.stringify({
            method: name,
            params,
            context: {
              caller: { type: 'manager', id: managerId },
              channel: { id: channelId },
            },
          })
          const upstream = await fetch(`${workerOrigin}/functions/v1`, {
            method: 'PUT',
            headers: {
              'content-type': 'application/json',
              'x-signature': createHmac('sha256', signingKey())
                .update(body)
                .digest('base64'),
            },
            body,
          })
          response.setHeader('content-type', 'application/json')
          response.statusCode = upstream.status
          response.end(await upstream.text())
        } catch (error) {
          response.statusCode = 502
          response.end(
            JSON.stringify({
              error: {
                message: `로컬 Worker(${workerOrigin})에 연결할 수 없어요: ${String(error)}`,
              },
            })
          )
        }
      })
    },
  }
}
