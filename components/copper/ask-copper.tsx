"use client";

// Module 2: the Ask Copper chat panel. It calls the askCopper Server Action
// and draws each answer as a line of stations on a rail: the tools Copper can
// use, what it was thinking, each tool call (what it sent and what came
// back), and the reply. The design is in specs/module-2/spec.md section 5.
import {
  ArrowUpIcon,
  BrainIcon,
  MessageCircleIcon,
  SparklesIcon,
  TriangleAlertIcon,
  WrenchIcon,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { SetupRequired } from "@/components/setup-required";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import { askCopper, type ChatMessage } from "@/lib/copper/assistant/ask";
import {
  TOOL_LABELS,
  toolCallsOf,
  type Progress,
  type ToolStep,
} from "@/lib/copper/assistant/progress";
import { formatUsd } from "@/lib/copper/catalog";
import { readLive } from "@/lib/ai/live";
import { cn } from "@/lib/utils";

const STARTERS = [
  "How much is Copper Home with Copper Plus, paid yearly, for 2 years?",
  "Is Copper Notes in Night Sky in stock?",
  "Is Copper Plus cheaper monthly or yearly?",
];

const SORRY: Progress = {
  steps: [],
  reply: "Sorry, something went wrong. Please try again.",
  status: "error",
};

type Turn = { question: string; progress: Progress | null };
type Chats = { on: Turn[]; off: Turn[] };

const isWorking = (turn: Turn | undefined) =>
  Boolean(turn) && (!turn!.progress || turn!.progress.status === "working");

/** The conversation so far, as the model gets it: questions and finished replies. */
function messagesOf(turns: Turn[], question: string): ChatMessage[] {
  const messages: ChatMessage[] = [];
  for (const turn of turns) {
    messages.push({ role: "user", content: turn.question });
    if (turn.progress?.reply) {
      messages.push({ role: "assistant", content: turn.progress.reply });
    }
  }
  messages.push({ role: "user", content: question });
  return messages;
}

export function AskCopper({ aiConfigured }: { aiConfigured: boolean }) {
  const [open, setOpen] = useState(false);
  const [useTools, setUseTools] = useState(true);
  const [chats, setChats] = useState<Chats>({ on: [], off: [] });
  const [draft, setDraft] = useState("");
  const bodyRef = useRef<HTMLDivElement>(null);

  const mode = useTools ? "on" : "off";
  const turns = chats[mode];
  const busy = isWorking(turns.at(-1));

  // Open from the header link, or when the site loads at /#ask. The link is
  // watched by click too: once the address ends in #ask, a second click fires
  // no hashchange.
  useEffect(() => {
    const openIfAsked = () => {
      if (window.location.hash === "#ask") setOpen(true);
    };
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest?.('a[href$="#ask"]')) setOpen(true);
    };
    const timer = window.setTimeout(openIfAsked, 0);
    window.addEventListener("hashchange", openIfAsked);
    document.addEventListener("click", onClick);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("hashchange", openIfAsked);
      document.removeEventListener("click", onClick);
    };
  }, []);

  // Keep the newest step in view.
  useEffect(() => {
    const body = bodyRef.current;
    if (body) body.scrollTop = body.scrollHeight;
  }, [chats, mode, open]);

  async function send(question: string) {
    const text = question.trim();
    if (!text || busy) return;
    const key = mode;
    const history = chats[key];
    const index = history.length;
    const setProgress = (progress: Progress | null) =>
      setChats((current) => ({
        ...current,
        [key]: current[key].map((turn, i) =>
          i === index ? { ...turn, progress } : turn,
        ),
      }));

    setChats((current) => ({
      ...current,
      [key]: [...current[key], { question: text, progress: null }],
    }));
    setDraft("");
    try {
      const { progress } = await askCopper({
        messages: messagesOf(history, text),
        useTools: key === "on",
      });
      for await (const update of readLive(progress)) setProgress(update);
    } catch {
      setProgress(SORRY);
    }
  }

  return (
    <>
      <Button
        data-testid="ask-copper-launcher"
        onClick={() => setOpen(true)}
        className="fixed right-4 bottom-4 z-40 h-12 rounded-full px-5 shadow-lg"
      >
        <MessageCircleIcon />
        Ask Copper
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          data-testid="ask-copper"
          showCloseButton
          className="w-full gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        >
          <header className="bg-chart-5 text-secondary">
            <div className="flex items-center gap-3 px-4 pt-4 pr-14">
              <span className="bg-primary flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full">
                <Image
                  src="/assets/brand/copper-mascot.png"
                  alt="Copper, the Copper State Labs mascot"
                  width={40}
                  height={40}
                  className="size-10 object-cover"
                />
              </span>
              <div>
                <SheetTitle className="text-secondary text-base">
                  Ask Copper
                </SheetTitle>
                <SheetDescription className="text-secondary/80 text-xs">
                  Prices, totals and stock, checked with tools.
                </SheetDescription>
              </div>
            </div>
            <div className="mt-3 flex items-center justify-between bg-white/10 px-4 py-2">
              <div>
                <div className="text-sm font-medium">Use tools</div>
                <div className="text-secondary/80 text-xs">
                  {useTools ? "Checks every answer" : "Model guesses alone"}
                </div>
              </div>
              <Switch
                aria-label="Use tools"
                checked={useTools}
                onCheckedChange={setUseTools}
              />
            </div>
          </header>

          {aiConfigured ? (
            <>
              <div
                ref={bodyRef}
                className="bg-secondary flex-1 space-y-4 overflow-y-auto p-4"
              >
                {turns.length === 0 && (
                  <p className="text-muted-foreground text-sm">
                    Ask me about Copper products, colors, prices and stock.
                  </p>
                )}
                {turns.map((turn, i) => (
                  <div key={i} className="space-y-3">
                    <div className="bg-primary text-primary-foreground ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-sm px-3 py-2 text-sm">
                      {turn.question}
                    </div>
                    <Answer progress={turn.progress} useTools={mode === "on"} />
                  </div>
                ))}
                {!busy && (
                  <div className="flex flex-col items-start gap-2 pt-1">
                    {STARTERS.map((starter) => (
                      <button
                        key={starter}
                        type="button"
                        onClick={() => void send(starter)}
                        className="bg-background hover:border-primary rounded-full border px-3 py-1.5 text-left text-sm transition-colors"
                      >
                        {starter}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void send(draft);
                }}
                className="bg-background flex items-center gap-2 border-t p-3"
              >
                <input
                  aria-label="Your question"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  placeholder="Ask about a price or stock…"
                  className="border-input focus-visible:ring-ring flex-1 rounded-full border px-4 py-2 text-sm outline-none focus-visible:ring-2"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={busy}
                  aria-label="Send"
                  className="rounded-full"
                >
                  <ArrowUpIcon />
                </Button>
              </form>
            </>
          ) : (
            <div className="bg-secondary flex-1 overflow-y-auto p-4">
              <SetupRequired service="ai" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}

/** One answer: stations hanging off a rail, then the reply. */
function Answer({
  progress,
  useTools,
}: {
  progress: Progress | null;
  useTools: boolean;
}) {
  const steps = progress?.steps ?? [];
  const reply = progress?.reply ?? "";
  const working = !progress || progress.status === "working";
  const used = new Set(
    progress ? toolCallsOf(progress).map((c) => c.name) : [],
  );

  let now = "Reading your question…";
  if (reply) now = "Writing the answer…";
  else if (steps.length > 0) now = "Deciding what to do next…";
  else if (!useTools) now = "Answering from memory…";
  if (!reply && !useTools && steps.length > 0) now = "Answering from memory…";

  return (
    <div>
      <ol className="relative ml-3 space-y-4 pl-6">
        <div
          aria-hidden
          className={cn(
            "absolute top-2 bottom-2 left-0 w-0.5 -translate-x-1/2",
            useTools
              ? "bg-linear-to-b from-primary via-accent to-accent"
              : "bg-chart-3",
          )}
        />
        <Station
          node={<SparklesIcon className="size-3" />}
          color={useTools ? "bg-primary" : "bg-chart-3"}
          label={
            useTools ? "Tools Copper can use" : "Tools given to Copper: none"
          }
        >
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.keys(TOOL_LABELS).map((name) => (
              <span
                key={name}
                className={cn(
                  "rounded-full px-2 py-0.5 font-mono text-xs",
                  !useTools && "line-through",
                  useTools && used.has(name)
                    ? "bg-accent text-accent-foreground font-bold"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {name}
              </span>
            ))}
          </div>
          {!useTools && (
            <p className="text-muted-foreground mt-1 text-xs">
              Copper has to answer from memory alone.
            </p>
          )}
        </Station>

        {steps.map((step, i) => {
          if (step.type === "thinking") {
            return (
              <Station
                key={i}
                node={<BrainIcon className="size-3" />}
                color={useTools ? "bg-primary" : "bg-chart-3"}
                label="Copper is thinking"
              >
                <div
                  data-testid="thinking"
                  className="text-muted-foreground mt-1 border-l-2 pl-3 text-sm italic"
                >
                  <Markdown text={step.text} />
                </div>
              </Station>
            );
          }
          const toolNumber =
            steps.slice(0, i).filter((s) => s.type === "tool").length + 1;
          return (
            <Station
              key={step.id}
              node={<WrenchIcon className="size-3" />}
              color="bg-accent"
              label={
                step.state === "calling"
                  ? "Copper is calling a tool"
                  : "Copper called a tool"
              }
            >
              <ToolCard step={step} number={toolNumber} />
            </Station>
          );
        })}

        {working && (
          <li className="relative flex items-center gap-2">
            <span className="bg-primary absolute top-1/2 -left-6 flex size-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center gap-0.5 rounded-full ring-4 ring-secondary">
              {[0, 1, 2].map((dot) => (
                <span
                  key={dot}
                  className="bg-primary-foreground size-1 animate-bounce rounded-full"
                  style={{ animationDelay: `${dot * 120}ms` }}
                />
              ))}
            </span>
            <span className="text-muted-foreground text-sm">{now}</span>
          </li>
        )}
      </ol>

      {reply && (
        <div className="bg-background mt-3 rounded-2xl rounded-tl-sm border p-3 text-sm">
          <div className="text-primary mb-1 text-xs font-semibold">Copper</div>
          {!useTools && (
            <div className="border-chart-3 mb-2 rounded-md border p-2 text-xs">
              <p className="flex items-center gap-1 font-semibold">
                <TriangleAlertIcon className="text-chart-3 size-3.5" />
                Answered without tools: may be made up
              </p>
              <p className="text-muted-foreground mt-1">
                With tools off, Copper can&apos;t see today&apos;s prices or
                stock. The AI only has what it learned in training, so it fills
                the gaps with guesses that sound right. That&apos;s a
                hallucination.
              </p>
            </div>
          )}
          <p className="whitespace-pre-wrap">
            {reply}
            {working && (
              <span className="bg-primary ml-0.5 inline-block h-4 w-0.5 animate-pulse align-middle" />
            )}
          </p>
        </div>
      )}
    </div>
  );
}

function Station({
  node,
  color,
  label,
  children,
}: {
  node: ReactNode;
  color: string;
  label: string;
  children?: ReactNode;
}) {
  return (
    <li className="relative">
      <span
        className={cn(
          "text-primary-foreground absolute top-0 -left-6 flex size-6 -translate-x-1/2 items-center justify-center rounded-full ring-4 ring-secondary",
          color,
        )}
      >
        {node}
      </span>
      <div className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
        {label}
      </div>
      {children}
    </li>
  );
}

/** Renders the **bold** and `code` marks in a thinking summary. */
function Markdown({ text }: { text: string }) {
  return (
    <span className="whitespace-pre-wrap">
      {text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
          <strong key={i}>{part.slice(2, -2)}</strong>
        ) : part.startsWith("`") && part.endsWith("`") && part.length > 2 ? (
          <code key={i} className="font-mono">
            {part.slice(1, -1)}
          </code>
        ) : (
          part
        ),
      )}
    </span>
  );
}

const PRODUCT_NAMES: Record<string, string> = {
  "copper-home": "Copper Home",
  "copper-notes": "Copper Notes",
};
const PLAN_NAMES: Record<string, string> = {
  free: "Free",
  "copper-plus": "Copper Plus",
};

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};
const asList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

function ToolCard({ step, number }: { step: ToolStep; number: number }) {
  const running = step.state === "calling";
  return (
    <div
      data-testid="tool-call"
      data-tool={step.name}
      className="bg-background mt-1 overflow-hidden rounded-lg border text-sm"
    >
      <div className="bg-accent text-accent-foreground flex items-center gap-2 px-3 py-1.5">
        <span className="font-mono font-bold">{step.name}()</span>
        <span className="rounded bg-white/25 px-1.5 text-xs">
          tool {number}
        </span>
        <span className="ml-auto text-xs">{TOOL_LABELS[step.name] ?? ""}</span>
      </div>
      <div className="space-y-1 p-3">
        <div className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
          → What Copper sent
        </div>
        {step.input === undefined ? (
          <p className="text-muted-foreground italic">
            {running ? "filling in the details…" : "Nothing"}
          </p>
        ) : (
          <SentList step={step} />
        )}
      </div>
      <div className="bg-accent/10 space-y-1 border-t p-3">
        <div className="text-muted-foreground text-[11px] font-semibold tracking-widest uppercase">
          ← What came back
        </div>
        {running ? (
          <p className="text-muted-foreground flex items-center gap-2 italic">
            <Spinner className="size-3" />
            the app is running the code…
          </p>
        ) : step.state === "error" ? (
          <p>{String(step.output)}</p>
        ) : (
          <CameBack step={step} />
        )}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="text-muted-foreground w-20 shrink-0">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function SentList({ step }: { step: ToolStep }) {
  const input = asRecord(step.input);
  if (step.name === "get_prices") {
    return <p>Nothing, it just asked for the price list</p>;
  }
  if (step.name === "get_products") {
    return <p>Nothing, it just asked what Copper sells</p>;
  }
  if (step.name === "calculate_cost") {
    const products = asList(input.products).map(
      (id) => PRODUCT_NAMES[String(id)] ?? String(id),
    );
    return (
      <>
        <Row
          label="Products"
          value={products.length ? products.join(", ") : "None"}
        />
        <Row
          label="Plan"
          value={PLAN_NAMES[String(input.plan)] ?? String(input.plan)}
        />
        <Row label="Billing" value={String(input.billing)} />
        <Row label="Years" value={String(input.years)} />
      </>
    );
  }
  return (
    <>
      <Row
        label="Product"
        value={PRODUCT_NAMES[String(input.product)] ?? String(input.product)}
      />
      <Row
        label="Color"
        value={input.color ? String(input.color) : "Every color"}
      />
    </>
  );
}

function Pill({
  className,
  children,
}: {
  className: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn("rounded-full px-2 py-0.5 text-xs font-medium", className)}
    >
      {children}
    </span>
  );
}

function formatDate(date: string) {
  const parsed = new Date(`${date}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? date
    : parsed.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
}

function CameBack({ step }: { step: ToolStep }) {
  const output = asRecord(step.output);

  if (step.name === "calculate_cost") {
    return (
      <div className="space-y-1">
        {asList(output.lines).map((line, i) => {
          const { item, usd } = asRecord(line);
          return (
            <div key={i} className="flex justify-between gap-3">
              <span>{String(item)}</span>
              <span>{formatUsd(Number(usd))}</span>
            </div>
          );
        })}
        <div className="text-primary flex items-baseline justify-between border-t pt-1 text-lg font-bold">
          <span>Total</span>
          <span>{formatUsd(Number(output.totalUsd))}</span>
        </div>
      </div>
    );
  }

  if (step.name === "get_products") {
    return (
      <div className="space-y-2">
        {asList(output.products).map((item, i) => {
          const product = asRecord(item);
          return (
            <div key={i}>
              <div className="flex justify-between gap-3 font-medium">
                <span>{String(product.name)}</span>
                <span>{formatUsd(Number(product.priceUsd))}</span>
              </div>
              <div className="text-muted-foreground text-xs">
                {String(product.type)}
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                {asList(product.colors).map((color) => (
                  <Pill
                    key={String(color)}
                    className="bg-accent text-accent-foreground"
                  >
                    {String(color)}
                  </Pill>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (step.name === "get_prices") {
    return (
      <div className="space-y-1">
        {asList(output.products).map((item, i) => {
          const product = asRecord(item);
          return (
            <div key={i} className="flex justify-between gap-3">
              <span>{String(product.name)}</span>
              <span>{formatUsd(Number(product.priceUsd))}</span>
            </div>
          );
        })}
        {asList(output.plans)
          .map(asRecord)
          .filter((plan) => Number(plan.monthlyUsd) > 0)
          .map((plan, i) => (
            <div key={i} className="flex justify-between gap-3">
              <span>{String(plan.name)}</span>
              <span>
                {formatUsd(Number(plan.monthlyUsd))}/mo ·{" "}
                {formatUsd(Number(plan.annualUsd))}/yr
              </span>
            </div>
          ))}
      </div>
    );
  }

  if (step.name === "check_availability") {
    if (output.status === "not_a_color") {
      return (
        <p>
          {String(output.product)} doesn&apos;t come in {String(output.color)}.
          It comes in {asList(output.colors).map(String).join(", ")}.
        </p>
      );
    }
    if (output.status === "unavailable") return <p>{String(output.message)}</p>;
    return (
      <div className="space-y-1">
        {asList(output.colors).map((item, i) => {
          const { color, stock, restockDate } = asRecord(item);
          return (
            <div key={i} className="flex items-center justify-between gap-3">
              <span>{String(color)}</span>
              {stock === "in_stock" ? (
                <Pill className="bg-accent text-accent-foreground">
                  In stock
                </Pill>
              ) : stock === "low_stock" ? (
                <Pill className="bg-chart-4 text-chart-5">Low stock</Pill>
              ) : (
                <Pill className="bg-chart-3 text-chart-5">
                  Back-ordered
                  {restockDate
                    ? ` until ${formatDate(String(restockDate))}`
                    : ""}
                </Pill>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return <p>{JSON.stringify(step.output)}</p>;
}
