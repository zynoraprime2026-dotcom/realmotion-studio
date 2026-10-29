# RealMotion — AI Movie Studio

A cinematic, responsive web app for developing story ideas into editable, shot-by-shot film treatments.

## What works

- Full-screen motion-study hero with playback, scrubbing, and fullscreen controls
- Story prompt, visual-language, aspect-ratio, and duration controls
- Editable three-scene storyboard planner with timed storyboard playback
- Original concept collection with genre filters and detailed treatment previews
- Creative-seed handoff from any sample treatment into the studio
- Text treatment downloads
- Browser-local My films library with reopen, export, and confirmed deletion
- Keyboard-accessible dialogs and mobile navigation, reduced-motion support, and responsive layouts

## Scope and storage

This version is frontend-only. It creates storyboard briefs, not rendered AI video, and does not claim to call a video model. Projects are stored in this browser's localStorage; they do not sync across devices and are removed if site data is cleared.

## Run

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
npm run preview
```

## Visual system

React, TypeScript, Vite, Manrope, Instrument Serif, Lucide icons, custom CSS, and locally bundled cinematic artwork. The hero MP4 is a locally produced motion study from the hero artwork, so playback has no external runtime dependency.
