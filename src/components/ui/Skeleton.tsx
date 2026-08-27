import { cn } from "@/lib/utils/cn";

type SkeletonVariant = "text" | "circle" | "rect";

export interface SkeletonProps {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  /** Drop the status role/aria-label for bulk/decorative skeletons (screen readers announce the wrapper instead). */
  decorative?: boolean;
  className?: string;
}

export function Skeleton({ variant = "text", width, height, decorative = false, className }: SkeletonProps): JSX.Element {
  const base = "animate-pulse bg-elevated";
  const commonProps = decorative ? {} : { role: "status" as const, "aria-label": "Loading" as const };

  if (variant === "circle") {
    return (
      <div
        {...commonProps}
        className={cn(base, "rounded-full", className)}
        style={{ width: width ?? 36, height: height ?? 36 }}
      />
    );
  }

  if (variant === "rect") {
    return (
      <div
        {...commonProps}
        className={cn(base, "rounded-lg", className)}
        style={{ width: width ?? "100%", height: height ?? 80 }}
      />
    );
  }

  return (
    <div
      {...commonProps}
      className={cn(base, "rounded-md h-4", className)}
      style={{ width: width ?? "100%" }}
    />
  );
}
