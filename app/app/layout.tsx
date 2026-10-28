import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// export const metadata: Metadata = {
//   title: "OmeLive",
//   description: "Chat with strangers",
// };
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b0a0a"
};
export const metadata: Metadata = {
  title: "Talk-Now | Random Video Chat",
  description: "Talk-Now brings spontaneous video conversations and text chat together in one premium anonymous experience.",
  keywords: ["anonymous chat", "random video chat", "meet strangers", "secure chat", "Talk-Now"],
  metadataBase: new URL('https://talk-now-nine.vercel.app'),
  robots: "index, follow, cache",
  alternates: {
    canonical: 'https://talk-now-nine.vercel.app'
  }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
     
      
      <body className={`bg-[#0b0a0a] text-white antialiased ${inter.className}`}>
        {children}

        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Talk-Now",
              url: "https://talk-now-nine.vercel.app",
              description: "Talk-Now brings spontaneous video conversations and text chat together in one premium anonymous experience.",
            }),
          }}
        />
      </body>
    </html>
  );
}
