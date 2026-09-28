import { Link } from "@tanstack/react-router";
import { FileText, Shield } from "lucide-react";
import { ChecInLogo } from "./ChecInLogo";

export function PublicFooter() {
  return (
    <footer className="border-t border-[#EBEBEB] bg-[#FAFAFA] mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm">
        <div className="flex items-center gap-3 text-muted-foreground text-center sm:text-left">
          <ChecInLogo size={24} />
          <div>
            <div className="text-xs text-[#6D6D6D]">
              © {new Date().getFullYear()} ChecIN Technologies Inc. · Modern Attendance for Modern Teams
            </div>
          </div>
        </div>
        <nav className="flex items-center gap-2 flex-wrap justify-center text-xs sm:text-sm font-medium text-[#0E2322]">
          <Link
            to="/terms"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-white transition-colors"
          >
            <FileText className="size-4" /> Terms of Service
          </Link>
          <Link
            to="/privacy"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md hover:bg-white transition-colors"
          >
            <Shield className="size-4" /> Privacy Policy
          </Link>
        </nav>
      </div>
    </footer>
  );
}
