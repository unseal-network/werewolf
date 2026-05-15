import type { ReactNode } from "react";

export function RootLayout({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen bg-[#161719] text-[#f7f1e7] font-sans">
      {children}
    </main>
  );
}
