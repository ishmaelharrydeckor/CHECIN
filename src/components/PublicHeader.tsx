import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { ChecInLogo } from "@/components/ChecInLogo";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

/**
 * The header for ChecIN's public pages (the landing page and the legal pages): one look, one menu.
 *
 * On a computer the section links sit in the bar. On a phone they move into a panel that slides in from
 * the right, opened by the menu button, so a visitor on a phone can reach Pricing or the FAQ too. Every link
 * points at the landing page's sections (`/#pricing`), so it works from any page that uses this header.
 */
export const PUBLIC_NAV = [
  { label: "Benefits", hash: "benefits" },
  { label: "Why ChecIN", hash: "why" },
  { label: "Capabilities", hash: "capabilities" },
  { label: "Pricing", hash: "pricing" },
  { label: "FAQ", hash: "faq" },
] as const;

export function PublicHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className="fixed top-3 sm:top-5 left-1/2 -translate-x-1/2 z-50 w-[95%] max-w-[1140px] h-[64px] sm:h-[68px] bg-white/95 backdrop-blur-md rounded-[20px] px-4 sm:px-6 flex items-center justify-between shadow-[0_4px_25px_rgba(0,0,0,0.06)] border border-[#EBEBEB]">
        <Link to="/" aria-label="ChecIN home" className="flex items-center no-underline">
          <ChecInLogo size={28} textColor="#0E2322" markColor="#0E2322" />
        </Link>

        <nav aria-label="Sections" className="hidden md:flex items-center space-x-7 text-[15px] font-medium text-[#0E2322]">
          {PUBLIC_NAV.map((item) => (
            <a key={item.hash} href={`/#${item.hash}`} className="hover:opacity-70 transition">
              {item.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center space-x-2.5">
          <Link
            to="/auth"
            className="hidden sm:inline-flex h-[43px] px-5 rounded-[14px] border border-[#0E2322] text-[#0E2322] text-[13.5px] font-medium hover:bg-black/5 active:scale-95 transition items-center justify-center no-underline"
          >
            Sign in
          </Link>
          <Link
            to="/auth"
            className="h-[43px] px-4 sm:px-6 rounded-[14px] bg-[#0E2322] text-white text-[13.5px] font-medium hover:bg-[#163331] active:scale-95 transition shadow-sm inline-flex items-center justify-center no-underline"
          >
            Get Started
          </Link>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-expanded={menuOpen}
            className="md:hidden size-[43px] rounded-[14px] border border-[#0E2322]/20 text-[#0E2322] hover:bg-black/5 active:scale-95 transition inline-flex items-center justify-center cursor-pointer"
          >
            <Menu className="size-5" aria-hidden />
          </button>
        </div>
      </header>

      {/* Phone menu: the same section links, in a panel that slides in from the right. Closes on a link, on Escape and on tapping outside. */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="right" className="w-[85%] max-w-xs p-0 flex flex-col md:hidden">
          <SheetTitle className="sr-only">Menu</SheetTitle>
          <SheetDescription className="sr-only">Jump to a section of the page, or sign in</SheetDescription>
          <div className="px-6 pt-6 pb-4 border-b border-[#EBEBEB]">
            <ChecInLogo size={26} />
          </div>
          <nav aria-label="Sections" className="flex-1 overflow-y-auto px-3 py-3">
            <ul className="space-y-1">
              {PUBLIC_NAV.map((item) => (
                <li key={item.hash}>
                  <a
                    href={`/#${item.hash}`}
                    onClick={closeMenu}
                    className="flex items-center min-h-12 px-3 rounded-xl text-[17px] font-medium text-[#0E2322] hover:bg-[#F5F5F5] no-underline"
                  >
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
          <div className="px-6 py-5 border-t border-[#EBEBEB] space-y-2.5">
            <Link
              to="/auth"
              onClick={closeMenu}
              className="w-full h-12 rounded-[14px] bg-[#0E2322] text-white text-[15px] font-medium inline-flex items-center justify-center no-underline"
            >
              Get Started
            </Link>
            <Link
              to="/auth"
              onClick={closeMenu}
              className="w-full h-12 rounded-[14px] border border-[#0E2322] text-[#0E2322] text-[15px] font-medium inline-flex items-center justify-center no-underline"
            >
              Sign in
            </Link>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
