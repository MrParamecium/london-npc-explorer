import { LoaderCircle } from "lucide-react";

import type { PublicProfileNpc } from "@/lib/generation/public-profile-contracts";

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function occupation(npc: PublicProfileNpc) {
  return (
    npc.canonicalProfile.work.occupationTitle ??
    npc.canonicalProfile.work.economicActivity.replaceAll("_", " ")
  );
}

export function NpcHistory({
  items,
  state,
  error,
  hasMore,
  onSelect,
  onLoadMore,
}: {
  items: PublicProfileNpc[];
  state: "idle" | "loading" | "ready" | "error";
  error: string | null;
  hasMore: boolean;
  onSelect: (npcId: string) => void;
  onLoadMore: () => void;
}) {
  return (
    <div className="history-popover" aria-label="NPC history">
      <div className="history-popover-heading">
        <span>Encounter history</span>
        <span>{items.length}</span>
      </div>
      {items.length ? (
        <div className="history-list">
          {items.map((npc) => (
            <button
              type="button"
              onClick={() => onSelect(npc.npcId)}
              key={npc.npcId}
            >
              <span>
                {initials(npc.canonicalProfile.identity.fictionalName)}
              </span>
              <span>
                <strong>{npc.canonicalProfile.identity.fictionalName}</strong>
                <small>{occupation(npc)}</small>
              </span>
            </button>
          ))}
          {hasMore ? (
            <button
              className="history-load-more"
              type="button"
              onClick={onLoadMore}
              disabled={state === "loading"}
            >
              {state === "loading" ? (
                <LoaderCircle className="spin" size={14} />
              ) : null}
              Load earlier
            </button>
          ) : null}
        </div>
      ) : state === "loading" ? (
        <p className="history-empty">
          <LoaderCircle className="spin" size={14} /> Loading encounters
        </p>
      ) : (
        <p className="history-empty">{error ?? "No saved encounters yet."}</p>
      )}
    </div>
  );
}
