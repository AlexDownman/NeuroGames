import { useEffect, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  createAnswerRunGame,
  generateQuestions,
  getCollection,
  getMaterialDownloadUrl,
  listGames,
  listMaterials,
  listQuestions,
  startSession,
  updateQuestionApproval,
  uploadMaterial,
  type Collection,
  type Game,
  type LearningMaterial,
  type Question,
} from '../lib/api'

export default function CollectionWorkspacePage() {
  const { collectionId } = useParams<{ collectionId: string }>()

  const [collection, setCollection] = useState<Collection | null>(null)
  const [materials, setMaterials] = useState<LearningMaterial[]>([])
  const [questions, setQuestions] = useState<Question[]>([])
  const [games, setGames] = useState<Game[]>([])
  const [loadError, setLoadError] = useState('')

  function refresh() {
    if (!collectionId) return
    Promise.all([listMaterials(collectionId), listQuestions(collectionId), listGames(collectionId)])
      .then(([materialsRes, questionsRes, gamesRes]) => {
        setMaterials(materialsRes)
        setQuestions(questionsRes)
        setGames(gamesRes)
      })
      .catch((error: Error) => setLoadError(error.message))
  }

  useEffect(() => {
    if (!collectionId) return
    getCollection(collectionId)
      .then(setCollection)
      .catch((error: Error) => setLoadError(error.message))
    refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionId])

  // All hooks above run unconditionally on every render; this guard only
  // affects what gets rendered.
  if (!collectionId) return null

  const approvedQuestions = questions.filter((q) => q.approvalStatus === 'approved')

  return (
    <div className="min-h-screen bg-ink text-porcelain">
      <header className="flex items-center justify-between px-6 py-5 md:px-12">
        <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-baltic text-sm font-extrabold">
            N
          </span>
          NeuroGames
        </Link>
        <Link to="/dashboard" className="text-sm font-medium text-porcelain/60 hover:text-porcelain">
          ← All collections
        </Link>
      </header>

      <main className="mx-auto max-w-3xl px-6 pb-24">
        <h1 className="text-2xl font-bold tracking-tight">{collection?.name ?? 'Loading…'}</h1>
        {collection?.description && <p className="mt-1 text-sm text-porcelain/60">{collection.description}</p>}
        {loadError && <p className="mt-4 text-sm text-cherry-light">{loadError}</p>}

        <MaterialsSection collectionId={collectionId} materials={materials} onUploaded={refresh} />
        <GenerateSection collectionId={collectionId} materials={materials} onGenerated={refresh} />
        <QuestionsSection questions={questions} onChanged={refresh} />
        <GamesSection
          collectionId={collectionId}
          approvedQuestions={approvedQuestions}
          games={games}
          onGameCreated={refresh}
        />
      </main>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-10 border-t border-white/10 pt-8 first:mt-8 first:border-t-0 first:pt-0">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function MaterialsSection({
  collectionId,
  materials,
  onUploaded,
}: {
  collectionId: string
  materials: LearningMaterial[]
  onUploaded: () => void
}) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setUploading(true)
    setError('')
    try {
      await uploadMaterial(collectionId, file)
      onUploaded()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <Section title="Learning materials">
      <label className="flex cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/5 px-4 py-6 text-center text-sm text-porcelain/60 transition hover:border-baltic/60 hover:bg-white/[0.08]">
        {uploading ? 'Uploading…' : 'Click to upload a PDF, PPTX or TXT file'}
        <input type="file" accept=".pdf,.pptx,.txt" className="hidden" disabled={uploading} onChange={handleFileChange} />
      </label>
      {error && <p className="mt-2 text-sm text-cherry-light">{error}</p>}

      {materials.length > 0 && (
        <ul className="mt-4 space-y-2">
          {materials.map((material) => (
            <li
              key={material.id}
              className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm"
            >
              <span className="min-w-0 truncate">{material.filename}</span>
              <span className="flex shrink-0 items-center gap-3">
                {material.fileStored && <OpenMaterialButton collectionId={collectionId} materialId={material.id} />}
                <StatusBadge status={material.extractionStatus} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}

function OpenMaterialButton({ collectionId, materialId }: { collectionId: string; materialId: string }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function open() {
    // Open the tab synchronously (inside the click) so popup blockers allow
    // it, then point it at the signed URL once the backend returns one.
    const tab = window.open('', '_blank')
    setBusy(true)
    setError('')
    try {
      const { url } = await getMaterialDownloadUrl(collectionId, materialId)
      if (tab) {
        tab.opener = null
        tab.location.href = url
      } else {
        window.location.href = url
      }
    } catch (err) {
      tab?.close()
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {error && <span className="text-xs text-cherry-light">{error}</span>}
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="text-xs font-medium text-baltic-light hover:underline disabled:opacity-60"
      >
        {busy ? 'Opening…' : 'Open'}
      </button>
    </>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    completed: 'bg-baltic/20 text-baltic-light',
    pending: 'bg-white/10 text-porcelain/60',
    processing: 'bg-white/10 text-porcelain/60',
    failed: 'bg-cherry/20 text-cherry-light',
    approved: 'bg-baltic/20 text-baltic-light',
    pending_review: 'bg-white/10 text-porcelain/60',
    rejected: 'bg-cherry/20 text-cherry-light',
  }
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] ?? 'bg-white/10 text-porcelain/60'}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function GenerateSection({
  collectionId,
  materials,
  onGenerated,
}: {
  collectionId: string
  materials: LearningMaterial[]
  onGenerated: () => void
}) {
  const completedMaterials = materials.filter((m) => m.extractionStatus === 'completed')
  const [mode, setMode] = useState<'text' | 'material'>('text')
  const [sourceText, setSourceText] = useState('')
  const [materialId, setMaterialId] = useState('')
  const [questionCount, setQuestionCount] = useState(5)
  const [difficulty, setDifficulty] = useState('medium')
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    setGenerating(true)
    setError('')
    try {
      await generateQuestions(collectionId, {
        sourceText: mode === 'text' ? sourceText : undefined,
        sourceMaterialId: mode === 'material' ? materialId : undefined,
        questionCount,
        difficulty,
      })
      setSourceText('')
      onGenerated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <Section title="Generate questions">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMode('text')}
            className={`rounded-lg px-3 py-1.5 ${mode === 'text' ? 'bg-baltic' : 'bg-white/5 text-porcelain/60'}`}
          >
            Paste text
          </button>
          <button
            type="button"
            disabled={completedMaterials.length === 0}
            onClick={() => setMode('material')}
            className={`rounded-lg px-3 py-1.5 disabled:opacity-40 ${mode === 'material' ? 'bg-baltic' : 'bg-white/5 text-porcelain/60'}`}
          >
            From uploaded material
          </button>
        </div>

        {mode === 'text' ? (
          <textarea
            required
            rows={5}
            value={sourceText}
            onChange={(event) => setSourceText(event.target.value)}
            placeholder="Paste a page or two of your lecture notes…"
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition focus:border-baltic"
          />
        ) : (
          <select
            required
            value={materialId}
            onChange={(event) => setMaterialId(event.target.value)}
            className="w-full rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none transition focus:border-baltic"
          >
            <option value="" disabled>
              Choose a material…
            </option>
            {completedMaterials.map((material) => (
              <option key={material.id} value={material.id}>
                {material.filename}
              </option>
            ))}
          </select>
        )}

        <div className="flex gap-3">
          <label className="flex items-center gap-2 text-sm text-porcelain/70">
            Count
            <input
              type="number"
              min={1}
              max={20}
              value={questionCount}
              onChange={(event) => setQuestionCount(Number(event.target.value))}
              className="w-16 rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:border-baltic"
            />
          </label>
          <select
            value={difficulty}
            onChange={(event) => setDifficulty(event.target.value)}
            className="rounded-lg border border-white/10 bg-white/5 px-2 py-1.5 text-sm outline-none focus:border-baltic"
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </div>

        {error && <p className="text-sm text-cherry-light">{error}</p>}

        <button
          type="submit"
          disabled={generating}
          className="rounded-lg bg-cherry px-4 py-2.5 text-sm font-semibold hover:bg-cherry-light disabled:opacity-60"
        >
          {generating ? 'Generating…' : 'Generate questions'}
        </button>
      </form>
    </Section>
  )
}

function QuestionsSection({ questions, onChanged }: { questions: Question[]; onChanged: () => void }) {
  async function review(questionId: string, status: 'approved' | 'rejected') {
    await updateQuestionApproval(questionId, status)
    onChanged()
  }

  if (questions.length === 0) {
    return (
      <Section title="Question bank">
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-porcelain/50">
          No questions yet — generate some above.
        </p>
      </Section>
    )
  }

  return (
    <Section title={`Question bank (${questions.length})`}>
      <ul className="space-y-3">
        {questions.map((question) => (
          <li key={question.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-start justify-between gap-3">
              <p className="font-medium">{question.questionText}</p>
              <StatusBadge status={question.approvalStatus} />
            </div>
            <ul className="mt-2 space-y-1 text-sm text-porcelain/70">
              {question.answerOptions.map((option) => (
                <li key={option.id} className={option.correct ? 'text-baltic-light' : undefined}>
                  {option.correct ? '✓ ' : '· '}
                  {option.text}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-porcelain/50">{question.explanation}</p>

            {question.approvalStatus === 'pending_review' && (
              <div className="mt-3 flex gap-2">
                <button
                  type="button"
                  onClick={() => review(question.id, 'approved')}
                  className="rounded-lg bg-baltic px-3 py-1.5 text-xs font-semibold hover:bg-baltic-light"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => review(question.id, 'rejected')}
                  className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/20"
                >
                  Reject
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function GamesSection({
  collectionId,
  approvedQuestions,
  games,
  onGameCreated,
}: {
  collectionId: string
  approvedQuestions: Question[]
  games: Game[]
  onGameCreated: () => void
}) {
  const [selected, setSelected] = useState<string[]>([])
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const navigate = useNavigate()

  function toggle(questionId: string) {
    setSelected((current) =>
      current.includes(questionId) ? current.filter((id) => id !== questionId) : [...current, questionId],
    )
  }

  async function handleCreate(event: FormEvent) {
    event.preventDefault()
    setCreating(true)
    setError('')
    try {
      await createAnswerRunGame(collectionId, { title, questionIds: selected })
      setTitle('')
      setSelected([])
      onGameCreated()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setCreating(false)
    }
  }

  // Opens the lobby on the host screen; students join with its code.
  async function handleStart(gameId: string) {
    try {
      const session = await startSession(gameId)
      navigate(`/host/${session.id}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <Section title="Answer Run games">
      {approvedQuestions.length === 0 ? (
        <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-porcelain/50">
          Approve some questions above to build a game.
        </p>
      ) : (
        <form onSubmit={handleCreate} className="space-y-3">
          <p className="text-sm text-porcelain/60">
            Pick questions in the order they should appear — earlier questions are worth less, later ones more
            (just like the show).
          </p>
          <ul className="space-y-1.5">
            {approvedQuestions.map((question) => {
              const position = selected.indexOf(question.id)
              return (
                <li key={question.id}>
                  <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                    <input type="checkbox" checked={position !== -1} onChange={() => toggle(question.id)} />
                    {position !== -1 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-cherry text-[11px] font-bold">
                        {position + 1}
                      </span>
                    )}
                    <span className="flex-1">{question.questionText}</span>
                  </label>
                </li>
              )
            })}
          </ul>

          <div className="flex gap-2">
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Game title, e.g. OOP Basics Run"
              className="flex-1 rounded-lg border border-white/10 bg-white/5 px-3.5 py-2.5 text-sm outline-none focus:border-baltic"
            />
            <button
              type="submit"
              disabled={creating || selected.length === 0}
              className="rounded-lg bg-baltic px-4 py-2.5 text-sm font-semibold hover:bg-baltic-light disabled:opacity-60"
            >
              {creating ? 'Creating…' : 'Create game'}
            </button>
          </div>
          {error && <p className="text-sm text-cherry-light">{error}</p>}
        </form>
      )}

      {games.length > 0 && (
        <ul className="mt-6 space-y-2">
          {games.map((game) => (
            <li key={game.id} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <div className="flex items-center justify-between">
                <span className="font-medium">{game.title}</span>
                <span className="text-xs text-porcelain/50">{game.questionCount} questions</span>
              </div>
              <button
                type="button"
                onClick={() => handleStart(game.id)}
                className="mt-3 rounded-lg bg-cherry px-3.5 py-2 text-sm font-semibold hover:bg-cherry-light"
              >
                Host live session
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  )
}
