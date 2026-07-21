import { Rosario, Raleway } from "next/font/google";

// `latin-ext` is mandatory — German umlauts (ä ö ü ß) live there.
export const rosario = Rosario({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading",
  display: "swap",
});

export const raleway = Raleway({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});
