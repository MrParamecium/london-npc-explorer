# NPC Portrait Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote the saved NPC portrait from a 94-pixel thumbnail to a responsive, capped 3:4 lead image above the character identity.

**Architecture:** Keep the existing `NpcProfile` component and `next/image` fill container, but change the identity section from a two-column thumbnail layout to a one-column editorial layout. CSS owns the responsive width and stable aspect ratio; the `sizes` hint mirrors those breakpoints so Next.js selects an appropriate source. Unit tests lock DOM order and image metadata, while the existing two-project Playwright flow verifies rendered dimensions and overflow on desktop and mobile.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, global CSS, `next/image`, Vitest, React Testing Library, Playwright

**Spec:** `docs/superpowers/specs/2026-08-15-npc-portrait-layout-design.md`

## Global Constraints

- The portrait remains `3:4`, uses `object-fit: cover`, and has `width: min(100%, 360px)`.
- The portrait is centered above the status label, name, and occupation.
- Mobile must not restore the old `84px` portrait override.
- History thumbnails remain unchanged.
- Do not change image generation, storage, database, public API, map, location, profile fields, or dialogue behavior.
- Preserve the existing alt text: `Fictional portrait of {name}`.
- Use the installed Next.js 16.3 `Image` API: a `fill` image keeps a positioned parent and an accurate responsive `sizes` value.
- Add no dependencies and no decorative card, overlay, modal, gradient, or animation.

---

### Task 1: Promote the NPC portrait to the lead visual

**Files:**

- Modify: `src/components/explorer/npc-profile.test.tsx:45-65`
- Modify: `src/components/explorer/npc-profile.tsx:66-89`
- Modify: `src/app/globals.css:1151-1192`
- Modify: `src/app/globals.css:1752-1758`
- Modify: `tests/e2e/explorer.spec.ts:29-53`

**Interfaces:**

- Consumes: `PublicProfileNpc.portraitUrl`, `canonicalProfile.identity.fictionalName`, and the existing `.npc-profile`, `.npc-identity`, and `.npc-portrait` hooks.
- Produces: a `.npc-identity-copy` block following `.npc-portrait`; the portrait image keeps `fill`, the existing alt text, and a new responsive `sizes` value.

- [x] **Step 1: Extend the component test with the lead-image contract**

Replace the existing test body after the `image` query with assertions that lock the URL, responsive image hint, and DOM order:

```tsx
const name = screen.getByRole("heading", { name: "Amara Okafor" });

expect(image).toHaveAttribute("src", expect.stringContaining("npc-portraits"));
expect(image).toHaveAttribute(
  "sizes",
  "(max-width: 440px) calc(100vw - 32px), (max-width: 820px) 360px, (max-width: 1080px) 272px, 360px",
);
expect(image.parentElement?.nextElementSibling).toContainElement(name);
expect(image.parentElement?.nextElementSibling).toHaveClass(
  "npc-identity-copy",
);
```

- [x] **Step 2: Run the component test and verify the new contract fails**

Run:

```bash
pnpm exec vitest run src/components/explorer/npc-profile.test.tsx
```

Expected: FAIL because the current image still reports `84px`/`94px` sizes and its following identity block has no `npc-identity-copy` class.

- [x] **Step 3: Add rendered-size assertions to the existing end-to-end flow**

After the generated `Amara Okafor` heading becomes visible, add:

```ts
const portrait = page.getByRole("img", {
  name: "Fictional portrait of Amara Okafor",
});
const portraitBox = await portrait.boundingBox();
const nameBox = await page
  .getByRole("heading", { name: "Amara Okafor" })
  .boundingBox();

expect(portraitBox).not.toBeNull();
expect(nameBox).not.toBeNull();
expect(portraitBox!.width).toBeGreaterThan(250);
expect(portraitBox!.width).toBeLessThanOrEqual(360);
expect(portraitBox!.height / portraitBox!.width).toBeGreaterThan(1.32);
expect(portraitBox!.height / portraitBox!.width).toBeLessThan(1.35);
expect(nameBox!.y).toBeGreaterThan(portraitBox!.y + portraitBox!.height);
```

These assertions run in both configured projects: Desktop Chrome and Pixel 7.

- [x] **Step 4: Run the end-to-end test and verify the current thumbnail fails**

Run:

```bash
pnpm test:e2e --grep "locates, generates, and chats"
```

Expected: FAIL because the current desktop portrait is only `94px` wide and the name is beside it.

- [x] **Step 5: Restructure the identity markup and update the image hint**

Change the identity block in `NpcProfile` to:

```tsx
<div className="npc-identity">
  <div className="npc-portrait">
    <Image
      src={npc.portraitUrl}
      alt={`Fictional portrait of ${profile.identity.fictionalName}`}
      fill
      sizes="(max-width: 440px) calc(100vw - 32px), (max-width: 820px) 360px, (max-width: 1080px) 272px, 360px"
      unoptimized={npc.portraitUrl.startsWith("data:")}
    />
  </div>
  <div className="npc-identity-copy">
    <span className="profile-state">
      {isGenerating
        ? generationCopy[generationStage]
        : "Fictional local sample"}
    </span>
    <h3>{profile.identity.fictionalName}</h3>
    <p>{workTitle(profile)}</p>
  </div>
</div>
```

Keep the portrait before the copy in source order so visual and assistive reading order agree.

- [x] **Step 6: Replace the thumbnail CSS with the responsive editorial layout**

Update the main rules to:

```css
.npc-identity {
  display: grid;
  gap: 14px;
}

.npc-portrait {
  position: relative;
  display: block;
  width: min(100%, 360px);
  aspect-ratio: 3 / 4;
  justify-self: center;
  overflow: hidden;
  border: 1px solid rgba(216, 82, 72, 0.38);
  border-radius: 6px;
  background: #dfe6ef;
}
```

Remove the entire mobile override below `@media (max-width: 440px)`:

```css
.npc-identity {
  grid-template-columns: 84px 1fr;
}

.npc-portrait {
  width: 84px;
}
```

Keep the current typography, border treatment, `object-fit: cover`, and all history portrait rules unchanged.

- [x] **Step 7: Run the focused component test**

Run:

```bash
pnpm exec vitest run src/components/explorer/npc-profile.test.tsx
```

Expected: PASS.

- [x] **Step 8: Run the focused desktop and mobile end-to-end flow**

Run:

```bash
pnpm test:e2e --grep "locates, generates, and chats"
```

Expected: PASS in `desktop-chromium` and `mobile-chromium`; generated screenshots remain under `test-results/` for inspection.

- [x] **Step 9: Inspect both generated screenshots**

Open the desktop and mobile `*-generated.png` files and confirm:

- the portrait is the first visual in the NPC profile;
- the name and occupation sit below it;
- the portrait has no stretching, blank area, or overlap;
- profile facts and dialogue remain readable;
- the map and rails retain their existing widths;
- history thumbnails are unchanged.

- [x] **Step 10: Run the full quality gate**

Run:

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm format:check
git diff --check
```

Expected: every command exits `0`; lint has no new warning, all tests pass, and the production build completes.

- [x] **Step 11: Commit the implementation**

```bash
git add src/components/explorer/npc-profile.tsx \
  src/components/explorer/npc-profile.test.tsx \
  src/app/globals.css \
  tests/e2e/explorer.spec.ts
git commit -m "feat: enlarge NPC portrait presentation"
```
