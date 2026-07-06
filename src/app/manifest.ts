import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "JobFlow",
    short_name: "JobFlow",
    description: "Tailored resumes + application tracking",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8fa",
    theme_color: "#1a365d",
    icons: [
      { src: "/icon.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
