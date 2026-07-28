# Practice Copilot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working Windows Electron practice assistant with a protected translucent overlay, tray-only lifecycle, global screenshot/answer hotkeys, encrypted BYOK settings, and streamed Markdown answers.

**Architecture:** Electron main owns all privileged behavior and secrets; a context-isolated preload exposes a narrow typed bridge; React renders the single-page overlay and settings. Pure settings, prompt, SSE, and state helpers remain independent of Electron so Vitest can exercise them first.

**Tech Stack:** Electron 41, React 19, TypeScript 5.8, electron-vite 3, Vitest 3, react-markdown, remark-gfm, npm/Node.js 20+

## Global Constraints

- Target Windows 10 2004+ and Windows 11 x64 only.
- Default window is `460 × 620 px`, minimum `380 × 440 px`, 24 px from the primary work-area right and bottom edges.
- Default accelerators are `Alt+Q`, `Alt+W`, `Alt+E`, and `Alt+X`.
- Keep only the latest JPEG screenshot in memory; never persist images or answers.
- Keep API keys exclusively in the main process and encrypt them with Electron `safeStorage`.
- Keep content protection permanently enabled and document its limitations.

---

### Task 1: Toolchain and Shared Contracts

**Files:**
- Create: `package.json`, `electron.vite.config.ts`, `tsconfig*.json`, `src/index.html`
- Create: `shared/protocol.ts`, `src/types.d.ts`
- Test: `test/protocol.spec.ts`

**Interfaces:**
- Produces `PublicSettings`, `SettingsPatch`, `AnswerEvent`, `CaptureResult`, `HotkeyAction`, `IPC`, and `PracticeApi` used by every later task.

- [ ] Write a failing protocol test that imports the default settings factory and expects the four required accelerators.
- [ ] Run `npm test -- test/protocol.spec.ts` and confirm failure because the factory does not exist.
- [ ] Add the TypeScript/Vite/Vitest configuration and shared contracts with exact IPC channel constants.
- [ ] Run the focused test and `npm run typecheck`; both must pass before continuing.

### Task 2: Settings, Validation, and Secret Storage

**Files:**
- Create: `electron/settings.ts`, `shared/validation.ts`
- Test: `test/settings.spec.ts`, `test/validation.spec.ts`

**Interfaces:**
- Produces `normalizeChatCompletionsUrl(baseUrl: string): string`, `validateSettingsPatch(patch): ValidationResult`, and `SettingsStore` with `getPublic`, `applyPatch`, `clearApiKey`, and `getApiKey`.

- [ ] Write failing tests for URL normalization, invalid protocols, prompt/model limits, forward-compatible settings merge, atomic persistence, encrypted key storage, keep-old-key-on-empty, and explicit key removal.
- [ ] Run the focused tests and confirm failures are caused by missing implementations.
- [ ] Implement pure validation first, then inject file and cipher dependencies into `SettingsStore` so tests use temporary directories and a deterministic cipher.
- [ ] Run both test files and confirm all cases pass.

### Task 3: Prompt Assembly and Streaming Client

**Files:**
- Create: `electron/llm/messages.ts`, `electron/llm/sse.ts`, `electron/llm/client.ts`
- Test: `test/messages.spec.ts`, `test/sse.spec.ts`, `test/llm-client.spec.ts`

**Interfaces:**
- Produces `buildVisionMessages`, async `parseSseStream`, and `streamVisionAnswer(options, emit, signal)`.
- Consumes normalized endpoint and decrypted API key from Task 2.

- [ ] Write failing tests for system/persistent/temporary prompt order, JPEG `image_url` payloads, fragmented SSE chunks, `[DONE]`, empty responses, HTTP errors, aborts, and secret-safe errors.
- [ ] Run the focused tests and observe expected failures.
- [ ] Implement the minimal OpenAI-compatible `/chat/completions` client with `fetch`, `Authorization: Bearer`, `stream: true`, and incremental `delta` emission.
- [ ] Run the three focused test files and confirm they pass.

### Task 4: Electron Desktop Services

**Files:**
- Create: `electron/capture.ts`, `electron/hotkeys.ts`, `electron/window-state.ts`, `electron/tray.ts`
- Test: `test/hotkeys.spec.ts`, `test/window-state.spec.ts`

**Interfaces:**
- Produces transactional `registerHotkeys`, `positionInWorkArea`, `clampBoundsToWorkArea`, `capturePrimaryDisplay`, and tray creation helpers.
- Emits semantic actions `capture`, `answer`, `toggle`, and `quit` to the main process coordinator.

- [ ] Write failing tests for transactional shortcut rollback and window clamping at 100%, 125%, and 150% scale-compatible work-area coordinates.
- [ ] Run focused tests and verify expected failures.
- [ ] Implement injected shortcut/window geometry helpers, then Electron adapters for primary display capture and tray lifecycle.
- [ ] Run focused tests and confirm pass.

### Task 5: Main Process and Secure Preload

**Files:**
- Create: `electron/main.ts`, `electron/preload.ts`
- Modify: `shared/protocol.ts`, `src/types.d.ts`
- Test: `test/lifecycle.spec.ts`

**Interfaces:**
- Exposes only `settings`, `capture`, `answer`, `window`, `app`, and event subscription methods declared by `PracticeApi`.
- Coordinates the latest in-memory screenshot and a single active `AbortController`.

- [ ] Write a failing coordinator test proving a new answer cancels the previous request and that quit unregisters shortcuts and destroys the tray.
- [ ] Run the focused test and confirm failure for missing coordinator behavior.
- [ ] Implement single-instance bootstrap, protected frameless `BrowserWindow`, tray-only close behavior, IPC input validation, latest-image memory, and graceful shutdown.
- [ ] Run the lifecycle test and Electron-side typecheck.

### Task 6: React Overlay and Settings UI

**Files:**
- Create: `src/main.tsx`, `src/App.tsx`, `src/state.ts`, `src/components/SettingsPanel.tsx`, `src/components/MarkdownAnswer.tsx`, `src/styles.css`
- Test: `test/state.spec.ts`, `test/app.spec.tsx`

**Interfaces:**
- Consumes `window.practice` from the preload bridge.
- Produces the A-layout UI with status, streamed answer, temporary prompt, and in-window settings overlay.

- [ ] Write failing reducer tests for capture, stream reset, delta append, completion, error, and retry-preserved screenshot state; write component tests for Markdown and settings validation feedback.
- [ ] Run the focused tests and verify expected failures.
- [ ] Implement the reducer and React components, using `react-markdown` plus `remark-gfm`, with accessible labels and no explicit “AI working” text.
- [ ] Implement the translucent dark theme, drag/no-drag regions, responsive minimum size, scroll behavior, and low-distraction streaming cursor.
- [ ] Run renderer tests and typecheck.

### Task 7: Packaging, Documentation, and End-to-End Verification

**Files:**
- Create: `build/tray-icon.svg`, `README.md`, `.gitignore`
- Modify: `package.json`

**Interfaces:**
- Produces `npm run dev`, `npm test`, `npm run typecheck`, `npm run build`, and Windows directory packaging commands.

- [ ] Add an original minimal tray icon, Electron Builder configuration, Windows x64 target, and concise setup/usage/security-limit documentation.
- [ ] Run `npm test`, `npm run typecheck`, and `npm run build` from a clean dependency install.
- [ ] Launch the built app long enough to verify no immediate main/preload/renderer crash, then close it via the documented shortcut or process-owned cleanup.
- [ ] Inspect `git status` and the final diff to ensure no screenshots, secrets, caches, or unrelated files are included.
