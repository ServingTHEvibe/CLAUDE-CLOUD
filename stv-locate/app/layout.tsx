import type { Metadata } from "next";
import "./globals.css";
import "./field.css";
import "./address.css";
import "./map-view.css";
import "./interior.css";
import "./workflow.css";
import "./planner.css";

export const metadata: Metadata = {
  title: "STV Locate · Every asset. Exactly where.",
  description: "Your equipment, mapped. A private workspace for equipment locations and indoor wayfinding.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
