"use client";

import { SignIn } from "@clerk/nextjs";
import { X } from "lucide-react";
import { useEffect } from "react";

export function SignInModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div className="auth-overlay" role="presentation" onMouseDown={onClose}>
      <section
        className="auth-dialog"
        role="dialog"
        aria-label="Sign in to London NPC Atlas"
        aria-modal="true"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="auth-close"
          type="button"
          aria-label="Close sign in"
          title="Close sign in"
          onClick={onClose}
        >
          <X size={18} />
        </button>
        <SignIn
          routing="hash"
          fallbackRedirectUrl="/"
          signUpFallbackRedirectUrl="/"
          withSignUp
        />
      </section>
    </div>
  );
}
