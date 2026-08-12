import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";

import { env } from "@/lib/config/env";

import "./globals.css";

export const metadata: Metadata = {
  title: "London NPC Atlas",
  description: "Coordinate-based local character encounters across London.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  const content = env.clerkEnabled ? (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: "#2759c7",
          colorForeground: "#14213a",
          colorBackground: "#ffffff",
          colorNeutral: "#526079",
          borderRadius: "6px",
          fontFamily: '"Avenir Next", "Segoe UI", sans-serif',
        },
        elements: {
          cardBox: "auth-clerk-card-box",
          card: "auth-clerk-card",
        },
      }}
    >
      {children}
    </ClerkProvider>
  ) : (
    children
  );

  return (
    <html lang="en">
      <body>{content}</body>
    </html>
  );
}
