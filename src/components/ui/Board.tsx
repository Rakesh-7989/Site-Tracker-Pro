import { useCallback, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { EmptyState } from "./EmptyState";
import type { IconName } from "./icons";
import { Spinner } from "./atoms";

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
  const dragItem = useRef<string | null>(null);

  const getItems = useCallback((colId: string) =>
    items.filter(i => i.columnId === colId),
  [items]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Spinner size={24} />
      </div>
    );
  }

  const totalItems = items.length;
  if (totalItems === 0) {
    return (
      <EmptyState
        title={emptyMessage ?? "No items"}
        icon={emptyIcon}
      />
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
              "flex-1 min-w-[260px] max-w-[360px] rounded-2xl bg-cream-100/50 border border-cream-200 flex flex-col",
              isOver && "border-safety-500 bg-safety-50/30",
            )}
            onDragOver={e => { e.preventDefault(); setDragOverCol(col.id); }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={e => {
              e.preventDefault();
              const id = dragItem.current;
              dragItem.current = null;
              setDragOverCol(null);
              if (id && onItemMove) {
                const item = items.find(i => i.id === id);
                if (item && item.columnId !== col.id) {
                  onItemMove(id, item.columnId, col.id);
                }
              }
            }}
          >
            <div className={cn(
              "flex items-center gap-2 px-4 py-3 border-b border-cream-200",
            )}>
              {col.icon && <span className="flex-shrink-0">{col.icon}</span>}
              <span className="font-semibold text-sm text-ink-700">{col.title}</span>
              <span className={cn(
                "ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full",
                col.color ?? "bg-cream-200 text-ink-500",
              )}>
                {colItems.length}
              </span>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[120px]">
              {colItems.map(item => (
                <div
                  key={item.id}
                  draggable
                  onDragStart={() => { dragItem.current = item.id; }}
                  className={cn(
                    "bg-white rounded-xl border border-cream-200 p-3 cursor-grab active:cursor-grabbing",
                    "hover:shadow-hover hover:border-ink-500/20 transition-all",
                    "select-none",
                  )}
                >
                  {item.content}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
