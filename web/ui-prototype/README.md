# Signal Desk UI Prototype

Open `index.html` in a desktop browser to review the interface. No web server,
package installation, or external CDN is required.

The prototype includes a pinned local GSAP runtime in `vendor/gsap.min.js` and
the reusable motion layer in `motion.js`. Page sections, ticket dialogs, the
account menu, login transition, toast messages, and button press feedback use
short transform/opacity animations. Ticket dialogs use a coordinated shell
entrance/exit and keep the page underneath stable while they open, so the
background does not flash or replay its page transition. Animations
automatically reduce when the browser has `prefers-reduced-motion: reduce`
enabled.

This prototype is also the authenticated Django workspace shell. Opening
`index.html` directly keeps its design-review data and role switcher. When a
signed-in user visits the Django root page, Django serves this shell with the
real session identity, restricts it to that user's role, and uses a
CSRF-protected POST request for logout. The JSON endpoints progressively
replace the design-review arrays with SQLite data.

## Design direction

The interface uses a "routing rail" as its signature: Intake → Route → Work →
Resolve. It is a visual reminder that the system's purpose is not merely to
store tickets, but to make their hand-off through the support operation clear.

The palette is Ink (`#17212B`), Mist (`#EDF2F4`), Paper (`#FFFFFF`), Signal
Orange (`#E2693F`), and Routing Teal (`#127B7F`). The fixed desktop layout,
wide tables, and persistent sidebar intentionally target the requested desktop
use case rather than a mobile layout.

The `ticket_ml` package remains an independent prediction module. Django calls
it only through the read-only `PredictionService` adapter when a ticket is
submitted.
