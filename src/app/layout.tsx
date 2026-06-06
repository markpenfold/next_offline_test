
import "@/app/styles/globals.css";
import { AppStoreProvider } from "@/providers/AppStoreProvider";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {

  
  return (
    <html>
      <body className="min-h-full flex flex-col">
        <AppStoreProvider initialTier="none">
              {children}
        </AppStoreProvider>
        </body>
    </html>
  );
}
