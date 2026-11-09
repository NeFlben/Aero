import type { MetadataRoute } from "next";

/** Makes Hangar installable: "Add to Home Screen" opens it full-screen, like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Hangar",
    short_name: "Hangar",
    description: "A modern database for aircraft model collections.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#eef2fb",
    theme_color: "#4f46e5",
    categories: ["lifestyle", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add Aircraft", url: "/?add=1", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "My Collection", url: "/collection", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
