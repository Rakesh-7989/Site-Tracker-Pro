import { useT } from "@/i18n/I18nProvider";
import { Icon } from "@/components/ui/atoms";

interface OfflineQueueBannerProps {
  queued: number;
  draining: boolean;
}

export function OfflineQueueBanner({ queued, draining }: OfflineQueueBannerProps): JSX.Element | null {
  const t = useT();
  if (queued <= 0) return null;
  return (
    <div className="flex items-center gap-2 text-xs font-semibold rounded-lg bg-accent-tint border border-accent text-accent px-3 py-2">
      <Icon name="send" size={14} />
      <span>{draining ? t("dpr.offline.sending", { count: queued }) : t("dpr.offline.queued", { count: queued, plural: queued === 1 ? "" : "s" })}</span>
    </div>
  );
}