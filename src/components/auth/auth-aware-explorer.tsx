"use client";

import { useAuth } from "@clerk/nextjs";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  ExplorerShell,
  type ExplorerResumeRequest,
} from "@/components/explorer/explorer-shell";
import {
  clearPendingGenerationIntent,
  consumePendingGenerationIntent,
  savePendingGenerationIntent,
} from "@/lib/auth/pending-generation-intent";
import type { ProviderMode } from "@/lib/providers/provider-mode";

import { AccountControl } from "./account-control";
import { SignInModal } from "./sign-in-modal";

export function AuthAwareExplorer({
  authEnabled,
  providerMode,
}: {
  authEnabled: boolean;
  providerMode: ProviderMode;
}) {
  if (!authEnabled) {
    return <ExplorerShell providerMode={providerMode} />;
  }

  return <ClerkExplorer providerMode={providerMode} />;
}

function ClerkExplorer({ providerMode }: { providerMode: ProviderMode }) {
  const { isLoaded, isSignedIn, userId } = useAuth();
  const [modalOpen, setModalOpen] = useState(false);
  const [synchronizedUserId, setSynchronizedUserId] = useState<string | null>(
    null,
  );
  const [authError, setAuthError] = useState<string | null>(null);
  const [resumeRequest, setResumeRequest] =
    useState<ExplorerResumeRequest | null>(null);
  const syncAttemptRef = useRef(0);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !userId) return;

    const currentUserId = userId;
    const attempt = ++syncAttemptRef.current;
    const controller = new AbortController();

    async function synchronizeUser() {
      setAuthError(null);
      try {
        const response = await fetch("/api/auth/sync", {
          method: "POST",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Account synchronization failed.");
        if (attempt !== syncAttemptRef.current) return;

        setSynchronizedUserId(currentUserId);
        setModalOpen(false);
        const intent = consumePendingGenerationIntent(sessionStorage);
        if (intent) {
          setResumeRequest({
            id: intent.createdAt,
            coordinates: {
              latitude: intent.latitude,
              longitude: intent.longitude,
            },
          });
        }
      } catch (error) {
        if (controller.signal.aborted || attempt !== syncAttemptRef.current)
          return;
        setAuthError(
          error instanceof Error
            ? error.message
            : "Account synchronization failed.",
        );
      }
    }

    void synchronizeUser();
    return () => controller.abort();
  }, [isLoaded, isSignedIn, userId]);

  const requestGenerationSignIn = useCallback(
    (coordinates: { latitude: number; longitude: number }) => {
      savePendingGenerationIntent(sessionStorage, coordinates);
      setAuthError(null);
      setModalOpen(true);
    },
    [],
  );

  const requestAccountSignIn = useCallback(() => {
    clearPendingGenerationIntent(sessionStorage);
    setAuthError(null);
    setModalOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    clearPendingGenerationIntent(sessionStorage);
    setModalOpen(false);
  }, []);

  return (
    <>
      <ExplorerShell
        key={userId ?? "signed-out"}
        providerMode={providerMode}
        authentication={{
          status: !isLoaded
            ? "loading"
            : isSignedIn && synchronizedUserId === userId
              ? "ready"
              : isSignedIn
                ? "synchronizing"
                : "signed_out",
          error: authError,
          requestGenerationSignIn,
          requestAccountSignIn,
          accountControl: (
            <AccountControl
              isLoaded={isLoaded}
              isSignedIn={Boolean(isSignedIn)}
              onSignIn={requestAccountSignIn}
            />
          ),
          resumeRequest,
          clearResumeRequest: () => setResumeRequest(null),
        }}
      />
      {modalOpen && !isSignedIn ? <SignInModal onClose={closeModal} /> : null}
    </>
  );
}
