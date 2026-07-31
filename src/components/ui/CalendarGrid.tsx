import { useMemo } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export interface CalendarEvent {
  date: Date;
  label: string;
  color?: string;
  onClick?: () => void;
}

export interface CalendarGridProps {
  year: number;
  month: number;
  events?: CalendarEvent[];
  renderDay?: (date: Date | null, events: CalendarEvent[]) => ReactNode;
  className?: string;
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_LABELS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

function hexToRgba(color: string | undefined, alpha: number): string | undefined {
  if (!color || !color.startsWith("#") || color.length < 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return color;
  return `rgba(${r},${g},${b},${alpha})`;
}

function eventsForDay(events: CalendarEvent[], day: number, year: number, month: number): CalendarEvent[] {
  return events.filter(e => {
    const d = e.date;
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });
}

export function CalendarGrid({ year, month, events = [], className }: CalendarGridProps): JSX.Element {
  const isMobile = !useMediaQuery("(min-width: 640px)");
  const grid = useMemo(() => {
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const weeks: Array<Array<{ day: number; isCurrent: boolean } | null>> = [];
    let week: Array<{ day: number; isCurrent: boolean } | null> = [];
    for (let i = 0; i < firstDay; i++) week.push(null);
    const today = new Date();
    for (let d = 1; d <= daysInMonth; d++) {
      const isCurrent = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
      week.push({ day: d, isCurrent });
      if (week.length === 7) { weeks.push(week); week = []; }
    }
    if (week.length) { while (week.length < 7) week.push(null); weeks.push(week); }
    return weeks;
  }, [year, month]);

  const sortedEvents = useMemo(() => {
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const map: Array<{ day: number; events: CalendarEvent[] }> = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const evs = eventsForDay(events, d, year, month);
      if (evs.length) map.push({ day: d, events: evs });
    }
    return map;
  }, [events, year, month]);

  const today = new Date();
  const isCurrentMonth = month === today.getMonth() && year === today.getFullYear();

  return (
    <div className={cn("bg-card rounded-2xl border border-default overflow-hidden", className)}>
      {isMobile ? (
        <div className="divide-y divide-default max-h-[400px] overflow-y-auto">
          {sortedEvents.length === 0 ? (
            <div className="p-6 text-center text-sm text-fg-tertiary">No events this month</div>
          ) : sortedEvents.map(({ day, events: evs }) => (
            <div key={day} className="p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className={cn(
                  "inline-flex items-center justify-center w-8 h-8 rounded-full text-sm font-semibold",
                  isCurrentMonth && day === today.getDate() ? "bg-accent text-inverse" : "bg-elevated text-fg-primary",
                )}>
                  {day}
                </span>
                <span className="text-xs text-fg-tertiary font-medium">
                  {DAY_LABELS[new Date(year, month, day).getDay()]}
                </span>
              </div>
              <div className="space-y-1.5 ml-10">
                {evs.map((ev, ei) => (
                  <button
                    key={ei}
                    onClick={ev.onClick}
                    className={cn(
                      "block w-full text-left rounded-lg px-3 py-2 text-sm font-medium leading-snug transition-colors",
                      ev.color ? "" : "bg-accent-tint text-accent-2",
                    )}
                    style={ev.color ? { backgroundColor: hexToRgba(ev.color, 0.12), color: ev.color } : undefined}
                  >
                    {ev.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-7">
            {DAY_LABELS.map(d => (
              <div key={d} className="px-1.5 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-fg-tertiary border-b border-default">
                {d}
              </div>
            ))}
          </div>
          {grid.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 border-t border-default first:border-t-0">
              {week.map((cell, ci) => {
                if (!cell) return <div key={ci} className="min-h-[80px] bg-elevated" />;
                const dayEvents = eventsForDay(events, cell.day, year, month);
                return (
                  <div
                    key={ci}
                    className={cn(
                      "min-h-[80px] p-1.5 border-r border-default last:border-r-0",
                      "hover:bg-elevated transition-colors",
                    )}
                  >
                    <span className={cn(
                      "inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-medium",
                      cell.isCurrent ? "bg-accent text-inverse" : "text-fg-primary",
                    )}>
                      {cell.day}
                    </span>
                    <div className="mt-0.5 space-y-0.5">
                      {dayEvents.slice(0, 2).map((ev, ei) => (
                        <button
                          key={ei}
                          onClick={ev.onClick}
                          className={cn(
                            "block w-full text-left truncate rounded px-1 py-0.5 text-[10px] font-semibold leading-tight",
                            ev.color ? "" : "text-accent-2",
                          )}
                          style={ev.color ? { backgroundColor: hexToRgba(ev.color, 0.12), color: ev.color } : undefined}
                          title={ev.label}
                        >
                          {ev.label}
                        </button>
                      ))}
                      {dayEvents.length > 2 && (
                        <span className="block text-[10px] text-fg-tertiary px-1">
                          +{dayEvents.length - 2} more
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export interface CalendarHeaderProps {
  year: number;
  month: number;
  onPrev: () => void;
  onNext: () => void;
  className?: string;
}

export function CalendarHeader({ year, month, onPrev, onNext, className }: CalendarHeaderProps): JSX.Element {
  return (
    <div className={cn("flex items-center justify-between", className)}>
      <button onClick={onPrev} className="p-1.5 rounded-lg hover:bg-elevated text-fg-secondary transition-colors">
        <Icon name="arrow" size={16} />
      </button>
      <h3 className="font-display font-semibold text-fg-primary text-base">
        {MONTH_LABELS[month]} {year}
      </h3>
      <button onClick={onNext} className="p-1.5 rounded-lg hover:bg-elevated text-fg-secondary transition-colors rotate-180">
        <Icon name="arrow" size={16} />
      </button>
    </div>
  );
}
