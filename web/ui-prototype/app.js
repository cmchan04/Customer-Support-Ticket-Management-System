const roleDefinitions = {
  customer: {
    name: "Maya Lim",
    title: "Customer account",
    initials: "ML",
    nav: [
      ["01", "Dashboard", "dashboard"],
      ["02", "New ticket", "new-ticket"],
      ["03", "My tickets", "tickets"],
    ],
  },
  staff: {
    name: "Arun Patel",
    title: "Technical Support",
    initials: "AP",
    nav: [
      ["01", "My desk", "dashboard", "4"],
      ["02", "Unassigned", "unassigned", "6"],
      ["03", "My tickets", "assigned", "4"],
      ["04", "Waiting for customer", "waiting", "3"],
    ],
  },
  admin: {
    name: "Aisha Tan",
    title: "System administrator",
    initials: "AT",
    nav: [
      ["01", "Overview", "dashboard"],
      ["02", "Ticket management", "tickets", "42"],
      ["03", "Model centre", "models"],
      ["04", "Users", "users"],
      ["05", "Queues", "queues"],
      ["—", "Activity log", "activity"],
    ],
  },
};

const state = {
  role: "admin",
  page: "dashboard",
  activeModel: "joint",
  customerTicketDialog: null,
  activeDraftId: null,
  pendingClosureTicketIds: new Set(),
  discardedDraftIds: new Set(),
  accountMenuOpen: false,
  accountReturnPage: "dashboard",
  staffResolvedPeriod: "today",
};

const customerTickets = [
  {
    id: "TKT-000128",
    subject: "Unable to access the staff portal",
    priority: "High",
    status: ["Waiting for you", "waiting"],
    updated: "18 min ago",
    updatedDetail: "18 minutes ago",
    request: "I cannot access the staff portal after signing in. The page returns me to the login screen.",
    response: "Could you tell us which operating system and browser you are using? If possible, please attach a screenshot of the message you see.",
  },
  {
    id: "TKT-000121",
    subject: "Please update my billing address",
    priority: "Medium",
    status: ["In progress", "progress"],
    updated: "Yesterday",
    updatedDetail: "Yesterday",
    request: "I moved recently and need the billing address on my account updated before the next invoice is issued.",
    response: "We are checking the account record and will confirm when the address has been updated.",
  },
  {
    id: "TKT-000107",
    subject: "Request for a service quotation",
    priority: "Low",
    status: ["Resolved", "resolved"],
    updated: "12 Aug",
    updatedDetail: "12 August",
    request: "Please provide a quotation for an annual service plan for our team.",
    response: "Your quotation was prepared and sent to the email address on your account. Please create a new ticket if you need any changes.",
  },
];

const customerDrafts = [
  {
    id: "DRAFT-01",
    subject: "Question about my latest invoice",
    body: "I would like to confirm the amount shown on my latest invoice before I make payment.",
    issueChoice: "need_action",
    updated: "Today, 09:18",
  },
];

const accountProfiles = {
  customer: { firstName: "Maya", lastName: "Lim", email: "maya.lim@example.com", phone: "+60 12-345 6789" },
  staff: { firstName: "Arun", lastName: "Patel", email: "arun.patel@example.com", phone: "+60 12-456 7890" },
  admin: { firstName: "Aisha", lastName: "Tan", email: "aisha.tan@example.com", phone: "+60 12-567 8901" },
};

const staffResolvedPeriods = [
  { key: "today", label: "Today", value: "7", detail: "+3 compared with yesterday" },
  { key: "week", label: "This week", value: "31", detail: "+5 compared with last week" },
  { key: "month", label: "This month", value: "128", detail: "+12% compared with last month" },
];

const main = document.querySelector("#main-content");
const navigation = document.querySelector("#primary-navigation");
const breadcrumb = document.querySelector("#breadcrumb");
const toast = document.querySelector("#toast");
const accountMenu = document.querySelector("#account-menu");
const accountMenuTrigger = document.querySelector("#account-menu-trigger");

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function renderAccountMenu() {
  accountMenu.hidden = !state.accountMenuOpen;
  accountMenuTrigger.setAttribute("aria-expanded", String(state.accountMenuOpen));
}

function getActiveProfile() {
  return accountProfiles[state.role];
}

function getProfileDisplayName(profile) {
  return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
}

function getProfileInitials(profile) {
  return `${profile.firstName.trim().charAt(0)}${profile.lastName.trim().charAt(0)}`.toUpperCase();
}

function updateAccountIdentity() {
  const definition = roleDefinitions[state.role];
  const profile = getActiveProfile();
  const displayName = getProfileDisplayName(profile);
  const initials = getProfileInitials(profile);
  document.querySelector("#user-name").textContent = displayName;
  document.querySelector("#user-role").textContent = definition.title;
  document.querySelector("#account-menu-name").textContent = displayName;
  document.querySelector("#account-menu-role").textContent = definition.title;
  document.querySelector(".avatar").textContent = initials;
  document.querySelector(".avatar").className = `avatar avatar-${state.role}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
  }[character]));
}

function getPasswordRequirements(password) {
  return {
    length: password.length >= 8,
    uppercase: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9\s]/.test(password),
  };
}

function updatePasswordRequirementState(password) {
  const rules = getPasswordRequirements(password);
  document.querySelectorAll("#password-requirements [data-rule]").forEach((item) => {
    item.classList.toggle("met", rules[item.dataset.rule]);
  });
}

function passwordRequirementError(password) {
  const rules = getPasswordRequirements(password);
  const missing = [];
  if (!rules.length) missing.push("at least 8 characters");
  if (!rules.uppercase) missing.push("one uppercase letter");
  if (!rules.number) missing.push("one number");
  if (!rules.special) missing.push("one special character");
  return missing.length ? `Your new password needs ${missing.join(", ")}.` : "";
}

function getStaffResolvedPeriod() {
  return staffResolvedPeriods.find((period) => period.key === state.staffResolvedPeriod) || staffResolvedPeriods[0];
}

function openAccountPage(page) {
  state.accountMenuOpen = false;
  state.customerTicketDialog = null;
  if (state.page !== "edit-profile" && state.page !== "change-password") state.accountReturnPage = state.page;
  state.page = page;
  render();
}

function renderNavigation() {
  const definition = roleDefinitions[state.role];
  navigation.innerHTML = definition.nav.map(([mark, label, page, badge]) => {
    if (mark === "—") return `<span class="nav-section-label">${label}</span>`;
    const isActive = page === state.page;
    const warm = page === "unassigned" || (page === "tickets" && state.role !== "customer") ? " warm" : "";
    const badgeMarkup = state.role === "customer" && page === "tickets"
      ? renderCustomerTicketBadges()
      : badge ? `<span class="nav-badge${warm}">${badge}</span>` : "";
    return `
      <button class="nav-item ${isActive ? "active" : ""}" type="button" data-page="${page}">
        <span class="nav-mark">${mark}</span><span>${label}</span>
        ${badgeMarkup}
      </button>`;
  }).join("");
}

function pageTitle() {
  const accountPageTitles = { "edit-profile": "Edit profile", "change-password": "Change password" };
  if (accountPageTitles[state.page]) return accountPageTitles[state.page];
  const definition = roleDefinitions[state.role];
  const match = definition.nav.find((item) => item[2] === state.page);
  return match ? match[1] : "Dashboard";
}

function setRole(role) {
  state.role = role;
  state.page = "dashboard";
  state.customerTicketDialog = null;
  state.activeDraftId = null;
  state.accountMenuOpen = false;
  document.querySelectorAll(".role-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.role === role);
  });
  updateAccountIdentity();
  render();
}

function render() {
  renderNavigation();
  updateAccountIdentity();
  const isCustomer = state.role === "customer";
  breadcrumb.hidden = isCustomer;
  breadcrumb.textContent = isCustomer ? "" : `${state.role.charAt(0).toUpperCase() + state.role.slice(1)} / ${pageTitle()}`;
  const routingRail = document.querySelector(".routing-rail");
  routingRail.hidden = isCustomer;
  document.querySelector(".topbar").classList.toggle("customer-topbar", isCustomer);
  renderAccountMenu();
  main.innerHTML = renderPage();
  main.focus({ preventScroll: true });
}

function renderPage() {
  if (state.page === "edit-profile") return renderEditProfile();
  if (state.page === "change-password") return renderChangePassword();
  if (state.role === "customer") return renderCustomer();
  if (state.role === "staff") return renderStaff();
  return renderAdmin();
}

function renderEditProfile() {
  const profile = getActiveProfile();
  const definition = roleDefinitions[state.role];
  return `
    <div class="page-heading"><div><span class="eyebrow">Account settings</span><h1>Edit profile</h1><p>Keep your details current so the support team can contact you about your requests.</p></div></div>
    <div class="account-form-shell"><form id="profile-form" class="form-card account-form-card"><section class="account-identity-strip"><span class="account-profile-avatar avatar-${state.role}">${getProfileInitials(profile)}</span><div><span class="eyebrow">Your account</span><strong>${escapeHtml(getProfileDisplayName(profile))}</strong><p>${definition.title}</p></div></section><div class="form-grid"><div class="form-field"><label for="profile-first-name">First name</label><input id="profile-first-name" name="profile-first-name" autocomplete="given-name" maxlength="40" value="${escapeHtml(profile.firstName)}" required /></div><div class="form-field"><label for="profile-last-name">Last name</label><input id="profile-last-name" name="profile-last-name" autocomplete="family-name" maxlength="40" value="${escapeHtml(profile.lastName)}" required /></div><div class="form-field full"><label for="profile-email">Email address</label><input id="profile-email" name="profile-email" type="email" autocomplete="email" maxlength="120" value="${escapeHtml(profile.email)}" required /></div><div class="form-field full"><label for="profile-phone">Phone number <span>Optional</span></label><input id="profile-phone" name="profile-phone" type="tel" autocomplete="tel" maxlength="30" value="${escapeHtml(profile.phone)}" placeholder="For example: +60 12-345 6789" /></div></div><div class="notice"><span aria-hidden="true">↳</span><span><strong>These details are visible only to you and authorised support staff.</strong> They help us identify your account and contact you about an active request.</span></div><div class="form-actions"><button class="button signal" type="submit">Save changes</button><button class="button secondary" type="button" data-action="return-from-account">Cancel</button></div></form></div>`;
}

function renderChangePassword() {
  return `
    <div class="page-heading"><div><span class="eyebrow">Account settings</span><h1>Change password</h1><p>Use a new password that you do not use for another service.</p></div></div>
    <div class="account-form-shell"><form id="password-form" class="form-card account-form-card"><section class="security-strip"><span class="eyebrow">Secure your account</span><strong>Choose a strong, private password.</strong><p>Your password needs at least 8 characters, one uppercase letter, one number, and one special character.</p></section><div class="form-grid"><div class="form-field full"><label for="current-password">Current password</label><input id="current-password" name="current-password" type="password" autocomplete="current-password" required /></div><div class="form-field"><label for="new-password">New password</label><input id="new-password" name="new-password" type="password" autocomplete="new-password" minlength="8" aria-describedby="password-requirements password-form-error" required /></div><div class="form-field"><label for="confirm-password">Confirm new password</label><input id="confirm-password" name="confirm-password" type="password" autocomplete="new-password" minlength="8" required /></div></div><ul id="password-requirements" class="password-requirements" aria-label="Password requirements"><li data-rule="length">At least 8 characters</li><li data-rule="uppercase">One uppercase letter</li><li data-rule="number">One number</li><li data-rule="special">One special character</li></ul><p id="password-form-error" class="form-error" role="alert" hidden></p><div class="notice"><span aria-hidden="true">↳</span><span><strong>Keep your password private.</strong> Support staff will never ask you to disclose it in a ticket reply.</span></div><div class="form-actions"><button class="button signal" type="submit">Save new password</button><button class="button secondary" type="button" data-action="return-from-account">Cancel</button></div></form></div>`;
}

function status(label, tone) { return `<span class="status ${tone}">${label}</span>`; }
function priority(label) { return `<span class="priority ${label.toLowerCase()}">${label}</span>`; }

function getCustomerDrafts() {
  return customerDrafts.filter((draft) => !state.discardedDraftIds.has(draft.id));
}

function getCustomerTicketStatus(ticket) {
  return state.pendingClosureTicketIds.has(ticket.id)
    ? ["Pending closure", "pending-close"]
    : ticket.status;
}

function getCustomerActiveTickets() {
  return customerTickets.filter((ticket) => ticket.status[1] !== "resolved" && !state.pendingClosureTicketIds.has(ticket.id));
}

function getCustomerReplyCount() {
  return getCustomerActiveTickets().filter((ticket) => ticket.status[1] === "waiting").length;
}

function renderCustomerTicketBadges() {
  const replyCount = getCustomerReplyCount();
  const draftCount = getCustomerDrafts().length;
  const labels = [];
  if (replyCount) labels.push(`${replyCount} ticket${replyCount === 1 ? "" : "s"} need your reply`);
  if (draftCount) labels.push(`${draftCount} draft${draftCount === 1 ? "" : "s"}`);
  if (!labels.length) return "";
  return `<span class="nav-badges" aria-label="${labels.join(", ")}">${replyCount ? `<span class="nav-badge warm" title="Tickets needing your reply">${replyCount}</span>` : ""}${draftCount ? `<span class="nav-badge" title="Private drafts">${draftCount}</span>` : ""}</span>`;
}

function openCustomerTicket(ticketId) {
  state.page = "tickets";
  state.activeDraftId = null;
  state.customerTicketDialog = ticketId;
  render();
}

function continueCustomerDraft(draftId) {
  state.customerTicketDialog = null;
  state.activeDraftId = draftId;
  state.page = "new-ticket";
  render();
}

function renderCustomerTicketAction(ticket) {
  const [, tone] = getCustomerTicketStatus(ticket);
  if (tone === "resolved") return '<span class="customer-action-note closed">Closed</span>';
  if (tone === "pending-close") return '<span class="customer-action-note">Ready for closure</span>';
  return `<button class="button secondary row-action" type="button" data-action="mark-customer-resolved" data-ticket-id="${ticket.id}">Mark as resolved</button>`;
}

function renderCustomer() {
  if (state.page === "new-ticket") return renderNewTicket();
  if (state.page === "tickets") {
    return `
      <div class="page-heading"><div><h1>My tickets</h1><p>Drafts appear first, followed by every submitted request and its latest status.</p></div><div class="heading-actions"><button class="button signal" data-action="new-ticket">Create ticket</button></div></div>
      ${renderCustomerTable("all")}
      ${state.customerTicketDialog ? renderCustomerTicketDialog(state.customerTicketDialog) : ""}`;
  }
  return `
    <div class="page-heading"><div><span class="eyebrow">Good morning, ${escapeHtml(getActiveProfile().firstName)}</span><h1>What needs attention?</h1><p>Submit a request, follow a reply, or check the progress of an open ticket.</p></div><div class="heading-actions"><button class="button signal" data-action="new-ticket">Create ticket</button></div></div>
    <section class="model-banner"><div class="model-token">01</div><div><strong>Your next step: reply to TKT-000128</strong><p>A support specialist needs the operating system and browser you are using.</p></div><div class="model-banner-actions"><button class="button secondary" data-action="view-customer-ticket" data-ticket-id="TKT-000128">View ticket</button></div></section>
    <section class="metric-grid customer-metric-grid"><article class="metric-card"><span class="eyebrow">Active tickets</span><strong class="metric-value">${getCustomerActiveTickets().length}</strong><span class="metric-footer">Requests currently being handled</span></article><article class="metric-card"><span class="eyebrow">Your reply needed</span><strong class="metric-value">${getCustomerReplyCount()}</strong><span class="metric-footer"><span class="trend warn">Action</span> Send more details</span></article></section>
    ${renderCustomerTable("active")}`;
}

function renderCustomerTable(scope) {
  const activeOnly = scope === "active";
  const tickets = activeOnly ? getCustomerActiveTickets() : customerTickets;
  const draftRows = activeOnly ? "" : getCustomerDrafts().map((draft) => `<tr class="customer-ticket-row draft-ticket-row" tabindex="0" role="button" data-action="continue-draft" data-draft-id="${draft.id}" aria-label="Continue draft ${draft.subject}"><td><span class="ticket-code">${draft.id}</span></td><td><span class="ticket-subject">${draft.subject}</span></td><td class="muted">—</td><td>${status("Draft", "draft")}</td><td class="muted">${draft.updated}</td><td><div class="draft-actions"><button class="button text" type="button" data-action="continue-draft" data-draft-id="${draft.id}">Continue</button><button class="button text danger-text" type="button" data-action="discard-draft" data-draft-id="${draft.id}">Discard</button></div></td></tr>`).join("");
  const ticketRows = tickets.map((ticket) => {
    const [statusLabel, statusTone] = getCustomerTicketStatus(ticket);
    return `<tr class="customer-ticket-row" tabindex="0" role="button" data-action="view-customer-ticket" data-ticket-id="${ticket.id}" aria-label="Open ${ticket.id}: ${ticket.subject}"><td><span class="ticket-code">${ticket.id}</span></td><td><span class="ticket-subject">${ticket.subject}</span></td><td>${priority(ticket.priority)}</td><td>${status(statusLabel, statusTone)}</td><td class="muted">${ticket.updated}</td><td>${renderCustomerTicketAction(ticket)}</td></tr>`;
  }).join("");
  return `<section class="panel table-panel"><div class="panel-head"><div><h2>${activeOnly ? "Active tickets" : "Tickets and drafts"}</h2><p>${activeOnly ? "Open any ticket to view its conversation. Mark an issue resolved when you no longer need help." : "Private drafts are shown first. Select a ticket row to view its details and reply."}</p></div>${activeOnly ? '<button class="button text" data-page="tickets">View all tickets</button>' : ""}</div><table class="data-table"><thead><tr><th>Reference</th><th>Subject</th><th>Priority</th><th>Status</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${draftRows}${ticketRows}</tbody></table></section>`;
}

function renderCustomerTicketDialog(ticketId) {
  const ticket = customerTickets.find((item) => item.id === ticketId);
  if (!ticket) return "";
  const [statusLabel, statusTone] = getCustomerTicketStatus(ticket);
  const resolved = statusTone === "resolved";
  const readyForClosure = statusTone === "pending-close";
  const finishedNotice = resolved
    ? '<div class="notice"><span aria-hidden="true">✓</span><span><strong>This ticket is resolved.</strong> No further action is needed unless the issue happens again.</span></div>'
    : '<div class="notice"><span aria-hidden="true">✓</span><span><strong>You marked this ticket as resolved.</strong> It is ready for a staff member or administrator to close.</span></div>';
  return `
    <div class="ticket-dialog-backdrop">
      <section class="ticket-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-dialog-title">
        <header class="ticket-dialog-header"><div><span class="ticket-code">${ticketId}</span><h2 id="ticket-dialog-title">${ticket.subject}</h2></div><button class="dialog-close" type="button" data-action="close-customer-ticket" aria-label="Close ticket details">×</button></header>
        <dl class="ticket-dialog-meta"><div><dt>Priority</dt><dd>${priority(ticket.priority)}</dd></div><div><dt>Status</dt><dd>${status(statusLabel, statusTone)}</dd></div><div><dt>Last updated</dt><dd>${ticket.updatedDetail}</dd></div></dl>
        <div class="ticket-dialog-body"><h3>Conversation</h3><div class="conversation"><article class="conversation-message customer-message"><span>You</span><p>${ticket.request}</p></article><article class="conversation-message staff-message"><span>Support team</span><p>${ticket.response}</p></article></div>${resolved || readyForClosure ? finishedNotice : '<form id="customer-reply-form" class="reply-form"><label for="customer-reply">Reply to support</label><textarea id="customer-reply" name="customer-reply" placeholder="Add the details requested by the support team." required></textarea><div class="form-actions"><button class="button signal" type="submit">Send reply</button><button class="button secondary" type="button" data-action="close-customer-ticket">Cancel</button></div></form>'}</div>
      </section>
    </div>`;
}

function renderNewTicket() {
  const draft = state.activeDraftId ? getCustomerDrafts().find((item) => item.id === state.activeDraftId) : null;
  const isDraft = Boolean(draft);
  return `
    <div class="page-heading"><div><span class="eyebrow">${isDraft ? "Continue draft" : "New customer request"}</span><h1>${isDraft ? "Finish your draft." : "Tell us what happened."}</h1><p>${isDraft ? "Your draft is still private until you submit it." : "We will send your request to the right support team after you submit it."}</p></div></div>
    <div class="form-shell"><form id="ticket-form" class="form-card"><div class="form-grid"><div class="form-field full"><label for="subject">Subject</label><input id="subject" name="subject" maxlength="160" value="${draft?.subject ?? ""}" placeholder="For example: I cannot sign in to my account" required /></div><div class="form-field full"><label for="description">Describe your issue</label><textarea id="description" name="description" placeholder="Include what you were trying to do, what happened, and any helpful details." required>${draft?.body ?? ""}</textarea></div><div class="form-field full"><label for="issue-choice">What best describes this?</label><select id="issue-choice" name="issue-choice" required><option value="" ${isDraft ? "" : "selected"} disabled>Select one answer</option><option value="stopped_working" ${draft?.issueChoice === "stopped_working" ? "selected" : ""}>Something stopped working</option><option value="need_action" ${draft?.issueChoice === "need_action" ? "selected" : ""}>I need something done</option><option value="ongoing_issue" ${draft?.issueChoice === "ongoing_issue" ? "selected" : ""}>I have an ongoing issue</option><option value="change_request" ${draft?.issueChoice === "change_request" ? "selected" : ""}>I want to change something</option></select><p class="field-help">Your answer helps us route the request to the right support team. You do not need to know which team handles it.</p></div></div><div class="notice"><span aria-hidden="true">↳</span><span><strong>Save or submit when ready.</strong> Drafts stay private. When submitted, your ticket receives a reference number and is sent for routing.</span></div><div class="form-actions"><button class="button signal" type="submit">Submit ticket</button><button class="button secondary" type="button" data-action="save-draft">${isDraft ? "Save changes" : "Save as draft"}</button><button class="button text" type="button" data-page="${isDraft ? "tickets" : "dashboard"}">Cancel</button></div></form></div>`;
}

function renderStaff() {
  const isMyDesk = state.page === "dashboard";
  const staffName = getProfileDisplayName(getActiveProfile());
  const resolvedPeriod = getStaffResolvedPeriod();
  const assignedTickets = [
    { id: "TKT-000126", subject: "Password reset email does not arrive", customer: "Daniel Wong", type: "Incident", priority: "High", status: ["Reply needed", "waiting"], updated: "42 min ago" },
    { id: "TKT-000132", subject: "VPN connection drops after password change", customer: "Lina Tan", type: "Incident", priority: "High", status: ["In progress", "progress"], updated: "2 h ago" },
    { id: "TKT-000119", subject: "System is slow after the latest update", customer: "Jessica Low", type: "Problem", priority: "Medium", status: ["Waiting for customer", "waiting"], updated: "Yesterday" },
    { id: "TKT-000104", subject: "Unable to install the desktop client", customer: "Mohd Firdaus", type: "Request", priority: "Low", status: ["In progress", "progress"], updated: "12 Aug" },
  ];
  const renderAssignedRows = (tickets) => tickets.map((ticket) => `<tr><td><span class="ticket-code">${ticket.id}</span></td><td><span class="ticket-subject">${ticket.subject}</span><span class="muted">${ticket.customer} · ${ticket.type}</span></td><td>${priority(ticket.priority)}</td><td>${status(ticket.status[0], ticket.status[1])}</td><td>${staffName}</td><td class="muted">${ticket.updated}</td><td><button class="button secondary" data-action="open-ticket">Open</button></td></tr>`).join("");
  const recentAssignedRows = renderAssignedRows(assignedTickets.slice(0, 3));
  const assignedRows = renderAssignedRows(assignedTickets);
  const unassignedRows = `<tr><td><span class="ticket-code">TKT-000128</span></td><td><span class="ticket-subject">Unable to access the staff portal</span><span class="muted">Maya Lim · Incident</span></td><td>${priority("High")}</td><td>${status("Open", "open")}</td><td class="muted">Unassigned</td><td class="muted">18 min ago</td><td><button class="button signal" data-action="claim">Claim</button></td></tr>`;
  const waitingRows = renderAssignedRows(assignedTickets.filter((ticket) => ticket.status[0] === "Waiting for customer"));
  const tableTitle = isMyDesk ? "My active tickets" : state.page === "assigned" ? "My tickets" : state.page === "waiting" ? "Waiting for customer" : "Unassigned tickets";
  const tableSubtitle = isMyDesk
    ? `The three most recently updated tickets assigned to ${staffName}.`
    : state.page === "assigned"
      ? `All tickets currently assigned to ${staffName}.`
      : "Technical Support tickets in this view.";
  const tableRows = isMyDesk ? recentAssignedRows : state.page === "assigned" ? assignedRows : state.page === "waiting" ? waitingRows : unassignedRows;
  const tableAction = isMyDesk
    ? '<button class="button text panel-head-action" type="button" data-page="assigned">View all tickets</button>'
    : '<button class="button secondary" type="button" data-action="filter">Filter list</button>';
  const table = `<section class="panel table-panel"><div class="panel-head"><div><h2>${tableTitle}</h2><p>${tableSubtitle}</p></div>${tableAction}</div><table class="data-table"><thead><tr><th>Reference</th><th>Customer issue</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Last updated</th><th></th></tr></thead><tbody>${tableRows}</tbody></table></section>`;
  return `
    <div class="page-heading"><div><span class="eyebrow">Technical Support</span><h1>My desk</h1><p>Focus on your assigned tickets, requested replies, and closure work.</p></div></div>
    <section class="queue-banner"><div><span class="eyebrow">Your queue</span><h2>Technical Support</h2><p>System access, account, and technical troubleshooting requests.</p></div><div class="queue-count">QUEUE BACKLOG<strong>18</strong></div><div class="queue-count">UNASSIGNED<strong>6</strong></div><div class="queue-count">HIGH PRIORITY<strong>3</strong></div></section>
    <section class="metric-grid"><article class="metric-card"><span class="eyebrow">My active tickets</span><strong class="metric-value">4</strong><span class="metric-footer"><span class="trend warn">1</span> ticket waiting your reply</span></article><article class="metric-card"><span class="eyebrow">Pending closure</span><strong class="metric-value">2</strong><span class="metric-footer">Ready for your final review</span></article><article class="metric-card resolution-metric"><div class="metric-card-header"><span class="eyebrow">Tickets resolved</span><button class="metric-swap" type="button" data-action="cycle-staff-resolved-period" aria-label="Show the next resolved-ticket period" title="Show today, this week, or this month">↻</button></div><strong class="metric-value">${resolvedPeriod.value}</strong><span class="metric-footer"><span class="period-label">${resolvedPeriod.label}</span>${resolvedPeriod.detail}</span></article><article class="metric-card"><span class="eyebrow">Route corrections</span><strong class="metric-value">2</strong><span class="metric-footer"><span class="period-label">This week</span> Recorded for model review</span></article></section>
    ${table}`;
}

function renderAdmin() {
  if (state.page === "models") return renderModelCentre();
  if (state.page === "users" || state.page === "queues" || state.page === "activity") {
    const label = state.page.charAt(0).toUpperCase() + state.page.slice(1);
    return `<div class="page-heading"><div><span class="eyebrow">Administration</span><h1>${label}</h1><p>Manage the people and routing structure behind the service desk.</p></div><div class="heading-actions"><button class="button signal" data-action="placeholder">Add ${state.page === "users" ? "staff member" : "record"}</button></div></div><section class="empty-state"><div><strong>${label} workspace</strong><p>This prototype keeps the focus on the ticket and model workflows. In Django, this page will use the matching administration table and filters.</p></div></section>`;
  }
  return `
    <div class="page-heading"><div><span class="eyebrow">Operations command desk</span><h1>Route with evidence, not guesswork.</h1><p>Monitor the live ticket flow and the model decisions shaping each queue.</p></div><div class="heading-actions"><button class="button secondary" data-page="models">Model centre</button><button class="button signal" data-page="tickets">Review tickets</button></div></div>
    <section class="model-banner"><div class="model-token">JNT</div><div><strong>Joint model is routing new tickets</strong><p>Version 2026.08.19 · Queue macro F1 79.49% · Priority accuracy 80.26%</p></div><div class="model-banner-actions"><span class="live-dot">LIVE</span><button class="button secondary" data-page="models">Manage model</button></div></section>
    <section class="metric-grid"><article class="metric-card"><span class="eyebrow">Tickets processed</span><strong class="metric-value">1,284</strong><span class="metric-footer"><span class="trend">+8.4%</span> This month</span></article><article class="metric-card"><span class="eyebrow">Open backlog</span><strong class="metric-value">42</strong><span class="metric-footer"><span class="trend warn">12</span> High priority</span></article><article class="metric-card"><span class="eyebrow">Route corrections</span><strong class="metric-value">9.7%</strong><span class="metric-footer">Based on 361 reviewed tickets</span></article><article class="metric-card"><span class="eyebrow">Routing failures</span><strong class="metric-value">3</strong><span class="metric-footer"><span class="trend warn">Review required</span></span></article></section>
    <section class="two-column"><article class="panel"><div class="panel-head"><div><h2>Queues receiving work</h2><p>Joint model predictions from the last 30 days.</p></div><button class="button text" data-page="models">View model dashboard</button></div><div class="panel-body"><div class="bar-list"><div class="bar-row"><span class="bar-label">Technical Support</span><span class="bar-track"><span class="bar-fill" style="width: 87%"></span></span><span class="bar-value">381</span></div><div class="bar-row"><span class="bar-label">Product Support</span><span class="bar-track"><span class="bar-fill" style="width: 68%"></span></span><span class="bar-value">297</span></div><div class="bar-row"><span class="bar-label">Customer Service</span><span class="bar-track"><span class="bar-fill signal" style="width: 48%"></span></span><span class="bar-value">209</span></div><div class="bar-row"><span class="bar-label">Billing and Payments</span><span class="bar-track"><span class="bar-fill gold" style="width: 37%"></span></span><span class="bar-value">162</span></div><div class="bar-row"><span class="bar-label">Other queues</span><span class="bar-track"><span class="bar-fill" style="width: 27%"></span></span><span class="bar-value">235</span></div></div></div></article><article class="panel"><div class="panel-head"><div><h2>Decision trail</h2><p>Events requiring an administrator’s attention.</p></div><button class="button text" data-page="activity">All activity</button></div><div class="panel-body"><div class="activity-list"><div class="activity-item"><span class="activity-dot signal"></span><div><strong>Three tickets need manual routing</strong><p>Classification failed before a queue could be assigned.</p><time>11:42 TODAY</time></div></div><div class="activity-item"><span class="activity-dot gold"></span><div><strong>Staff corrected a queue prediction</strong><p>TKT-000115 moved from Customer Service to Billing and Payments.</p><time>10:26 TODAY</time></div></div><div class="activity-item"><span class="activity-dot"></span><div><strong>Separate model dashboard updated</strong><p>Seven reviewed tickets were added to its live accuracy sample.</p><time>09:03 TODAY</time></div></div></div></div></article></section>
    ${renderAdminTicketTable()}`;
}

function renderAdminTicketTable() {
  return `<section class="panel table-panel"><div class="panel-head"><div><h2>Tickets requiring attention</h2><p>Prioritised by workflow state and customer impact.</p></div><button class="button text" data-page="tickets">View all tickets</button></div><table class="data-table"><thead><tr><th>Reference</th><th>Customer request</th><th>Model used</th><th>Queue</th><th>Priority</th><th>Status</th><th></th></tr></thead><tbody><tr><td><span class="ticket-code">TKT-000128</span></td><td><span class="ticket-subject">Unable to access the staff portal</span><span class="muted">Maya Lim · submitted 18 min ago</span></td><td><span class="status open">Joint</span></td><td>Technical Support</td><td>${priority("High")}</td><td>${status("Open", "open")}</td><td><button class="button secondary" data-action="open-ticket">Open</button></td></tr><tr><td><span class="ticket-code">TKT-000125</span></td><td><span class="ticket-subject">Charge appears twice on invoice</span><span class="muted">Amir Hasan · submitted 39 min ago</span></td><td><span class="status draft">Separate</span></td><td>Billing and Payments</td><td>${priority("High")}</td><td>${status("In progress", "progress")}</td><td><button class="button secondary" data-action="open-ticket">Open</button></td></tr><tr><td><span class="ticket-code">TKT-000117</span></td><td><span class="ticket-subject">Unable to classify customer request</span><span class="muted">Yuki Tan · submitted yesterday</span></td><td><span class="status open">Joint</span></td><td class="muted">Routing failed</td><td>—</td><td>${status("Open", "open")}</td><td><button class="button signal" data-action="manual-route">Route</button></td></tr></tbody></table></section>`;
}

function renderModelCentre() {
  const joint = state.activeModel === "joint";
  return `
    <div class="page-heading"><div><span class="eyebrow">Model centre</span><h1>Keep model evidence separate.</h1><p>Switch the active model for future tickets, then compare each family only against its own reviewed outcomes.</p></div></div>
    <section class="model-compare"><article class="compare-card ${joint ? "selected" : ""}"><span class="eyebrow">${joint ? "Active deployment" : "Available deployment"}</span><h3>Joint model</h3><p>One queue-and-priority prediction with type-aware routing.</p><strong class="compare-stat">79.49% <small>queue F1</small></strong><div class="form-actions"><button class="button ${joint ? "secondary" : "signal"}" data-action="activate-joint">${joint ? "Currently active" : "Activate joint model"}</button><button class="button text" data-action="show-joint">Open dashboard</button></div></article><article class="compare-card ${!joint ? "selected" : ""}"><span class="eyebrow">${!joint ? "Active deployment" : "Available deployment"}</span><h3>Separate models</h3><p>Independent queue and priority pipelines with type-aware routing.</p><strong class="compare-stat">78.90% <small>queue F1</small></strong><div class="form-actions"><button class="button ${!joint ? "secondary" : "signal"}" data-action="activate-separate">${!joint ? "Currently active" : "Activate separate models"}</button><button class="button text" data-action="show-separate">Open dashboard</button></div></article></section>
    <section class="panel"><div class="tabs"><button class="tab active" type="button">${joint ? "Joint" : "Separate"} live performance</button><button class="tab" type="button">Queue outcomes</button><button class="tab" type="button">Priority outcomes</button><button class="tab" type="button">Training evaluation</button></div><div class="panel-body"><div class="metric-grid"><article class="metric-card"><span class="eyebrow">Processed by this model</span><strong class="metric-value">${joint ? "1,284" : "826"}</strong><span class="metric-footer">Historical tickets remain isolated</span></article><article class="metric-card"><span class="eyebrow">Reviewed tickets</span><strong class="metric-value">${joint ? "361" : "214"}</strong><span class="metric-footer">Live accuracy sample</span></article><article class="metric-card"><span class="eyebrow">Queue accuracy</span><strong class="metric-value">${joint ? "77.6%" : "75.8%"}</strong><span class="metric-footer">Staff-confirmed labels only</span></article><article class="metric-card"><span class="eyebrow">Priority accuracy</span><strong class="metric-value">${joint ? "79.4%" : "77.1%"}</strong><span class="metric-footer">High-priority recall tracked</span></article></div><div class="two-column"><article><h2 class="subheading">Correction rate by queue</h2><div class="bar-list"><div class="bar-row"><span class="bar-label">Technical Support</span><span class="bar-track"><span class="bar-fill" style="width: 14%"></span></span><span class="bar-value">6.1%</span></div><div class="bar-row"><span class="bar-label">Customer Service</span><span class="bar-track"><span class="bar-fill signal" style="width: 49%"></span></span><span class="bar-value">21.5%</span></div><div class="bar-row"><span class="bar-label">Billing and Payments</span><span class="bar-track"><span class="bar-fill gold" style="width: 25%"></span></span><span class="bar-value">10.8%</span></div></div></article><article><h2 class="subheading">Interpretation</h2><div class="notice"><span aria-hidden="true">↳</span><span><strong>Live performance is still maturing.</strong> Only tickets with staff-confirmed queue and priority labels contribute to the accuracy figures above.</span></div></article></div></div></section>`;
}

document.addEventListener("click", (event) => {
  if (!event.target.closest("#account-menu-shell") && state.accountMenuOpen) {
    state.accountMenuOpen = false;
    renderAccountMenu();
  }
  const roleButton = event.target.closest("[data-role]");
  if (roleButton) return setRole(roleButton.dataset.role);
  const pageButton = event.target.closest("[data-page]");
  if (pageButton) {
    state.page = pageButton.dataset.page;
    if (state.page === "new-ticket") state.activeDraftId = null;
    if (state.page !== "tickets") state.customerTicketDialog = null;
    render();
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "go-dashboard") {
    event.preventDefault();
    state.accountMenuOpen = false;
    state.customerTicketDialog = null;
    state.activeDraftId = null;
    state.page = "dashboard";
    render();
    return;
  }
  if (action === "toggle-account-menu") {
    state.accountMenuOpen = !state.accountMenuOpen;
    renderAccountMenu();
    return;
  }
  if (action === "edit-profile") {
    openAccountPage("edit-profile");
    return;
  }
  if (action === "change-password") {
    openAccountPage("change-password");
    return;
  }
  if (action === "return-from-account") {
    state.page = state.accountReturnPage || "dashboard";
    state.accountReturnPage = "dashboard";
    render();
    return;
  }
  if (action === "log-out") {
    state.accountMenuOpen = false;
    renderAccountMenu();
    showToast("Log out will end the authenticated Django session.");
    return;
  }
  if (action === "new-ticket") { state.activeDraftId = null; state.page = "new-ticket"; render(); return; }
  if (action === "view-customer-ticket") {
    openCustomerTicket(event.target.closest("[data-ticket-id]").dataset.ticketId);
    return;
  }
  if (action === "continue-draft") {
    continueCustomerDraft(event.target.closest("[data-draft-id]").dataset.draftId);
    return;
  }
  if (action === "discard-draft") {
    const draftId = event.target.closest("[data-draft-id]").dataset.draftId;
    state.discardedDraftIds.add(draftId);
    if (state.activeDraftId === draftId) state.activeDraftId = null;
    render();
    showToast(`${draftId} was discarded.`);
    return;
  }
  if (action === "mark-customer-resolved") {
    const ticketId = event.target.closest("[data-ticket-id]").dataset.ticketId;
    state.pendingClosureTicketIds.add(ticketId);
    render();
    showToast(`${ticketId} is ready for staff or administrator closure.`);
    return;
  }
  if (action === "close-customer-ticket") {
    state.customerTicketDialog = null;
    render();
    return;
  }
  if (action === "save-draft") { showToast(state.activeDraftId ? "Draft changes saved. It has not been sent for routing." : "Draft saved. It has not been sent for routing."); return; }
  if (action === "cycle-staff-resolved-period") {
    const currentIndex = staffResolvedPeriods.findIndex((period) => period.key === state.staffResolvedPeriod);
    state.staffResolvedPeriod = staffResolvedPeriods[(currentIndex + 1) % staffResolvedPeriods.length].key;
    render();
    return;
  }
  if (action === "claim") { showToast("TKT-000128 is now assigned to Arun Patel."); return; }
  if (action === "manual-route") { showToast("Manual routing form would open for TKT-000117."); return; }
  if (action === "open-ticket") { showToast("Ticket detail is the next Django template to implement."); return; }
  if (action === "filter") { showToast("Filters will apply to the ticket queryset in Django."); return; }
  if (action === "placeholder") { showToast("This management table will be connected during Django implementation."); return; }
  if (action === "activate-joint") { state.activeModel = "joint"; render(); showToast("Joint model selected for future ticket submissions."); return; }
  if (action === "activate-separate") { state.activeModel = "separate"; render(); showToast("Separate models selected for future ticket submissions."); return; }
  if (action === "show-joint") { state.activeModel = "joint"; render(); return; }
  if (action === "show-separate") { state.activeModel = "separate"; render(); }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.accountMenuOpen) {
    state.accountMenuOpen = false;
    renderAccountMenu();
    accountMenuTrigger.focus();
    return;
  }
  if (event.key !== "Enter" && event.key !== " ") return;
  const row = event.target.closest(".customer-ticket-row");
  if (!row || event.target.closest("button")) return;
  event.preventDefault();
  if (row.dataset.action === "view-customer-ticket") openCustomerTicket(row.dataset.ticketId);
  if (row.dataset.action === "continue-draft") continueCustomerDraft(row.dataset.draftId);
});

document.addEventListener("input", (event) => {
  if (event.target.id !== "new-password") return;
  updatePasswordRequirementState(event.target.value);
  const error = document.querySelector("#password-form-error");
  if (!error || error.hidden) return;
  const message = passwordRequirementError(event.target.value);
  error.textContent = message;
  error.hidden = !message;
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "profile-form") {
    event.preventDefault();
    const formData = new FormData(event.target);
    accountProfiles[state.role] = {
      firstName: String(formData.get("profile-first-name")).trim(),
      lastName: String(formData.get("profile-last-name")).trim(),
      email: String(formData.get("profile-email")).trim(),
      phone: String(formData.get("profile-phone")).trim(),
    };
    updateAccountIdentity();
    showToast("Profile changes saved.");
    return;
  }
  if (event.target.id === "password-form") {
    event.preventDefault();
    const currentPassword = event.target.elements["current-password"].value;
    const newPassword = event.target.elements["new-password"].value;
    const confirmPassword = event.target.elements["confirm-password"].value;
    const error = document.querySelector("#password-form-error");
    const requirementError = passwordRequirementError(newPassword);
    if (requirementError) {
      error.textContent = requirementError;
      error.hidden = false;
      return;
    }
    if (newPassword === currentPassword) {
      error.textContent = "Choose a new password that differs from your current password.";
      error.hidden = false;
      return;
    }
    if (newPassword !== confirmPassword) {
      error.textContent = "The new password and confirmation do not match.";
      error.hidden = false;
      return;
    }
    error.hidden = true;
    event.target.reset();
    showToast("New password saved.");
    return;
  }
  if (event.target.id === "customer-reply-form") {
    event.preventDefault();
    state.customerTicketDialog = null;
    render();
    showToast("Reply sent. Your ticket is now back with the support team.");
    return;
  }
  if (event.target.id !== "ticket-form") return;
  event.preventDefault();
  const submittedDraftId = state.activeDraftId;
  if (submittedDraftId) state.discardedDraftIds.add(submittedDraftId);
  state.activeDraftId = null;
  showToast(submittedDraftId ? "Draft submitted. The routing result will appear in your ticket timeline." : "Ticket submitted. The routing result will appear in your ticket timeline.");
  state.page = "tickets";
  window.setTimeout(render, 650);
});

render();
