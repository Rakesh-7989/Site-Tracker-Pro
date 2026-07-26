import { useMemo } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { Icon } from "./icons";

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

function eventsForDay(events: CalendarEvent[], day: number, year: number, month: number): CalendarEvent[] {
  return events.filter(e => {
    const d = e.date;
    return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
  });
}

export function CalendarGrid({ year, month, events = [], className }: CalendarGridProps): JSX.Element {
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

  return (
    <div className={cn("bg-white rounded-2xl border border-cream-200 overflow-hidden", className)}>
      <div className="grid grid-cols-7">
        {DAY_LABELS.map(d => (
          <div key={d} className="px-1.5 py-2 text-center text-[10px] font-bold uppercase tracking-wider text-ink-400 border-b border-cream-200">
            {d}
          </div>
        ))}
      </div>
      {grid.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-t border-cream-200 first:border-t-0">
          {week.map((cell, ci) => {
            if (!cell) return <div key={ci} className="min-h-[80px] bg-cream-100/40" />;
            const dayEvents = eventsForDay(events, cell.day, year, month);
            return (
              <div
                key={ci}
                className={cn(
                  "min-h-[80px] p-1.5 border-r border-cream-200 last:border-r-0",
                  "hover:bg-cream-100/60 transition-colors",
                )}
              >
                <span className={cn(
                  "inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-medium",
                  cell.isCurrent ? "bg-safety-500 text-white" : "text-ink-700",
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
                        ev.color ? "" : "bg-safety-500/10 text-safety-600",
                      )}
                      style={ev.color ? { backgroundColor: ev.color + "20", color: ev.color } : undefined}
                      title={ev.label}
                    >
                      {ev.label}
                    </button>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="block text-[10px] text-ink-400 px-1">
                      +{dayEvents.length - 2} more
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ))}
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
      <button onClick={onPrev} className="p-1.5 rounded-lg hover:bg-cream-200 text-ink-600 transition-colors">
        <Icon name="arrow" size={16} />
      </button>
      <h3 className="font-display font-semibold text-ink-800 text-base">
        {MONTH_LABELS[month]} {year}
      </h3>
      <button onClick={onNext} className="p-1.5 rounded-lg hover:bg-cream-200 text-ink-600 transition-colors rotate-180">
        <Icon name="arrow" size={16} />
      </button>
    </div>
  );
}
