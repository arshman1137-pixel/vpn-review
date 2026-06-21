# Changelog

## [v0.1.0] - 2026-05-15

### Added
- Full TDD implementation: 149 tests passing across 26 test files
- Security hardening: timing-safe auth compare, budget validation, HTML escaping
- Dashboard pages: budget overview and startup detail views
- Unit tests for auth, cxo, dashboard, heartbeat routes
- PII masker, rate limiting, startup config modules

### Fixed
- Replaced `any` types with eslint-disable in test files
- Removed unused variables
- HTML escaping in notify module
