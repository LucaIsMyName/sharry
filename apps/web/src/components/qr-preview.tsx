import { useEffect, useRef } from "react";
import QRCodeStyling from "qr-code-styling";
import { qrWarnings, type QrStyle } from "@sharry/shared";
import { Notice } from "./ui/notice.tsx";

export function QrPreview({
  url,
  style,
  logoUrl,
  showNotes = true,
}: {
  url: string;
  style: QrStyle;
  logoUrl?: string | null;
  showNotes?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const qrRef = useRef<QRCodeStyling | null>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const options = toOptions(url, style, logoUrl ?? null, false);
    if (!qrRef.current) {
      qrRef.current = new QRCodeStyling(options);
      node.replaceChildren();
      qrRef.current.append(node);
    } else {
      qrRef.current.update(options);
    }
  }, [url, style, logoUrl]);

  const warnings = qrWarnings(style, Boolean(logoUrl));
  return (
    <div className="space-y-3 gap-3">
      <div
        className="grid min-h-72 place-items-center rounded-2xl bg-white p-3"
        ref={ref}
      />
      {showNotes
        ? warnings.map((warning) => (
            <Notice key={warning} tone="error">
              {warning}
            </Notice>
          ))
        : null}
      {showNotes ? (
        <p className="text-sm text-muted-foreground">
          JPEG downloads use a solid background because JPEG cannot store
          transparency.
        </p>
      ) : null}
    </div>
  );
}

export async function downloadQr(
  url: string,
  style: QrStyle,
  logoUrl: string | null,
  format: "png" | "jpeg" | "svg",
  name: string,
) {
  const qr = new QRCodeStyling({
    ...toOptions(url, style, logoUrl, format === "jpeg"),
    width: style.size,
    height: style.size,
  });
  await qr.download({ name, extension: format });
}

function toOptions(
  url: string,
  style: QrStyle,
  logoUrl: string | null,
  jpeg: boolean,
) {
  const corners =
    style.cornersSquareType === "rounded"
      ? "extra-rounded"
      : style.cornersSquareType;
  return {
    width: 280,
    height: 280,
    type: "svg" as const,
    data: url,
    margin: style.margin * 6,
    qrOptions: { errorCorrectionLevel: style.errorCorrectionLevel },
    dotsOptions: { type: style.dotsType, color: style.dotsColor },
    cornersSquareOptions: { type: corners, color: style.cornersSquareColor },
    cornersDotOptions: { type: style.cornersDotType, color: style.dotsColor },
    backgroundOptions: {
      color:
        jpeg || !style.backgroundTransparent
          ? jpeg
            ? style.jpegBackground
            : style.backgroundColor
          : "#00000000",
    },
    image: logoUrl ?? undefined,
    imageOptions: {
      hideBackgroundDots: true,
      imageSize: style.imageSize,
      margin: 4,
    },
  };
}
