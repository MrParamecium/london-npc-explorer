"use client";

import { UserButton } from "@clerk/nextjs";
import { LogIn } from "lucide-react";

export function AccountControl({
  isLoaded,
  isSignedIn,
  onSignIn,
}: {
  isLoaded: boolean;
  isSignedIn: boolean;
  onSignIn: () => void;
}) {
  if (!isLoaded) {
    return (
      <span
        className="account-control account-loading"
        aria-label="Loading account"
      >
        <span />
      </span>
    );
  }

  if (isSignedIn) {
    return (
      <span
        className="account-control account-signed-in"
        aria-label="Account menu"
      >
        <UserButton
          appearance={{
            elements: { avatarBox: "account-avatar" },
          }}
        />
      </span>
    );
  }

  return (
    <button
      className="account-control account-sign-in"
      type="button"
      onClick={onSignIn}
    >
      <LogIn size={15} />
      <span>Sign in</span>
    </button>
  );
}
