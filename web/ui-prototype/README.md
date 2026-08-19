# Signal Desk UI Prototype

Open `index.html` in a desktop browser to review the interface. No web server,
package installation, or external CDN is required.

This prototype is deliberately separate from the future Django project. It
demonstrates the shared desktop shell, role-specific navigation, customer ticket
submission, staff queue work, and separate joint/separate model dashboards.

## Design direction

The interface uses a "routing rail" as its signature: Intake → Route → Work →
Resolve. It is a visual reminder that the system's purpose is not merely to
store tickets, but to make their hand-off through the support operation clear.

The palette is Ink (`#17212B`), Mist (`#EDF2F4`), Paper (`#FFFFFF`), Signal
Orange (`#E2693F`), and Routing Teal (`#127B7F`). The fixed desktop layout,
wide tables, and persistent sidebar intentionally target the requested desktop
use case rather than a mobile layout.

When Django implementation starts, split the common shell into a base template,
retain the role navigation as one module with a small interface, and render the
role-specific page content from Django views. The `ticket_ml` package remains
an independent prediction module.
