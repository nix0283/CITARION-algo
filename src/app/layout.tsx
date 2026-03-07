import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#0B0E11" },
  ],
};

export const metadata: Metadata = {
  title: {
    default: "CITARION",
    template: "%s | CITARION",
  },
  description: "Продвинутая платформа для автоматической торговли криптовалютой",
  keywords: ["crypto", "trading", "bot", "automated trading", "cryptocurrency", "bitcoin", "ethereum", "grid bot", "dca bot", "AI trading"],
  authors: [{ name: "CITARION" }],
  creator: "CITARION",
  publisher: "CITARION",
  
  // PWA
  manifest: "/manifest.json",
  applicationName: "CITARION",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "CITARION",
  },
  formatDetection: {
    telephone: true,
    date: true,
    address: true,
    email: true,
  },
  
  // Open Graph
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "CITARION",
    title: "CITARION",
    description: "Продвинутая платформа для автоматической торговли криптовалютой",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "CITARION Trading Platform",
      },
    ],
  },
  
  // Twitter
  twitter: {
    card: "summary_large_image",
    title: "CITARION",
    description: "Автоматическая торговля криптовалютой",
    images: ["/og-image.png"],
  },
  
  // Robots
  robots: {
    index: true,
    follow: true,
  },
  
  // Icons
  icons: {
    icon: [
      { url: "/icons/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/icons/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* PWA Meta Tags */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CITARION" />
        <meta name="application-name" content="CITARION" />
        <meta name="msapplication-TileColor" content="#F0B90B" />
        <meta name="msapplication-tap-highlight" content="no" />
        
        {/* Android Chrome */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="theme-color" content="#F0B90B" />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster position="top-right" richColors />
        </ThemeProvider>
        
        {/* PWA Registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').then(
                    function(registration) {
                      console.log('SW registered: ', registration.scope);
                    },
                    function(error) {
                      console.log('SW registration failed: ', error);
                    }
                  );
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
