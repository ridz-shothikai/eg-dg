# Active Context: Project Renaming & Build Stability

**Date:** March 30, 2025

**Status:** Updated project name references from "Doclyze" to "Engineering Diagram Insights" across Memory Bank files. Build process is stable after resolving syntax errors.

**Recent Activity (March 30):**
- **Project Renaming:** Replaced instances of "Doclyze" with "Engineering Diagram Insights" in Memory Bank files (`projectbrief.md`, `productContext.md`, `systemPatterns.md`, `techContext.md`, `progress.md`). Updated UI title in `src/app/page.js`.
- **Build Error Fix:** Resolved persistent build errors by fixing a missing closing brace in `bom/route.js`.
- **Puppeteer Environment Compatibility:** Ensured conditional logic uses `NODE_ENV` to correctly select between local `puppeteer` and production `@sparticuz/chromium`.
- **Dockerfile Update:** Added `ENV NODE_ENV=production` and necessary Alpine dependencies (`chromium`, `nss`, etc.) for Puppeteer in the production stage.
- **GitHub Actions Update:** Added `NODE_ENV: production` to the build job environment (note: Dockerfile `ENV` is primary for runtime).
- **Next.js API Route Fix (`sync-files`):** Addressed "params should be awaited" error.
- **Gemini HTML Output Cleanup:** Added logic to remove Markdown fences.
- **Git Ignore Update:** Added `NUL` and external path to `.gitignore`.

**Previous Activity (March 28):**
- **Vercel Deployment Fixes:** Addressed `/tmp` directory usage and GCS downloads.
- **Chat Streaming Implementation:** Implemented streaming responses.
- **UI Refinements (Chat):** Updated loading indicator and copy button.

**Current Focus:**
- Verifying application stability after recent fixes and renaming.
- Testing core features (report generation, sync, chat) in both local and deployed environments.

**Next Steps:**
1.  Thoroughly test report generation (OCR, BoM, Compliance) locally and in the deployed environment.
2.  Test file syncing functionality.
3.  Test chat functionality.
4.  Address any remaining UI inconsistencies or bugs.
5.  Refine PDF formatting/styling in the report generation API routes.
6.  Continue with Phase 7 tasks (Testing, CI/CD, etc.) once current features are stable.
