import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { KEY_NAME, MAX_REQUEST_BYTES, handleGenerateHttp } from './server/generate.js'

// Runs the server function at /api/generate on your laptop (npm run dev / npm run preview).
// The key is read from .env.local here, on the server. Vite only ever sends variables
// starting with VITE_ to the browser, and this one doesn't.
function localServerFunction(apiKey) {
  const middleware = async (req, res, next) => {
    if (req.url !== '/api/generate') return next()
    if (req.method !== 'POST') {
      res.statusCode = 405
      return res.end()
    }
    let body = ''
    let size = 0
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_REQUEST_BYTES + 1) break
      body += chunk
    }
    const { status, body: result } = await handleGenerateHttp(body, apiKey)
    res.statusCode = status
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(result))
  }
  return {
    name: 'local-server-function',
    configureServer(server) {
      server.middlewares.use(middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware)
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'MCQ_')
  return {
    plugins: [react(), tailwindcss(), localServerFunction(env[KEY_NAME])],
    test: {
      include: ['tests/unit/**/*.test.js'],
    },
  }
})
