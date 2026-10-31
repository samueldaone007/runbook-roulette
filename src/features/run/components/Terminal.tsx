import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import { complete } from "../../../engine/shell";
import type { LineKind } from "../../../engine/types";
import { formatPrompt } from "../prompt";
import type { ActiveRun } from "../types";

function kindClass(kind: LineKind): string {
  switch (kind) {
    case "cmd":
      return "term-cmd";
    case "err":
      return "term-err";
    case "sys":
      return "term-sys";
    case "ok":
      return "term-ok";
    default:
      return "term-out";
  }
}

interface TerminalProps {
  run: ActiveRun;
  onCommand: (command: string) => void;
  onClear: () => void;
}

/**
 * The terminal surface.
 *
 * All the intelligence lives in `engine/shell.ts`; this component only owns the
 * input line, history recall, tab completion and the scroll position.
 */
export function Terminal({ run, onCommand, onClear }: TerminalProps) {
  const [input, setInput] = useState("");
  const [cursor, setCursor] = useState<number | null>(null);
  const [completions, setCompletions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const completionRef = useRef<HTMLDivElement>(null);

  const prompt = formatPrompt(run.scenario, run.world);

  /* A new incident gets a clean input line. The page heading takes focus on
     route changes, so the pager alert is heard before the terminal. */
  useEffect(() => {
    setInput("");
    setCursor(null);
    setCompletions([]);
  }, [run.scenario.id]);

  /* Keep the newest output in view, without yanking the page. */
  useEffect(() => {
    const element = scrollRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [run.lines.length]);

  const submitLine = () => {
    if (!input.trim()) return;
    onCommand(input);
    setInput("");
    setCursor(null);
    setCompletions([]);
    inputRef.current?.focus({ preventScroll: true });
  };

  const applyCompletion = (option: string) => {
    const parts = input.split(" ");
    parts[parts.length - 1] = option;
    setInput(`${parts.join(" ")} `);
    setCompletions([]);
    inputRef.current?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      submitLine();
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!run.entries.length) return;
      const next = cursor === null ? run.entries.length - 1 : Math.max(0, cursor - 1);
      setCursor(next);
      setInput(run.entries[next]?.command ?? "");
      setCompletions([]);
      return;
    }

    if (event.key === "ArrowDown") {
      // ArrowDown normally walks history; while the suggestions are open it
      // walks into them instead.
      if (completions.length > 0) {
        event.preventDefault();
        completionRef.current?.querySelector("button")?.focus();
        return;
      }
      event.preventDefault();
      if (cursor === null) return;
      const next = cursor + 1;
      if (next >= run.entries.length) {
        setCursor(null);
        setInput("");
      } else {
        setCursor(next);
        setInput(run.entries[next]?.command ?? "");
      }
      setCompletions([]);
      return;
    }

    if (event.key === "Tab") {
      // Tab is command completion only while there is something to complete.
      // Once the suggestions are on screen a second Tab hands focus to them,
      // so they are reachable without a mouse. An empty input keeps normal
      // focus movement and Shift+Tab always escapes: no keyboard trap.
      if (event.shiftKey || !input.trim() || completions.length > 0) return;
      event.preventDefault();
      const result = complete(run.scenario, run.world, input);
      if (result.options.length === 1) {
        setInput(result.value);
        setCompletions([]);
      } else {
        setCompletions(result.options.slice(0, 10));
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setCompletions([]);
      inputRef.current?.blur();
      return;
    }
  };

  /* Escape inside the suggestion row returns to the input rather than the top
     of the page, so a keyboard user is never stranded in the terminal footer. */
  const onCompletionKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "Escape") return;
    event.preventDefault();
    setCompletions([]);
    inputRef.current?.focus();
  };

  const focusInput = () => {
    // Do not steal focus while the user is selecting text to copy.
    if (window.getSelection()?.toString()) return;
    inputRef.current?.focus();
  };

  return (
    <section className="terminal min-w-0" aria-label={`${run.scenario.hostname} simulated terminal`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-[#3a3844] px-3 py-2">
        <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-term-dim">
          <span className="h-2 w-2 animate-blink rounded-full bg-alert" aria-hidden="true" />
          <span className="text-term">
            {run.scenario.user}@{run.scenario.hostname}
          </span>
          <span className="hidden sm:inline">/ simulated tty</span>
        </div>
        <button type="button" className="btn btn-sm btn-ghost" onClick={onClear}>
          Clear
        </button>
      </div>

      <div
        ref={scrollRef}
        className="terminal-body h-[380px] overflow-y-auto px-4 py-3 md:h-[440px]"
        onClick={focusInput}
        role="log"
        aria-live="polite"
        aria-label="Terminal output"
        tabIndex={0}
      >
        {run.lines.map((line, index) => (
          <p
            key={index}
            className={`whitespace-pre-wrap break-words ${kindClass(line.kind)}`}
          >
            {line.text || "\u00a0"}
          </p>
        ))}
      </div>

      <div className="border-t-2 border-[#3a3844] px-4 py-3">
        <div className="flex items-start gap-2">
          <span className="term-cmd shrink-0 font-mono text-[12.5px]">{prompt}</span>
          <input
            ref={inputRef}
            value={input}
            onChange={(event) => {
              setInput(event.target.value);
              setCompletions([]);
            }}
            onKeyDown={onKeyDown}
            className="terminal-input"
            aria-label="Terminal command input"
            aria-describedby="terminal-help"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="type a command"
          />
        </div>

        {completions.length > 0 ? (
          <div
            ref={completionRef}
            className="mt-2 flex flex-wrap items-center gap-1.5"
            role="group"
            aria-label="Command completions"
          >
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-term-dim">
              tab:
            </span>
            {completions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  applyCompletion(option);
                }}
                onKeyDown={onCompletionKeyDown}
                className="border border-[#4a4756] px-1.5 py-1 font-mono text-[11px] text-term transition-colors hover:border-amber hover:text-amber"
              >
                {option}
              </button>
            ))}
            <span className="sr-only" role="status">
              {completions.length} command completions. Press Tab to reach them, Escape to close.
            </span>
          </div>
        ) : null}

        <p
          id="terminal-help"
          className="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-term-dim"
        >
          Tab completes · Esc leaves · ↑↓ history · fixes change the simulation
        </p>
      </div>
    </section>
  );
}
