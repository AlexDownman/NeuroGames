import { useEffect, useState } from 'react'

type NodeKind = 'agent' | 'service'

const NODES: Array<{ name: string; kind: NodeKind; role: string }> = [
  { name: 'Document Processing', kind: 'service', role: 'Pulls text out of PDF, DOCX and PPTX files.' },
  { name: 'Material Analysis', kind: 'agent', role: 'Finds concepts, key terms and learning objectives.' },
  { name: 'Question Generation', kind: 'agent', role: 'Writes questions, answers and distractors.' },
  { name: 'Content Validation', kind: 'agent', role: 'Checks accuracy, ambiguity and duplicates.' },
  { name: 'Game Generation', kind: 'agent', role: 'Shapes questions into each game mode.' },
  { name: 'Question Bank', kind: 'service', role: 'Stores the questions and publishes the game.' },
]

// One beat of the loop: which node is working, which connector the data
// arrived on (connector i joins node i and i + 1), and what it says.
const STEPS: Array<{ node: number; edge: number | null; reverse?: boolean; message: string; orchestrator: string }> = [
  { node: 0, edge: null, message: 'lecture-04.pdf → 12 pages of text', orchestrator: 'New upload received — starting the pipeline' },
  { node: 1, edge: 0, message: '18 concepts · 6 learning objectives', orchestrator: 'Dispatching Material Analysis' },
  { node: 2, edge: 1, message: 'Drafted 24 questions with distractors', orchestrator: 'Handing concepts to Question Generation' },
  { node: 3, edge: 2, message: '2 questions ambiguous — sending back', orchestrator: 'Validating generated content' },
  { node: 2, edge: 2, reverse: true, message: 'Rewrote the 2 flagged questions', orchestrator: 'Retry: revising flagged questions' },
  { node: 3, edge: 2, message: 'All 24 questions pass ✓', orchestrator: 'Re-validating revised questions' },
  { node: 4, edge: 3, message: 'Quiz Battle sequence ready', orchestrator: 'Building the game' },
  { node: 5, edge: 4, message: 'Saved and published', orchestrator: 'Done — the game is live' },
]

const STEP_MS = 2400

export default function AgentFlow() {
  const [step, setStep] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setStep((current) => (current + 1) % STEPS.length), STEP_MS)
    return () => clearInterval(timer)
  }, [])

  const current = STEPS[step]
  // Furthest node reached so far this run, so the revision loop doesn't
  // un-tick Content Validation.
  const reached = Math.max(...STEPS.slice(0, step + 1).map((s) => s.node))

  return (
    <div className="mt-20">
      <p className="text-center text-sm font-semibold uppercase tracking-widest text-cherry">
        Under the hood
      </p>
      <h3 className="mt-3 text-center text-2xl font-bold tracking-tight md:text-3xl">
        A team of agents, one hand-off at a time.
      </h3>

      <p className="sr-only">
        An AI orchestrator coordinates the pipeline. Document Processing extracts the text, the
        Material Analysis agent finds the concepts, the Question Generation agent writes questions,
        the Content Validation agent checks them and sends unclear ones back for revision, the Game
        Generation agent builds the game, and the Question Bank stores and publishes it.
      </p>

      <div aria-hidden="true" className="mt-10">
        {/* Orchestrator hub */}
        <div className="mx-auto flex max-w-xl flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-ink px-4 py-3 text-porcelain shadow-lg shadow-ink/20 lg:max-w-none">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-baltic-light opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-baltic-light" />
          </span>
          <span className="shrink-0 text-sm font-semibold">AI Orchestrator</span>
          <span className="min-h-[2.5rem] basis-full pl-[1.375rem] text-sm text-porcelain/60 sm:min-h-0 sm:basis-auto sm:pl-0 lg:truncate">
            {current.orchestrator}
          </span>
        </div>

        {/* Pipeline: vertical on small screens, horizontal from lg */}
        <div className="mx-auto mt-6 flex max-w-sm flex-col items-stretch lg:mt-0 lg:max-w-none lg:flex-row">
          {NODES.map((node, index) => {
            const active = current.node === index
            const done = !active && index < reached
            const edge = index - 1
            const edgeActive = current.edge === edge

            return (
              <div key={node.name} className="contents">
                {index > 0 && (
                  <Connector active={edgeActive} reverse={edgeActive && current.reverse} step={step} />
                )}
                <div className="flex flex-col lg:min-w-0 lg:flex-1">
                  {/* Orchestrator link (agents only, lg+) */}
                  <div className="relative hidden h-8 justify-center lg:flex">
                    {node.kind === 'agent' && (
                      <>
                        <span
                          className={`h-full border-l-2 border-dashed transition-colors duration-500 ${
                            active ? 'border-baltic' : 'border-ink/15'
                          }`}
                        />
                        {active && (
                          <span
                            key={step}
                            className="absolute left-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 animate-packet-y rounded-full bg-baltic motion-reduce:invisible"
                          />
                        )}
                      </>
                    )}
                  </div>

                  <NodeCard
                    name={node.name}
                    kind={node.kind}
                    text={active ? current.message : node.role}
                    active={active}
                    done={done}
                    revising={active && current.reverse === true}
                  />
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function NodeCard({
  name,
  kind,
  text,
  active,
  done,
  revising,
}: {
  name: string
  kind: NodeKind
  text: string
  active: boolean
  done: boolean
  revising: boolean
}) {
  const accent = revising ? 'border-cherry bg-cherry/5 shadow-cherry/20' : 'border-baltic bg-baltic/5 shadow-baltic/20'

  return (
    <div
      className={`flex h-full flex-col rounded-xl border-2 p-3 transition-all duration-500 ${
        kind === 'service' ? 'border-dashed' : ''
      } ${active ? `${accent} shadow-lg lg:-translate-y-1` : 'border-ink/10 bg-white'}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={`text-[10px] font-semibold uppercase tracking-wider ${
            kind === 'agent' ? 'text-baltic' : 'text-ink/40'
          }`}
        >
          {kind === 'agent' ? 'AI agent' : 'Service'}
        </span>
        {done && <span className="text-xs font-bold text-baltic">✓</span>}
      </div>
      <p className="mt-1 text-sm font-semibold leading-tight">{name}</p>
      <p
        className={`mt-1.5 text-xs lg:min-h-[4.25rem] leading-snug transition-colors duration-500 ${
          active ? (revising ? 'font-medium text-cherry' : 'font-medium text-baltic') : 'text-ink/55'
        }`}
      >
        {text}
      </p>
    </div>
  )
}

function Connector({ active, reverse, step }: { active: boolean; reverse?: boolean; step: number }) {
  const color = reverse ? 'bg-cherry' : 'bg-baltic'
  const direction = reverse ? '[animation-direction:reverse]' : ''

  return (
    <div className="flex justify-center lg:flex-col lg:justify-start">
      {/* spacer matching the orchestrator-link row above the cards */}
      <div className="hidden h-8 lg:block" />
      <div className="relative flex h-8 w-full items-center justify-center lg:h-auto lg:w-8 lg:flex-1 xl:w-12">
        <span
          className={`h-full w-0.5 transition-colors duration-500 lg:h-0.5 lg:w-full ${
            active ? (reverse ? 'bg-cherry/50' : 'bg-baltic/50') : 'bg-ink/15'
          }`}
        />
        {active && (
          <>
            <span
              key={`y-${step}`}
              className={`absolute left-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 animate-packet-y rounded-full lg:hidden ${color} ${direction} motion-reduce:invisible`}
            />
            <span
              key={`x-${step}`}
              className={`absolute top-1/2 hidden h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 animate-packet-x rounded-full lg:block ${color} ${direction} motion-reduce:invisible`}
            />
          </>
        )}
      </div>
    </div>
  )
}
