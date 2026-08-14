import {
  Banknote,
  BriefcaseBusiness,
  Clock3,
  Database,
  Home,
  MessageSquareText,
  Shirt,
  Sparkles,
  Target,
} from "lucide-react";
import Image from "next/image";

import type { PublicProfileNpc } from "@/lib/generation/public-profile-contracts";

import type { NpcGenerationStage } from "./use-npc-generation";

const generationCopy: Record<NpcGenerationStage, string> = {
  profile: "Sampling local profile",
  portrait: "Generating portrait",
  persistence: "Saving encounter",
};

function humanize(value: string | null) {
  return value ? value.replaceAll("_", " ") : "Not applicable";
}

function workTitle(profile: PublicProfileNpc["canonicalProfile"]) {
  return (
    profile.work.occupationTitle ?? humanize(profile.work.economicActivity)
  );
}

function income(profile: PublicProfileNpc["canonicalProfile"]) {
  return profile.work.annualIncomeBand ?? "Not applicable";
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

export function NpcProfile({
  npc,
  isGenerating,
  generationStage,
  generationError,
  onGenerateAnother,
}: {
  npc: PublicProfileNpc;
  isGenerating: boolean;
  generationStage: NpcGenerationStage;
  generationError: string | null;
  onGenerateAnother: () => void;
}) {
  const profile = npc.canonicalProfile;
  const state = npc.currentState;
  const sources = Object.entries(npc.fieldProvenance).sort(([left], [right]) =>
    left.localeCompare(right),
  );

  return (
    <div className="npc-profile">
      <div className="npc-identity">
        <div className="npc-portrait">
          <Image
            src={npc.portraitUrl}
            alt={`Fictional portrait of ${profile.identity.fictionalName}`}
            fill
            sizes="(max-width: 440px) 84px, 94px"
            unoptimized={npc.portraitUrl.startsWith("data:")}
          />
        </div>
        <div>
          <span className="profile-state">
            {isGenerating
              ? generationCopy[generationStage]
              : "Fictional local sample"}
          </span>
          <h3>{profile.identity.fictionalName}</h3>
          <p>{workTitle(profile)}</p>
        </div>
      </div>

      <p className="npc-narrative">{npc.narrative}</p>

      <div className="profile-facts">
        <div>
          <Clock3 size={15} />
          <span>
            {profile.identity.age} years / {profile.identity.pronouns}
          </span>
        </div>
        <div>
          <BriefcaseBusiness size={15} />
          <span>{workTitle(profile)}</span>
        </div>
        <div>
          <Banknote size={15} />
          <span>{income(profile)}</span>
        </div>
        <div>
          <Home size={15} />
          <span>
            {humanize(profile.household.householdType)} /{" "}
            {humanize(profile.household.housingTenure)}
          </span>
        </div>
        <div>
          <Shirt size={15} />
          <span>{profile.appearance.clothing.join(", ")}</span>
        </div>
      </div>

      <section className="current-state" aria-labelledby="current-state-title">
        <div className="profile-section-title">
          <Target size={14} />
          <h4 id="current-state-title">Right now</h4>
        </div>
        <p>{state.currentTask}</p>
        <dl className="compact-profile-list">
          <ProfileRow label="Here because" value={state.reasonForLocation} />
          <ProfileRow
            label="Mood / energy"
            value={`${state.mood} / ${state.energy}`}
          />
          <ProfileRow label="Next goal" value={state.shortTermGoal} />
        </dl>
      </section>

      <details className="profile-disclosure">
        <summary>
          <span>
            <Sparkles size={14} />
            Complete profile
          </span>
          <small>Identity, work, life and character</small>
        </summary>
        <div className="profile-disclosure-body">
          <section>
            <h4>Identity & household</h4>
            <dl className="compact-profile-list">
              {"statisticalSex" in profile.identity ? (
                <>
                  <ProfileRow
                    label="Statistical sex"
                    value={profile.identity.statisticalSex}
                  />
                  <ProfileRow
                    label="Ethnic group"
                    value={profile.identity.ethnicGroup}
                  />
                </>
              ) : (
                <ProfileRow
                  label="Background"
                  value={profile.identity.culturalBackground}
                />
              )}
              <ProfileRow
                label="Household"
                value={humanize(profile.household.householdType)}
              />
              <ProfileRow
                label="Tenure"
                value={humanize(profile.household.housingTenure)}
              />
            </dl>
          </section>
          <section>
            <h4>Work & daily life</h4>
            <dl className="compact-profile-list">
              <ProfileRow
                label="Activity"
                value={humanize(profile.work.economicActivity)}
              />
              <ProfileRow label="Occupation" value={workTitle(profile)} />
              <ProfileRow label="Income" value={income(profile)} />
              <ProfileRow
                label="Education"
                value={humanize(profile.dailyLife.education)}
              />
              <ProfileRow
                label="Commute"
                value={humanize(profile.dailyLife.commute)}
              />
              <ProfileRow label="Routine" value={profile.dailyLife.routine} />
            </dl>
          </section>
          <section>
            <h4>Appearance & character</h4>
            <dl className="compact-profile-list">
              <ProfileRow
                label="Presentation"
                value={profile.appearance.presentation}
              />
              <ProfileRow
                label="Possessions"
                value={profile.appearance.possessions.join(", ") || "None"}
              />
              <ProfileRow
                label="History"
                value={profile.character.personalHistory}
              />
              <ProfileRow
                label="Values"
                value={profile.character.values.join(", ")}
              />
              <ProfileRow
                label="Speech"
                value={profile.character.speechStyle}
              />
              <ProfileRow
                label="Boundaries"
                value={profile.character.boundaries.join("; ")}
              />
            </dl>
          </section>
        </div>
      </details>

      <details className="profile-disclosure source-disclosure">
        <summary>
          <span>
            <Database size={14} />
            Data sources
          </span>
          <small>{sources.length} field decisions</small>
        </summary>
        <div className="source-list">
          {sources.map(([path, source]) => (
            <div key={path}>
              <code>{path.replaceAll("/", " / ").trim()}</code>
              <span>
                {source.kind === "statistical"
                  ? `${source.sourceRelease ?? "Official release"} / ${source.geographyLevel ?? "London"}`
                  : `${source.kind} / ${source.transformVersion}`}
              </span>
            </div>
          ))}
        </div>
      </details>

      {generationError ? (
        <p className="form-error generation-error" role="alert">
          {generationError}
        </p>
      ) : null}

      <button
        className="secondary-button another-button"
        type="button"
        onClick={onGenerateAnother}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <MessageSquareText size={16} />
        ) : (
          <Sparkles size={16} />
        )}
        {isGenerating ? "Sampling another profile" : "Generate another"}
      </button>
    </div>
  );
}
