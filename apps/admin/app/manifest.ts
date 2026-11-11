import tokens from "@namitiszunk/ui/tokens.json";
import type { MetadataRoute } from "next";

// The bar tablet's home-screen app (T-054): full screen, landscape, straight to the bar view.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Na, mit iszunk? Pult",
    short_name: "Pult",
    start_url: "/pult",
    display: "fullscreen",
    orientation: "landscape",
    background_color: tokens.color.bg,
    theme_color: tokens.color.bg,
    icons: [{ src: "/favicon.ico", sizes: "any", type: "image/x-icon" }],
  };
}
