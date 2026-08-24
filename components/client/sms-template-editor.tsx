"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import {
  formatSmsPlaceholder,
  isValidSmsPlaceholderKey,
  SMS_PLACEHOLDERS,
  type SmsPlaceholder,
} from "@/lib/sms/placeholders";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

type SmsTemplateEditorProps = {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  insertLabel?: string;
  required?: boolean;
  id?: string;
};

type TokenMatch = {
  start: number;
  end: number;
  key: string;
  valid: boolean;
};

type OpenToken = {
  start: number;
  query: string;
};

function findTokens(text: string): TokenMatch[] {
  const matches: TokenMatch[] = [];
  const re = /\{\{\s*([a-z_]*)\s*\}\}/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const key = (m[1] ?? "").toLowerCase();
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      key,
      valid: isValidSmsPlaceholderKey(key),
    });
  }
  return matches;
}

function findOpenToken(text: string, cursor: number): OpenToken | null {
  const before = text.slice(0, cursor);
  const match = before.match(/\{\{\s*([a-z_]*)$/i);
  if (!match || match.index === undefined) return null;
  // Ignore if already closed between match and cursor (shouldn't happen with $)
  return {
    start: match.index,
    query: (match[1] ?? "").toLowerCase(),
  };
}

function HighlightedMirror({ value }: { value: string }) {
  const tokens = findTokens(value);
  if (!value) return <br />;

  const parts: ReactNode[] = [];
  let cursor = 0;
  tokens.forEach((token, i) => {
    if (token.start > cursor) {
      parts.push(<span key={`t-${i}`}>{value.slice(cursor, token.start)}</span>);
    }
    parts.push(
      <span
        key={`p-${i}`}
        className={cn(
          token.valid ? "rounded-sm bg-blue-500/15 font-medium text-blue-600 dark:text-blue-400" : "text-foreground"
        )}
      >
        {value.slice(token.start, token.end)}
      </span>
    );
    cursor = token.end;
  });
  if (cursor < value.length) {
    parts.push(<span key="tail">{value.slice(cursor)}</span>);
  }
  // Trailing newline needs a break so heights match textarea
  if (value.endsWith("\n")) {
    parts.push(<br key="nl" />);
  }
  return <>{parts}</>;
}

export function SmsTemplateEditor({
  value,
  onChange,
  rows = 4,
  disabled,
  placeholder,
  className,
  insertLabel = "Insert placeholder",
  required,
  id,
}: SmsTemplateEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const [cursor, setCursor] = useState(0);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);

  const openToken = useMemo(() => findOpenToken(value, cursor), [value, cursor]);

  const filtered = useMemo(() => {
    if (!openToken) return [] as SmsPlaceholder[];
    const q = openToken.query;
    if (!q) return SMS_PLACEHOLDERS;
    return SMS_PLACEHOLDERS.filter((p) => p.key.startsWith(q));
  }, [openToken]);

  useEffect(() => {
    if (openToken && filtered.length > 0 && !disabled) {
      setSuggestOpen(true);
      setActiveIndex(0);
    } else {
      setSuggestOpen(false);
    }
  }, [openToken, filtered.length, disabled]);

  const syncScroll = useCallback(() => {
    const ta = textareaRef.current;
    const mirror = mirrorRef.current;
    if (!ta || !mirror) return;
    mirror.scrollTop = ta.scrollTop;
    mirror.scrollLeft = ta.scrollLeft;
  }, []);

  useLayoutEffect(() => {
    syncScroll();
  }, [value, syncScroll]);

  function updateCursorFromTextarea() {
    const ta = textareaRef.current;
    if (!ta) return;
    setCursor(ta.selectionStart);
  }

  function insertAtCursor(token: string, replaceFrom?: number) {
    const ta = textareaRef.current;
    const start = replaceFrom ?? ta?.selectionStart ?? value.length;
    const end = ta?.selectionEnd ?? start;
    const next = `${value.slice(0, start)}${token}${value.slice(end)}`;
    onChange(next);
    const nextCursor = start + token.length;
    requestAnimationFrame(() => {
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(nextCursor, nextCursor);
      setCursor(nextCursor);
    });
  }

  function insertPlaceholder(key: string) {
    const token = formatSmsPlaceholder(key);
    if (openToken) {
      insertAtCursor(token, openToken.start);
      setSuggestOpen(false);
      return;
    }
    insertAtCursor(token);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!suggestOpen || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % filtered.length);
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      const pick = filtered[activeIndex];
      if (pick) insertPlaceholder(pick.key);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      setSuggestOpen(false);
    }
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={disabled}>
              {insertLabel}
              <ChevronDown className="ml-1 size-3.5 opacity-70" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">
              Available placeholders
            </DropdownMenuLabel>
            {SMS_PLACEHOLDERS.map((p) => (
              <DropdownMenuItem
                key={p.key}
                onSelect={(e) => {
                  e.preventDefault();
                  insertPlaceholder(p.key);
                }}
              >
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  {formatSmsPlaceholder(p.key)}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{p.label}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Popover open={suggestOpen} onOpenChange={setSuggestOpen}>
        <PopoverAnchor asChild>
          <div className="relative">
            <div
              ref={mirrorRef}
              aria-hidden
              className={cn(
                "pointer-events-none absolute inset-0 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-transparent px-2.5 py-2 text-base md:text-sm",
                "text-foreground"
              )}
              style={{ minHeight: `${rows * 1.5}rem` }}
            >
              <HighlightedMirror value={value} />
            </div>
            <textarea
              id={id}
              ref={textareaRef}
              value={value}
              required={required}
              disabled={disabled}
              rows={rows}
              placeholder={placeholder}
              spellCheck={false}
              onScroll={syncScroll}
              onKeyDown={onKeyDown}
              onClick={updateCursorFromTextarea}
              onKeyUp={updateCursorFromTextarea}
              onSelect={updateCursorFromTextarea}
              onChange={(e) => {
                onChange(e.target.value);
                setCursor(e.target.selectionStart);
              }}
              className={cn(
                "relative z-10 field-sizing-content min-h-16 w-full resize-y rounded-lg border border-input bg-transparent px-2.5 py-2 text-base transition-colors outline-none md:text-sm",
                "text-transparent caret-foreground selection:bg-blue-500/30",
                "placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                "disabled:cursor-not-allowed disabled:opacity-50"
              )}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          side="bottom"
          className="w-72 p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          {filtered.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-muted-foreground">No matching placeholders</p>
          ) : (
            filtered.map((p, i) => (
              <button
                key={p.key}
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                  i === activeIndex && "bg-accent"
                )}
                onMouseDown={(e) => {
                  e.preventDefault();
                  insertPlaceholder(p.key);
                }}
              >
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  {formatSmsPlaceholder(p.key)}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">{p.label}</span>
              </button>
            ))
          )}
        </PopoverContent>
      </Popover>
    </div>
  );
}
