const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000').replace(/\/$/, '')

async function parseResponse(response) {
  let payload = null
  try {
    payload = await response.json()
  } catch {
    throw new Error(`AI Detective API returned an invalid response (${response.status}).`)
  }

  if (!response.ok) {
    throw new Error(payload?.detail || `AI Detective API request failed (${response.status}).`)
  }

  return payload
}

export async function discoverBackends() {
  const response = await fetch(`${API_BASE_URL}/api/backends/discover`)
  return parseResponse(response)
}

export async function connectBackend({ backendUrl, logSourceUrl }) {
  const response = await fetch(`${API_BASE_URL}/api/backends/connect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backend_url: backendUrl || null, log_source_url: logSourceUrl }),
  })
  return parseResponse(response)
}

export async function fetchSourceReport({ logSourceUrl, useAI = false, maxLines = 100000, signal } = {}) {
  const response = await fetch(`${API_BASE_URL}/api/analyze/source`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ log_source_url: logSourceUrl, use_ai: useAI, max_lines: maxLines }),
    signal,
  })
  return parseResponse(response)
}

export async function fetchContentReport({ fileName, content, useAI = false, maxLines = 100000, signal } = {}) {
  const response = await fetch(`${API_BASE_URL}/api/analyze/content`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_name: fileName, content, use_ai: useAI, max_lines: maxLines }),
    signal,
  })
  return parseResponse(response)
}

export async function generateResolutionPrompt({ problem, cause, errorCount, recommendations, evidence, signal } = {}) {
  const response = await fetch(`${API_BASE_URL}/api/prompt/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      problem,
      cause,
      error_count: errorCount,
      recommendations,
      evidence,
    }),
    signal,
  })
  return parseResponse(response)
}

export async function checkApiHealth() {
  const response = await fetch(`${API_BASE_URL}/health`)
  if (!response.ok) throw new Error('AI Detective API is not healthy.')
  return response.json()
}

export { API_BASE_URL }
