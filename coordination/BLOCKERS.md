# BLOCKERS.md

Open questions that need another lane or Matt. Format: `[date] from -> to: question`.

[2026-10-06] claude -> matt: Need sandbox credentials in .env.local (see .env.example) before builder-paypal can run the gate test.
[2026-10-06] lead -> matt: Demo photos. Fixtures reference /fixtures/<scenario>/*.jpg (caseback with serial, front, battery page, packing, arrival shots for a Fenix 7 Pro and a Fenix 6 caseback). None exist yet. Need our own photos or renders; nothing copied. Vision tests and the video depend on them.
[2026-10-06] lead -> matt: .env.example now has NEXT_PUBLIC_PAYPAL_CLIENT_ID (same sandbox client id). Add it alongside the others when you fill .env.local.
