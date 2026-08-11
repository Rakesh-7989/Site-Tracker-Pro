import { useCallback, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EmptyState } from "./EmptyState";
import type { IconName } from "./icons";
import { Icon } from "./icons";
import { Skeleton } from "./Skeleton";
import { useMediaQuery } from "@/hooks/useMediaQuery";

export interface BoardColumn {
  id: string;
  title: string;
  color?: string;
  icon?: ReactNode;
}

export interface BoardItem {
  id: string;
  columnId: string;
  content: ReactNode;
}

export interface BoardProps {
  columns: BoardColumn[];
  items: BoardItem[];
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: IconName;
  onItemMove?: (itemId: string, fromColumn: string, toColumn: string) => void;
  className?: string;
}

function MoveControls({
  onItemMove,
  itemId,
  fromColumn,
  columnId,
  columns,
}: {
  onItemMove?: (itemId: string, fromColumn: string, toColumn: string) => void;
  itemId: string;
  fromColumn: string;
  columnId: string;
  columns: BoardColumn[];
}): JSX.Element | null {
  if (!onItemMove) return null;
  const idx = columns.findIndex(c => c.id === columnId);
  const prev = idx > 0 ? columns[idx - 1] : null;
  const next = idx >= 0 && idx < columns.length - 1 ? columns[idx + 1] : null;
  return (
    <div className="flex items-center gap-1 mt-2 pt-2 border-t border-default">
      <button
        type="button"
        disabled={!prev}
        aria-label={prev ? `Move to ${prev.title}` : "Move left"}
        title={prev ? `Move to ${prev.title}` : "Move left"}
        onClick={() => prev && onItemMove(itemId, fromColumn, prev.id)}
        className="p-1 rounded-md hover:bg-elevated text-fg-tertiary hover:text-fg-primary transition disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Icon name="chevron" size={14} className="rotate-180" />
      </button>
      <button
        type="button"
        disabled={!next}
        aria-label={next ? `Move to ${next.title}` : "Move right"}
        title={next ? `Move to ${next.title}` : "Move right"}
        onClick={() => next && onItemMove(itemId, fromColumn, next.id)}
        className="p-1 rounded-md hover:bg-elevated text-fg-tertiary hover:text-fg-primary transition disabled:opacity-30 disabled:cursor-not-allowed"
      >
        <Icon name="chevron" size={14} />
      </button>
    </div>
  );
}

export function Board({
  columns,
  items,
  loading = false,
  emptyMessage,
  emptyIcon,
  onItemMove,
  className,
}: BoardProps): JSX.Element {
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const isMobile = !useMediaQuery("(min-width: 768px)");
  const [expandedCols, setExpandedCols] = useState<Set<string>>(new Set(columns.length ? [columns[0].id] : []));

  const toggleCol = (colId: string) => setExpandedCols(prev => {
    const next = new Set(prev);
    if (next.has(colId)) next.delete(colId); else next.add(colId);
    return next;
  });

  const getItems = useCallback((colId: string) =>
    items.filter(i => i.columnId === colId),
  [items]);

  if (loading) {
    return (
      <div
        role="status"
        aria-label="Loading board"
        aria-busy="true"
        className={cn(isMobile ? "space-y-3" : "flex gap-4 overflow-x-auto", className)}
      >
        {columns.map(col => isMobile ? (
          <div key={col.id} className="rounded-2xl bg-elevated border border-default px-4 py-3">
            <div className="flex items-center gap-2">
              <Skeleton decorative height={12} width="w-24" />
              <span className="ml-auto"><Skeleton decorative height={16} width="w-6" variant="circle" /></span>
            </div>
            <div className="mt-3 space-y-2">
              {[0, 1].map(r => (
                <div key={r} className="bg-card rounded-xl border border-default p-3 space-y-2">
                  <Skeleton decorative height={12} width="w-5/6" />
                  <Skeleton decorative height={12} width="w-2/3" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div key={col.id} className="flex-1 min-w-[260px] max-w-[360px] rounded-2xl bg-elevated border border-default p-2 space-y-2">
            <div className="flex items-center gap-2 px-2 py-1">
              <Skeleton decorative height={12} width="w-24" />
              <span className="ml-auto"><Skeleton decorative height={16} width="w-6" variant="circle" /></span>
            </div>
            {[0, 1, 2].map(r => (
              <div key={r} className="bg-card rounded-xl border border-default p-3 space-y-2">
                <Skeleton decorative height={12} width="w-5/6" />
                <Skeleton decorative height={12} width="w-2/3" />
              </div>
            ))}
          </div>
        ))}
      </div>
    );
  }

  const totalItems = items.length;
  if (totalItems === 0) {
    return (
      <EmptyState
        compact
        title={emptyMessage ?? "No items"}
        icon={emptyIcon}
      />
    );
  }

  if (isMobile) {
    return (
      <div className={cn("space-y-3", className)}>
        {columns.map(col => {
          const colItems = getItems(col.id);
          const isOpen = expandedCols.has(col.id);
          return (
            <div key={col.id} className="rounded-2xl bg-elevated border border-default overflow-hidden">
              <button
                onClick={() => toggleCol(col.id)}
                className="flex items-center gap-2 w-full px-4 py-3 text-left"
              >
                {col.icon && <span className="flex-shrink-0">{col.icon}</span>}
                <span className="font-semibold text-sm text-fg-primary">{col.title}</span>
                <span className={cn(
                  "ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full",
                  col.color ?? "bg-elevated text-fg-secondary",
                )}>
                  {colItems.length}
                </span>
                <Icon name="arrow" size={14} className={cn("text-fg-tertiary transition-transform", isOpen && "rotate-180")} />
              </button>
              {isOpen && (
                <div className="px-3 pb-3 space-y-2">
                  {colItems.length === 0 ? (
                    <div className="text-sm text-fg-tertiary py-4 text-center">No items</div>
                  ) : colItems.map(item => (
                    <div
                      key={item.id}
                      className="bg-card rounded-xl border border-default p-3"
                    >
                      {item.content}
                      <MoveControls onItemMove={onItemMove} itemId={item.id} fromColumn={item.columnId} columnId={item.columnId} columns={columns} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={cn("flex gap-4 overflow-x-auto pb-4", className)}>
      {columns.map(col => {
        const colItems = getItems(col.id);
        const isOver = dragOverCol === col.id;
        return (
<div
              key={col.id}
              className={cn(
                "flex-1 min-w-[260px] max-w-[360px] rounded-2xl bg-elevated border border-default flex flex-col",
                isOver && "border-accent bg-accent-tint",
              )}
              onDragOver={e => { e.preventDefault(); setDragOverCol(col.id); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={e => {
                e.preventDefault();
                const id = draggedItemId;
                setDraggedItemId(null);
                setDragOverCol(null);
                if (id && onItemMove) {
                  const item = items.find(i => i.id === id);
                  if (item && item.columnId !== col.id) {
                    onItemMove(id, item.columnId, col.id);
                  }
                }
              }}
              aria-dropeffect="move"
            >
            <div className={cn(
              "flex items-center gap-2 px-4 py-3 border-b border-default",
            )}>
              {col.icon && <span className="flex-shrink-0">{col.icon}</span>}
              <span className="font-semibold text-sm text-fg-primary">{col.title}</span>
              <span className={cn(
                "ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full",
                col.color ?? "bg-elevated text-fg-secondary",
              )}>
                {colItems.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
              {colItems.map(item => (
                <div
                  key={item.id}
                  draggable
                  tabIndex={0}
                  role="button"
                  aria-grabbed={draggedItemId === item.id}
                  onDragStart={() => { setDraggedItemId(item.id); }}
                  onDragEnd={() => { setDraggedItemId(null); }}
                  className={cn(
                    "bg-card rounded-xl border border-default p-3 cursor-grab active:cursor-grabbing",
                    "hover:shadow-hover hover:border-default transition-all",
                    "select-none",
                  )}
                >
                  {item.content}
                  <MoveControls onItemMove={onItemMove} itemId={item.id} fromColumn={item.columnId} columnId={item.columnId} columns={columns} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
