---
description: Create an agent handoff using the SiteTrack template. Usage: /handoff <work-item> <assigned-agent> <summary>
agent: team-lead
---

Read the handoff template from .agents/sitetrack-pro/handoff-template.md and create a new handoff entry.

Work item: $1
Assigned agent: $2
Summary: $ARGUMENTS

After creating the handoff, append it to the work board at .agents/sitetrack-pro/work-board.md with status "In Progress".
