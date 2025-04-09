# Active Context: Docker Dev Env & Dependency Updates

**Date:** April 9, 2025

**Status:** Updated project dependencies (Next.js 15, React 19, Tailwind 4). Simplified Docker setup for local development using Docker Compose. Minor updates to authentication routes.

**Recent Activity (April 9):**
- **Dependency Updates:** Updated major dependencies including Next.js (v15.2.4), React (v19.0.0), Tailwind CSS (v4), and others in `package.json` and `package-lock.json`.
- **Docker Simplification:** Modified `Dockerfile` to only include the `development` stage, commenting out production stages.
- **Docker Compose:** Added `docker-compose.yml` to manage the local development container build and runtime, targeting the `development` stage in the Dockerfile.
- **Auth Route Updates:** Minor changes to `src/app/api/auth/[...nextauth]/route.js` (exported `authOptions`, logging) and `src/app/api/auth/register/route.js` (logging, commented out auto-login).
- **Memory Bank Update:** Updated `techContext.md` and `systemPatterns.md` to reflect the Docker and dependency changes.

**Previous Activity (March 30):**
- **Project Renaming:** Replaced "Doclyze" with "Engineering Diagram Insights".
- **Build Error Fix:** Resolved syntax error in `bom/route.js`.
- **Puppeteer Environment Compatibility:** Ensured correct Puppeteer setup for local/prod.
- **Dockerfile Update (Previous):** Added production stage dependencies (now commented out).
- **API Route Fixes:** Addressed `sync-files` params error, added Gemini HTML cleanup.

**Current Focus:**
- Ensuring application stability after major dependency upgrades (Next.js 15, React 19).
- Testing the new Docker Compose local development setup.
- Verifying authentication flows after minor route updates.

**Next Steps:**
1.  Thoroughly test core features (upload, sync, reports, chat) with the new dependencies and Docker setup.
2.  Address any regressions or issues arising from the dependency upgrades.
3.  Continue with previous testing goals (report generation, sync, chat) once stability is confirmed.
4.  Refine PDF formatting/styling in the report generation API routes.
