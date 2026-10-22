import { useEffect, useMemo, useRef, useState } from 'react'
import { BgKineticLines } from './components/bg-kinetic-lines'
import {
  connectBackend,
  discoverBackends,
  fetchContentReport,
  fetchSourceReport,
  generateResolutionPrompt,
} from './lib/api'

const confidenceLabels = {
  low: 'Low confidence',
  medium: 'Medium confidence',
  high: 'High confidence',
}

function Badge({ children, tone = 'slate' }) {
  const tones = {
    slate: 'border-slate-600/60 bg-slate-700/30 text-slate-300',
    green: 'border-mint/30 bg-mint/10 text-mint',
    amber: 'border-amber/30 bg-amber/10 text-amber',
    red: 'border-danger/30 bg-danger/10 text-danger',
  }

  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] ${tones[tone]}`}>
      {children}
    </span>
  )
}

function Panel({ children, className = '', ...props }) {
  return (
    <section {...props} className={`rounded-2xl border border-line bg-panel/80 shadow-panel ${className}`}>
      {children}
    </section>
  )
}

function ActionStep({ index, action }) {
  return (
    <div className="flex gap-3 border-b border-line/70 py-4 last:border-0 last:pb-0">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-mint/10 font-mono text-xs font-semibold text-mint">
        {String(index).padStart(2, '0')}
      </span>
      <p className="pt-1 text-sm leading-6 text-slate-200">{action}</p>
    </div>
  )
}

function AIStackOverflowOption({ checked, onChange, infoOpen, onToggleInfo }) {
  return (
    <div className="relative">
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={checked} onChange={onChange} className="accent-mint" />
          AI + Stack Overflow
        </label>
        <button
          type="button"
          onClick={onToggleInfo}
          aria-expanded={infoOpen}
          aria-label="Explain AI and Stack Overflow analysis"
          className="flex h-5 w-5 items-center justify-center rounded-full border border-slate-600 text-[10px] font-bold text-slate-400 transition hover:border-mint hover:text-mint"
        >
          i
        </button>
      </div>
      {infoOpen && (
        <div className="absolute bottom-full left-0 z-30 mb-3 w-72 rounded-xl border border-mint/25 bg-[#0c1a2b] p-4 text-xs leading-5 text-slate-300 shadow-2xl sm:left-auto sm:right-0">
          <p className="font-semibold text-white">Why enable this option?</p>
          <p className="mt-2">Groq compares the detected incident with the available evidence and generates deeper recommendations.</p>
          <p className="mt-2">AI Detective then performs one bounded Stack Overflow search for the leading error and shows the source links used.</p>
          <p className="mt-2 text-slate-500">This is not continuous polling: it runs only when you start an analysis, with one external lookup per analysis.</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, detail, tone = 'mint' }) {
  const dotColor = tone === 'red' ? 'bg-danger' : tone === 'amber' ? 'bg-amber' : 'bg-mint'

  return (
    <div className="rounded-2xl border border-line bg-panel/80 px-4 py-4 shadow-panel">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{label}</p>
        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
      </div>
      <p className="mt-3 text-2xl font-semibold tracking-tight text-white">{value}</p>
      <p className="mt-1 truncate text-xs text-slate-500">{detail}</p>
    </div>
  )
}

function resolutionStepsFor(message = '') {
  const normalized = message.toLowerCase()
  if (normalized.includes('database') || normalized.includes('postgres') || normalized.includes('sql') || normalized.includes('connection refused')) {
    return [
      'Check that the database service is running and reachable from the backend.',
      'Verify the host, port, credentials and DATABASE_URL variable.',
      'Test the connection with the same parameters used by the application.',
    ]
  }
  if (normalized.includes('redis') || normalized.includes('cache')) {
    return [
      'Check that Redis is running and reachable from the backend.',
      'Verify REDIS_URL, the connection timeout and network rules.',
      'Provide a fallback behavior if the cache remains unavailable.',
    ]
  }
  if (normalized.includes('jwt') || normalized.includes('auth') || normalized.includes('token')) {
    return [
      'Verify the signing key, issuer and audience configured by the backend.',
      'Check that the server clock and identity provider clock are synchronized.',
      'Create a fresh test token and verify the authentication middleware.',
    ]
  }
  if (normalized.includes('timeout') || normalized.includes('inventory') || normalized.includes('unavailable')) {
    return [
      'Check the health and availability of the service named in the error.',
      'Verify the network, configured timeout and retry count.',
      'Add or fix a circuit breaker and fallback behavior when needed.',
    ]
  }
  if (normalized.includes('payment') || normalized.includes('provider') || normalized.includes('503')) {
    return [
      'Check the payment provider status and environment credentials.',
      'Verify timeouts, retries and idempotency key usage.',
      'Replay a test transaction without exposing sensitive data.',
    ]
  }
  if (normalized.includes('elastic') || normalized.includes('search')) {
    return [
      'Check the cluster status and the availability of each node.',
      'Verify the URL, credentials and index used by the backend.',
      'Run a simple query before restarting the business operation.',
    ]
  }
  if (normalized.includes('validation') || normalized.includes('payload')) {
    return [
      'Identify the payload field that does not match the expected schema.',
      'Compare the received request with the API contract and add clear validation.',
      'Add a regression test for this data format.',
    ]
  }
  return [
    'Inspect nearby log lines and reproduce the error in a controlled environment.',
    'Check the dependency or component named in the message.',
    'Add a regression test after applying the fix.',
  ]
}

function ErrorList({ errors, total, selectionMode, selectedLines, onToggleLine, activeLine, onSelectError }) {
  return (
    <Panel className="border-danger/25 bg-danger/[0.035]">
      <div className="border-b border-line px-6 py-5 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-danger/80">Error details</p>
            <h2 className="mt-1 text-xl font-semibold text-white">Detected errors</h2>
          </div>
          <Badge tone="red">{total} occurrence{total > 1 ? 's' : ''}</Badge>
        </div>
        <p className="mt-2 text-xs text-slate-500">Each occurrence is shown separately with its message and source line.</p>
      </div>
      <div className="divide-y divide-line/70 px-6 sm:px-8">
        {errors.map((item, index) => (
          <div
            key={`${item.message}-${item.line_number}-${index}`}
            role="button"
            tabIndex={0}
            onClick={() => onSelectError(item.line_number)}
            onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') onSelectError(item.line_number) }}
            className={`flex cursor-pointer flex-wrap items-center justify-between gap-4 rounded-xl px-3 py-4 transition ${activeLine === item.line_number ? 'bg-danger/10 ring-1 ring-danger/30' : 'hover:bg-white/[0.03]'}`}
          >
            <div className="flex min-w-0 items-start gap-3">
              {selectionMode && (
                <input
                  type="checkbox"
                  checked={selectedLines.includes(item.line_number)}
                  onChange={() => onToggleLine(item.line_number)}
                  aria-label={`Select the error on line ${item.line_number}`}
                  className="mt-1.5 h-4 w-4 shrink-0 accent-mint"
                />
              )}
              <div className="min-w-0">
                <p className="break-words font-mono text-sm leading-6 text-slate-200">{item.message}</p>
                <p className="mt-1 text-xs text-slate-500">Source line: <span className="font-mono text-slate-400">{item.line_number}</span></p>
              </div>
            </div>
            <span className="shrink-0 rounded-lg border border-danger/25 bg-danger/10 px-2.5 py-1.5 font-mono text-xs font-semibold text-danger">
              #{index + 1}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  )
}

function StackOverflowAttribution({ report }) {
  const sources = report.external_solutions || []
  const resolutionSteps = report.resolution_steps || []

  if (sources.length === 0) {
    return (
      <div className="mt-6 rounded-xl border border-line bg-white/[0.03] p-4">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Recommendation source</p>
        <p className="mt-2 text-xs leading-5 text-slate-400">These recommendations come from log analysis. No Stack Overflow source was used in deterministic mode.</p>
      </div>
    )
  }

  return (
    <div className="mt-6 rounded-xl border border-mint/20 bg-mint/[0.05] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-mint/80">Recommendations from Stack Overflow</p>
        <Badge tone="green">{sources.length} source{sources.length > 1 ? 's' : ''}</Badge>
      </div>
      {resolutionSteps.length > 0 && (
        <div className="mt-3 space-y-3">
          {resolutionSteps.map((step, index) => (
            <div key={`${step.action}-${index}`} className="border-t border-mint/10 pt-3 first:border-0 first:pt-0">
              <p className="text-xs font-semibold leading-5 text-slate-200">{step.action}</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">{step.reason}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {step.source_urls.map((url) => (
                  <a key={url} href={url} target="_blank" rel="noreferrer" className="max-w-full truncate rounded-md border border-mint/20 px-2 py-1 font-mono text-[10px] text-mint hover:bg-mint/10">
                    Voir la source
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 border-t border-mint/10 pt-3">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Sources used</p>
        <div className="space-y-2">
          {sources.slice(0, 5).map((source) => {
            const url = source.answer_url || source.source_url
            return <a key={url} href={url} target="_blank" rel="noreferrer" className="block truncate text-xs text-mint hover:text-white">{source.title}</a>
          })}
        </div>
      </div>
    </div>
  )
}

function TechnicalDetails({ report, source }) {
  return (
    <details className="mt-6 rounded-2xl border border-line bg-panel/50">
      <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-300 hover:text-white sm:px-6">
        Developer technical details
      </summary>
      <div className="grid gap-5 border-t border-line p-5 text-xs sm:p-6 xl:grid-cols-2">
        <div>
          <p className="mb-2 font-bold uppercase tracking-[0.16em] text-slate-500">Analyzed source</p>
          <p className="break-all font-mono text-slate-300">{source?.url || 'Unknown source'}</p>
          <p className="mt-2 text-slate-500">{source?.line_count || 0} line(s) · {source?.analysis_mode || 'deterministic'}</p>
        </div>
        <div>
          <p className="mb-2 font-bold uppercase tracking-[0.16em] text-slate-500">Level distribution</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(report.statistics.levels_count || {}).map(([level, count]) => (
              <span key={level} className="rounded-md border border-line bg-white/[0.03] px-2 py-1 font-mono text-slate-300">
                {level}: {count}
              </span>
            ))}
          </div>
        </div>
        <div className="xl:col-span-2">
          <p className="mb-2 font-bold uppercase tracking-[0.16em] text-slate-500">Repeated errors</p>
          <div className="space-y-2">
            {(report.statistics.top_errors || []).map((item) => (
              <div key={item.message} className="flex flex-wrap justify-between gap-2 rounded-lg border border-line bg-white/[0.02] p-3 font-mono text-slate-300">
                <span>{item.message}</span>
                <span className="text-danger">{item.count} times</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </details>
  )
}

function App() {
  const [report, setReport] = useState(null)
  const [source, setSource] = useState(null)
  const [backends, setBackends] = useState([])
  const [backendUrl, setBackendUrl] = useState('')
  const [logSourceUrl, setLogSourceUrl] = useState('')
  const logSourceUrlRef = useRef('')
  const [fileName, setFileName] = useState('')
  const [fileContent, setFileContent] = useState('')
  const [sourceMode, setSourceMode] = useState(null)
  const [useAI, setUseAI] = useState(false)
  const [aiInfoOpen, setAiInfoOpen] = useState(false)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [connectionOpen, setConnectionOpen] = useState(true)
  const [isConnecting, setIsConnecting] = useState(false)
  const [generatedPrompt, setGeneratedPrompt] = useState('')
  const [promptError, setPromptError] = useState('')
  const [isGeneratingPrompt, setIsGeneratingPrompt] = useState(false)
  const [promptScope, setPromptScope] = useState('all')
  const [selectedErrorLines, setSelectedErrorLines] = useState([])
  const [activeErrorLine, setActiveErrorLine] = useState(null)
  const analysisInFlightRef = useRef(false)
  const lastAnalysisAtRef = useRef(0)
  const reportRef = useRef(null)

  function chooseSourceMode(mode) {
    setSourceMode(mode)
    setReport(null)
    reportRef.current = null
    setSource(null)
    setError('')
    setGeneratedPrompt('')
    setPromptError('')
    setSelectedErrorLines([])
    setActiveErrorLine(null)
    setConnectionOpen(true)
    setStatus(mode === 'url' ? 'loading' : 'idle')
  }

  async function discover() {
    const payload = await discoverBackends()
    setBackends(payload.backends || [])
    return payload.backends || []
  }

  async function loadReport(sourceUrl = logSourceUrl, { force = false } = {}) {
    if (!sourceUrl || analysisInFlightRef.current) return
    const elapsed = Date.now() - lastAnalysisAtRef.current
    if (!force && elapsed < 10000) return
    analysisInFlightRef.current = true
    setStatus('loading')
    setError('')

    try {
      const payload = await fetchSourceReport({ logSourceUrl: sourceUrl, useAI })
      setReport(payload.report)
      reportRef.current = payload.report
      setSource(payload.source)
      setGeneratedPrompt('')
      setPromptError('')
      setPromptScope('all')
      setSelectedErrorLines([])
      setActiveErrorLine(null)
      setStatus('ready')
      setConnectionOpen(false)
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setReport(null)
        reportRef.current = null
        setSource(null)
        setStatus('error')
        setError(requestError.message)
      }
    } finally {
      lastAnalysisAtRef.current = Date.now()
      analysisInFlightRef.current = false
    }
  }

  async function loadFileReport(content = fileContent, name = fileName) {
    if (!content || analysisInFlightRef.current) return
    analysisInFlightRef.current = true
    setStatus('loading')
    setError('')

    try {
      const payload = await fetchContentReport({ fileName: name || 'uploaded-logs.json', content, useAI })
      setReport(payload.report)
      reportRef.current = payload.report
      setSource(payload.source)
      setGeneratedPrompt('')
      setPromptError('')
      setPromptScope('all')
      setSelectedErrorLines([])
      setActiveErrorLine(null)
      setStatus('ready')
      setConnectionOpen(false)
    } catch (requestError) {
      setReport(null)
      reportRef.current = null
      setSource(null)
      setStatus('error')
      setError(requestError.message)
    } finally {
      lastAnalysisAtRef.current = Date.now()
      analysisInFlightRef.current = false
    }
  }

  useEffect(() => {
    if (sourceMode !== 'url') return undefined
    let active = true

    async function initialize() {
      try {
        const discovered = await discover()
        const available = discovered.find((item) => item.reachable)
        if (active && available) {
          setBackendUrl((current) => current || available.url)
          if (!reportRef.current) setStatus('detected')
        } else if (active) {
          setStatus('idle')
        }
      } catch (requestError) {
        if (active) {
          setStatus('error')
          setError(requestError.message)
        }
      }
    }

    initialize()
    const timer = window.setInterval(async () => {
      if (reportRef.current) return
      try {
        const discovered = await discover()
        const available = discovered.find((item) => item.reachable)
        if (active && available) {
          setBackendUrl((current) => current || available.url)
          setStatus('detected')
        }
      } catch {
        // Keep the last usable state if the gateway briefly restarts.
      }
    }, 15000)

    return () => {
      active = false
      window.clearInterval(timer)
    }
    // Polling keeps local backend discovery simple.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceMode])

  const primary = report?.hypotheses?.[0]
  const errorCount = useMemo(() => {
    if (!report) return 0
    return Object.entries(report.statistics.levels_count || {})
      .filter(([level]) => level.toUpperCase() === 'ERROR')
      .reduce((total, [, count]) => total + count, 0)
  }, [report])

  const warningCount = useMemo(() => {
    if (!report) return 0
    return Object.entries(report.statistics.levels_count || {})
      .filter(([level]) => ['WARN', 'WARNING'].includes(level.toUpperCase()))
      .reduce((total, [, count]) => total + count, 0)
  }, [report])

  const detailedErrors = useMemo(() => {
    if (!report) return []
    return (report.statistics.top_errors || []).flatMap((item) => (
      item.line_numbers.map((lineNumber) => ({
        message: item.message,
        line_number: lineNumber,
      }))
    ))
  }, [report])

  const activeError = detailedErrors.find((item) => item.line_number === activeErrorLine) || detailedErrors[0]
  const activeHypothesis = report?.hypotheses?.find((hypothesis) => (
    hypothesis.supporting_evidence || []
  ).some((evidence) => evidence.line_number === activeError?.line_number)) || primary
  const activeSolutionSteps = activeError
    ? [...new Set([
      ...resolutionStepsFor(activeError.message),
      ...(activeHypothesis?.recommended_checks || []),
      ...(report?.recommendations || []),
    ])].slice(0, 6)
    : []

  async function handleConnect(event) {
    event.preventDefault()
    logSourceUrlRef.current = logSourceUrl
    setIsConnecting(true)
    setStatus('loading')
    setError('')

    try {
      if (sourceMode === 'file') {
        if (!fileContent) throw new Error('Select a JSON file before starting the analysis.')
        await loadFileReport(fileContent, fileName)
        return
      }
      if (!logSourceUrl) throw new Error('Enter a log source URL before starting the analysis.')
      const result = await connectBackend({ backendUrl, logSourceUrl })
      if (!result.connected) throw new Error('The backend is not responding yet.')
      await loadReport(logSourceUrl, { force: true })
    } catch (requestError) {
      setStatus('error')
      setError(requestError.message)
    } finally {
      setIsConnecting(false)
    }
  }

  async function handleFileSelect(event) {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const content = await file.text()
      JSON.parse(content)
      setFileName(file.name)
      setFileContent(content)
      setLogSourceUrl('')
      logSourceUrlRef.current = ''
      setError('')
    } catch {
      setFileName('')
      setFileContent('')
      setStatus('error')
      setError('The selected file does not contain valid JSON.')
    }
  }

  async function handleGeneratePrompt() {
    if (!report || isHealthy || isGeneratingPrompt) return
    const promptErrors = promptScope === 'all'
      ? detailedErrors
      : detailedErrors.filter((item) => selectedErrorLines.includes(item.line_number))
    if (promptErrors.length === 0) {
      setPromptError('Select at least one error before generating this prompt.')
      return
    }
    setIsGeneratingPrompt(true)
    setPromptError('')
    try {
      const result = await generateResolutionPrompt({
        problem: `${report.incident_summary}\n\nErrors to resolve:\n${promptErrors.map((item) => `- Line ${item.line_number}: ${item.message}`).join('\n')}`,
        cause: primary?.cause,
        errorCount: promptErrors.length,
        recommendations: [
          ...(report.recommendations || []),
          ...(report.resolution_steps || []).map((step) => `${step.action} (Stack Overflow recommendation)`),
        ].slice(0, 5),
        evidence: promptErrors.map((item) => `Line ${item.line_number}: ${item.message}`),
      })
      setGeneratedPrompt(result.prompt)
    } catch (requestError) {
      setPromptError(requestError.message)
    } finally {
      setIsGeneratingPrompt(false)
    }
  }

  async function copyPrompt() {
    if (!generatedPrompt) return
    await navigator.clipboard.writeText(generatedPrompt)
  }

  function changePromptScope(scope) {
    setPromptScope(scope)
    setGeneratedPrompt('')
    setPromptError('')
    if (scope === 'all') setSelectedErrorLines([])
  }

  function toggleErrorLine(lineNumber) {
    setSelectedErrorLines((current) => (
      current.includes(lineNumber)
        ? current.filter((line) => line !== lineNumber)
        : [...current, lineNumber]
    ))
    setGeneratedPrompt('')
    setPromptError('')
  }

  function downloadReport() {
    if (!report) return
    const blob = new Blob([JSON.stringify({ report, source }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'ai-detective-live-report.json'
    link.click()
    URL.revokeObjectURL(url)
  }

  const isHealthy = report && errorCount === 0

  return (
    <div className="relative isolate min-h-screen overflow-hidden">
      <div className="pointer-events-none fixed inset-0 z-0" aria-hidden="true">
        <div className="relative h-full w-full opacity-80">
          <BgKineticLines lineCount={18} curvature={0.34} speed={7} trailLength={0.28} direction="right" spread={0.82} seed={11} className="opacity-70" />
        </div>
      </div>

      <div className="relative z-10 mx-auto min-h-screen max-w-[1440px] px-4 py-6 sm:px-7 sm:py-10 2xl:px-10">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-5">
          <div>
            <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-mint/80">AI Detective · Live</p>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">What is happening?</h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">A clear answer: the detected problem and the next action to take.</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone={status === 'ready' ? 'green' : status === 'error' ? 'red' : 'amber'}>
              {status === 'ready' ? 'Analysis complete' : status === 'error' ? 'Action required' : status === 'detected' ? 'Backend detected' : status === 'idle' ? 'Waiting' : 'Searching'}
            </Badge>
            <button type="button" onClick={downloadReport} disabled={!report} className="rounded-xl border border-line bg-panel px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40">
              Export
            </button>
            <button
              type="button"
              onClick={() => (source?.url?.startsWith('file://') ? loadFileReport() : loadReport(logSourceUrl, { force: true }))}
              disabled={!report || isConnecting || analysisInFlightRef.current}
              className="rounded-xl border border-line bg-panel px-3 py-2 text-xs font-semibold text-slate-300 transition hover:border-slate-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Refresh
            </button>
          </div>
        </header>

        <Panel className="mb-6">
          <button type="button" onClick={() => setConnectionOpen((open) => !open)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left sm:px-6">
            <span>
              <span className="block text-[10px] font-bold uppercase tracking-[0.2em] text-mint/80">Step 1 · Input source</span>
              <span className="mt-1 block text-sm font-semibold text-white">{connectionOpen ? 'Choose how to provide your logs' : 'Source configured'}</span>
            </span>
            <span className="text-xs text-slate-500">{connectionOpen ? 'Hide' : 'Edit'}</span>
          </button>

          {connectionOpen && (
            <div className="border-t border-line p-5 sm:p-6">
              <p className="mb-3 text-xs text-slate-500">No backend request is made until you choose an input source.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={() => chooseSourceMode('url')} className={`rounded-xl border p-4 text-left transition ${sourceMode === 'url' ? 'border-mint/60 bg-mint/10' : 'border-line bg-ink hover:border-slate-500'}`}>
                  <span className="block text-sm font-semibold text-white">Live backend URL</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Connect to an existing backend and fetch its log endpoint.</span>
                </button>
                <button type="button" onClick={() => chooseSourceMode('file')} className={`rounded-xl border p-4 text-left transition ${sourceMode === 'file' ? 'border-mint/60 bg-mint/10' : 'border-line bg-ink hover:border-slate-500'}`}>
                  <span className="block text-sm font-semibold text-white">JSON log file</span>
                  <span className="mt-1 block text-xs leading-5 text-slate-500">Analyze a local JSON or JSONL file without contacting a backend.</span>
                </button>
              </div>

              {sourceMode === 'url' && (
                <form onSubmit={handleConnect} className="mt-5 grid gap-3 border-t border-line/70 pt-5 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_auto_auto] lg:items-end">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Backend URL</span>
                    <input value={backendUrl} onChange={(event) => setBackendUrl(event.target.value)} list="detected-backends" className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 font-mono text-sm text-slate-200 outline-none focus:border-mint" placeholder="http://127.0.0.1:5000" />
                    <datalist id="detected-backends">
                      {backends.map((backend) => <option key={backend.url} value={backend.url} />)}
                    </datalist>
                  </label>
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Log source URL</span>
                    <input value={logSourceUrl} onChange={(event) => { logSourceUrlRef.current = event.target.value; setLogSourceUrl(event.target.value); setFileContent(''); setFileName('') }} className="w-full rounded-xl border border-line bg-ink px-3 py-2.5 font-mono text-sm text-slate-200 outline-none focus:border-mint" placeholder="http://127.0.0.1:5000/api/logs" />
                  </label>
                  <AIStackOverflowOption checked={useAI} onChange={(event) => setUseAI(event.target.checked)} infoOpen={aiInfoOpen} onToggleInfo={() => setAiInfoOpen((open) => !open)} />
                  <button type="submit" disabled={isConnecting} className="rounded-xl bg-mint px-4 py-2.5 text-xs font-bold text-ink transition hover:bg-white disabled:opacity-50">
                    {isConnecting ? 'Connecting…' : 'Analyze'}
                  </button>
                </form>
              )}

              {sourceMode === 'file' && (
                <form onSubmit={handleConnect} className="mt-5 grid gap-3 border-t border-line/70 pt-5 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                  <label className="block">
                    <span className="mb-2 block text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">JSON or JSONL file</span>
                    <input type="file" accept=".json,.jsonl,application/json" onChange={handleFileSelect} className="block w-full cursor-pointer rounded-xl border border-line bg-ink px-3 py-2 text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-mint file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-ink" />
                    {fileName && <span className="mt-1 block truncate text-[11px] text-mint">{fileName} selected</span>}
                  </label>
                  <AIStackOverflowOption checked={useAI} onChange={(event) => setUseAI(event.target.checked)} infoOpen={aiInfoOpen} onToggleInfo={() => setAiInfoOpen((open) => !open)} />
                  <button type="submit" disabled={isConnecting} className="rounded-xl bg-mint px-4 py-2.5 text-xs font-bold text-ink transition hover:bg-white disabled:opacity-50">
                    {isConnecting ? 'Analyzing…' : 'Analyze file'}
                  </button>
                </form>
              )}
            </div>
          )}
        </Panel>

        {!sourceMode && (
          <Panel className="border-line bg-panel/60 p-8 text-center">
            <p className="text-lg font-semibold text-white">Choose an input source to begin</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Select a live backend URL or a JSON file above. No request will be sent before your choice.</p>
          </Panel>
        )}

        {status === 'error' && (
          <Panel className="mb-6 border-danger/30 bg-danger/[0.06]">
            <div className="p-6 sm:p-8">
              <div className="flex gap-4">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-danger/15 font-bold text-danger" aria-hidden="true">!</span>
                <div>
                  <h2 className="text-lg font-semibold text-white">Unable to analyze the logs</h2>
                  <p className="mt-2 text-sm leading-6 text-slate-300">{error}</p>
                  <p className="mt-3 text-xs leading-5 text-slate-500">Check that the backend is running and that the log URL returns text or JSON.</p>
                </div>
              </div>
            </div>
          </Panel>
        )}

        {status === 'loading' && !report && (
          <Panel className="p-10 text-center">
            <p className="text-sm text-slate-300">Searching for the backend…</p>
            <p className="mt-2 text-xs text-slate-500">Ports 5000 and 3000 are being checked.</p>
          </Panel>
        )}

        {status === 'detected' && !report && (
          <Panel className="border-mint/25 bg-mint/[0.04] p-8 text-center">
            <p className="text-lg font-semibold text-white">Backend detected</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Enter the log source URL to start the analysis.</p>
          </Panel>
        )}

        {status === 'idle' && sourceMode === 'url' && !report && (
          <Panel className="p-8 text-center">
            <p className="text-lg font-semibold text-white">No backend detected</p>
            <p className="mt-2 text-sm leading-6 text-slate-400">Start your server or enter its address in the input source step.</p>
          </Panel>
        )}

        {report && (
          <>
            <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Errors" value={errorCount} detail={errorCount ? 'Needs attention' : 'No errors'} tone={errorCount ? 'red' : 'mint'} />
              <StatCard label="Warnings" value={warningCount} detail="Signals to monitor" tone="amber" />
              <StatCard label="Lines analyzed" value={source?.line_count ?? report.statistics.total_lines} detail={source?.analysis_mode || 'Deterministic analysis'} />
              <StatCard label="Recurring groups" value={report.statistics.top_errors.length} detail={`${report.statistics.parsed_events} event(s) parsed`} tone="amber" />
            </div>

            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
              <div className="space-y-6">
                <Panel className={`border-2 ${isHealthy ? 'border-mint/30 bg-mint/[0.06]' : 'border-danger/30 bg-danger/[0.06]'}`}>
                  <div className="p-6 sm:p-8">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex gap-4">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-xl font-bold ${isHealthy ? 'bg-mint/15 text-mint' : 'bg-danger/15 text-danger'}`} aria-hidden="true">
                          {isHealthy ? '✓' : '!'}
                        </span>
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">Result</p>
                          <h2 className="mt-1 text-2xl font-semibold text-white">{isHealthy ? 'No problem detected' : 'Problem detected'}</h2>
                          <p className="mt-2 text-sm text-slate-400">{isHealthy ? 'The backend is operating correctly according to the received logs.' : `${errorCount} error${errorCount > 1 ? 's' : ''} need attention in the logs.`}</p>
                        </div>
                      </div>
                      <Badge tone={isHealthy ? 'green' : 'red'}>{isHealthy ? 'All clear' : `${errorCount} error${errorCount > 1 ? 's' : ''}`}</Badge>
                    </div>

                    <div className={`mt-7 rounded-xl border p-5 ${isHealthy ? 'border-mint/20 bg-mint/[0.06]' : 'border-danger/20 bg-danger/[0.06]'}`}>
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Problem summary</p>
                      <p className="mt-2 text-sm leading-7 text-slate-200">{report.incident_summary}</p>
                    </div>
                  </div>
                </Panel>

                {!isHealthy && detailedErrors.length > 0 && (
                  <ErrorList
                    errors={detailedErrors}
                    total={errorCount}
                    selectionMode={promptScope === 'selected'}
                    selectedLines={selectedErrorLines}
                    onToggleLine={toggleErrorLine}
                    activeLine={activeError?.line_number}
                    onSelectError={setActiveErrorLine}
                  />
                )}

                {!isHealthy && (
                  <Panel className="border-mint/25 bg-mint/[0.04]">
                    <div className="p-6 sm:p-8">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-mint/80">Resolution</p>
                          <h2 className="mt-1 text-xl font-semibold text-white">Solution for this error</h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {report.external_solutions?.length > 0 && <Badge tone="green">Stack Overflow</Badge>}
                          {activeHypothesis && <Badge tone="amber">{confidenceLabels[activeHypothesis.confidence]}</Badge>}
                        </div>
                      </div>

                      {activeError && <p className="mt-5 rounded-xl border border-danger/20 bg-danger/[0.06] p-4 font-mono text-sm leading-6 text-slate-200">{activeError.message}<span className="mt-1 block font-sans text-xs text-slate-500">Line {activeError.line_number} · click another error to change the solution</span></p>}
                      {activeHypothesis && <p className="mt-3 rounded-xl border border-line bg-white/[0.03] p-4 text-sm leading-6 text-slate-200">Likely cause: <strong className="text-white">{activeHypothesis.cause}</strong></p>}

                      <div className="mt-4">
                        {activeSolutionSteps.map((action, index) => <ActionStep key={action} index={index + 1} action={action} />)}
                      </div>
                      <StackOverflowAttribution report={report} />
                    </div>
                  </Panel>
                )}

                {isHealthy && (
                  <Panel className="border-line bg-panel/60 p-6 text-center">
                    <p className="text-sm text-slate-300">No fix is needed at the moment.</p>
                    <p className="mt-2 text-xs text-slate-500">AI Detective will check the source again when you run another analysis.</p>
                  </Panel>
                )}
              </div>

              <aside className="xl:sticky xl:top-6">
                {!isHealthy ? (
                  <Panel className="border-mint/30 bg-panel/90">
                    <div className="p-6 sm:p-7">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-mint/80">Assistant Groq</p>
                          <h2 className="mt-1 text-xl font-semibold text-white">Resolution prompt</h2>
                        </div>
                        <span className="rounded-lg bg-mint/10 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-mint">LLM-ready</span>
                      </div>
                      <p className="mt-3 text-sm leading-6 text-slate-400">A professional prompt based on the problem, likely cause and diagnostic evidence.</p>

                      <div className="mt-5 space-y-2 rounded-xl border border-line bg-white/[0.03] p-3">
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-300 transition hover:bg-white/[0.04]">
                          <input type="radio" name="prompt-scope" value="all" checked={promptScope === 'all'} onChange={() => changePromptScope('all')} className="h-4 w-4 accent-mint" />
                          <span>All errors <span className="text-xs text-slate-500">({errorCount})</span></span>
                        </label>
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm text-slate-300 transition hover:bg-white/[0.04]">
                          <input type="radio" name="prompt-scope" value="selected" checked={promptScope === 'selected'} onChange={() => changePromptScope('selected')} className="h-4 w-4 accent-mint" />
                          <span>Selected errors only <span className="text-xs text-slate-500">({selectedErrorLines.length})</span></span>
                        </label>
                      </div>

                      {promptScope === 'selected' && <p className="mt-3 text-xs leading-5 text-amber">Check the errors to include in the “Detected errors” section.</p>}

                      {!generatedPrompt && (
                        <button type="button" onClick={handleGeneratePrompt} disabled={isGeneratingPrompt || (promptScope === 'selected' && selectedErrorLines.length === 0)} className="mt-6 w-full rounded-xl bg-mint px-4 py-3 text-xs font-bold text-ink transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50">
                          {isGeneratingPrompt ? 'Generating with Groq…' : 'Generate prompt'}
                        </button>
                      )}
                      {promptError && <p className="mt-3 text-xs leading-5 text-danger">{promptError}</p>}
                      {generatedPrompt && (
                        <div className="mt-5">
                        <textarea readOnly value={generatedPrompt} aria-label="Generated resolution prompt" className="min-h-[360px] w-full resize-y rounded-xl border border-line bg-ink p-4 font-mono text-xs leading-6 text-slate-200 outline-none focus:border-mint" />
                          <div className="mt-3 flex flex-wrap gap-3">
                            <button type="button" onClick={copyPrompt} className="rounded-xl bg-mint px-4 py-2.5 text-xs font-bold text-ink transition hover:bg-white">Copy prompt</button>
                            <button type="button" onClick={() => setGeneratedPrompt('')} className="text-xs text-slate-500 hover:text-white">Generate again</button>
                          </div>
                        </div>
                      )}
                    </div>
                  </Panel>
                ) : (
                  <Panel className="border-mint/25 bg-mint/[0.04] p-7">
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-mint/80">Assistant Groq</p>
                    <h2 className="mt-1 text-xl font-semibold text-white">No prompt needed</h2>
                    <p className="mt-3 text-sm leading-6 text-slate-400">The backend has no errors to resolve in this analysis.</p>
                  </Panel>
                )}
              </aside>
            </div>

            <TechnicalDetails report={report} source={source} />
          </>
        )}

        <footer className="py-8 text-center text-xs text-slate-600">AI Detective · One problem, one solution.</footer>
      </div>
    </div>
  )
}

export default App
