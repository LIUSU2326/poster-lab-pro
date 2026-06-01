# AGENTS.md

## Current Collaboration Overrides

- For routine UI iteration, target the desktop workbench only unless mobile is explicitly requested.
- Do not run screenshot sweeps, Playwright visual checks, or full responsive verification for small UI fixes unless explicitly requested.
- Use lightweight verification for small UI fixes: syntax/type/build checks and desktop packaging only when the executable must be refreshed.
- Reserve full responsive checks, browser screenshots, Playwright runs, and broad test passes for large reviews or explicit user requests.

## Project Summary

这是一个面向游戏宣发素材的 AI 批量创意工作台。

## Document Reading Rules

- Always read this `AGENTS.md` first.
- Do not default to reading every project document in full.
- Read supporting documents only as needed for the task:
  - Product scope or new features: `PRODUCT.md`, `ROADMAP.md`, `DECISIONS.md`
  - UI, frontend, or interaction work: `DESIGN.md`, `PRODUCT.md`
  - Testing, bug fixes, or pre-release checks: `TESTING.md`, `DECISIONS.md`
  - Technical architecture, providers, queues, or storage: `DECISIONS.md`, `PRODUCT.md`
- For small local changes, read the relevant code and only the necessary docs.
- Prefer targeted lookup over broad document loading.

## Workflow Rules

- Before development, classify the task type and impact area.
- New features must be classified as `MVP`, `Beta`, `Later`, or `Out of Scope`.
- If product direction, UI style, technical architecture, or testing strategy changes, update the relevant document before implementation.
- Do not make broad code changes before the scope is clear.
- UI work should start with static flow and layout before connecting data or APIs.
- For UI redesigns, extract reference patterns, confirm information architecture, and document state coverage before implementation.
- Split complex features into small milestones before implementation.
- Keep changes scoped to the requested task. Do not perform unrelated refactors.

## UI/UX Rules

- Follow `DESIGN.md`.
- The product is a professional creative production tool, not a toy AI generator.
- Design desktop-first with high information density and clear hierarchy.
- Preserve the core workbench structure: left control panel, central brief/canvas area, right inspector, unless a design decision explicitly changes it.
- Avoid marketing landing pages, large rounded stacked cards, excessive gradients, toy-like styling, and empty sci-fi decoration.
- Results and generated images should visually dominate the interface, not decorative UI chrome.
- Core workbench UI should preserve the confirmed production-table model: left production config, center scheme/result board, contextual inspector, and lightweight task feedback.
- Theme tokens, provider settings, inspector behavior, and task queue changes must be reflected in `DESIGN.md`, `PRODUCT.md`, `ROADMAP.md`, `TESTING.md`, or `DECISIONS.md` before implementation when they affect product direction.
- After UI changes, check `1440`, `1024`, `768`, and `375px` for overlap and overflow.

## Engineering Rules

- Default target stack: Next.js App Router, TypeScript, Tailwind CSS, CSS Variables, Radix/shadcn-style components, and `lucide-react`.
- Forms should use React Hook Form and Zod.
- Image generation capabilities should use a provider adapter design and must not bind business logic to a single model.
- Do not introduce new dependencies casually. Explain why a new dependency is needed.
- Do not do unrelated rewrites or architecture churn.
- Keep provider, queue, storage, and UI boundaries explicit.

## Testing And Acceptance

- Before finishing important changes, run lint, typecheck, unit tests, and build when available.
- UI changes need browser or Playwright verification.
- New core logic should include focused tests.
- If tests cannot be run, explain why and name the remaining risk.
- Bug fixes should include either a regression test or a clear reason one was not practical.

## Change Management

Evaluate new ideas before implementation:

- What user problem does it solve?
- Is it `MVP`, `Beta`, `Later`, or `Out of Scope`?
- Which pages, data models, task queues, and tests are affected?
- Does it slow down MVP?
- What is the recommended implementation order?

After acceptance, update `ROADMAP.md` or `DECISIONS.md` before building.
