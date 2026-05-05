# Decision Inbox: Infinite Campus login field parity

**Author:** Data  
**Date:** 2026-05-04T19:38:12.216-05:00  
**Status:** Proposed  
**Requested by:** Brady

## Decision

Keep the Infinite Campus login payload configurable with optional `appName` and `portalLoginPage` fields sourced from environment variables, while defaulting `appName` to `portal` so existing districts keep working unchanged.

## Rationale

Brady already validated these two fields against another working Infinite Campus integration, so matching that behavior reduces drift between repos and avoids district-specific login failures caused by hardcoded form data. Making the fields env-driven preserves the current no-code setup model for parents while letting discovery output feed directly into production configuration when a portal expects custom values.
