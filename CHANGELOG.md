# Changelog

All notable changes to this plugin are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses
[Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-11-05

### Added

- Left-sidebar entry (`sidebar.panellist`, id `apikey-usage`) and the matching
  `main` panel with daily token usage and estimated cost per API key.
- Host aggregation over session logs: startup backfill (180 days / 200 sessions)
  plus live `session/event` ingestion.
- Provider-route → credential-name attribution with `keyLabels` override.
- Editable CNY price table persisted to `apikey-usage-config.json`, applied to
  the whole history immediately.
- Private JSON routes `POST /dsh-apikey-usage/api/{summary,scan,prices}` owned by
  the plugin fiber.
- 7 / 30 / 90 day ranges, summary tiles, per-key charts, daily and per-model
  tables, zh/en UI strings, bundle display metadata and icon.

### Fixed

- Route registrations are now effects of the plugin fiber, so disabling and
  re-enabling the bundle no longer leaves orphaned routes (which previously
  surfaced as `webserver: duplicate exact route`).
