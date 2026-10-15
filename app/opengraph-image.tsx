import { ImageResponse } from "next/og";
import { SITE } from "@/lib/site";

// Shared preview image for links to any page (social posts, texts, chat apps).
export const alt = `${SITE.name}: motor sales, repair and service`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The image is drawn outside the page, so it uses the brand colours directly
// rather than the CSS theme tokens.
const INK = "#0e1a26";
const COPPER = "#e8833f";
const MIST = "#c9d3dd";
const DASHES = [12, 12, 0, 12, 12, 12, 0, 4, 12, 4, 0, 4, 4, 4, 0, 4];

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: "80px 96px", background: INK, color: "white" }}>
        <div style={{ fontSize: 112, fontWeight: 700, letterSpacing: 6 }}>MORSE</div>
        <div style={{ fontSize: 40, letterSpacing: 10, color: MIST, marginTop: 4 }}>ELECTRIC MOTOR CO.</div>
        <div style={{ display: "flex", gap: 12, marginTop: 28 }}>
          {DASHES.map((w, i) => (
            <div key={i} style={{ width: w * 6, height: 14, background: w ? COPPER : "transparent" }} />
          ))}
        </div>
        <div style={{ fontSize: 40, marginTop: 56, color: "white", maxWidth: 960, lineHeight: 1.3 }}>
          Motors, pumps, blowers, vacuum pumps, starters and alternators. Sales, repair and field service.
        </div>
        <div style={{ fontSize: 30, marginTop: 40, color: COPPER }}>morseelectricmotor.com</div>
      </div>
    ),
    size,
  );
}
