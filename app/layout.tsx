import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "FORM — Your personal fitting studio",
  description:
    "A private, camera-guided body measurement studio. Two views. Forty tailoring dimensions. A more considered fit.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
