// SiteTrack Pro — render a UPI payment string as a scannable QR (qrcode, OSS).

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function UpiQr({ uri, size = 220 }: { uri: string; size?: number }): JSX.Element {
  const [dataUrl, setDataUrl] = useState<string>("");
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(uri, { width: size, margin: 1, errorCorrectionLevel: "M" })
      .then(u => { if (alive) setDataUrl(u); })
      .catch(() => { if (alive) setDataUrl(""); });
    return () => { alive = false; };
  }, [uri, size]);

  if (!dataUrl) {
    return <div className="grid place-items-center bg-cream-50 rounded-xl border border-cream-200 text-ink-300 text-xs" style={{ width: size, height: size }}>Generating QR…</div>;
  }
  return <img src={dataUrl} alt="UPI payment QR" width={size} height={size} className="rounded-xl border border-cream-200 bg-white" />;
}
