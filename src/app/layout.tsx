
import "@/app/styles/globals.css";
import { AppStoreProvider } from "@/providers/AppStoreProvider";
import { Geist, Geist_Mono } from "next/font/google";



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
      <body className="min-h-full flex flex-col">
        <AppStoreProvider initialTier="none">
              {children}
        </AppStoreProvider>
        </body>
    </html>
  );
}
