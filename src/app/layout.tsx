import type { Metadata, Viewport } from "next";
import { Heebo } from "next/font/google";
import Script from "next/script";
import "./globals.css";
import { serverPublicEnv } from "@/lib/public-env";

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
});

export const metadata: Metadata = {
  title: "חשבוניות",
  description: "סריקת חשבוניות ואישור מנהל",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#1d4ed8",
};

// Public values only (URL + publishable key); secrets never go here. "<" is escaped so the
// JSON cannot close the script tag.
const envScript = () => `window.__ENV=${JSON.stringify(serverPublicEnv()).split("<").join("\\u003c")}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <Script id="public-env" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: envScript() }} />
        {children}
      </body>
    </html>
  );
}
