import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "London NPC Atlas",
  description: "Coordinate-based local character encounters across London.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
