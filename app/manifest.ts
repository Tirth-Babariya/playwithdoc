import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PlayWithDoc — every PDF & file tool, private",
    short_name: "PlayWithDoc",
    description: "Convert, compress, merge, sign and edit PDFs and images. Everything runs on your device.",
    start_url: "/",
    display: "standalone",
    background_color: "#000000",
    theme_color: "#000000",
    categories: ["utilities", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "JPG to PDF", url: "/tools/jpg-to-pdf" },
      { name: "Compress PDF", url: "/tools/compress-pdf" },
      { name: "Sign PDF", url: "/tools/sign-pdf" },
    ],
  };
}
