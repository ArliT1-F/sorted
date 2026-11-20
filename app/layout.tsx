import type { Metadata, Viewport } from "next";
import "./globals.css";
import { VaultProvider } from "@/components/VaultProvider";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: { default: "Sorted: everyday paperwork tools", template: "%s · Sorted" },
  description: "Free tools for everyday paperwork: redact documents, check scam messages, read contracts, clean photo metadata, and keep your papers in an encrypted vault.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#2b3fd6" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@100..125,400..900&display=swap" rel="stylesheet" />
      </head>
      <body>
        <VaultProvider>
          <Nav />
          <main>{children}</main>
          <footer className="foot">
            <div className="wrap">
              <strong>Sorted</strong>
              <span>Quick tools run entirely in your browser. Saved items are encrypted on your device before upload.</span>
            </div>
          </footer>
        </VaultProvider>
      </body>
    </html>
  );
}
