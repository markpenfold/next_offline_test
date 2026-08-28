
import "@/app/styles/globals.css";
import { AppStoreProvider } from "@/providers/AppStoreProvider";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from 'react-hot-toast';
import { StoreSync } from '@/stores/StoreSync';
import { Analytics } from "@vercel/analytics/next"
const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});



export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body >
        <Analytics/>
        <AppStoreProvider initialTier="none">
          <StoreSync/>
              {children}
        </AppStoreProvider>
        <Toaster position="top-center"/>
        </body>
    </html>
  );
}
