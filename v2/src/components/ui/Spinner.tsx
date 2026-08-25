import { clsx } from "clsx";

export function Spinner({ size = "md" }: { size?: "sm" | "md" }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={clsx(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        size === "sm" ? "h-3.5 w-3.5" : "h-5 w-5",
      )}
    />
  );
}
