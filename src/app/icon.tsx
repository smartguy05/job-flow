import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

// Themed browser/tab icon (complements the shipped favicon.ico).
export default function Icon() {
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
          fontSize: 20,
          fontWeight: 700,
        }}
      >
        J<span style={{ color: "#4a90d9" }}>F</span>
      </div>
    ),
    size,
  );
}
