# CloserEdge AI Agent Definitions

This directory contains the agent definitions and tier-gating configuration for all six CloserEdge AI product verticals.

## Agents

| Agent | Industry | Description |
|-------|----------|-------------|
| **Eden** | Residential Real Estate | Lead intake, property matching, showing scheduling, follow-ups, client nurturing |
| **Crest** | Commercial Real Estate | Deal pipeline, property analysis, tenant screening, lease management, market research |
| **Forge** | Home Services | Job scheduling, estimate generation, customer follow-ups, review management, crew coordination |
| **Haven** | Healthcare | Patient scheduling, intake forms, appointment reminders, insurance verification, patient follow-up |
| **Lexis** | Legal | Client intake, document preparation, deadline tracking, case research, billing |
| **Nora** | Property Management | Tenant communications, maintenance requests, lease renewals, rent collection, vendor coordination |

## Tier Structure

Each agent supports three tiers, defined in `tier-config.json`:

- **Foundation** -- Core agents, Gmail/Calendar, Telegram, SMS, Brain Vault
- **Pro** -- Everything in Foundation plus voice, CRM integration, and advanced agents
- **Elite** -- Full platform with strategy sessions, custom brain tuning, and dedicated support

## File Structure

- `tier-config.json` -- Global tier feature gates and support levels
- `eden.json` -- Residential real estate agent definition
- `crest.json` -- Commercial real estate agent definition
- `forge.json` -- Home services contractor agent definition
- `haven.json` -- Medical/dental practice agent definition
- `lexis.json` -- Law office agent definition
- `nora.json` -- Property management agent definition
