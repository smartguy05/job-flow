import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

// iOS "Add to Home Screen" uses the apple-touch-icon; Next injects the link automatically.
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a365d",
          color: "#ffffff",
          fontSize: 96,
          fontWeight: 700,
        }}
      >
        J<span style={{ color: "#4a90d9" }}>F</span>
      </div>
    ),
    size,
  );
}
