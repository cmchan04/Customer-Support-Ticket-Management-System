const roleDefinitions = {
  customer: {
    name: "Maya Lim",
    title: "Customer account",
    initials: "ML",
    nav: [
      ["01", "Home", "dashboard"],
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
      ["02", "Ticket Pool", "unassigned", "6"],
      ["03", "My tickets", "assigned", "4"],
      ["04", "Performance", "performance"],
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
      ["04", "Queues & staff", "users"],
      ["—", "Records"],
      ["05", "Activity & audit log", "activity"],
    ],
  },
};

const PROTOTYPE_TODAY = new Date("2026-08-19T12:00:00");
const CUSTOMER_REPLY_WINDOW_MS = 86_400_000;
const CUSTOMER_CLOSURE_WINDOW_DAYS = 3;
const TICKET_TABLE_PAGE_SIZE = 10;
const TICKET_TABLE_PREVIEW_SIZE = 5;
const queueDashboardPeriods = [
  { key: "week", label: "This week", factor: 0.22, slaOffset: 2, graphLabels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] },
  { key: "month", label: "This month", factor: 1, slaOffset: 0, graphLabels: ["Week 1", "Week 2", "Week 3", "Week 4"] },
  { key: "quarter", label: "This quarter", factor: 3.05, slaOffset: -1, graphLabels: ["Jun", "Jul", "Aug"] },
  { key: "year", label: "This year", factor: 12.2, slaOffset: -2, graphLabels: ["Q1", "Q2", "Q3", "Q4"] },
];

const state = {
  authenticated: false,
  serverBacked: false,
  serverLoading: false,
  serverError: "",
  ticketDetails: new Map(),
  serverData: {
    customer: null,
    staff: null,
    staffPerformance: null,
    adminOverview: null,
    adminManagement: null,
    queuesStaff: null,
    audit: null,
    deployments: null,
    modelOperational: null,
  },
  role: "admin",
  page: "dashboard",
  activeModel: "joint",
  modelDashboard: null,
  modelOperationalPeriod: "month",
  customerTicketDialog: null,
  staffTicketDialog: null,
  adminTicketDialog: null,
  ticketDetailLoading: new Set(),
  pendingActions: new Set(),
  staffUserDialog: null,
  staffQueueFilter: "all",
  queueDashboardPeriod: "month",
  staffUserResolvedPeriod: "month",
  staffDeleteConfirmId: null,
  activeDraftId: null,
  customerFormRequestKey: "",
  customerActionPending: false,
  customerRequestStep: 1,
  customerRequestValues: null,
  customerRequestError: "",
  emptyDraftPrompt: false,
  pendingClosureTicketIds: new Set(),
  customerResolutionDates: new Map([["TKT-000104", "2026-08-17T09:00:00"]]),
  waitingForCustomerSince: new Map([["TKT-000119", "2026-08-18T10:00:00"]]),
  automaticallyResolvedTicketIds: new Set(),
  systemClosedTickets: new Map(),
  forceClosedTickets: new Map(),
  discardedDraftIds: new Set(),
  accountMenuOpen: false,
  accountReturnPage: "dashboard",
  staffResolvedPeriod: "today",
  staffPerformancePeriod: "week",
  staffPerformancePage: 1,
  customerTicketsPage: 1,
  staffTicketPoolPage: 1,
  staffMyTicketsPage: 1,
  adminAttentionPage: 1,
  adminAllTicketsPage: 1,
  adminTicketFiltersOpen: false,
  adminTicketSearch: "",
  adminTicketFilters: { model: "all", type: "all", queue: "all", priority: "all", status: "all", assignee: "all" },
  adminTicketSort: { key: "updated", direction: "desc" },
  ticketPoolFiltersOpen: false,
  ticketPoolFilters: { priority: "all", type: "all" },
  ticketPoolSort: { key: "ticketId", direction: "desc" },
  myTicketsFiltersOpen: false,
  myTicketsFilters: { priority: "all", status: "all" },
  myTicketsSearch: "",
  myTicketsSort: { key: "lastUpdated", direction: "asc" },
  claimedTicketAssignments: new Map(),
  staffReroutedTicketIds: new Set(),
  adminActivityView: "feed",
  auditQuery: "",
  auditCategory: "all",
  adminOverviewPeriod: "day",
  adminOverduePeriod: "month",
};

const customerTickets = [
  {
    id: "TKT-000128",
    subject: "Unable to access the staff portal",
    status: ["Waiting for Customer", "waiting"],
    updated: "18 min ago",
    updatedDetail: "18 minutes ago",
    request: "I cannot access the staff portal after signing in. The page returns me to the login screen.",
    response: "Could you tell us which operating system and browser you are using? If possible, please attach a screenshot of the message you see.",
  },
  {
    id: "TKT-000121",
    subject: "Please update my billing address",
    status: ["Waiting for Support", "waiting"],
    updated: "Yesterday",
    updatedDetail: "Yesterday",
    request: "I moved recently and need the billing address on my account updated before the next invoice is issued.",
    response: "We are checking the account record and will confirm when the address has been updated.",
  },
  {
    id: "TKT-000107",
    subject: "Request for a service quotation",
    status: ["Closed", "resolved"],
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
const customerPreviewTickets = [];
const customerReplyPreviewTickets = [];

const staffAssignedTickets = [
  { id: "TKT-000126", subject: "Password reset email does not arrive", createdBy: "Daniel Wong", type: "Incident", priority: "High", status: ["Waiting for Support", "waiting"], updated: "42 min ago", updatedOrder: 42 },
  { id: "TKT-000132", subject: "VPN connection drops after password change", createdBy: "Lina Tan", type: "Incident", priority: "High", status: ["Waiting for Support", "waiting"], updated: "2 h ago", updatedOrder: 120 },
  { id: "TKT-000119", subject: "System is slow after the latest update", createdBy: "Jessica Low", type: "Problem", priority: "Medium", status: ["Waiting for Customer", "waiting"], updated: "Yesterday", updatedOrder: 1440 },
  { id: "TKT-000104", subject: "Unable to install the desktop client", createdBy: "Mohd Firdaus", type: "Request", priority: "Low", status: ["Resolved", "resolved"], updated: "12 Aug", updatedOrder: 11520 },
];
const staffPreviewTickets = [];

const ticketPoolTickets = [
  { id: "TKT-000128", subject: "Unable to access the staff portal", createdBy: "Maya Lim", type: "Incident", priority: "High", createdAt: "18 min ago", createdOrder: 18 },
  { id: "TKT-000131", subject: "Cannot connect to the company VPN", createdBy: "Izzat Rahman", type: "Incident", priority: "High", createdAt: "34 min ago", createdOrder: 34 },
  { id: "TKT-000125", subject: "Desktop client opens to a blank screen", createdBy: "Priya Nair", type: "Problem", priority: "High", createdAt: "1 h ago", createdOrder: 60 },
  { id: "TKT-000120", subject: "Request access to the shared support mailbox", createdBy: "Ethan Lee", type: "Request", priority: "Medium", createdAt: "3 h ago", createdOrder: 180 },
  { id: "TKT-000116", subject: "Repeated sign-in prompt after update", createdBy: "Nur Aina", type: "Problem", priority: "Medium", createdAt: "Yesterday", createdOrder: 1440 },
  { id: "TKT-000111", subject: "Need help configuring the desktop application", createdBy: "Kavitha Devi", type: "Request", priority: "Low", createdAt: "Yesterday", createdOrder: 1500 },
];

const staffTicketConversations = {
  "TKT-000126": { customerMessage: "I have requested a password reset twice, but no reset email has arrived. I also checked my spam folder.", staffMessage: "We are checking the email-delivery logs. Please confirm the account email address if the next message does not arrive." },
  "TKT-000132": { customerMessage: "The VPN disconnects a few minutes after I changed my password. I cannot stay connected to company resources.", staffMessage: "We are reviewing the session logs. Please keep the VPN client open and tell us if another sign-in prompt appears." },
  "TKT-000119": { customerMessage: "The system has been noticeably slow since the latest update, especially when I open the dashboard.", staffMessage: "We have asked for the affected module and the time of the issue. We are waiting for those details before continuing the investigation." },
  "TKT-000104": { customerMessage: "I need help installing the desktop client on my work computer. The setup stops before the installation is complete.", staffMessage: "We shared the installation steps and are checking whether the setup log shows a permissions issue." },
  "TKT-000128": { customerMessage: "I cannot access the staff portal after signing in. The page returns me to the login screen.", staffMessage: "Please tell us which operating system and browser you are using. A screenshot of the message would also help." },
  "TKT-000131": { customerMessage: "I cannot connect to the company VPN from my laptop. The connection fails before it reaches the sign-in screen.", staffMessage: "No reply has been sent yet. Review the connection details and provide the next troubleshooting step." },
  "TKT-000125": { customerMessage: "The desktop client opens to a blank screen after I sign in. Restarting the application has not helped.", staffMessage: "No reply has been sent yet. Review the client version and request the relevant error details." },
  "TKT-000120": { customerMessage: "Please grant me access to the shared support mailbox so I can help with the team inbox.", staffMessage: "No reply has been sent yet. Confirm the required approval and access level before replying." },
  "TKT-000116": { customerMessage: "I am repeatedly asked to sign in again after the latest update, even when I select remember this device.", staffMessage: "No reply has been sent yet. Review the sign-in logs and request the device details if needed." },
  "TKT-000111": { customerMessage: "I need help configuring the desktop application for the first time. I am not sure which settings are required.", staffMessage: "No reply has been sent yet. Send the setup guide that matches the customer's operating system." },
};

const accountProfiles = {
  customer: { id: "customer-maya-lim", firstName: "Maya", lastName: "Lim", email: "maya.lim@gmail.com", phone: "+60 12-345 6789" },
  staff: { id: "staff-arun-patel", firstName: "Arun", lastName: "Patel", email: "arun.patel@outlook.com", phone: "+60 12-456 7890" },
  admin: { id: "admin-aisha-tan", firstName: "Aisha", lastName: "Tan", email: "aisha.tan@gmail.com", phone: "+60 12-567 8901" },
};

const adminActivityEvents = [
  { tone: "signal", category: "Routing", title: "Three tickets need manual routing", detail: "Classification failed before a queue could be assigned.", actor: "Routing service", time: "11:42 TODAY" },
  { tone: "gold", category: "Routing", title: "Staff corrected a queue prediction", detail: "TKT-000115 moved from Customer Service to Billing and Payments.", actor: "Arun Patel", time: "10:26 TODAY" },
  { tone: "", category: "Model", title: "Separate model dashboard updated", detail: "Seven reviewed tickets were added to its live accuracy sample.", actor: "Aisha Tan", time: "09:03 TODAY" },
  { tone: "", category: "Ticket", title: "Customer reopened a resolved ticket", detail: "TKT-000121 was returned to the Billing and Payments queue.", actor: "Maya Lim", time: "YESTERDAY, 16:18" },
  { tone: "gold", category: "Access", title: "Staff queue membership changed", detail: "Priya Nair was added to Product Support.", actor: "Aisha Tan", time: "YESTERDAY, 14:05" },
];

const auditLogRecords = [
  { timestamp: "19 Aug 2026, 11:42", actor: "Routing service", category: "Routing", action: "Classification failed", record: "TKT-000117", detail: "Queue prediction unavailable; manual routing required." },
  { timestamp: "19 Aug 2026, 10:26", actor: "Arun Patel", category: "Routing", action: "Corrected queue", record: "TKT-000115", detail: "Customer Service → Billing and Payments." },
  { timestamp: "19 Aug 2026, 09:03", actor: "Aisha Tan", category: "Model", action: "Updated review sample", record: "Separate model", detail: "Added 7 reviewed ticket outcomes." },
  { timestamp: "18 Aug 2026, 16:18", actor: "Maya Lim", category: "Ticket", action: "Reopened ticket", record: "TKT-000121", detail: "Customer marked the issue as unresolved." },
  { timestamp: "18 Aug 2026, 15:47", actor: "Arun Patel", category: "Ticket", action: "Claimed ticket", record: "TKT-000128", detail: "Moved from Ticket Pool to Arun Patel's desk." },
  { timestamp: "18 Aug 2026, 14:05", actor: "Aisha Tan", category: "Access", action: "Changed queue membership", record: "Priya Nair", detail: "Added to Product Support." },
  { timestamp: "18 Aug 2026, 13:26", actor: "Aisha Tan", category: "Model", action: "Selected active model", record: "Joint model", detail: "Set as the routing model for new submissions." },
  { timestamp: "17 Aug 2026, 17:14", actor: "Customer system", category: "Ticket", action: "Marked ticket resolved", record: "TKT-000104", detail: "Started the three-day customer review period." },
  { timestamp: "17 Aug 2026, 11:52", actor: "Aisha Tan", category: "Access", action: "Created staff account", record: "Priya Nair", detail: "Assigned the Product Support staff role." },
  { timestamp: "16 Aug 2026, 09:31", actor: "Routing service", category: "Routing", action: "Predicted ticket queue", record: "TKT-000128", detail: "Assigned Technical Support with high confidence." },
];

const adminTickets = [
  { id: "TKT-000117", subject: "Unable to classify customer request", customer: "Yuki Tan", type: "Request", request: "I submitted a request for help but the system could not determine which support team should receive it.", priority: null, model: "Joint", queue: "", assignee: "Unassigned", status: ["Open", "open"], updated: "Yesterday", routingFailed: true, reopened: false },
  { id: "TKT-000112", subject: "Account access request needs routing", customer: "Leon Ng", type: "Request", request: "I need access to a company application, but I am not sure which support team manages the required permissions.", priority: null, model: "Joint", queue: "", assignee: "Unassigned", status: ["Open", "open"], updated: "Today, 10:48", routingFailed: true, reopened: false },
  { id: "TKT-000103", subject: "Product issue has no supported category", customer: "Nabila Ibrahim", type: "Incident", request: "The product stopped working after an update, but none of the available categories describe the issue correctly.", priority: null, model: "Separate", queue: "", assignee: "Unassigned", status: ["Open", "open"], updated: "Today, 09:58", routingFailed: true, reopened: false },
  { id: "TKT-000121", subject: "Please update my billing address", customer: "Maya Lim", type: "Request", request: "I reopened this request because the billing address shown on my account still has not changed.", priority: "Medium", model: "Separate", queue: "Billing and Payments", assignee: "Billing team", status: ["Reopened", "reopened"], updated: "Yesterday, 16:18", routingFailed: false, reopened: true, predictionConfidence: { queue: 84, priority: 78 } },
  { id: "TKT-000128", subject: "Unable to access the staff portal", customer: "Maya Lim", type: "Incident", request: "I cannot access the staff portal after signing in. The page returns me to the login screen.", priority: "High", model: "Joint", queue: "Technical Support", assignee: "Arun Patel", status: ["Waiting for Customer", "waiting"], updated: "18 min ago", routingFailed: false, reopened: false, predictionConfidence: { queue: 91, priority: 87 } },
  { id: "TKT-000125", subject: "Charge appears twice on invoice", customer: "Amir Hasan", type: "Incident", request: "The same monthly charge appears twice on my invoice and I need it reviewed before the payment due date.", priority: "High", model: "Separate", queue: "Billing and Payments", assignee: "Billing team", status: ["Waiting for Support", "waiting"], updated: "39 min ago", routingFailed: false, reopened: false, predictionConfidence: { queue: 89, priority: 85 } },
  { id: "TKT-000118", subject: "Company VPN access is still unavailable", customer: "Rina Abdullah", type: "Incident", request: "I still cannot connect to the company VPN and need access restored before I can continue my work.", priority: "Medium", model: "Joint", queue: "Technical Support", assignee: "Arun Patel", status: ["Waiting for Support", "waiting"], updated: "Yesterday, 13:20", routingFailed: false, reopened: false, overdue: true, overdueLabel: "2 h overdue", predictionConfidence: { queue: 86, priority: 74 } },
  { id: "TKT-000110", subject: "Refund request has not been reviewed", customer: "Wei Jian", type: "Request", request: "I submitted a refund request but have not received an update on its review or the next step.", priority: "Low", model: "Separate", queue: "Billing and Payments", assignee: "Billing team", status: ["Waiting for Support", "waiting"], updated: "Yesterday, 10:12", routingFailed: false, reopened: false, overdue: true, overdueLabel: "1 day overdue", predictionConfidence: { queue: 82, priority: 79 } },
  { id: "TKT-000104", subject: "Unable to install the desktop client", customer: "Mohd Firdaus", type: "Request", request: "I need help installing the desktop client on my work computer. The setup stops before the installation is complete.", priority: "Low", model: "Joint", queue: "Technical Support", assignee: "Arun Patel", status: ["Resolved", "resolved"], updated: "12 Aug", routingFailed: false, reopened: false, predictionConfidence: { queue: 88, priority: 76 } },
];
const serverAdminAttentionTickets = [];

const adminQueueOptions = ["Technical Support", "Product Support", "Customer Service", "Billing and Payments"];
const adminPriorityOptions = ["High", "Medium", "Low"];
const staffQueueOptions = ["Technical Support", "Product Support", "Customer Service", "Billing and Payments", "Returns and Exchanges", "Service Outages and Maintenance", "Sales and Pre-Sales", "Human Resources", "General Inquiry"];
const staffUsers = [
  { id: "staff-arun-patel", firstName: "Arun", lastName: "Patel", email: "arun.patel@outlook.com", phone: "+60 12-456 7890", queue: "Technical Support", title: "Support specialist", status: "Available", activeTickets: 4, waitingReply: 1, resolved: { today: { count: 2, sla: "100%", time: "2 h 18 min" }, week: { count: 11, sla: "94%", time: "2 h 47 min" }, month: { count: 43, sla: "92%", time: "3 h 06 min" } } },
  { id: "staff-siti-aziz", firstName: "Siti", lastName: "Aziz", email: "siti.aziz@yahoo.com", phone: "+60 12-321 7788", queue: "Technical Support", title: "Support specialist", status: "In a ticket", activeTickets: 5, waitingReply: 2, resolved: { today: { count: 3, sla: "100%", time: "2 h 11 min" }, week: { count: 14, sla: "96%", time: "2 h 38 min" }, month: { count: 51, sla: "93%", time: "2 h 59 min" } } },
  { id: "staff-muhammad-amir", firstName: "Muhammad Amir", lastName: "Yusof", email: "muhammad.amir.yusof@gmail.com", phone: "+60 12-733 2184", queue: "Technical Support", title: "Technical support specialist", status: "Available", activeTickets: 3, waitingReply: 1, resolved: { today: { count: 2, sla: "100%", time: "2 h 31 min" }, week: { count: 10, sla: "93%", time: "2 h 58 min" }, month: { count: 37, sla: "91%", time: "3 h 20 min" } } },
  { id: "staff-yap-sze-min", firstName: "Yap", lastName: "Sze Min", email: "yap.szmin@yahoo.com", phone: "+60 12-841 4056", queue: "Technical Support", title: "Technical support specialist", status: "Available", activeTickets: 2, waitingReply: 0, resolved: { today: { count: 1, sla: "100%", time: "2 h 44 min" }, week: { count: 8, sla: "92%", time: "3 h 06 min" }, month: { count: 30, sla: "90%", time: "3 h 28 min" } } },
  { id: "staff-priya-nair", firstName: "Priya", lastName: "Nair", email: "priya.nair@outlook.com", phone: "+60 12-765 3301", queue: "Product Support", title: "Product support analyst", status: "Available", activeTickets: 3, waitingReply: 0, resolved: { today: { count: 2, sla: "100%", time: "2 h 41 min" }, week: { count: 9, sla: "95%", time: "3 h 02 min" }, month: { count: 36, sla: "91%", time: "3 h 22 min" } } },
  { id: "staff-james-wong", firstName: "James", lastName: "Wong", email: "james.wong@hotmail.com", phone: "+60 12-210 8843", queue: "Product Support", title: "Product support analyst", status: "Away", activeTickets: 4, waitingReply: 1, resolved: { today: { count: 1, sla: "100%", time: "2 h 55 min" }, week: { count: 8, sla: "92%", time: "3 h 15 min" }, month: { count: 31, sla: "90%", time: "3 h 36 min" } } },
  { id: "staff-nur-aina", firstName: "Nur", lastName: "Aina", email: "nur.aina.azman@gmail.com", phone: "+60 12-918 4421", queue: "Customer Service", title: "Customer service specialist", status: "Available", activeTickets: 2, waitingReply: 0, resolved: { today: { count: 4, sla: "100%", time: "1 h 49 min" }, week: { count: 16, sla: "97%", time: "2 h 09 min" }, month: { count: 62, sla: "95%", time: "2 h 28 min" } } },
  { id: "staff-farah-ismail", firstName: "Farah", lastName: "Ismail", email: "farah.ismail@yahoo.com", phone: "+60 12-344 9082", queue: "Customer Service", title: "Customer service specialist", status: "In a ticket", activeTickets: 5, waitingReply: 2, resolved: { today: { count: 3, sla: "100%", time: "1 h 57 min" }, week: { count: 13, sla: "95%", time: "2 h 19 min" }, month: { count: 55, sla: "93%", time: "2 h 37 min" } } },
  { id: "staff-kavitha-devi", firstName: "Kavitha", lastName: "Devi", email: "kavitha.devi@gmail.com", phone: "+60 12-630 1157", queue: "Billing and Payments", title: "Billing support specialist", status: "Available", activeTickets: 3, waitingReply: 1, resolved: { today: { count: 2, sla: "100%", time: "2 h 26 min" }, week: { count: 10, sla: "93%", time: "2 h 54 min" }, month: { count: 39, sla: "90%", time: "3 h 18 min" } } },
  { id: "staff-lee-chen", firstName: "Lee", lastName: "Chen", email: "lee.chen@outlook.com", phone: "+60 12-404 6622", queue: "Billing and Payments", title: "Billing support specialist", status: "Away", activeTickets: 2, waitingReply: 0, resolved: { today: { count: 1, sla: "100%", time: "2 h 33 min" }, week: { count: 7, sla: "94%", time: "3 h 07 min" }, month: { count: 29, sla: "91%", time: "3 h 29 min" } } },
];
// The staff directory is intentionally replaceable by the selected queue
// filter. Assignment dialogs use this separate collection so that a page
// filter can never hide valid assignees for another route queue.
const assignmentStaffUsers = staffUsers.map((user) => ({ ...user }));
const queueDashboardMetrics = [
  { queue: "Technical Support", backlog: 25, unassigned: 9, highPriority: 4, sla: "92%" },
  { queue: "Product Support", backlog: 14, unassigned: 4, highPriority: 2, sla: "94%" },
  { queue: "Customer Service", backlog: 13, unassigned: 3, highPriority: 1, sla: "95%" },
  { queue: "Billing and Payments", backlog: 10, unassigned: 2, highPriority: 2, sla: "91%" },
  { queue: "Returns and Exchanges", backlog: 6, unassigned: 1, highPriority: 0, sla: "96%" },
  { queue: "Service Outages and Maintenance", backlog: 5, unassigned: 2, highPriority: 2, sla: "89%" },
  { queue: "Sales and Pre-Sales", backlog: 4, unassigned: 1, highPriority: 0, sla: "97%" },
  { queue: "Human Resources", backlog: 3, unassigned: 0, highPriority: 0, sla: "98%" },
  { queue: "General Inquiry", backlog: 8, unassigned: 4, highPriority: 1, sla: "94%" },
];
const adminOverviewPeriods = [
  { key: "day", label: "Today", ticketsProcessed: 9, openBacklog: 8, highPriority: 2, routeCorrections: 0 },
  { key: "week", label: "This week", ticketsProcessed: 46, openBacklog: 11, highPriority: 3, routeCorrections: 3 },
  { key: "month", label: "This month", ticketsProcessed: 182, openBacklog: 18, highPriority: 7, routeCorrections: 12 },
];
const adminOverduePeriods = [
  { key: "month", label: "This month", counts: { "Technical Support": 4, "Product Support": 2, "Customer Service": 3, "Billing and Payments": 5 } },
  { key: "quarter", label: "This quarter", counts: { "Technical Support": 11, "Product Support": 7, "Customer Service": 9, "Billing and Payments": 13 } },
  { key: "year", label: "This year", counts: { "Technical Support": 38, "Product Support": 24, "Customer Service": 31, "Billing and Payments": 46 } },
];

const modelPerformance = {
  joint: {
    name: "Joint model",
    token: "JNT",
    version: "2026.08.19",
    description: "One type-aware classifier predicts the queue and priority outcome together.",
    processed: "1,284",
    reviewed: "361",
    queueAccuracy: "77.6%",
    priorityAccuracy: "79.4%",
    queueMetrics: [
      ["Holdout accuracy", "79.8%"],
      ["Macro F1", "79.49%"],
      ["Weighted F1", "79.7%"],
      ["Live correction rate", "9.7%"],
    ],
    priorityMetrics: [
      ["Holdout accuracy", "80.26%"],
      ["Macro F1", "78.9%"],
      ["Weighted F1", "80.1%"],
      ["High-priority recall", "82.4%"],
    ],
    operationalPeriods: {
      month: {
        label: "This month",
        queuePredictions: [["Technical Support", 60], ["Product Support", 28], ["Customer Service", 21], ["Billing and Payments", 14], ["Returns and Exchanges", 7], ["Service Outages and Maintenance", 6], ["Sales and Pre-Sales", 5], ["Human Resources", 3], ["General Inquiry", 2]],
        priorityPredictions: [["High", 57], ["Medium", 59], ["Low", 30]],
      },
      quarter: {
        label: "This quarter",
        queuePredictions: [["Technical Support", 173], ["Product Support", 80], ["Customer Service", 62], ["Billing and Payments", 41], ["Returns and Exchanges", 21], ["Service Outages and Maintenance", 18], ["Sales and Pre-Sales", 13], ["Human Resources", 9], ["General Inquiry", 6]],
        priorityPredictions: [["High", 165], ["Medium", 171], ["Low", 87]],
      },
      year: {
        label: "This year",
        queuePredictions: [["Technical Support", 526], ["Product Support", 242], ["Customer Service", 189], ["Billing and Payments", 125], ["Returns and Exchanges", 64], ["Service Outages and Maintenance", 53], ["Sales and Pre-Sales", 40], ["Human Resources", 27], ["General Inquiry", 18]],
        priorityPredictions: [["High", 500], ["Medium", 520], ["Low", 264]],
      },
    },
  },
  separate: {
    name: "Separate models",
    token: "SEP",
    version: "2026.08.18",
    description: "Independent queue and priority pipelines produce two predictions for each ticket.",
    processed: "826",
    reviewed: "214",
    queueAccuracy: "75.8%",
    priorityAccuracy: "76.1%",
    queueMetrics: [
      ["Holdout accuracy", "75.40%"],
      ["Macro F1", "78.90%"],
      ["Weighted F1", "75.9%"],
      ["Live correction rate", "12.6%"],
    ],
    priorityMetrics: [
      ["Holdout accuracy", "76.04%"],
      ["Macro F1", "75.28%"],
      ["Weighted F1", "75.94%"],
      ["High-priority recall", "81.02%"],
    ],
    operationalPeriods: {
      month: {
        label: "This month",
        queuePredictions: [["Technical Support", 38], ["Product Support", 18], ["Customer Service", 14], ["Billing and Payments", 9], ["Returns and Exchanges", 5], ["Service Outages and Maintenance", 4], ["Sales and Pre-Sales", 3], ["Human Resources", 2], ["General Inquiry", 1]],
        priorityPredictions: [["High", 37], ["Medium", 38], ["Low", 19]],
      },
      quarter: {
        label: "This quarter",
        queuePredictions: [["Technical Support", 112], ["Product Support", 51], ["Customer Service", 40], ["Billing and Payments", 27], ["Returns and Exchanges", 14], ["Service Outages and Maintenance", 11], ["Sales and Pre-Sales", 9], ["Human Resources", 6], ["General Inquiry", 4]],
        priorityPredictions: [["High", 107], ["Medium", 111], ["Low", 56]],
      },
      year: {
        label: "This year",
        queuePredictions: [["Technical Support", 337], ["Product Support", 155], ["Customer Service", 122], ["Billing and Payments", 81], ["Returns and Exchanges", 41], ["Service Outages and Maintenance", 34], ["Sales and Pre-Sales", 26], ["Human Resources", 18], ["General Inquiry", 12]],
        priorityPredictions: [["High", 321], ["Medium", 334], ["Low", 171]],
      },
    },
  },
};

const staffResolvedPeriods = [
  { key: "today", label: "Today", value: "7", detail: "+3 compared with yesterday" },
  { key: "week", label: "This week", value: "31", detail: "+5 compared with last week" },
  { key: "month", label: "This month", value: "128", detail: "+12% compared with last month" },
];

const staffPerformancePeriods = [
  {
    key: "today", label: "Today", resolved: "7", resolvedNote: "+3 compared with yesterday", firstReply: "18 min", firstReplyNote: "12 min under target", resolution: "2 h 44 min", resolutionNote: "26 min faster than usual", sla: "96%", slaNote: "24 of 25 tickets met target",
    cadence: [{ label: "09:00", value: 1 }, { label: "11:00", value: 2 }, { label: "13:00", value: 1 }, { label: "15:00", value: 2 }, { label: "17:00", value: 1 }],
    quality: [{ label: "First replies within target", detail: "Cases acknowledged inside 30 minutes", value: "96%" }, { label: "Tickets reopened", detail: "Resolved work reopened by a customer", value: "0" }, { label: "Route corrections", detail: "Corrections recorded for model review", value: "1" }],
  },
  {
    key: "week", label: "This week", resolved: "31", resolvedNote: "+5 compared with last week", firstReply: "21 min", firstReplyNote: "9 min under target", resolution: "3 h 12 min", resolutionNote: "18 min faster than last week", sla: "94%", slaNote: "58 of 62 tickets met target",
    cadence: [{ label: "Mon", value: 4 }, { label: "Tue", value: 5 }, { label: "Wed", value: 6 }, { label: "Thu", value: 5 }, { label: "Fri", value: 7 }, { label: "Sat", value: 4 }, { label: "Sun", value: 0 }],
    quality: [{ label: "First replies within target", detail: "Cases acknowledged inside 30 minutes", value: "94%" }, { label: "Tickets reopened", detail: "Resolved work reopened by a customer", value: "1" }, { label: "Route corrections", detail: "Corrections recorded for model review", value: "2" }],
  },
  {
    key: "month", label: "This month", resolved: "128", resolvedNote: "+12% compared with last month", firstReply: "24 min", firstReplyNote: "6 min under target", resolution: "3 h 26 min", resolutionNote: "34 min faster than last month", sla: "92%", slaNote: "228 of 248 tickets met target",
    cadence: [{ label: "Week 1", value: 28 }, { label: "Week 2", value: 31 }, { label: "Week 3", value: 34 }, { label: "Week 4", value: 35 }],
    quality: [{ label: "First replies within target", detail: "Cases acknowledged inside 30 minutes", value: "92%" }, { label: "Tickets reopened", detail: "Resolved work reopened by a customer", value: "4" }, { label: "Route corrections", detail: "Corrections recorded for model review", value: "7" }],
  },
];

const main = document.querySelector("#main-content");
const navigation = document.querySelector("#primary-navigation");
const breadcrumb = document.querySelector("#breadcrumb");
const toast = document.querySelector("#toast");
const accountMenu = document.querySelector("#account-menu");
const accountMenuTrigger = document.querySelector("#account-menu-trigger");
const loginScreen = document.querySelector("#login-screen");
const appShell = document.querySelector(".app-shell");
let toastTimer;
let lastRenderPageKey = "";
let lastRenderDialogKey = "";

function getPrototypeRoleForEmail(email) {
  const knownRoles = {
    "maya.lim@gmail.com": "customer",
    "arun.patel@outlook.com": "staff",
    "aisha.tan@gmail.com": "admin",
  };
  return knownRoles[email.trim().toLowerCase()] || "customer";
}

function showLoginScreen() {
  state.authenticated = false;
  appShell.hidden = true;
  loginScreen.hidden = false;
  window.ticketMotion?.enterLogin(loginScreen);
  window.setTimeout(() => document.querySelector("#login-email")?.focus(), 0);
}

function startPrototypeSession(email) {
  state.authenticated = true;
  const beginSession = () => {
    loginScreen.hidden = true;
    appShell.hidden = false;
    setRole(getPrototypeRoleForEmail(email));
  };
  if (window.ticketMotion) window.ticketMotion.leaveLogin(loginScreen, beginSession);
  else beginSession();
}

function getServerSession() {
  const session = window.ticketServerSession;
  return session?.authenticated ? session : null;
}

function serverSessionIsActive() {
  return Boolean(state.serverBacked && getServerSession());
}

function shouldRefreshRolePage(page = state.page) {
  if (!serverSessionIsActive()) return false;
  if (state.role === "customer") return ["dashboard", "tickets"].includes(page);
  if (state.role === "staff") return ["dashboard", "unassigned", "assigned", "performance"].includes(page);
  return false;
}

function refreshAfterPageNavigation() {
  // Navigation renders immediately so the destination feels responsive. The
  // server refresh that follows must not replace that entrance animation with
  // a no-animation render when its response arrives (which is especially
  // noticeable on the fast local development server).
  if (shouldRefreshRolePage()) void refreshServerData({ animatePage: true });
}

function getServerCsrfToken() {
  return getServerSession()?.csrfToken || "";
}

function createCustomerRequestKey() {
  return window.crypto?.randomUUID?.()
    || `ticket-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function ensureCustomerFormRequestKey() {
  if (!state.customerFormRequestKey) state.customerFormRequestKey = createCustomerRequestKey();
  return state.customerFormRequestKey;
}

function setCustomerTicketActionPending(form, pending, action = "") {
  state.customerActionPending = pending;
  if (!form?.isConnected) return;
  form.setAttribute("aria-busy", String(pending));
  form.querySelectorAll("button").forEach((button) => {
    button.disabled = pending;
    if (pending && !button.dataset.idleLabel) button.dataset.idleLabel = button.textContent;
    if (pending && button.type !== "button") button.textContent = action === "submit" ? "Submitting…" : "Working…";
    if (!pending && button.dataset.idleLabel) {
      button.textContent = button.dataset.idleLabel;
      delete button.dataset.idleLabel;
    }
  });
}

function ticketActionKey(role, ticketId) {
  return `ticket:${role}:${ticketId}`;
}

function findTicketActionButton(action, ticketId) {
  return [...document.querySelectorAll(`[data-action="${action}"]`)]
    .find((button) => button.dataset.ticketId === ticketId) || null;
}

function setActionScopePending(scope, pending, label = "Working…") {
  if (!scope?.isConnected) return;
  scope.setAttribute("aria-busy", String(pending));
  scope.classList.toggle("is-action-pending", pending);
  const buttons = scope.matches?.("button") ? [scope, ...scope.querySelectorAll("button")] : [...scope.querySelectorAll("button")];
  buttons.forEach((button) => {
    if (pending) {
      button.dataset.actionPendingDisabled = String(button.disabled);
      button.disabled = true;
      if ((button === scope || button.type === "submit") && !button.dataset.actionPendingLabel) {
        button.dataset.actionPendingLabel = button.textContent;
        button.textContent = label;
      }
    } else {
      button.disabled = button.dataset.actionPendingDisabled === "true";
      delete button.dataset.actionPendingDisabled;
      if (button.dataset.actionPendingLabel) {
        button.textContent = button.dataset.actionPendingLabel;
        delete button.dataset.actionPendingLabel;
      }
    }
  });
}

function beginPendingAction(key, scope, label = "Working…") {
  if (state.pendingActions.has(key)) return false;
  state.pendingActions.add(key);
  setActionScopePending(scope, true, label);
  return true;
}

function finishPendingAction(key, scope) {
  state.pendingActions.delete(key);
  setActionScopePending(scope, false);
}

async function serverRequest(path, { method = "GET", body, idempotencyKey } = {}) {
  const headers = { Accept: "application/json" };
  const request = { method, credentials: "same-origin", headers };
  if (method !== "GET") {
    headers["Content-Type"] = "application/json";
    headers["X-CSRFToken"] = getServerCsrfToken();
    if (idempotencyKey) headers["Idempotency-Key"] = idempotencyKey;
    request.body = JSON.stringify(body || {});
  }
  const response = await fetch(path, request);
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    const error = new Error(payload.detail || payload.error || `Request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return payload;
}

function serverUrl(path, params = {}) {
  const query = new URLSearchParams(
    Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ""),
  );
  const suffix = query.toString();
  return suffix ? `${path}?${suffix}` : path;
}

function replaceCollection(target, values) {
  target.splice(0, target.length, ...(values || []));
}

const serverStatusLabels = {
  DRAFT: "Draft",
  OPEN: "Open",
  WAITING_FOR_SUPPORT: "Waiting for Support",
  WAITING_FOR_CUSTOMER: "Waiting for Customer",
  RESOLVED: "Resolved",
  REOPENED: "Reopened",
  CLOSED: "Closed",
};

function serverStatusTone(statusCode) {
  return {
    DRAFT: "draft",
    OPEN: "open",
    WAITING_FOR_SUPPORT: "waiting",
    WAITING_FOR_CUSTOMER: "waiting",
    RESOLVED: "resolved",
    REOPENED: "reopened",
    CLOSED: "resolved",
  }[statusCode] || "open";
}

function serverPriorityLabel(value) {
  if (!value) return null;
  return String(value).charAt(0).toUpperCase() + String(value).slice(1).toLowerCase();
}

function issueChoiceForType(value) {
  return {
    Incident: "stopped_working",
    Request: "need_action",
    Problem: "ongoing_issue",
    Change: "change_request",
  }[value] || value || "";
}

function formatServerDate(value, { detail = false } = {}) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  const now = new Date();
  const seconds = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (!detail && seconds < 90) return "Just now";
  if (!detail && seconds < 86_400) {
    const minutes = Math.max(1, Math.round(seconds / 60));
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.round(minutes / 60);
    return `${hours} h ago`;
  }
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: detail ? "numeric" : undefined, hour: detail ? "2-digit" : undefined, minute: detail ? "2-digit" : undefined }).format(date);
}

function normalizeServerTicket(row) {
  const statusCode = String(row.status || "OPEN");
  const statusLabel = serverStatusLabels[statusCode] || row.admin_status || statusCode;
  const reference = row.reference || (row.id ? `TKT-${String(row.id).padStart(6, "0")}` : "");
  const previous = Array.isArray(row.previous_predictions) ? row.previous_predictions : [];
  const firstPrediction = previous[0];
  return {
    ...row,
    backendId: row.id,
    id: reference,
    subject: row.subject || "Untitled ticket",
    createdBy: row.customer || "Customer",
    customer: row.customer || "Customer",
    type: row.type || row.issue_type || "",
    request: row.description || row.request || "",
    priority: serverPriorityLabel(row.priority),
    status: [statusLabel, serverStatusTone(statusCode)],
    statusCode,
    updated: formatServerDate(row.updated_at),
    updatedDetail: formatServerDate(row.updated_at, { detail: true }),
    createdAt: formatServerDate(row.created_at),
    createdOrder: row.created_at ? new Date(row.created_at).getTime() : 0,
    updatedOrder: row.updated_at ? new Date(row.updated_at).getTime() : 0,
    assignee: row.assignee || "Unassigned",
    queue: row.queue || "",
    model: row.model_family === "separate" ? "Separate" : "Joint",
    modelVersion: row.model_version || "",
    predictedQueue: row.predicted_queue || "",
    predictedPriority: serverPriorityLabel(row.predicted_priority),
    routingFailed: Boolean(row.routing_failed),
    reroutedByStaff: Boolean(row.reroute_requests?.length) || /staff|rerout/i.test(String(row.routing_failure_reason || "")),
    overdue: Boolean(row.overdue),
    overdueLabel: row.overdue_label || "",
    predictionConfidence: row.queue_confidence_percent != null || row.priority_confidence_percent != null
      ? { queue: row.queue_confidence_percent, priority: row.priority_confidence_percent }
      : null,
    originalPrediction: firstPrediction
      ? { queue: firstPrediction.queue, priority: serverPriorityLabel(firstPrediction.priority) }
      : null,
    previousPredictions: previous,
    closureReason: row.force_close_reason || "",
    forceCloseReason: row.force_close_reason || "",
    closedAt: formatServerDate(row.closed_at, { detail: true }),
    customerReviewUntil: formatServerDate(row.customer_review_until, { detail: true }),
    resolutionSource: row.resolution_source || "",
  };
}

function mergeServerDetail(detail) {
  const mapped = normalizeServerTicket(detail);
  mapped.messages = Array.isArray(detail.messages) ? detail.messages : [];
  mapped.predictions = Array.isArray(detail.predictions) ? detail.predictions : [];
  mapped.rerouteRequests = Array.isArray(detail.reroute_requests) ? detail.reroute_requests : [];
  mapped.reroutedByStaff = mapped.rerouteRequests.length > 0 || mapped.reroutedByStaff;
  state.ticketDetails.set(mapped.id, mapped);
  getTicketRecords(mapped.id).forEach((ticket) => Object.assign(ticket, mapped));
  return mapped;
}

function mapServerSummaryRows(rows) {
  return (rows || []).map(normalizeServerTicket);
}

async function refreshServerData({ renderAfter = true, animatePage = false } = {}) {
  if (!serverSessionIsActive()) return;
  state.serverLoading = true;
  state.serverError = "";
  try {
    if (state.role === "customer") {
      const dashboard = await serverRequest(serverUrl("/api/reporting/customer/dashboard/", {
        page: state.customerTicketsPage,
        page_size: TICKET_TABLE_PAGE_SIZE,
      }));
      state.serverData.customer = dashboard;
      replaceCollection(customerTickets, mapServerSummaryRows(dashboard.tickets));
      replaceCollection(customerPreviewTickets, mapServerSummaryRows(dashboard.preview_tickets));
      replaceCollection(customerReplyPreviewTickets, mapServerSummaryRows(dashboard.reply_preview));
      replaceCollection(customerDrafts, mapServerSummaryRows(dashboard.drafts).map((draft) => ({ ...draft, issueChoice: issueChoiceForType(draft.type || draft.issue_type), body: draft.request || "" })));
      state.customerTicketsPage = Number(dashboard.tickets_pagination?.page || state.customerTicketsPage || 1);
      if (state.customerTicketDialog && !customerTickets.some((ticket) => ticket.id === state.customerTicketDialog)) {
        state.customerTicketDialog = null;
      }
    } else if (state.role === "staff") {
      const [dashboard, performance] = await Promise.all([
        serverRequest(serverUrl("/api/reporting/staff/dashboard/", {
          pool_page: state.staffTicketPoolPage,
          my_page: state.staffMyTicketsPage,
          page_size: TICKET_TABLE_PAGE_SIZE,
          pool_priority: state.ticketPoolFilters.priority,
          pool_type: state.ticketPoolFilters.type,
          pool_search: "",
          pool_sort: state.ticketPoolSort.key === "ticketId" ? "ticketId" : state.ticketPoolSort.key,
          pool_direction: state.ticketPoolSort.direction,
          my_priority: state.myTicketsFilters.priority,
          my_status: state.myTicketsFilters.status,
          my_search: state.myTicketsSearch,
          my_sort: state.myTicketsSort.key === "ticketId" ? "ticketId" : state.myTicketsSort.key,
          my_direction: state.myTicketsSort.direction,
          resolved_period: state.staffResolvedPeriod,
        })),
        serverRequest(`/api/reporting/staff/performance/?page=${state.staffPerformancePage || 1}&period=${encodeURIComponent(state.staffPerformancePeriod || "week")}`),
      ]);
      state.serverData.staff = dashboard;
      state.serverData.staffPerformance = performance;
      replaceCollection(staffAssignedTickets, mapServerSummaryRows(dashboard.tickets));
      replaceCollection(staffPreviewTickets, mapServerSummaryRows(dashboard.preview_tickets));
      replaceCollection(ticketPoolTickets, mapServerSummaryRows(dashboard.ticket_pool));
      state.staffTicketPoolPage = Number(dashboard.ticket_pool_pagination?.page || state.staffTicketPoolPage || 1);
      state.staffMyTicketsPage = Number(dashboard.tickets_pagination?.page || state.staffMyTicketsPage || 1);
      roleDefinitions.staff.title = dashboard.staff?.queue || roleDefinitions.staff.title;
    } else if (state.role === "admin") {
      const [overview, management, queuesStaff, audit, deployments] = await Promise.all([
        serverRequest(serverUrl("/api/reporting/admin/overview/", {
          period: state.adminOverviewPeriod,
          overdue_period: state.adminOverduePeriod,
          attention_page: 1,
          page_size: TICKET_TABLE_PREVIEW_SIZE,
        })),
        serverRequest(serverUrl("/api/reporting/admin/ticket-management/", {
          page: state.adminAllTicketsPage,
          attention_page: state.adminAttentionPage,
          page_size: TICKET_TABLE_PAGE_SIZE,
          search: state.adminTicketSearch,
          model: state.adminTicketFilters.model,
          type: state.adminTicketFilters.type,
          queue: state.adminTicketFilters.queue,
          priority: state.adminTicketFilters.priority,
          status: state.adminTicketFilters.status,
          assignee: state.adminTicketFilters.assignee,
          sort: state.adminTicketSort.key,
          direction: state.adminTicketSort.direction,
        })),
        serverRequest(serverUrl("/api/accounts/queues-staff/", {
          period: state.queueDashboardPeriod || "month",
          queue_id: state.staffQueueFilter !== "all"
            ? state.serverData.queuesStaff?.queues?.find((queue) => queue.name === state.staffQueueFilter)?.id
            : undefined,
        })),
        serverRequest(serverUrl("/api/audit/activity/", { q: state.auditQuery, category: state.auditCategory })),
        serverRequest("/api/model/deployments/"),
      ]);
      state.serverData.adminOverview = overview;
      state.serverData.adminOverdueOverview = overview;
      state.serverData.adminManagement = management;
      state.serverData.queuesStaff = queuesStaff;
      state.serverData.audit = audit;
      state.serverData.deployments = deployments;
      if (deployments.active_family === "joint" || deployments.active_family === "separate") state.activeModel = deployments.active_family;
      replaceCollection(adminTickets, mapServerSummaryRows(management.all_tickets));
      const attentionRows = [...mapServerSummaryRows(management.attention), ...mapServerSummaryRows(overview.tickets_requiring_attention)];
      const uniqueAttentionRows = [...new Map(attentionRows.map((ticket) => [ticket.id, ticket])).values()];
      replaceCollection(serverAdminAttentionTickets, uniqueAttentionRows);
      state.adminAllTicketsPage = Number(management.all_pagination?.page || state.adminAllTicketsPage || 1);
      state.adminAttentionPage = Number(management.attention_pagination?.page || state.adminAttentionPage || 1);
      replaceCollection(staffUsers, (queuesStaff.staff || []).map(normalizeServerStaffUser));
      // Keep assignment choices independent from the selected directory
      // queue. The endpoint returns all active staff in assignment_staff.
      if (Array.isArray(queuesStaff.assignment_staff)) {
        replaceCollection(assignmentStaffUsers, queuesStaff.assignment_staff.map(normalizeServerStaffUser));
      }
      replaceCollection(adminActivityEvents, (audit.events || []).slice(0, 5).map((event) => ({
        tone: event.category === "ROUTING" ? "signal" : event.category === "ACCESS" ? "gold" : "",
        category: event.category,
        title: event.action,
        detail: typeof event.detail === "object" ? JSON.stringify(event.detail) : String(event.detail || ""),
        actor: event.actor,
        time: formatServerDate(event.timestamp),
      })));
      replaceCollection(auditLogRecords, (audit.events || []).map((event) => ({
        timestamp: formatServerDate(event.timestamp, { detail: true }),
        actor: event.actor,
        category: event.category,
        action: event.action,
        record: event.record,
        detail: typeof event.detail === "object" ? JSON.stringify(event.detail) : String(event.detail || ""),
      })));
    }
    state.serverLoading = false;
    if (renderAfter) {
      render({ skipPageAnimation: !animatePage, forcePageAnimation: animatePage });
    }
  } catch (error) {
    state.serverLoading = false;
    state.serverError = error.message || "Unable to load the support workspace.";
    showToast(state.serverError);
    if (renderAfter) {
      render({ skipPageAnimation: !animatePage, forcePageAnimation: animatePage });
    }
  }
}

async function refreshServerModelOperational(family = state.modelDashboard, period = state.modelOperationalPeriod) {
  if (!serverSessionIsActive() || !family) return;
  try {
    const data = await serverRequest(serverUrl(`/api/model/deployments/${encodeURIComponent(family)}/operational/`, { period }));
    state.serverData.modelOperational = data;
    render({ skipPageAnimation: true });
  } catch (error) {
    showToast(error.message || "Unable to load model operational data.");
  }
}

async function refreshServerTicketDetail(ticketId, role) {
  if (!serverSessionIsActive()) return null;
  const loadingKey = `${role}:${ticketId}`;
  if (state.ticketDetailLoading.has(loadingKey)) return null;
  state.ticketDetailLoading.add(loadingKey);
  const ticket = state.ticketDetails.get(ticketId) || getTicketRecords(ticketId).find(Boolean);
  const backendId = ticket?.backendId || ticketId;
  try {
    const detail = await serverRequest(`/api/tickets/${encodeURIComponent(backendId)}/`);
    const mapped = mergeServerDetail(detail);
    if (role === "customer") state.customerTicketDialog = mapped.id;
    if (role === "staff") state.staffTicketDialog = mapped.id;
    if (role === "admin") state.adminTicketDialog = mapped.id;
    render({ skipPageAnimation: true });
    return mapped;
  } catch (error) {
    if (role === "customer" && error.status === 404) {
      state.ticketDetails.delete(ticketId);
      state.customerTicketDialog = null;
      await refreshServerData({ renderAfter: false });
      render({ skipPageAnimation: true });
      showToast("This ticket is closed and is no longer available.");
      return null;
    }
    showToast(error.message || "Unable to load ticket details.");
    return null;
  } finally {
    state.ticketDetailLoading.delete(loadingKey);
  }
}

function startServerSession(session) {
  const role = String(session.role || "customer").toLowerCase();
  if (!roleDefinitions[role]) return showLoginScreen();

  const profile = {
    id: session.id,
    firstName: String(session.firstName || "").trim(),
    lastName: String(session.lastName || "").trim(),
    email: String(session.email || "").trim(),
    phone: String(session.phone || "").trim(),
  };
  accountProfiles[role] = profile;
  state.serverBacked = true;
  roleDefinitions[role] = {
    ...roleDefinitions[role],
    name: getProfileDisplayName(profile) || roleDefinitions[role].name,
    title: String(session.title || roleDefinitions[role].title),
  };
  state.authenticated = true;
  loginScreen.hidden = true;
  appShell.hidden = false;
  // A Django session has one real role.  The prototype's role switcher stays
  // available only when index.html is opened directly for design review.
  document.querySelector(".role-picker")?.setAttribute("hidden", "");
  setRole(role);
  void refreshServerData();
}

function logOutOfServerSession() {
  const session = getServerSession();
  if (!session?.logoutUrl || !session.csrfToken) {
    showLoginScreen();
    return;
  }
  const form = document.createElement("form");
  form.method = "post";
  form.action = session.logoutUrl;
  const token = document.createElement("input");
  token.type = "hidden";
  token.name = "csrfmiddlewaretoken";
  token.value = session.csrfToken;
  form.appendChild(token);
  document.body.appendChild(form);
  form.submit();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.ticketMotion?.enterToast(toast);
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    window.ticketMotion?.leaveToast(toast);
    toast.classList.remove("show");
  }, 3200);
}

function renderAccountMenu() {
  accountMenu.hidden = !state.accountMenuOpen;
  accountMenuTrigger.setAttribute("aria-expanded", String(state.accountMenuOpen));
  if (state.accountMenuOpen) window.ticketMotion?.animateAccountMenu(accountMenu, true);
}

function getActiveProfile() {
  return accountProfiles[state.role];
}

function getProfileDisplayName(profile) {
  return [profile.firstName, profile.lastName].filter(Boolean).join(" ");
}

function normalizeServerStaffUser(person) {
  return {
    ...person,
    id: String(person.id),
    firstName: person.first_name ?? person.firstName ?? "",
    lastName: person.last_name ?? person.lastName ?? "",
    title: person.title || "Support specialist",
    status: person.active === false ? "Inactive" : (person.status || "Available"),
    activeTickets: Number(person.active_tickets || 0),
    waitingReply: Number(person.waiting_for_reply || 0),
    resolved: {
      today: { count: Number(person.resolved || 0), sla: "—", time: "—" },
      week: { count: Number(person.resolved || 0), sla: "—", time: "—" },
      month: { count: Number(person.resolved || 0), sla: "—", time: "—" },
    },
  };
}

function getAssignmentStaffNames(queueName) {
  if (!queueName) return [];
  const source = serverSessionIsActive() ? assignmentStaffUsers : staffUsers;
  return [...new Set(source
    .filter((user) => user.queue === queueName && getProfileDisplayName(user))
    .map((user) => getProfileDisplayName(user)))];
}

function renderAdminAssigneeOptions(queueName, selectedName = "") {
  const names = ["Unassigned", ...getAssignmentStaffNames(queueName)];
  // Keep the local prototype's team labels visible for its static fixture
  // tickets. Server-backed tickets are always constrained to real staff
  // returned by the selected queue's active assignments.
  if (!serverSessionIsActive() && selectedName && !names.includes(selectedName)) names.push(selectedName);
  return names.map((assignee) => `<option value="${escapeHtml(assignee)}" ${selectedName === assignee ? "selected" : ""}>${escapeHtml(assignee)}</option>`).join("");
}

function getAvailableTicketPoolTickets() {
  return ticketPoolTickets.filter((ticket) => (
    !state.claimedTicketAssignments.has(ticket.id)
    && !state.staffReroutedTicketIds.has(ticket.id)
    && !state.forceClosedTickets.has(ticket.id)
    && !state.systemClosedTickets.has(ticket.id)
    && ticket.status?.[0] !== "Closed"
  ));
}

function getTicketRecords(ticketId) {
  return [customerTickets, customerPreviewTickets, customerReplyPreviewTickets, staffAssignedTickets, ticketPoolTickets, adminTickets, serverAdminAttentionTickets]
    .map((tickets) => tickets.find((ticket) => ticket.id === ticketId))
    .filter(Boolean);
}

function setTicketStatus(ticketId, label, tone, updates = {}) {
  getTicketRecords(ticketId).forEach((ticket) => {
    Object.assign(ticket, { status: [label, tone], ...updates });
  });
}

function markTicketResolved(ticketId, { automatic = false } = {}) {
  if (state.forceClosedTickets.has(ticketId) || state.systemClosedTickets.has(ticketId)) return;
  const waitingSince = state.waitingForCustomerSince.get(ticketId);
  const resolvedAt = automatic && waitingSince
    ? new Date(new Date(waitingSince).getTime() + CUSTOMER_REPLY_WINDOW_MS)
    : PROTOTYPE_TODAY;
  state.pendingClosureTicketIds.add(ticketId);
  state.customerResolutionDates.set(ticketId, resolvedAt.toISOString());
  state.waitingForCustomerSince.delete(ticketId);
  if (automatic) state.automaticallyResolvedTicketIds.add(ticketId);
  else state.automaticallyResolvedTicketIds.delete(ticketId);
  setTicketStatus(ticketId, "Resolved", "resolved", {
    updated: automatic ? "Resolved automatically" : "Resolved by customer",
    updatedDetail: automatic ? "Automatically resolved after one day" : "Resolved by customer",
  });
}

function syncTicketLifecycle() {
  state.waitingForCustomerSince.forEach((waitingSince, ticketId) => {
    if (PROTOTYPE_TODAY.getTime() - new Date(waitingSince).getTime() >= CUSTOMER_REPLY_WINDOW_MS) {
      markTicketResolved(ticketId, { automatic: true });
    }
  });
  state.customerResolutionDates.forEach((resolvedAt, ticketId) => {
    const closesAt = new Date(resolvedAt);
    closesAt.setDate(closesAt.getDate() + CUSTOMER_CLOSURE_WINDOW_DAYS);
    if (closesAt.getTime() > PROTOTYPE_TODAY.getTime() || state.forceClosedTickets.has(ticketId) || state.systemClosedTickets.has(ticketId)) return;
    const closure = {
      closedAt: formatClosureDate(closesAt),
      closedOrder: closesAt.getTime(),
      reason: "Customer did not reopen the resolved ticket within 3 days.",
      closedBy: "System",
    };
    state.systemClosedTickets.set(ticketId, closure);
    setTicketStatus(ticketId, "Closed", "resolved", {
      updated: "Closed automatically",
      updatedDetail: closure.reason,
      closedAt: closure.closedAt,
      closureReason: closure.reason,
    });
  });
}

function getTicketClosureDetails(ticketId) {
  const forcedClosure = state.forceClosedTickets.get(ticketId);
  if (forcedClosure) {
    return { ...forcedClosure, isClosed: true, daysRemaining: 0, forced: true };
  }
  const systemClosure = state.systemClosedTickets.get(ticketId);
  if (systemClosure) {
    return { ...systemClosure, isClosed: true, daysRemaining: 0, automatic: true };
  }
  const markedResolvedAt = state.customerResolutionDates.get(ticketId);
  if (!markedResolvedAt) return null;
  const markedAt = new Date(markedResolvedAt);
  const closesAt = new Date(markedAt);
  closesAt.setDate(closesAt.getDate() + CUSTOMER_CLOSURE_WINDOW_DAYS);
  const remainingMilliseconds = closesAt.getTime() - PROTOTYPE_TODAY.getTime();
  return {
    markedAt,
    closesAt,
    isClosed: remainingMilliseconds <= 0,
    daysRemaining: Math.max(0, Math.ceil(remainingMilliseconds / 86_400_000)),
  };
}

function formatClosureDate(date) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(date);
}

function getClosureCountdownLabel(closure) {
  if (closure.daysRemaining === 0) return "Closes today";
  return `Closes in ${closure.daysRemaining} day${closure.daysRemaining === 1 ? "" : "s"}`;
}

function getStaffTicketRecord(ticket) {
  const closure = getTicketClosureDetails(ticket.id);
  if (closure?.forced) {
    return {
      ...ticket,
      status: ["Closed", "resolved"],
      closure,
      closedAt: closure.closedAt,
      closedOrder: closure.closedOrder,
      resolvedIn: "Force closed by administrator",
    };
  }
  if (!closure) return { ...ticket, closure: null };
  if (closure.isClosed) {
    return {
      ...ticket,
      status: ["Closed", "resolved"],
      closure,
      closedAt: formatClosureDate(closure.closesAt),
      closedOrder: closure.closesAt.getTime(),
      resolvedIn: ticket.resolvedIn || "3 days",
    };
  }
  return { ...ticket, status: ["Resolved", "resolved"], closure };
}

function getClaimedStaffTickets() {
  return ticketPoolTickets
    .filter((ticket) => state.claimedTicketAssignments.get(ticket.id) === getActiveProfile().id)
    .map((ticket) => getStaffTicketRecord({ ...ticket, status: ["Waiting for Support", "waiting"], updated: "Just claimed", updatedOrder: 0 }));
}

function getStaffWorkTickets() {
  return [...getClaimedStaffTickets(), ...staffAssignedTickets.map((ticket) => getStaffTicketRecord(ticket))]
    .filter((ticket) => !state.staffReroutedTicketIds.has(ticket.id));
}

function getStaffActiveTickets() {
  return getStaffWorkTickets().filter((ticket) => ticket.status[0] !== "Closed" && !ticket.closure?.isClosed);
}

function getClaimedTicketCountForStaff(staffId) {
  return ticketPoolTickets.filter((ticket) => (
    state.claimedTicketAssignments.get(ticket.id) === staffId
    && !getTicketClosureDetails(ticket.id)?.isClosed
  )).length;
}

function getStaffPendingReplyCount() {
  return getStaffActiveTickets().filter((ticket) => ["Waiting for Support", "Reopened"].includes(ticket.status[0])).length;
}

function getFilteredStaffMyTickets() {
  const search = state.myTicketsSearch.trim().toLowerCase();
  return getStaffActiveTickets().filter((ticket) => {
    const searchable = [ticket.id, ticket.subject, ticket.request, ticket.createdBy, ticket.type, ticket.priority, ticket.status?.[0], ticket.queue, ticket.assignee, ticket.updated].filter(Boolean).join(" ").toLowerCase();
    return (state.myTicketsFilters.priority === "all" || ticket.priority === state.myTicketsFilters.priority)
      && (state.myTicketsFilters.status === "all" || ticket.status?.[0] === state.myTicketsFilters.status)
      && (!search || searchable.includes(search));
  });
}

function getAssignedStaffName(staffId) {
  const profile = Object.values(accountProfiles).find((item) => item.id === staffId);
  return profile ? getProfileDisplayName(profile) : "Assigned staff";
}

function getStaffTicket(ticketId) {
  return getStaffActiveTickets().find((ticket) => ticket.id === ticketId)
    || staffPreviewTickets.find((ticket) => ticket.id === ticketId)
    || state.ticketDetails.get(ticketId);
}

function rerouteStaffTicketToAdmin(ticketId) {
  const ticket = getStaffTicket(ticketId);
  if (!ticket) {
    showToast("That ticket is no longer available in your desk.");
    return;
  }
  const staffName = getProfileDisplayName(getActiveProfile());
  const conversation = staffTicketConversations[ticket.id];
  const routingRecord = {
    id: ticket.id,
    subject: ticket.subject,
    customer: ticket.createdBy,
    type: ticket.type,
    request: conversation?.customerMessage || `The customer needs help with: ${ticket.subject}.`,
    priority: ticket.priority,
    model: state.activeModel === "joint" ? "Joint" : "Separate",
    originalPrediction: {
      queue: roleDefinitions.staff.title,
      priority: ticket.priority,
    },
    predictionConfidence: { queue: 71, priority: 84 },
    queue: "",
    assignee: "Unassigned",
    status: ["Open", "open"],
    updated: `Sent by ${staffName}`,
    routingFailed: true,
    reopened: false,
    reroutedByStaff: true,
  };
  const existingRecord = getAdminTicket(ticket.id);
  if (existingRecord) Object.assign(existingRecord, routingRecord);
  else adminTickets.unshift(routingRecord);
  state.staffReroutedTicketIds.add(ticket.id);
  state.claimedTicketAssignments.delete(ticket.id);
  adminActivityEvents.unshift({ tone: "signal", category: "Routing", title: "Staff sent a ticket for manual rerouting", detail: `${ticket.id} was returned by ${staffName} because it does not belong to the current queue.`, actor: staffName, time: "JUST NOW" });
  auditLogRecords.unshift({ timestamp: "19 Aug 2026, 12:04", actor: staffName, category: "Routing", action: "Sent ticket for manual rerouting", record: ticket.id, detail: "Staff determined that the ticket does not belong to their assigned queue." });
  closeActiveDialog("staffTicketDialog", () => showToast(`${ticket.id} was sent to Admin Ticket management for manual rerouting.`));
}

function renderStaffTicketStatus(ticket) {
  const countdown = ticket.closure && !ticket.closure.isClosed
    ? `<span class="closure-window">${getClosureCountdownLabel(ticket.closure)}</span>`
    : "";
  return `${status(ticket.status[0], ticket.status[1])}${countdown}`;
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
  if (serverSessionIsActive() && state.serverData.staff?.resolved_period === state.staffResolvedPeriod) {
    const labels = { today: "Today", week: "This week", month: "This month" };
    return {
      key: state.staffResolvedPeriod,
      label: labels[state.staffResolvedPeriod] || state.staffResolvedPeriod,
      value: String(Number(state.serverData.staff.resolved_period_count || 0)),
      detail: " resolved in selected period",
    };
  }
  return staffResolvedPeriods.find((period) => period.key === state.staffResolvedPeriod) || staffResolvedPeriods[0];
}

function getStaffPerformancePeriod() {
  return staffPerformancePeriods.find((period) => period.key === state.staffPerformancePeriod) || staffPerformancePeriods[0];
}

function openAccountPage(page) {
  state.accountMenuOpen = false;
  state.customerTicketDialog = null;
  state.staffTicketDialog = null;
  if (state.page !== "edit-profile" && state.page !== "change-password") state.accountReturnPage = state.page;
  state.page = page;
  render();
}

function closeActiveDialog(dialogStateKey, afterClose) {
  const finish = () => {
    state[dialogStateKey] = null;
    if (dialogStateKey === "staffUserDialog") state.staffDeleteConfirmId = null;
    render({ skipPageAnimation: true });
    afterClose?.();
  };
  if (main.querySelector(".ticket-dialog-backdrop") && window.ticketMotion?.animateDialogExit) {
    window.ticketMotion.animateDialogExit(main, finish);
    return;
  }
  finish();
}

function renderNavigation() {
  const definition = roleDefinitions[state.role];
  const staffId = state.role === "staff" ? getActiveProfile().id : null;
  const claimedTicketCount = staffId ? getClaimedTicketCountForStaff(staffId) : 0;
  navigation.innerHTML = definition.nav.map(([mark, label, page, badge]) => {
    if (mark === "—") return `<span class="nav-section-label">${label}</span>`;
    const isActive = page === state.page;
    const isStaffReplyAction = state.role === "staff" && page === "dashboard";
    const warm = page === "unassigned" || (page === "tickets" && state.role !== "customer") ? " warm" : "";
    const badgeClass = isStaffReplyAction ? " action" : warm;
    const displayedBadge = state.role === "staff" && page === "dashboard"
      ? (serverSessionIsActive() && state.serverData.staff ? Number(state.serverData.staff.metrics?.waiting_for_reply || 0) : getStaffPendingReplyCount())
      : state.role === "staff" && page === "unassigned"
        ? (serverSessionIsActive() && state.serverData.staff ? Number(state.serverData.staff.ticket_pool_pagination?.total || 0) : getAvailableTicketPoolTickets().length)
        : state.role === "staff" && page === "assigned"
          ? (serverSessionIsActive() && state.serverData.staff ? Number(state.serverData.staff.metrics?.active_tickets || 0) : staffAssignedTickets.length + claimedTicketCount)
          : badge;
    const badgeTitle = isStaffReplyAction
      ? `${displayedBadge} ticket${displayedBadge === 1 ? "" : "s"} waiting for your reply`
      : "";
    const badgeMarkup = state.role === "customer" && page === "tickets"
      ? renderCustomerTicketBadges()
      : state.role === "admin" && page === "tickets"
        ? renderAdminTicketManagementBadges()
        : displayedBadge ? `<span class="nav-badge${badgeClass}"${badgeTitle ? ` title="${badgeTitle}"` : ""}>${displayedBadge}</span>` : "";
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
  if (state.page === "models" && state.modelDashboard) return `Model centre / ${modelPerformance[state.modelDashboard].name}`;
  const definition = roleDefinitions[state.role];
  const match = definition.nav.find((item) => item[2] === state.page);
  return match ? match[1] : state.role === "customer" ? "Home" : "Dashboard";
}

function setRole(role) {
  state.role = role;
  state.page = "dashboard";
  state.modelDashboard = null;
  state.customerTicketDialog = null;
  state.staffTicketDialog = null;
  state.adminTicketDialog = null;
  state.activeDraftId = null;
  state.emptyDraftPrompt = false;
  state.accountMenuOpen = false;
  lastRenderPageKey = "";
  lastRenderDialogKey = "";
  document.querySelectorAll(".role-button").forEach((button) => {
    button.classList.toggle("active", button.dataset.role === role);
  });
  updateAccountIdentity();
  render();
}

function getRenderPageKey() {
  const requestStep = state.role === "customer" && state.page === "new-ticket"
    ? String(state.customerRequestStep || 1)
    : "";
  return [state.role, state.page, state.modelDashboard || "", requestStep].join(":");
}

function getRenderDialogKey() {
  return [
    state.customerTicketDialog ? `customer:${state.customerTicketDialog}` : "",
    state.staffTicketDialog ? `staff:${state.staffTicketDialog}` : "",
    state.adminTicketDialog ? `admin:${state.adminTicketDialog}` : "",
    state.staffUserDialog ? `staff-user:${state.staffUserDialog}` : "",
  ].filter(Boolean).join("|");
}

function render(options = {}) {
  syncTicketLifecycle();
  const pageKey = getRenderPageKey();
  const dialogKey = getRenderDialogKey();
  const pageChanged = pageKey !== lastRenderPageKey;
  const dialogChanged = dialogKey !== lastRenderDialogKey;
  renderNavigation();
  updateAccountIdentity();
  const isCustomer = state.role === "customer";
  const isStaff = state.role === "staff";
  breadcrumb.hidden = isCustomer;
  breadcrumb.textContent = isCustomer
    ? ""
    : isStaff
      ? `${getProfileDisplayName(getActiveProfile())} · ${roleDefinitions.staff.title}`
      : `${getProfileDisplayName(getActiveProfile())} · ${roleDefinitions.admin.title}`;
  const routingRail = document.querySelector(".routing-rail");
  routingRail.hidden = isCustomer;
  // Keep the rendered role separate from the role-switch buttons. Using
  // `data-role` here made every click bubble to the role-switch handler.
  appShell.dataset.userRole = state.role;
  document.querySelector(".topbar").classList.toggle("customer-topbar", isCustomer);
  renderAccountMenu();
  main.innerHTML = renderPage();
  main.focus({ preventScroll: true });
  const forcePageAnimation = Boolean(options.forcePageAnimation);
  const skipPageAnimation = Boolean(dialogKey) || (Boolean(options.skipPageAnimation) && !forcePageAnimation);
  if ((pageChanged || forcePageAnimation) && !skipPageAnimation) window.ticketMotion?.animatePage(main);
  else window.ticketMotion?.animatePage(main, { skip: true });
  if (dialogChanged && dialogKey) window.ticketMotion?.animateDialog(main);
  lastRenderPageKey = pageKey;
  lastRenderDialogKey = dialogKey;
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
    <div class="account-form-shell"><form id="profile-form" class="form-card account-form-card"><section class="account-identity-strip"><span class="account-profile-avatar avatar-${state.role}">${getProfileInitials(profile)}</span><div><span class="eyebrow">Your account</span><strong>${escapeHtml(getProfileDisplayName(profile))}</strong><p>${definition.title}</p></div></section><div class="form-grid"><div class="form-field"><label for="profile-first-name">First name</label><input id="profile-first-name" name="profile-first-name" autocomplete="given-name" maxlength="40" value="${escapeHtml(profile.firstName)}" required /></div><div class="form-field"><label for="profile-last-name">Last name</label><input id="profile-last-name" name="profile-last-name" autocomplete="family-name" maxlength="40" value="${escapeHtml(profile.lastName)}" required /></div><div class="form-field full"><label for="profile-email">Email address</label><input id="profile-email" name="profile-email" type="email" autocomplete="email" maxlength="120" value="${escapeHtml(profile.email)}" readonly aria-readonly="true" required /></div><div class="form-field full"><label for="profile-phone">Phone number <span>Optional</span></label><input id="profile-phone" name="profile-phone" type="tel" autocomplete="tel" maxlength="30" value="${escapeHtml(profile.phone)}" placeholder="For example: +60 12-345 6789" /></div></div><div class="notice"><span aria-hidden="true">↳</span><span><strong>These details are visible only to you and authorised support staff.</strong> They help us identify your account and contact you about an active request.</span></div><div class="form-actions"><button class="button signal" type="submit">Save changes</button><button class="button secondary" type="button" data-action="return-from-account">Cancel</button></div></form></div>`;
}

function renderChangePassword() {
  return `
    <div class="page-heading"><div><span class="eyebrow">Account settings</span><h1>Change password</h1><p>Use a new password that you do not use for another service.</p></div></div>
    <div class="account-form-shell"><form id="password-form" class="form-card account-form-card"><section class="security-strip"><span class="eyebrow">Secure your account</span><strong>Choose a strong, private password.</strong><p>Your password needs at least 8 characters, one uppercase letter, one number, and one special character.</p></section><div class="form-grid"><div class="form-field full"><label for="current-password">Current password</label><input id="current-password" name="current-password" type="password" autocomplete="current-password" required /></div><div class="form-field"><label for="new-password">New password</label><input id="new-password" name="new-password" type="password" autocomplete="new-password" minlength="8" aria-describedby="password-requirements password-form-error" required /></div><div class="form-field"><label for="confirm-password">Confirm new password</label><input id="confirm-password" name="confirm-password" type="password" autocomplete="new-password" minlength="8" required /></div></div><ul id="password-requirements" class="password-requirements" aria-label="Password requirements"><li data-rule="length">At least 8 characters</li><li data-rule="uppercase">One uppercase letter</li><li data-rule="number">One number</li><li data-rule="special">One special character</li></ul><p id="password-form-error" class="form-error" role="alert" hidden></p><div class="notice"><span aria-hidden="true">↳</span><span><strong>Keep your password private.</strong> Support staff will never ask you to disclose it in a ticket reply.</span></div><div class="form-actions"><button class="button signal" type="submit">Save new password</button><button class="button secondary" type="button" data-action="return-from-account">Cancel</button></div></form></div>`;
}

function status(label, tone) { return `<span class="status ${tone}">${label}</span>`; }
function priority(label) { return label ? `<span class="priority ${String(label).toLowerCase()}">${escapeHtml(label)}</span>` : "—"; }

function getCustomerDrafts() {
  return customerDrafts.filter((draft) => !state.discardedDraftIds.has(draft.id));
}

function getTicketFormValues(form) {
  const formData = new FormData(form);
  return {
    subject: String(formData.get("subject") || "").trim(),
    body: String(formData.get("description") || "").trim(),
    issueChoice: String(formData.get("issue-choice") || "").trim(),
  };
}

function customerRequestValuesFromDraft(draft = null) {
  return {
    subject: draft?.subject ?? "",
    body: draft?.body ?? "",
    issueChoice: draft?.issueChoice ?? "",
  };
}

function resetCustomerRequest(values = null) {
  state.customerRequestStep = 1;
  state.customerRequestValues = values || customerRequestValuesFromDraft();
  state.customerRequestError = "";
}

function currentCustomerRequestValues(draft = null) {
  if (!state.customerRequestValues) state.customerRequestValues = customerRequestValuesFromDraft(draft);
  return state.customerRequestValues;
}

function syncCustomerRequestValues(form) {
  if (!form) return currentCustomerRequestValues();
  const values = getTicketFormValues(form);
  state.customerRequestValues = {
    subject: values.subject,
    body: values.body,
    issueChoice: values.issueChoice,
  };
  return state.customerRequestValues;
}

function showCustomerRequestError(message, fieldId = "") {
  state.customerRequestError = message;
  render();
  if (fieldId) window.setTimeout(() => document.querySelector(`#${fieldId}`)?.focus(), 0);
}

function issueTypeForChoice(value) {
  return {
    stopped_working: "Incident",
    need_action: "Request",
    ongoing_issue: "Problem",
    change_request: "Change",
  }[value] || value || "";
}

async function saveCustomerDraft(form) {
  if (state.customerActionPending) return;
  setCustomerTicketActionPending(form, true, "save");
  const values = getTicketFormValues(form);
  if (serverSessionIsActive()) {
    const draft = customerDrafts.find((item) => item.id === state.activeDraftId);
    const requestKey = ensureCustomerFormRequestKey();
    const path = draft?.backendId
      ? `/api/tickets/customer/drafts/${encodeURIComponent(draft.backendId)}/`
      : "/api/tickets/customer/drafts/";
    try {
      await serverRequest(path, {
        method: "POST",
        idempotencyKey: requestKey,
        body: { subject: values.subject, description: values.body, issue_type: issueTypeForChoice(values.issueChoice) },
      });
      state.activeDraftId = null;
      state.customerFormRequestKey = "";
      resetCustomerRequest();
      state.emptyDraftPrompt = false;
      state.page = "tickets";
      await refreshServerData({ renderAfter: false });
      render();
      showToast(draft ? "Draft changes saved. It has not been sent for routing." : "Draft saved. It now appears at the top of My tickets.");
    } catch (error) {
      showToast(error.message || "Unable to save the draft.");
    } finally {
      setCustomerTicketActionPending(form, false);
    }
    return;
  }
  const wasEditing = Boolean(state.activeDraftId);
  const draftId = state.activeDraftId || `DRAFT-${String(customerDrafts.length + 1).padStart(2, "0")}`;
  const existingDraft = customerDrafts.find((draft) => draft.id === draftId);
  const draft = existingDraft || { id: draftId };
  Object.assign(draft, {
    subject: values.subject || "Untitled draft",
    body: values.body,
    issueChoice: values.issueChoice,
    updated: "Just now",
  });
  if (!existingDraft) customerDrafts.unshift(draft);
  state.activeDraftId = null;
  state.customerFormRequestKey = "";
  resetCustomerRequest();
  state.emptyDraftPrompt = false;
  state.page = "tickets";
  render();
  showToast(wasEditing ? "Draft changes saved. It has not been sent for routing." : "Draft saved. It now appears at the top of My tickets.");
  setCustomerTicketActionPending(form, false);
}

function getCustomerTicketStatus(ticket) {
  return state.forceClosedTickets.has(ticket.id) || state.systemClosedTickets.has(ticket.id) || ticket.status[0] === "Closed"
    ? ["Closed", "resolved"]
    : state.pendingClosureTicketIds.has(ticket.id)
    ? ["Resolved", "resolved"]
    : ticket.status;
}

function getCustomerActiveTickets() {
  return customerTickets.filter((ticket) => (
    getCustomerTicketStatus(ticket)[0] !== "Closed"
  ));
}

function getCustomerReplyCount() {
  return getCustomerActiveTickets().filter((ticket) => getCustomerTicketStatus(ticket)[0] === "Waiting for Customer").length;
}

function renderCustomerTicketBadges() {
  const serverCustomer = state.serverData.customer;
  const replyCount = serverSessionIsActive() && serverCustomer ? Number(serverCustomer.reply_needed_count || 0) : getCustomerReplyCount();
  const draftCount = serverSessionIsActive() && serverCustomer ? Number(serverCustomer.draft_count || 0) : getCustomerDrafts().length;
  const labels = [];
  if (replyCount) labels.push(`${replyCount} ticket${replyCount === 1 ? "" : "s"} need your reply`);
  if (draftCount) labels.push(`${draftCount} draft${draftCount === 1 ? "" : "s"}`);
  if (!labels.length) return "";
  return `<span class="nav-badges" aria-label="${labels.join(", ")}">${replyCount ? `<span class="nav-badge warm" title="Tickets needing your reply">${replyCount}</span>` : ""}${draftCount ? `<span class="nav-badge" title="Private drafts">${draftCount}</span>` : ""}</span>`;
}

async function openCustomerTicket(ticketId) {
  if (serverSessionIsActive()) {
    const ticket = customerTickets.find((item) => item.id === ticketId) || customerPreviewTickets.find((item) => item.id === ticketId) || customerReplyPreviewTickets.find((item) => item.id === ticketId);
    if (!ticket || ticket.statusCode === "CLOSED") {
      showToast("Closed tickets are available for administrator review only.");
      return;
    }
    state.page = "tickets";
    state.activeDraftId = null;
    state.customerTicketDialog = ticketId;
    render({ skipPageAnimation: true });
    await refreshServerTicketDetail(ticketId, "customer");
    return;
  }
  const ticket = customerTickets.find((item) => item.id === ticketId);
  if (!ticket || getCustomerTicketStatus(ticket)[0] === "Closed") {
    showToast("Closed tickets are available for administrator review only.");
    return;
  }
  state.page = "tickets";
  state.activeDraftId = null;
  state.customerTicketDialog = ticketId;
  render();
}

async function openStaffTicket(ticketId) {
  // Performance review is an in-place inspection workflow. Keep the current
  // pane mounted so the staff member can close the dialog and continue where
  // they were reviewing resolved work.
  const originPage = state.page;
  const dialogPage = originPage === "performance" ? "performance" : "assigned";
  if (serverSessionIsActive()) {
    let staffTicket = getStaffTicket(ticketId);
    if (!staffTicket) {
      const historical = (state.serverData.staffPerformance?.recent_resolved_work || []).find((row) => row.reference === ticketId || String(row.id) === ticketId);
      if (historical) {
        staffTicket = normalizeServerTicket(historical);
        state.ticketDetails.set(staffTicket.id, staffTicket);
      }
    }
    if (!staffTicket) {
      showToast("That ticket is no longer assigned to your desk.");
      return;
    }
    state.page = dialogPage;
    state.customerTicketDialog = null;
    state.staffTicketDialog = ticketId;
    render({ skipPageAnimation: true });
    await refreshServerTicketDetail(ticketId, "staff");
    return;
  }
  if (!getStaffTicket(ticketId)) {
    showToast("That ticket is no longer assigned to your desk.");
    return;
  }
  state.page = dialogPage;
  state.customerTicketDialog = null;
  state.staffTicketDialog = ticketId;
  render();
}

function backendTicketId(ticketId) {
  const ticket = state.ticketDetails.get(ticketId) || getTicketRecords(ticketId).find(Boolean);
  return ticket?.backendId || ticketId;
}

async function discardCustomerDraft(draftId) {
  if (!serverSessionIsActive()) return false;
  const draft = customerDrafts.find((item) => item.id === draftId);
  if (!draft?.backendId) return false;
  const key = `draft:${draftId}`;
  const scope = findTicketActionButton("discard-draft", draftId);
  if (!beginPendingAction(key, scope, "Discarding…")) return false;
  try {
    await serverRequest(`/api/tickets/customer/drafts/${encodeURIComponent(draft.backendId)}/discard/`, { method: "DELETE" });
    await refreshServerData({ renderAfter: false });
    render();
    showToast(`${draftId} was discarded.`);
  } catch (error) {
    showToast(error.message || "Unable to discard the draft.");
  } finally {
    finishPendingAction(key, scope);
  }
  return true;
}

async function markCustomerTicketResolved(ticketId) {
  if (!serverSessionIsActive()) return false;
  const key = ticketActionKey("customer", ticketId);
  const scope = document.querySelector(".customer-ticket-dialog");
  if (!beginPendingAction(key, scope, "Saving…")) return false;
  try {
    await serverRequest(`/api/tickets/customer/tickets/${encodeURIComponent(backendTicketId(ticketId))}/resolve/`, { method: "POST" });
    await refreshServerData({ renderAfter: false });
    state.customerTicketDialog = null;
    render();
    showToast(`${ticketId} will close automatically after three days unless reopened.`);
  } catch (error) {
    showToast(error.message || "Unable to mark the ticket resolved.");
  } finally {
    finishPendingAction(key, scope);
  }
  return true;
}

async function reopenCustomerTicket(ticketId) {
  if (!serverSessionIsActive()) return false;
  const key = ticketActionKey("customer", ticketId);
  const scope = document.querySelector(".customer-ticket-dialog");
  if (!beginPendingAction(key, scope, "Reopening…")) return false;
  try {
    await serverRequest(`/api/tickets/customer/tickets/${encodeURIComponent(backendTicketId(ticketId))}/reopen/`, { method: "POST" });
    await refreshServerData({ renderAfter: false });
    state.customerTicketDialog = null;
    render();
    showToast(`${ticketId} was reopened and returned to the support team.`);
  } catch (error) {
    showToast(error.message || "Unable to reopen the ticket.");
  } finally {
    finishPendingAction(key, scope);
  }
  return true;
}

async function claimServerTicket(ticketId) {
  if (!serverSessionIsActive()) return false;
  const key = `claim:${ticketId}`;
  if (!beginPendingAction(key, findTicketActionButton("claim", ticketId), "Claiming…")) return false;
  try {
    await serverRequest(`/api/tickets/staff/ticket-pool/${encodeURIComponent(backendTicketId(ticketId))}/claim/`, { method: "POST" });
    await refreshServerData({ renderAfter: false });
    render();
    showToast(`${ticketId} was claimed and moved to My tickets.`);
  } catch (error) {
    showToast(error.message || "Unable to claim that ticket.");
  } finally {
    finishPendingAction(key, findTicketActionButton("claim", ticketId));
  }
  return true;
}

async function rerouteServerTicket(ticketId) {
  if (!serverSessionIsActive()) return false;
  const key = ticketActionKey("staff", ticketId);
  const scope = document.querySelector(".staff-ticket-dialog");
  if (!beginPendingAction(key, scope, "Sending…")) return false;
  try {
    const reason = window.prompt("Why does this ticket need manual rerouting?")?.trim();
    if (!reason) return true;
    await serverRequest(`/api/tickets/staff/tickets/${encodeURIComponent(backendTicketId(ticketId))}/reroute/`, { method: "POST", body: { reason } });
    await refreshServerData({ renderAfter: false });
    state.staffTicketDialog = null;
    render();
    showToast(`${ticketId} was sent to Admin Ticket management for manual rerouting.`);
  } catch (error) {
    showToast(error.message || "Unable to send this ticket for rerouting.");
  } finally {
    finishPendingAction(key, scope);
  }
  return true;
}

async function submitServerCustomerTicket(form) {
  if (state.customerActionPending) return;
  setCustomerTicketActionPending(form, true, "submit");
  const values = getTicketFormValues(form);
  const draft = customerDrafts.find((item) => item.id === state.activeDraftId);
  const requestKey = ensureCustomerFormRequestKey();
  try {
    let draftId = draft?.backendId;
    if (!draftId) {
      const created = await serverRequest("/api/tickets/customer/drafts/", {
        method: "POST",
        idempotencyKey: requestKey,
        body: { subject: values.subject, description: values.body, issue_type: issueTypeForChoice(values.issueChoice) },
      });
      draftId = created.id;
    } else {
      await serverRequest(`/api/tickets/customer/drafts/${encodeURIComponent(draftId)}/`, {
        method: "POST",
        idempotencyKey: requestKey,
        body: { subject: values.subject, description: values.body, issue_type: issueTypeForChoice(values.issueChoice) },
      });
    }
    await serverRequest(`/api/tickets/customer/tickets/${encodeURIComponent(draftId)}/submit/`, {
      method: "POST",
      idempotencyKey: requestKey,
      body: {},
    });
    state.activeDraftId = null;
    state.customerFormRequestKey = "";
    resetCustomerRequest();
    state.page = "tickets";
    await refreshServerData({ renderAfter: false });
    render();
    showToast(draft ? "Draft submitted. The routing result will appear in your ticket timeline." : "Ticket submitted. The routing result will appear in your ticket timeline.");
  } catch (error) {
    const errorNode = form.querySelector("#ticket-form-error");
    if (errorNode) {
      errorNode.textContent = error.message || "Unable to submit the ticket.";
      errorNode.hidden = false;
    } else showToast(error.message || "Unable to submit the ticket.");
  } finally {
    setCustomerTicketActionPending(form, false);
  }
}

async function replyToCustomerTicket(ticketId, body, errorNode, form) {
  const key = ticketActionKey("customer", ticketId);
  const scope = form.closest(".ticket-dialog") || form;
  if (!beginPendingAction(key, scope, "Sending…")) return false;
  try {
    await serverRequest(`/api/tickets/customer/tickets/${encodeURIComponent(backendTicketId(ticketId))}/reply/`, { method: "POST", body: { body } });
    await refreshServerData({ renderAfter: false });
    state.customerTicketDialog = null;
    render();
    showToast("Reply sent. Your ticket is now back with the support team.");
  } catch (error) {
    errorNode.textContent = error.message || "Unable to send the reply.";
    errorNode.hidden = false;
    form.elements["customer-reply"]?.focus();
  } finally {
    finishPendingAction(key, scope);
  }
  return true;
}

async function replyToStaffTicket(ticketId, body, errorNode, form) {
  const key = ticketActionKey("staff", ticketId);
  const scope = form.closest(".ticket-dialog") || form;
  if (!beginPendingAction(key, scope, "Sending…")) return false;
  try {
    await serverRequest(`/api/tickets/staff/tickets/${encodeURIComponent(backendTicketId(ticketId))}/reply/`, { method: "POST", body: { body } });
    await refreshServerData({ renderAfter: false });
    state.staffTicketDialog = null;
    render();
    showToast("Reply sent to the customer.");
  } catch (error) {
    errorNode.textContent = error.message || "Unable to send the reply.";
    errorNode.hidden = false;
    form.elements["staff-reply"]?.focus();
  } finally {
    finishPendingAction(key, scope);
  }
  return true;
}

async function forceCloseServerTicket(ticketId, reason) {
  if (!serverSessionIsActive()) return false;
  const key = ticketActionKey("admin", ticketId);
  const scope = document.querySelector(".admin-ticket-dialog");
  if (!beginPendingAction(key, scope, "Closing…")) return false;
  try {
    await serverRequest(`/api/tickets/admin/tickets/${encodeURIComponent(backendTicketId(ticketId))}/force-close/`, {
      method: "POST",
      body: { reason },
    });
    await refreshServerData({ renderAfter: false });
    state.adminTicketDialog = null;
    render();
    showToast(`${ticketId} was force closed and moved to the closed ticket archive.`);
  } catch (error) {
    showToast(error.message || "Unable to force close this ticket.");
  } finally {
    finishPendingAction(key, scope);
  }
  return true;
}

function serverQueueIdForName(queueName) {
  const queues = state.serverData.queuesStaff?.queues || [];
  return queues.find((queue) => queue.name === queueName)?.id || null;
}

function serverStaffIdForName(name) {
  if (!name || name === "Unassigned") return null;
  return assignmentStaffUsers.find((user) => getProfileDisplayName(user) === name || user.name === name)?.id || null;
}

async function routeServerAdminTicket(ticketId, { queueName, assigneeName, priorityValue }) {
  if (!serverSessionIsActive()) return false;
  const key = ticketActionKey("admin", ticketId);
  const scope = document.querySelector(".admin-ticket-dialog");
  if (!beginPendingAction(key, scope, "Saving…")) return false;
  const queueId = serverQueueIdForName(queueName);
  if (!queueId) {
    showToast("Select a valid support queue before saving.");
    finishPendingAction(key, scope);
    return true;
  }
  try {
    await serverRequest(`/api/tickets/admin/tickets/${encodeURIComponent(backendTicketId(ticketId))}/route/`, {
      method: "POST",
      body: {
        queue_id: queueId,
        assignee_id: serverStaffIdForName(assigneeName),
        priority: String(priorityValue || "").toLowerCase(),
      },
    });
    await refreshServerData({ renderAfter: false });
    state.adminTicketDialog = null;
    render();
    showToast(`${ticketId} was routed to ${queueName} and assigned to ${assigneeName || "Unassigned"}.`);
  } catch (error) {
    showToast(error.message || "Unable to update this ticket route.");
  } finally {
    finishPendingAction(key, scope);
  }
  return true;
}

async function saveServerProfile(form) {
  if (!serverSessionIsActive()) return false;
  const key = "account:profile";
  if (!beginPendingAction(key, form, "Saving…")) return false;
  const formData = new FormData(form);
  try {
    await serverRequest("/profile/", {
      method: "POST",
      body: {
        first_name: String(formData.get("profile-first-name") || "").trim(),
        last_name: String(formData.get("profile-last-name") || "").trim(),
        phone: String(formData.get("profile-phone") || "").trim(),
      },
    });
    const session = getServerSession();
    const nextProfile = {
      ...getActiveProfile(),
      firstName: String(formData.get("profile-first-name") || "").trim(),
      lastName: String(formData.get("profile-last-name") || "").trim(),
      phone: String(formData.get("profile-phone") || "").trim(),
    };
    accountProfiles[state.role] = nextProfile;
    roleDefinitions[state.role].name = getProfileDisplayName(nextProfile);
    roleDefinitions[state.role].title = String(session?.title || roleDefinitions[state.role].title);
    updateAccountIdentity();
    render();
    showToast("Profile changes saved.");
  } catch (error) {
    showToast(error.message || "Unable to save profile changes.");
  } finally {
    finishPendingAction(key, form);
  }
  return true;
}

async function changeServerPassword(form, values, error) {
  if (!serverSessionIsActive()) return false;
  const key = "account:password";
  if (!beginPendingAction(key, form, "Saving…")) return false;
  try {
    await serverRequest("/api/accounts/change-password/", {
      method: "POST",
      body: {
        old_password: values.currentPassword,
        new_password1: values.newPassword,
        new_password2: values.confirmPassword,
      },
    });
    error.hidden = true;
    form.reset();
    showToast("New password saved.");
  } catch (requestError) {
    error.textContent = requestError.message || "Unable to change the password.";
    error.hidden = false;
  } finally {
    finishPendingAction(key, form);
  }
  return true;
}

async function saveServerStaffUser(form) {
  if (!serverSessionIsActive()) return false;
  const formData = new FormData(form);
  const userId = form.dataset.staffId;
  const queueId = serverQueueIdForName(String(formData.get("staff-queue") || ""));
  const body = {
    first_name: String(formData.get("staff-first-name") || "").trim(),
    last_name: String(formData.get("staff-last-name") || "").trim(),
    phone: String(formData.get("staff-phone") || "").trim(),
    queue_id: queueId,
  };
  if (userId === "new") {
    body.email = String(formData.get("staff-email") || "").trim().toLowerCase();
    body.password = String(formData.get("staff-password") || "");
  }
  if (!queueId || !body.first_name || !body.last_name || (userId === "new" && (!body.email || !body.password))) {
    showToast("Complete the staff name, queue, email, and password before saving.");
    return true;
  }
  const key = `staff-user:${userId}`;
  const scope = form.closest(".staff-user-dialog") || form;
  if (!beginPendingAction(key, scope, "Saving…")) return false;
  try {
    const path = userId === "new" ? "/api/accounts/staff/" : `/api/accounts/staff/${encodeURIComponent(userId)}/`;
    await serverRequest(path, { method: "POST", body });
    state.staffUserDialog = null;
    await refreshServerData({ renderAfter: false });
    render();
    showToast(userId === "new" ? "Staff member created." : "Staff record updated.");
  } catch (error) {
    showToast(error.message || "Unable to save the staff record.");
  } finally {
    finishPendingAction(key, scope);
  }
  return true;
}

async function deactivateServerStaffUser(userId) {
  if (!serverSessionIsActive()) return false;
  const key = `staff-user:${userId}`;
  const scope = document.querySelector(".staff-user-dialog");
  if (!beginPendingAction(key, scope, "Deleting…")) return false;
  try {
    await serverRequest(`/api/accounts/staff/${encodeURIComponent(userId)}/deactivate/`, { method: "POST" });
    state.staffUserDialog = null;
    state.staffDeleteConfirmId = null;
    await refreshServerData({ renderAfter: false });
    render();
    showToast("Staff member deactivated.");
  } catch (error) {
    showToast(error.message || "Unable to deactivate the staff member.");
  } finally {
    finishPendingAction(key, scope);
  }
  return true;
}

async function loadServerStaffSummary(userId, period) {
  if (!serverSessionIsActive() || userId === "new") return null;
  try {
    const summary = await serverRequest(`/api/accounts/staff/${encodeURIComponent(userId)}/summary/?period=${encodeURIComponent(period)}`);
    state.serverData.staffSummaries = state.serverData.staffSummaries || {};
    state.serverData.staffSummaries[`${userId}:${period}`] = summary;
    const user = getStaffUser(String(userId));
    if (user) {
      user.resolved = user.resolved || {};
      user.resolved[period] = {
        count: Number(summary.resolved_count || 0),
        sla: summary.overall_sla_met_percent == null ? "—" : `${summary.overall_sla_met_percent}%`,
        time: "—",
        slaByPriority: summary.sla_by_priority || {},
      };
      user.activeTickets = Number(summary.active_tickets || user.activeTickets || 0);
      user.waitingReply = Number(summary.waiting_for_reply || user.waitingReply || 0);
    }
    return summary;
  } catch (error) {
    showToast(error.message || "Unable to load staff performance.");
    return null;
  }
}

async function activateServerModel(family) {
  if (!serverSessionIsActive()) return false;
  const key = "model:activate";
  const scope = document.querySelector(`[data-action="activate-${family}"]`);
  if (!beginPendingAction(key, scope, "Saving…")) return false;
  try {
    await serverRequest(`/api/model/deployments/${encodeURIComponent(family)}/activate/`, { method: "POST" });
    state.activeModel = family;
    await refreshServerData({ renderAfter: false });
    render();
    showToast(`${family === "joint" ? "Joint" : "Separate"} model selected for future submissions.`);
  } catch (error) {
    showToast(error.message || "Unable to change the active model.");
  } finally {
    finishPendingAction(key, scope);
  }
  return true;
}

function continueCustomerDraft(draftId) {
  const draft = getCustomerDrafts().find((item) => item.id === draftId);
  state.customerTicketDialog = null;
  state.customerFormRequestKey = createCustomerRequestKey();
  state.activeDraftId = draftId;
  resetCustomerRequest(customerRequestValuesFromDraft(draft));
  state.emptyDraftPrompt = false;
  state.page = "new-ticket";
  render();
}

function renderCustomerTicketAction(ticket) {
  const [label] = getCustomerTicketStatus(ticket);
  if (label === "Closed") return "";
  if (label === "Resolved") return '<span class="customer-action-note">Ready for closure</span>';
  return `<button class="button secondary row-action" type="button" data-action="mark-customer-resolved" data-ticket-id="${ticket.id}">Mark as resolved</button>`;
}

function renderCustomerGuidedHero() {
  return `
    <section class="customer-guided-hero" aria-labelledby="customer-guided-hero-title">
      <div class="customer-guided-hero__lead">
        <span class="customer-guided-hero__sun" aria-hidden="true"></span>
        <span class="eyebrow">Your support space</span>
        <h1 id="customer-guided-hero-title">A clear next step starts here.</h1>
        <p>Ask a question, report a problem, or make a request. We will keep the conversation simple and keep you updated along the way.</p>
        <div class="customer-guided-hero__actions">
          <button class="button customer-guided-hero__primary-action" type="button" data-action="new-ticket">Start a new request <span aria-hidden="true">→</span></button>
          <button class="button customer-guided-hero__secondary-action" type="button" data-page="tickets">Check my requests</button>
        </div>
      </div>
      <aside class="customer-guided-hero__journey" aria-labelledby="customer-journey-title">
        <span class="eyebrow">What happens next</span>
        <h2 id="customer-journey-title">Support without the runaround.</h2>
        <p>Every request follows one calm, visible path.</p>
        <ol class="customer-journey-list">
          <li class="is-current"><span>1</span><div><strong>Tell us what happened</strong><p>Choose the closest description and add the important details.</p></div></li>
          <li><span>2</span><div><strong>We find the right help</strong><p>Your request reaches the support team that can assist you.</p></div></li>
          <li><span>3</span><div><strong>Follow the conversation</strong><p>Reply when needed and see every update in one place.</p></div></li>
        </ol>
      </aside>
    </section>`;
}

function renderCustomerHomeWelcome(replyTicket) {
  const firstName = escapeHtml(getActiveProfile().firstName);
  const hasReplyWaiting = Boolean(replyTicket);
  const noticeCopy = hasReplyWaiting
    ? `<strong>A reply is waiting from you.</strong> Share a little more information so support can keep moving.`
    : `<strong>No reply is waiting from you.</strong> Your active tickets will appear here as the support team works on them.`;
  const action = hasReplyWaiting
    ? `<button class="button secondary customer-home-notice__action" type="button" data-action="view-customer-ticket" data-ticket-id="${escapeHtml(replyTicket.id)}">Reply now</button>`
    : "";
  return `
    <section class="customer-home-intro" aria-labelledby="customer-home-welcome-title">
      <div class="customer-home-welcome">
        <span class="eyebrow">Good morning, ${firstName}</span>
        <h2 id="customer-home-welcome-title">What needs attention?</h2>
        <p>Submit a request, follow a reply, or check the progress of an open ticket.</p>
      </div>
      <div class="customer-home-notice${hasReplyWaiting ? " is-action" : ""}" role="status">
        <span class="customer-home-notice__icon" aria-hidden="true">${hasReplyWaiting ? "↗" : "✓"}</span>
        <span class="customer-home-notice__copy">${noticeCopy}</span>
        ${action}
      </div>
    </section>`;
}

function renderCustomer() {
  if (state.page === "new-ticket") return renderNewTicket();
  if (state.page === "tickets") {
    return `
      <div class="customer-my-tickets-page">
        <div class="page-heading"><div><h1>My tickets</h1><p>Drafts appear first, followed by every submitted request and its latest status.</p></div><div class="heading-actions"><button class="button signal" data-action="new-ticket">Create ticket</button></div></div>
        ${renderCustomerTable("all")}
      </div>
      ${state.customerTicketDialog ? renderCustomerTicketDialog(state.customerTicketDialog) : ""}`;
  }
  const replyTicket = (serverSessionIsActive() ? customerReplyPreviewTickets : getCustomerActiveTickets())
    .find((ticket) => getCustomerTicketStatus(ticket)[0] === "Waiting for Customer");
  return `
    <div class="customer-home">
      ${renderCustomerGuidedHero()}
      ${renderCustomerHomeWelcome(replyTicket)}
      ${renderCustomerTable("active")}
    </div>`;
}

function getTicketUpdatedTimestamp(ticket) {
  const numericOrder = Number(ticket?.updatedOrder);
  if (Number.isFinite(numericOrder) && numericOrder > 0) {
    // Server rows carry an epoch timestamp. Prototype rows carry the age in minutes.
    return numericOrder > 100_000_000_000
      ? numericOrder
      : PROTOTYPE_TODAY.getTime() - (numericOrder * 60_000);
  }
  const label = String(ticket?.updated || ticket?.updatedDetail || "").trim().toLowerCase();
  if (!label || label === "—") return 0;
  if (label === "just now" || label === "just claimed" || label === "today") return PROTOTYPE_TODAY.getTime();
  const relative = label.match(/^(\d+)\s+(min|mins|minute|minutes|h|hr|hour|hours)\s+ago$/);
  if (relative) {
    const amount = Number(relative[1]);
    const multiplier = relative[2].startsWith("h") ? 60 * 60_000 : 60_000;
    return PROTOTYPE_TODAY.getTime() - (amount * multiplier);
  }
  const clock = label.match(/^(today|yesterday),?\s+(\d{1,2}):(\d{2})/);
  if (clock) {
    const date = new Date(PROTOTYPE_TODAY);
    if (clock[1] === "yesterday") date.setDate(date.getDate() - 1);
    date.setHours(Number(clock[2]), Number(clock[3]), 0, 0);
    return date.getTime();
  }
  const calendar = label.match(/^(\d{1,2})\s+([a-z]{3})/i);
  if (calendar) {
    const date = new Date(`${calendar[1]} ${calendar[2]} ${PROTOTYPE_TODAY.getFullYear()}`);
    if (!Number.isNaN(date.getTime())) return date.getTime();
  }
  return 0;
}

function sortTicketsMostRecent(left, right) {
  const comparison = getTicketUpdatedTimestamp(right) - getTicketUpdatedTimestamp(left);
  return comparison || String(right?.id || "").localeCompare(String(left?.id || ""));
}

function paginateTableRows(items, requestedPage) {
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / TICKET_TABLE_PAGE_SIZE));
  const page = Math.min(Math.max(Number(requestedPage) || 1, 1), totalPages);
  const start = (page - 1) * TICKET_TABLE_PAGE_SIZE;
  return {
    rows: items.slice(start, start + TICKET_TABLE_PAGE_SIZE),
    page,
    total,
    totalPages,
  };
}

function renderTablePagination(action, pagination, label = "tickets", pageStateKey = "") {
  if (pagination.totalPages <= 1) return "";
  const noun = pagination.total === 1 ? label.replace(/s$/, "") : label;
  return `<div class="table-pagination" aria-label="${escapeHtml(label)} pagination"><div class="table-pagination-status"><span>Page ${pagination.page} of ${pagination.totalPages} · ${pagination.total} ${escapeHtml(noun)}</span><label class="table-page-jump">Go to page <input type="number" min="1" max="${pagination.totalPages}" value="${pagination.page}" data-table-page-input="${action}" data-page-state-key="${pageStateKey}" aria-label="Go to ${escapeHtml(label)} page" /></label></div><div><button class="button secondary" type="button" data-action="${action}" data-direction="previous" ${pagination.page <= 1 ? "disabled" : ""}>Previous</button><button class="button secondary" type="button" data-action="${action}" data-direction="next" ${pagination.page >= pagination.totalPages ? "disabled" : ""}>Next</button></div></div>`;
}

function moveTablePage(stateKey, direction, total) {
  const totalPages = Math.max(1, Math.ceil(total / TICKET_TABLE_PAGE_SIZE));
  const currentPage = Number(state[stateKey]) || 1;
  state[stateKey] = Math.max(1, Math.min(totalPages, currentPage + (direction === "next" ? 1 : -1)));
}

function moveServerTablePage(action, direction) {
  const mapping = {
    "paginate-customer-tickets": ["customerTicketsPage", () => state.serverData.customer?.tickets_pagination],
    "paginate-staff-ticket-pool": ["staffTicketPoolPage", () => state.serverData.staff?.ticket_pool_pagination],
    "paginate-staff-my-tickets": ["staffMyTicketsPage", () => state.serverData.staff?.tickets_pagination],
    "paginate-admin-attention": ["adminAttentionPage", () => state.serverData.adminManagement?.attention_pagination],
    "paginate-admin-all-tickets": ["adminAllTicketsPage", () => state.serverData.adminManagement?.all_pagination],
  }[action];
  if (!mapping) return false;
  const [stateKey, getPagination] = mapping;
  const pagination = getPagination() || {};
  const totalPages = Math.max(1, Number(pagination.total_pages || 1));
  const current = Number(pagination.page || state[stateKey] || 1);
  state[stateKey] = Math.max(1, Math.min(totalPages, current + (direction === "next" ? 1 : -1)));
  return true;
}

function getTableTotalForAction(action) {
  if (action === "paginate-customer-tickets") return getCustomerDrafts().length + customerTickets.filter((ticket) => getCustomerTicketStatus(ticket)[0] !== "Closed").length;
  if (action === "paginate-staff-ticket-pool") return getAvailableTicketPoolTickets().filter((ticket) => (
    (state.ticketPoolFilters.priority === "all" || ticket.priority === state.ticketPoolFilters.priority)
    && (state.ticketPoolFilters.type === "all" || ticket.type === state.ticketPoolFilters.type)
  )).length;
  if (action === "paginate-staff-my-tickets") return getFilteredStaffMyTickets().length;
  if (action === "paginate-admin-attention") return getFilteredAdminAttentionTickets().length;
  if (action === "paginate-admin-all-tickets") return getFilteredAdminTickets().length;
  return 0;
}

function goToTablePage(action, requestedPage) {
  const inputPage = Number(requestedPage);
  if (!Number.isFinite(inputPage)) return;
  const stateKey = {
    "paginate-customer-tickets": "customerTicketsPage",
    "paginate-staff-ticket-pool": "staffTicketPoolPage",
    "paginate-staff-my-tickets": "staffMyTicketsPage",
    "paginate-admin-attention": "adminAttentionPage",
    "paginate-admin-all-tickets": "adminAllTicketsPage",
  }[action];
  if (!stateKey) return;
  const serverPagination = serverSessionIsActive() && (
    action === "paginate-customer-tickets" ? state.serverData.customer?.tickets_pagination
      : action === "paginate-staff-ticket-pool" ? state.serverData.staff?.ticket_pool_pagination
        : action === "paginate-staff-my-tickets" ? state.serverData.staff?.tickets_pagination
          : action === "paginate-admin-attention" ? state.serverData.adminManagement?.attention_pagination
            : action === "paginate-admin-all-tickets" ? state.serverData.adminManagement?.all_pagination
              : null
  );
  const totalPages = serverPagination?.total_pages || Math.max(1, Math.ceil(getTableTotalForAction(action) / TICKET_TABLE_PAGE_SIZE));
  state[stateKey] = Math.max(1, Math.min(totalPages, Math.trunc(inputPage)));
  if (serverSessionIsActive()) void refreshServerData();
  else render();
}

function goToStaffPerformancePage(requestedPage) {
  const inputPage = Number(requestedPage);
  if (!Number.isFinite(inputPage)) return;
  const total = Number(state.serverData.staffPerformance?.total || 0);
  const pageSize = Number(state.serverData.staffPerformance?.page_size || 5);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  state.staffPerformancePage = Math.max(1, Math.min(totalPages, Math.trunc(inputPage)));
  if (serverSessionIsActive()) void refreshServerData();
  else render();
}

function renderCustomerTable(scope) {
  const activeOnly = scope === "active";
  const serverCustomer = state.serverData.customer;
  const tickets = serverSessionIsActive() && serverCustomer
    ? (activeOnly ? customerPreviewTickets : customerTickets)
    : activeOnly
      ? [...getCustomerActiveTickets()].sort(sortTicketsMostRecent).slice(0, TICKET_TABLE_PREVIEW_SIZE)
      : customerTickets.filter((ticket) => getCustomerTicketStatus(ticket)[0] !== "Closed").sort(sortTicketsMostRecent);
  const draftRecords = activeOnly ? [] : getCustomerDrafts().map((draft) => ({ kind: "draft", draft }));
  const ticketRecords = tickets.map((ticket) => ({ kind: "ticket", ticket }));
  const allRecords = activeOnly ? ticketRecords : [...draftRecords, ...ticketRecords];
  const pagination = activeOnly
    ? null
    : serverSessionIsActive() && serverCustomer
      ? {
        rows: allRecords.slice(0, TICKET_TABLE_PAGE_SIZE),
        page: Number(serverCustomer.tickets_pagination?.page || state.customerTicketsPage || 1),
        total: Number(serverCustomer.tickets_pagination?.total || allRecords.length),
        totalPages: Number(serverCustomer.tickets_pagination?.total_pages || 1),
      }
      : paginateTableRows(allRecords, state.customerTicketsPage);
  const visibleRecords = activeOnly ? allRecords : pagination.rows;
  const rows = visibleRecords.map((record) => {
    if (record.kind === "draft") {
      const { draft } = record;
      const draftSubject = draft.subject || "Untitled draft";
      return `<tr class="customer-ticket-row draft-ticket-row" tabindex="0" role="button" data-action="continue-draft" data-draft-id="${escapeHtml(draft.id)}" aria-label="Continue draft ${escapeHtml(draftSubject)}"><td><span class="ticket-code">${escapeHtml(draft.id)}</span></td><td><span class="ticket-subject">${escapeHtml(draftSubject)}</span></td><td>${status("Draft", "draft")}</td><td class="muted">${escapeHtml(draft.updated)}</td><td><div class="draft-actions"><button class="button text" type="button" data-action="continue-draft" data-draft-id="${escapeHtml(draft.id)}">Continue</button><button class="button text danger-text" type="button" data-action="discard-draft" data-draft-id="${escapeHtml(draft.id)}">Discard</button></div></td></tr>`;
    }
    const { ticket } = record;
    const [statusLabel, statusTone] = getCustomerTicketStatus(ticket);
    return `<tr class="customer-ticket-row" tabindex="0" role="button" data-action="view-customer-ticket" data-ticket-id="${escapeHtml(ticket.id)}" aria-label="Open ${escapeHtml(ticket.id)}: ${escapeHtml(ticket.subject)}"><td><span class="ticket-code">${escapeHtml(ticket.id)}</span></td><td><span class="ticket-subject">${escapeHtml(ticket.subject)}</span></td><td>${status(statusLabel, statusTone)}</td><td class="muted">${escapeHtml(ticket.updated)}</td><td>${renderCustomerTicketAction(ticket)}</td></tr>`;
  }).join("");
  const emptyRow = `<tr><td colspan="5"><p class="table-empty">${activeOnly ? "No active tickets are available." : "No tickets or drafts are available."}</p></td></tr>`;
  const paginationMarkup = pagination ? renderTablePagination("paginate-customer-tickets", pagination, "tickets", "customerTicketsPage") : "";
  const panelClass = activeOnly ? "panel table-panel" : "panel table-panel customer-my-tickets-panel";
  return `<section class="${panelClass}"><div class="panel-head"><div><h2>${activeOnly ? "Active tickets" : "Tickets and drafts"}</h2><p>${activeOnly ? "The five most recently updated tickets in your account. Open any ticket to view its conversation." : "Private drafts are shown first. Select a ticket row to view its details and reply."}</p></div>${activeOnly ? '<button class="button text" data-page="tickets">View all tickets</button>' : ""}</div><table class="data-table"><thead><tr><th>Reference</th><th>Subject</th><th>Status</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows || emptyRow}</tbody></table>${paginationMarkup}</section>`;
}

function renderCustomerTicketDialog(ticketId) {
  const ticket = state.ticketDetails.get(ticketId) || customerTickets.find((item) => item.id === ticketId);
  if (!ticket) return "";
  const [statusLabel, statusTone] = getCustomerTicketStatus(ticket);
  // Closed tickets are private to administrators. If a stale client-side
  // dialog survives an admin closure, do not render the conversation again.
  if (statusLabel === "Closed") return "";
  const resolved = statusLabel === "Resolved";
  const finishedNotice = state.automaticallyResolvedTicketIds.has(ticket.id)
      ? '<div class="notice"><span aria-hidden="true">✓</span><span><strong>This ticket was resolved automatically.</strong> We did not receive a reply for one day. You can reopen it within three days if you still need help.</span></div>'
      : '<div class="notice"><span aria-hidden="true">✓</span><span><strong>You marked this ticket as resolved.</strong> It will close automatically after three days unless you reopen it.</span></div>';
  const ticketAction = resolved
    ? `${finishedNotice}<div class="form-actions"><button class="button signal" type="button" data-action="reopen-customer-ticket" data-ticket-id="${ticket.id}">Reopen ticket</button><button class="button secondary" type="button" data-action="close-customer-ticket">Close</button></div>`
    : '<form id="customer-reply-form" class="reply-form" novalidate><label for="customer-reply">Reply to support</label><textarea id="customer-reply" name="customer-reply" placeholder="Add the details requested by the support team." required></textarea><p id="customer-reply-error" class="form-error" role="alert" hidden></p><div class="form-actions"><button class="button signal" type="submit">Send reply</button><button class="button secondary" type="button" data-action="close-customer-ticket">Cancel</button></div></form>';
  const messages = Array.isArray(ticket.messages) && ticket.messages.length
    ? ticket.messages
    : [{ author: ticket.customer || "You", author_role: "CUSTOMER", body: ticket.request }, { author: "Support team", author_role: "STAFF", body: ticket.response || "No support response has been recorded yet." }];
  const conversation = messages.map((message) => `<article class="conversation-message ${message.author_role === "CUSTOMER" ? "customer-message" : "staff-message"}"><span>${escapeHtml(message.author || "Support team")}</span><p>${escapeHtml(message.body || "")}</p></article>`).join("");
  return `
    <div class="ticket-dialog-backdrop">
      <section class="ticket-dialog customer-ticket-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-dialog-title">
        <header class="ticket-dialog-header"><div><span class="ticket-code">${ticketId}</span><h2 id="ticket-dialog-title">${ticket.subject}</h2></div><button class="dialog-close" type="button" data-action="close-customer-ticket" aria-label="Close ticket details">×</button></header>
        <dl class="ticket-dialog-meta"><div><dt>Status</dt><dd>${status(statusLabel, statusTone)}</dd></div><div><dt>Support team</dt><dd>Assigned support team</dd></div><div><dt>Last updated</dt><dd>${escapeHtml(ticket.updatedDetail || ticket.updated || "—")}</dd></div></dl>
        <div class="ticket-dialog-body"><h3>Conversation</h3><div class="conversation">${conversation}</div>${ticketAction}</div>
      </section>
    </div>`;
}

function renderStaffTicketDialog(ticketId) {
  const ticket = getStaffTicket(ticketId) || state.ticketDetails.get(ticketId);
  if (!ticket) return "";
  const isClosed = ticket.status[0] === "Closed";
  const isResolved = ticket.status[0] === "Resolved";
  const conversation = staffTicketConversations[ticketId] || {
    customerMessage: `The customer needs help with: ${ticket.subject}.`,
    staffMessage: isClosed
      ? "This ticket was resolved and then closed after the customer review window ended."
      : "No reply has been sent yet. Review the request and give the customer a clear next step.",
  };
  const staffName = getProfileDisplayName(getActiveProfile());
  const detailMessages = state.ticketDetails.get(ticketId)?.messages;
  const conversationMarkup = Array.isArray(detailMessages) && detailMessages.length
    ? detailMessages.map((message) => `<article class="conversation-message ${message.author_role === "CUSTOMER" ? "customer-message" : "staff-message"}"><span>${escapeHtml(message.author || "Support team")}</span><p>${escapeHtml(message.body || "")}</p></article>`).join("")
    : `<article class="conversation-message customer-message"><span>${escapeHtml(ticket.createdBy)}</span><p>${escapeHtml(conversation.customerMessage)}</p></article><article class="conversation-message staff-message"><span>${escapeHtml(staffName)}</span><p>${escapeHtml(conversation.staffMessage)}</p></article>`;
  const lifecycleNotice = ticket.closure && !ticket.closure.isClosed
    ? `<div class="notice"><span aria-hidden="true">◷</span><span><strong>The customer marked this ticket as resolved.</strong> It remains in My tickets until ${formatClosureDate(ticket.closure.closesAt)}. ${getClosureCountdownLabel(ticket.closure)} unless the customer reopens it.</span></div>`
    : isClosed
      ? `<div class="notice"><span aria-hidden="true">✓</span><span><strong>This ticket is closed.</strong> Closed ${escapeHtml(ticket.closedAt || "after the three-day review window")} and available for review only.</span></div>`
      : "";
  const rerouteControl = isClosed || isResolved
    ? ""
    : `<div class="staff-reroute-control"><div><strong>Not for your queue?</strong><span>Send this ticket to Admin for manual rerouting. You will no longer be assigned to it.</span></div><button class="button danger-text" type="button" data-action="reroute-staff-ticket" data-ticket-id="${escapeHtml(ticket.id)}">Reroute to admin</button></div>`;
  const ticketAction = isClosed || isResolved
    ? lifecycleNotice
    : `${lifecycleNotice}${rerouteControl}${["Waiting for Support", "Reopened"].includes(ticket.status[0]) ? `<form id="staff-reply-form" class="reply-form" novalidate><label for="staff-reply">Reply to ${escapeHtml(ticket.createdBy)}</label><textarea id="staff-reply" name="staff-reply" placeholder="Write a clear update, question, or next step for the customer." required></textarea><p id="staff-reply-error" class="form-error" role="alert" hidden></p><div class="form-actions"><button class="button signal" type="submit">Send reply</button><button class="button secondary" type="button" data-action="close-staff-ticket">Close</button></div></form>` : `<div class="notice"><span aria-hidden="true">◷</span><span><strong>Waiting for customer.</strong> The reply box will return when the customer sends an update.</span></div>`}`;
  return `
    <div class="ticket-dialog-backdrop">
      <section class="ticket-dialog staff-ticket-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-ticket-dialog-title">
        <header class="ticket-dialog-header"><div><span class="ticket-code">${escapeHtml(ticket.id)}</span><h2 id="staff-ticket-dialog-title">${escapeHtml(ticket.subject)}</h2></div><button class="dialog-close" type="button" data-action="close-staff-ticket" aria-label="Close ticket details">×</button></header>
        <dl class="ticket-dialog-meta"><div><dt>Customer</dt><dd>${escapeHtml(ticket.createdBy)}</dd></div><div><dt>Ticket type</dt><dd>${escapeHtml(ticket.type)}</dd></div><div><dt>Priority</dt><dd>${priority(ticket.priority)}</dd></div><div><dt>Status</dt><dd>${status(ticket.status[0], ticket.status[1])}</dd></div><div><dt>${isClosed ? "Closed" : "Last updated"}</dt><dd>${escapeHtml(ticket.closedAt || ticket.updated || "—")}</dd></div><div><dt>Assignee</dt><dd>${escapeHtml(staffName)}</dd></div></dl>
        <div class="ticket-dialog-body"><h3>Conversation</h3><div class="conversation">${conversationMarkup}</div>${ticketAction}</div>
      </section>
    </div>`;
}

function renderLegacyNewTicket() {
  const draft = state.activeDraftId ? getCustomerDrafts().find((item) => item.id === state.activeDraftId) : null;
  const isDraft = Boolean(draft);
  const draftSubject = draft?.subject ?? "";
  const draftBody = draft?.body ?? "";
  const emptyDraftPrompt = state.emptyDraftPrompt
    ? `<div class="draft-empty-prompt" role="alertdialog" aria-labelledby="empty-draft-title" aria-describedby="empty-draft-description"><div><strong id="empty-draft-title">This ticket is empty.</strong><p id="empty-draft-description">There is nothing to save yet. Do you want to discard it?</p></div><div class="draft-empty-actions"><button class="button danger" type="button" data-action="discard-empty-draft">Discard ticket</button><button class="button secondary" type="button" data-action="keep-empty-draft">Keep editing</button></div></div>`
    : "";
  return `
    <div class="page-heading"><div><span class="eyebrow">${isDraft ? "Continue draft" : "New customer request"}</span><h1>${isDraft ? "Finish your draft." : "Tell us what happened."}</h1><p>${isDraft ? "Your draft is still private until you submit it." : "We will send your request to the right support team after you submit it."}</p></div></div>
    <div class="form-shell"><form id="ticket-form" class="form-card" novalidate><div class="form-grid"><div class="form-field full"><label for="subject">Subject</label><input id="subject" name="subject" maxlength="160" value="${escapeHtml(draftSubject)}" placeholder="For example: I cannot sign in to my account" required /></div><div class="form-field full"><label for="description">Describe your issue</label><textarea id="description" name="description" placeholder="Include what you were trying to do, what happened, and any helpful details." required>${escapeHtml(draftBody)}</textarea></div><div class="form-field full"><label for="issue-choice">What best describes this?</label><select id="issue-choice" name="issue-choice" required><option value="" ${draft?.issueChoice ? "" : "selected"} disabled>Select one answer</option><option value="stopped_working" ${draft?.issueChoice === "stopped_working" ? "selected" : ""}>Something stopped working</option><option value="need_action" ${draft?.issueChoice === "need_action" ? "selected" : ""}>I need something done</option><option value="ongoing_issue" ${draft?.issueChoice === "ongoing_issue" ? "selected" : ""}>I have an ongoing issue</option><option value="change_request" ${draft?.issueChoice === "change_request" ? "selected" : ""}>I want to change something</option></select><p class="field-help">Your answer helps us route the request to the right support team. You do not need to know which team handles it.</p></div></div>${emptyDraftPrompt}<p id="ticket-form-error" class="form-error" role="alert" hidden></p><div class="notice"><span aria-hidden="true">↳</span><span><strong>Save or submit when ready.</strong> Drafts stay private. When submitted, your ticket receives a reference number and is sent for routing.</span></div><div class="form-actions"><button class="button signal" type="submit">Submit ticket</button><button class="button secondary" type="button" data-action="save-draft">${isDraft ? "Save changes" : "Save as draft"}</button><button class="button text" type="button" data-page="${isDraft ? "tickets" : "dashboard"}">Cancel</button></div></form></div>`;
}

function renderCustomerRequestProgress(step) {
  const steps = [
    ["Choose", "Pick the closest match"],
    ["Describe", "Add the important details"],
    ["Review", "Send when you are ready"],
  ];
  return `<ol class="customer-request-stepper" aria-label="New request progress">${steps.map(([label, detail], index) => {
    const stepNumber = index + 1;
    const stateClass = stepNumber === step ? " is-active" : stepNumber < step ? " is-complete" : "";
    return `<li class="customer-request-step${stateClass}"><span class="customer-request-step-number">${stepNumber < step ? "&#10003;" : stepNumber}</span><span><strong>${label}</strong><small>${detail}</small></span></li>`;
  }).join("")}</ol>`;
}

function renderCustomerRequestGuidance() {
  return `
    <aside class="customer-request-guidance" aria-label="Request tips">
      <span class="eyebrow">A quick note</span>
      <h2>Most requests take less than two minutes.</h2>
      <p>We only ask for the details that will help the support team understand your situation.</p>
      <ol>
        <li><span>1</span><div><strong>Be specific</strong><p>Include an order number or date if it is relevant.</p></div></li>
        <li><span>2</span><div><strong>Keep it safe</strong><p>Never send passwords, one-time codes, or full card numbers.</p></div></li>
        <li><span>3</span><div><strong>Stay in the thread</strong><p>We will keep replies here, so nothing gets lost in your inbox.</p></div></li>
      </ol>
    </aside>`;
}

function renderNewTicket() {
  const draft = state.activeDraftId ? getCustomerDrafts().find((item) => item.id === state.activeDraftId) : null;
  const isDraft = Boolean(draft);
  const values = currentCustomerRequestValues(draft);
  const step = Math.min(3, Math.max(1, Number(state.customerRequestStep) || 1));
  const issueTypes = [
    { key: "stopped_working", title: "Something stopped working", description: "An order, account, payment, or feature is not working as expected.", icon: "&#9651;", tone: "issue" },
    { key: "need_action", title: "I need something done", description: "You need help with an order, account, return, or another service request.", icon: "&#9634;", tone: "request" },
    { key: "ongoing_issue", title: "I have an ongoing issue", description: "The same issue keeps happening and you need help getting it resolved.", icon: "&#8635;", tone: "ongoing" },
    { key: "change_request", title: "I want to change something", description: "You want to update an order, delivery detail, account preference, or service.", icon: "&#8596;", tone: "change" },
  ];
  const selectedType = issueTypes.find((item) => item.key === values.issueChoice);
  const emptyDraftPrompt = state.emptyDraftPrompt
    ? `<div class="draft-empty-prompt" role="alertdialog" aria-labelledby="empty-draft-title" aria-describedby="empty-draft-description"><div><strong id="empty-draft-title">This ticket is empty.</strong><p id="empty-draft-description">There is nothing to save yet. Do you want to discard it?</p></div><div class="draft-empty-actions"><button class="button danger" type="button" data-action="discard-empty-draft">Discard ticket</button><button class="button secondary" type="button" data-action="keep-empty-draft">Keep editing</button></div></div>`
    : "";
  const hiddenTextFields = `<input type="hidden" name="subject" value="${escapeHtml(values.subject)}" /><input type="hidden" name="description" value="${escapeHtml(values.body)}" />`;
  const hiddenTypeField = `<input type="hidden" name="issue-choice" value="${escapeHtml(values.issueChoice)}" />`;
  const cancellationPage = isDraft ? "tickets" : "dashboard";
  const selectionSummary = selectedType
    ? `<div class="customer-request-selection"><span class="customer-request-type-icon ${selectedType.tone}" aria-hidden="true">${selectedType.icon}</span><div><span class="eyebrow">Your selected path</span><strong>${selectedType.title}</strong><p>${selectedType.description}</p></div><button class="button text" type="button" data-action="customer-request-previous-step">Change</button></div>`
    : "";
  const chooseStep = `
    <div class="customer-request-copy"><h2>What best describes this?</h2><p>Choose the closest match. This helps us guide your request without making you learn support terminology.</p></div>
    <div class="customer-request-type-grid">${issueTypes.map((item) => `<button class="customer-request-type${values.issueChoice === item.key ? " is-selected" : ""}" type="button" data-action="customer-request-select-type" data-issue-choice="${item.key}" aria-pressed="${values.issueChoice === item.key}"><span class="customer-request-type-icon ${item.tone}" aria-hidden="true">${item.icon}</span><span class="customer-request-type-copy"><strong>${item.title}</strong><small>${item.description}</small></span><span class="customer-request-type-check" aria-hidden="true">&#10003;</span></button>`).join("")}</div>
    <div class="customer-request-actions"><button class="button text" type="button" data-page="${cancellationPage}">Cancel</button><button class="button signal customer-request-primary" type="button" data-action="customer-request-next-step">Continue <span aria-hidden="true">&#8594;</span></button></div>`;
  const describeStep = `
    ${selectionSummary}
    <div class="customer-request-copy"><h2>Tell us the important details.</h2><p>A short, clear summary gives the support team a better place to start. You can always add more in the conversation later.</p></div>
    <div class="customer-request-fields"><div class="form-field full"><label for="subject">Subject</label><input id="subject" name="subject" data-customer-request-field="subject" maxlength="160" value="${escapeHtml(values.subject)}" placeholder="For example: I cannot sign in to my account" required /></div><div class="form-field full"><label for="description">Describe your issue</label><textarea id="description" name="description" data-customer-request-field="body" maxlength="4000" placeholder="Include what you were trying to do, what happened, and any helpful details." required>${escapeHtml(values.body)}</textarea><p class="field-help">Include any order number, item, date, or error message that could help us understand the issue.</p></div></div>
    <div class="customer-request-actions"><div><button class="button text" type="button" data-action="customer-request-previous-step">&#8592; Back</button><button class="button secondary" type="button" data-action="save-draft">${isDraft ? "Save changes" : "Save as draft"}</button></div><button class="button signal customer-request-primary" type="button" data-action="customer-request-next-step">Review request <span aria-hidden="true">&#8594;</span></button></div>`;
  const reviewStep = `
    ${selectionSummary}
    <div class="customer-request-copy"><h2>Ready to send?</h2><p>Review the essentials below. Once you submit, your request will receive a reference number and be sent for routing.</p></div>
    <dl class="customer-request-review"><div><dt>What you need</dt><dd>${escapeHtml(selectedType?.title || "Not selected")}</dd></div><div><dt>Subject</dt><dd>${escapeHtml(values.subject || "Not added")}</dd></div><div class="full"><dt>Description</dt><dd>${escapeHtml(values.body || "Not added")}</dd></div></dl>
    <div class="notice customer-request-notice"><span aria-hidden="true">&#8594;</span><span><strong>Keep the conversation in one place.</strong> You can return to My tickets whenever you need to add information or check an update.</span></div>
    <div class="customer-request-actions"><div><button class="button text" type="button" data-action="customer-request-previous-step">&#8592; Edit details</button><button class="button secondary" type="button" data-action="save-draft">${isDraft ? "Save changes" : "Save as draft"}</button></div><button class="button signal customer-request-primary" type="submit">Send request <span aria-hidden="true">&#8594;</span></button></div>`;
  const currentStepMarkup = step === 1 ? chooseStep : step === 2 ? describeStep : reviewStep;
  const retainedFields = step === 1 ? `${hiddenTextFields}${hiddenTypeField}` : step === 2 ? hiddenTypeField : `${hiddenTextFields}${hiddenTypeField}`;
  return `
    <div class="customer-request-page">
      <div class="page-heading customer-request-heading"><div><span class="eyebrow">${isDraft ? "Continue draft" : "New customer request"}</span><h1>${isDraft ? "Finish your draft." : "Tell us what happened."}</h1><p>${isDraft ? "Your draft is still private until you submit it." : "We will send your request to the right support team after you submit it."}</p></div><aside class="customer-request-duration"><span aria-hidden="true">&#9719;</span><div><strong>Usually 1&ndash;2 minutes</strong><p>You are only three short steps away from sending your request.</p></div></aside></div>
      <div class="customer-request-layout"><form id="ticket-form" class="customer-request-card" novalidate>${renderCustomerRequestProgress(step)}<div class="customer-request-body">${retainedFields}${currentStepMarkup}${emptyDraftPrompt}<p id="ticket-form-error" class="form-error" role="alert" ${state.customerRequestError ? "" : "hidden"}>${escapeHtml(state.customerRequestError)}</p></div></form>${renderCustomerRequestGuidance()}</div>
    </div>`;
}

function renderStaffPerformance(staffName) {
  const basePeriod = getStaffPerformancePeriod();
  const serverPerformance = state.serverData.staffPerformance;
  const period = serverSessionIsActive() && serverPerformance
    ? {
      ...basePeriod,
      resolved: Number(serverPerformance.period_resolved_count || 0),
      resolvedNote: `${Number(serverPerformance.period_resolved_count || 0)} in selected period`,
      sla: serverPerformance.period_sla?.overall_sla_met == null ? "—" : `${serverPerformance.period_sla.overall_sla_met}%`,
      slaNote: "Resolved within SLA",
    }
    : basePeriod;
  const maximumCadence = Math.max(...period.cadence.map((item) => item.value), 1);
  const periodControls = staffPerformancePeriods.map((item) => `<button class="performance-period${item.key === period.key ? " active" : ""}" type="button" data-action="set-staff-performance-period" data-period="${item.key}" aria-pressed="${item.key === period.key}">${item.label}</button>`).join("");
  const cadence = period.cadence.map((item) => {
    const height = Math.max(10, Math.round((item.value / maximumCadence) * 100));
    return `<div class="performance-bar-column"><span class="performance-bar-value">${item.value}</span><span class="performance-bar-track"><span class="performance-bar" style="height: ${height}%"></span></span><span class="performance-bar-label">${item.label}</span></div>`;
  }).join("");
  const qualityRows = period.quality.map((item) => `<div class="quality-row"><div><strong>${item.label}</strong><p>${item.detail}</p></div><span>${item.value}</span></div>`).join("");
  const resolvedRows = serverSessionIsActive() && serverPerformance
    ? (serverPerformance.recent_resolved_work || []).map((ticket) => { const reference = ticket.reference || `TKT-${String(ticket.id).padStart(6, "0")}`; const closed = ticket.status === "CLOSED"; const statusLabel = serverStatusLabels[ticket.status] || ticket.status || "Resolved"; return `<tr><td><span class="ticket-code">${escapeHtml(reference)}</span></td><td><span class="ticket-subject">${escapeHtml(ticket.subject || "Untitled ticket")}</span><span class="muted">${escapeHtml(ticket.customer || "Customer")} · ${escapeHtml(ticket.type || "")}</span></td><td>${priority(serverPriorityLabel(ticket.priority))}</td><td>${status(statusLabel, serverStatusTone(ticket.status))}</td><td class="muted">${escapeHtml(formatServerDate(ticket.updated_at || ticket.created_at))}</td><td><button class="button secondary staff-review-button" type="button" data-action="view-staff-ticket" data-ticket-id="${escapeHtml(reference)}">${closed ? "Review" : "Open"}</button></td></tr>`; }).join("")
    : "";
  const performanceTable = serverSessionIsActive() && serverPerformance
    ? `<section class="panel table-panel staff-performance-work"><div class="panel-head"><div><h2>Recent resolved work</h2><p>Review resolved and closed tickets without reopening them or changing their history.</p></div><span class="performance-total">${serverPerformance.total || 0} reviewable</span></div><table class="data-table"><thead><tr><th>Reference</th><th>Customer issue</th><th>Priority</th><th>Status</th><th>Resolved</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${resolvedRows || '<tr><td colspan="6"><p class="table-empty">No resolved tickets are available for review.</p></td></tr>'}</tbody></table><div class="table-pagination"><div class="table-pagination-status"><span>Page ${serverPerformance.page || 1} of ${Math.max(1, Math.ceil(Number(serverPerformance.total || 0) / Number(serverPerformance.page_size || 5)))} · ${serverPerformance.total || 0} tickets</span><label class="table-page-jump">Go to page <input type="number" min="1" max="${Math.max(1, Math.ceil(Number(serverPerformance.total || 0) / Number(serverPerformance.page_size || 5)))}" value="${serverPerformance.page || 1}" data-server-page-input="staff-performance-page" aria-label="Go to resolved work page" /></label></div><div><button class="button secondary" type="button" data-action="staff-performance-page" data-direction="previous" ${Number(serverPerformance.page || 1) <= 1 ? "disabled" : ""}>Previous</button><button class="button secondary" type="button" data-action="staff-performance-page" data-direction="next" ${Number(serverPerformance.page || 1) >= Math.max(1, Math.ceil(Number(serverPerformance.total || 0) / Number(serverPerformance.page_size || 5))) ? "disabled" : ""}>Next</button></div></div></section>`
    : "";
  return `
    <div class="staff-workspace staff-workspace--performance">
    <div class="page-heading performance-heading"><div><span class="eyebrow">${escapeHtml(staffName)}'s performance</span><h1>Your service results</h1><p>Track your resolved work, response speed, and service quality over time.</p></div><div class="performance-periods" role="group" aria-label="Select performance period">${periodControls}</div></div>
    <section class="metric-grid performance-metric-grid"><article class="metric-card"><span class="eyebrow">Tickets resolved</span><strong class="metric-value">${period.resolved}</strong><span class="metric-footer"><span class="trend">${period.resolvedNote.split(" ")[0]}</span> ${period.resolvedNote.replace(/^[^ ]+ /, "")}</span></article><article class="metric-card"><span class="eyebrow">Average first reply</span><strong class="metric-value">${period.firstReply}</strong><span class="metric-footer"><span class="trend">${period.firstReplyNote.split(" ").slice(0, 2).join(" ")}</span> ${period.firstReplyNote.split(" ").slice(2).join(" ")}</span></article><article class="metric-card"><span class="eyebrow">Average resolution</span><strong class="metric-value">${period.resolution}</strong><span class="metric-footer"><span class="trend">${period.resolutionNote.split(" ").slice(0, 2).join(" ")}</span> ${period.resolutionNote.split(" ").slice(2).join(" ")}</span></article><article class="metric-card"><span class="eyebrow">SLA met</span><strong class="metric-value">${period.sla}</strong><span class="metric-footer">${period.slaNote}</span></article></section>
    <section class="performance-detail-grid"><article class="panel performance-cadence-panel"><div class="panel-head"><div><h2>Resolution cadence</h2><p>Tickets resolved across ${period.label.toLowerCase()}.</p></div><span class="performance-total">${period.resolved} resolved</span></div><div class="panel-body"><div class="performance-cadence-chart">${cadence}</div><p class="performance-cadence-caption">Each column records resolved tickets in its time period.</p></div></article><article class="panel performance-quality-panel"><div class="panel-head"><div><h2>Quality review</h2><p>Personal service signals for ${period.label.toLowerCase()}.</p></div></div><div class="panel-body"><div class="quality-list">${qualityRows}</div><div class="performance-note"><span aria-hidden="true">✓</span><span><strong>Keep the momentum.</strong> Your reply speed remains inside the team target for this period.</span></div></div></article></section>
     ${performanceTable}
     <section class="performance-note"><span aria-hidden="true">↳</span><span><strong>Closed tickets remain reviewable here.</strong> They are removed from active worklists after the three-day customer review window.</span></section>
    ${state.staffTicketDialog ? renderStaffTicketDialog(state.staffTicketDialog) : ""}
    </div>`;
}

function renderStaff() {
  const isMyDesk = state.page === "dashboard";
  const isTicketPool = state.page === "unassigned";
  const isMyTickets = state.page === "assigned";
  const isPerformance = state.page === "performance";
  const staffName = getProfileDisplayName(getActiveProfile());
  const serverStaff = state.serverData.staff;
  const serverQueue = serverStaff?.queue || {};
  const serverMetrics = serverStaff?.metrics || {};
  const queueName = serverStaff?.staff?.queue || roleDefinitions.staff.title || "Your queue";
  if (isPerformance) return renderStaffPerformance(staffName);
  const resolvedPeriod = getStaffResolvedPeriod();
  const serverMode = serverSessionIsActive() && Boolean(serverStaff);
  const assignedTickets = serverMode ? staffAssignedTickets : getStaffActiveTickets();
  const renderAssignedRows = (tickets, emptyMessage = "No assigned tickets match these filters.") => tickets.length
    ? tickets.map((ticket) => `<tr><td><span class="ticket-code">${ticket.id}</span></td><td><span class="ticket-subject">${ticket.subject}</span><span class="muted">${ticket.createdBy} · ${ticket.type}</span></td><td>${priority(ticket.priority)}</td><td>${renderStaffTicketStatus(ticket)}</td><td>${staffName}</td><td class="muted">${ticket.updated}</td><td><button class="button secondary" data-action="view-staff-ticket" data-ticket-id="${ticket.id}">Open</button></td></tr>`).join("")
    : `<tr><td colspan="7"><p class="table-empty">${emptyMessage}</p></td></tr>`;
  const renderTicketPoolRows = (tickets) => tickets.length
    ? tickets.map((ticket) => `<tr><td><span class="ticket-code">${ticket.id}</span></td><td><span class="ticket-subject">${ticket.subject}</span><span class="muted">${ticket.createdBy} · ${ticket.type}</span></td><td>${priority(ticket.priority)}</td><td class="muted">${ticket.createdAt}</td><td><button class="button signal" data-action="claim" data-ticket-id="${ticket.id}">Claim</button></td></tr>`).join("")
    : '<tr><td colspan="5"><p class="table-empty">No Ticket Pool tickets match these filters.</p></td></tr>';
  const recentAssignedRows = renderAssignedRows(serverMode
    ? staffPreviewTickets.slice(0, TICKET_TABLE_PREVIEW_SIZE)
    : [...assignedTickets].sort(sortTicketsMostRecent).slice(0, TICKET_TABLE_PREVIEW_SIZE));
  const availableTicketPoolTickets = serverMode ? ticketPoolTickets : getAvailableTicketPoolTickets();
  const filteredTicketPoolTickets = serverMode
    ? availableTicketPoolTickets
    : availableTicketPoolTickets.filter((ticket) => (
      (state.ticketPoolFilters.priority === "all" || ticket.priority === state.ticketPoolFilters.priority)
      && (state.ticketPoolFilters.type === "all" || ticket.type === state.ticketPoolFilters.type)
    ));
  const priorityOrder = { High: 3, Medium: 2, Low: 1 };
  const sortedTicketPoolTickets = serverMode ? filteredTicketPoolTickets : [...filteredTicketPoolTickets].sort((left, right) => {
    let comparison = 0;
    if (state.ticketPoolSort.key === "ticketId") {
      comparison = Number(left.id.replace(/\D/g, "")) - Number(right.id.replace(/\D/g, ""));
    } else if (state.ticketPoolSort.key === "priority") {
      comparison = priorityOrder[left.priority] - priorityOrder[right.priority];
    } else {
      comparison = left.createdOrder - right.createdOrder;
    }
    return state.ticketPoolSort.direction === "asc" ? comparison : -comparison;
  });
  const ticketPoolPagination = serverMode
    ? {
      rows: sortedTicketPoolTickets,
      page: Number(serverStaff.ticket_pool_pagination?.page || state.staffTicketPoolPage || 1),
      total: Number(serverStaff.ticket_pool_pagination?.total || sortedTicketPoolTickets.length),
      totalPages: Number(serverStaff.ticket_pool_pagination?.total_pages || 1),
    }
    : paginateTableRows(sortedTicketPoolTickets, state.staffTicketPoolPage);
  const unassignedRows = renderTicketPoolRows(ticketPoolPagination.rows);
  const filteredAssignedTickets = serverMode ? assignedTickets : getFilteredStaffMyTickets();
  const sortedAssignedTickets = serverMode ? filteredAssignedTickets : [...filteredAssignedTickets].sort((left, right) => {
    let comparison = 0;
    if (state.myTicketsSort.key === "ticketId") {
      comparison = Number(left.id.replace(/\D/g, "")) - Number(right.id.replace(/\D/g, ""));
    } else if (state.myTicketsSort.key === "priority") {
      comparison = priorityOrder[left.priority] - priorityOrder[right.priority];
    } else {
      comparison = left.updatedOrder - right.updatedOrder;
    }
    return state.myTicketsSort.direction === "asc" ? comparison : -comparison;
  });
  const assignedPagination = serverMode
    ? {
      rows: sortedAssignedTickets,
      page: Number(serverStaff.tickets_pagination?.page || state.staffMyTicketsPage || 1),
      total: Number(serverStaff.tickets_pagination?.total || sortedAssignedTickets.length),
      totalPages: Number(serverStaff.tickets_pagination?.total_pages || 1),
    }
    : paginateTableRows(sortedAssignedTickets, state.staffMyTicketsPage);
  const assignedRows = renderAssignedRows(assignedPagination.rows);
  const tableTitle = isMyDesk ? "My active tickets" : isTicketPool ? `${queueName} tickets` : "Assigned work";
  const tableSubtitle = isMyDesk
    ? `The five most recently updated tickets assigned to ${staffName}.`
    : isTicketPool
      ? "Unassigned tickets available for you to claim."
      : `Tickets assigned to ${staffName}. Filter or sort to focus on your next action.`;
  const tableRows = isMyDesk ? recentAssignedRows : isTicketPool ? unassignedRows : assignedRows;
  const tablePagination = isTicketPool
    ? renderTablePagination("paginate-staff-ticket-pool", ticketPoolPagination, "tickets", "staffTicketPoolPage")
    : isMyTickets
      ? renderTablePagination("paginate-staff-my-tickets", assignedPagination, "tickets", "staffMyTicketsPage")
      : "";
  const renderSortHeader = (sort, action, key, label) => {
    const isSorted = sort.key === key;
    const direction = sort.direction;
    const indicator = isSorted ? (direction === "asc" ? "↑" : "↓") : "↕";
    const sortState = isSorted ? (direction === "asc" ? "ascending" : "descending") : "none";
    return `<th aria-sort="${sortState}"><button class="table-sort${isSorted ? " active" : ""}" type="button" data-action="${action}" data-sort-key="${key}" aria-pressed="${isSorted}" title="Sort by ${label}">${label}<span aria-hidden="true">${indicator}</span></button></th>`;
  };
  const tableHeaders = isTicketPool
    ? `${renderSortHeader(state.ticketPoolSort, "sort-ticket-pool", "ticketId", "Ticket ID")}<th>Customer issue</th>${renderSortHeader(state.ticketPoolSort, "sort-ticket-pool", "priority", "Priority")}${renderSortHeader(state.ticketPoolSort, "sort-ticket-pool", "createdAt", "Created")}<th></th>`
    : isMyTickets
      ? `${renderSortHeader(state.myTicketsSort, "sort-my-tickets", "ticketId", "Ticket ID")}<th>Customer issue</th>${renderSortHeader(state.myTicketsSort, "sort-my-tickets", "priority", "Priority")}<th>Status</th><th>Assignee</th>${renderSortHeader(state.myTicketsSort, "sort-my-tickets", "lastUpdated", "Last updated")}<th></th>`
    : "<th>Reference</th><th>Customer issue</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Last updated</th><th></th>";
  const activeTicketPoolFilters = Number(state.ticketPoolFilters.priority !== "all") + Number(state.ticketPoolFilters.type !== "all");
  const ticketPoolFilters = isTicketPool && state.ticketPoolFiltersOpen ? `
    <div class="ticket-pool-filters" role="group" aria-label="Filter Technical Support tickets">
      <label><span>Priority</span><select data-ticket-pool-filter="priority" aria-label="Filter by priority"><option value="all" ${state.ticketPoolFilters.priority === "all" ? "selected" : ""}>All priorities</option><option value="High" ${state.ticketPoolFilters.priority === "High" ? "selected" : ""}>High priority</option><option value="Medium" ${state.ticketPoolFilters.priority === "Medium" ? "selected" : ""}>Medium priority</option><option value="Low" ${state.ticketPoolFilters.priority === "Low" ? "selected" : ""}>Low priority</option></select></label>
      <label><span>Ticket type</span><select data-ticket-pool-filter="type" aria-label="Filter by ticket type"><option value="all" ${state.ticketPoolFilters.type === "all" ? "selected" : ""}>All ticket types</option><option value="Incident" ${state.ticketPoolFilters.type === "Incident" ? "selected" : ""}>Incident</option><option value="Problem" ${state.ticketPoolFilters.type === "Problem" ? "selected" : ""}>Problem</option><option value="Request" ${state.ticketPoolFilters.type === "Request" ? "selected" : ""}>Request</option></select></label>
      <button class="button text" type="button" data-action="clear-ticket-pool-filters">Clear filters</button>
      <span class="ticket-pool-filter-count">Showing ${sortedTicketPoolTickets.length} of ${serverMode ? Number(serverStaff.ticket_pool_pagination?.total || sortedTicketPoolTickets.length) : availableTicketPoolTickets.length} tickets</span>
    </div>` : "";
  const activeMyTicketsFilters = Number(state.myTicketsFilters.priority !== "all") + Number(state.myTicketsFilters.status !== "all") + Number(Boolean(state.myTicketsSearch));
  const myTicketsFilters = isMyTickets && state.myTicketsFiltersOpen ? `
    <div class="my-tickets-filters" role="group" aria-label="Filter ${staffName}'s assigned tickets">
      <form id="staff-my-tickets-search-form" class="staff-my-tickets-search"><div class="staff-my-tickets-search-field"><label for="staff-my-tickets-search">Search tickets</label><div class="staff-my-tickets-search-input"><input id="staff-my-tickets-search" name="staff-my-tickets-search" type="search" value="${escapeHtml(state.myTicketsSearch)}" placeholder="Ticket ID, subject, customer, queue, or status" /><button type="button" data-action="clear-staff-my-tickets-search" aria-label="Clear ticket search" ${state.myTicketsSearch ? "" : "disabled"}>×</button></div></div><button class="button secondary" type="submit">Search</button></form>
      <label><span>Priority</span><select data-my-tickets-filter="priority" aria-label="Filter by priority"><option value="all" ${state.myTicketsFilters.priority === "all" ? "selected" : ""}>All priorities</option><option value="High" ${state.myTicketsFilters.priority === "High" ? "selected" : ""}>High priority</option><option value="Medium" ${state.myTicketsFilters.priority === "Medium" ? "selected" : ""}>Medium priority</option><option value="Low" ${state.myTicketsFilters.priority === "Low" ? "selected" : ""}>Low priority</option></select></label>
      <label><span>Status</span><select data-my-tickets-filter="status" aria-label="Filter by status"><option value="all" ${state.myTicketsFilters.status === "all" ? "selected" : ""}>All statuses</option><option value="Waiting for Support" ${state.myTicketsFilters.status === "Waiting for Support" ? "selected" : ""}>Waiting for Support</option><option value="Waiting for Customer" ${state.myTicketsFilters.status === "Waiting for Customer" ? "selected" : ""}>Waiting for Customer</option><option value="Reopened" ${state.myTicketsFilters.status === "Reopened" ? "selected" : ""}>Reopened</option><option value="Resolved" ${state.myTicketsFilters.status === "Resolved" ? "selected" : ""}>Resolved</option></select></label>
      <button class="button text" type="button" data-action="clear-my-tickets-filters">Clear filters</button>
      <span class="my-tickets-filter-count">Showing ${sortedAssignedTickets.length} of ${serverMode ? Number(serverStaff.tickets_pagination?.total || sortedAssignedTickets.length) : assignedTickets.length} tickets</span>
    </div>` : "";
  const tableAction = isMyDesk
    ? '<button class="button text panel-head-action" type="button" data-page="assigned">View all tickets</button>'
    : isTicketPool
      ? `<button class="button secondary" type="button" data-action="toggle-ticket-pool-filters" aria-expanded="${state.ticketPoolFiltersOpen}">${activeTicketPoolFilters ? `Filters (${activeTicketPoolFilters})` : "Filter tickets"}</button>`
      : isMyTickets
        ? `<button class="button secondary" type="button" data-action="toggle-my-tickets-filters" aria-expanded="${state.myTicketsFiltersOpen}">${activeMyTicketsFilters ? `Filters (${activeMyTicketsFilters})` : "Filter tickets"}</button>`
      : '<button class="button secondary" type="button" data-action="filter">Filter list</button>';
  const tableFilters = isTicketPool ? ticketPoolFilters : isMyTickets ? myTicketsFilters : "";
  const table = `<section class="panel table-panel"><div class="panel-head"><div><h2>${tableTitle}</h2><p>${tableSubtitle}</p></div>${tableAction}</div>${tableFilters}<table class="data-table"><thead><tr>${tableHeaders}</tr></thead><tbody>${tableRows}</tbody></table>${tablePagination}</section>`;
  const queueBanner = `<section class="queue-banner"><div><span class="eyebrow">Your queue</span><h2>${escapeHtml(queueName)}</h2><p>Tickets routed to the support area assigned to you.</p></div><div class="queue-count">QUEUE BACKLOG<strong>${serverQueue.backlog ?? 18}</strong></div><div class="queue-count">UNASSIGNED<strong>${serverQueue.unassigned ?? availableTicketPoolTickets.length}</strong></div><div class="queue-count">HIGH PRIORITY<strong>${serverQueue.high_priority ?? availableTicketPoolTickets.filter((ticket) => ticket.priority === "High").length}</strong></div></section>`;
  const deskMetrics = `<section class="metric-grid"><article class="metric-card"><span class="eyebrow">My active tickets</span><strong class="metric-value">${serverMetrics.active_tickets ?? assignedTickets.length}</strong><span class="metric-footer"><span class="trend warn">${serverMetrics.waiting_for_reply ?? getStaffPendingReplyCount()}</span> ticket waiting your reply</span></article><article class="metric-card"><span class="eyebrow">Pending closure</span><strong class="metric-value">${serverMetrics.pending_closure ?? 2}</strong><span class="metric-footer">Ready for your final review</span></article><article class="metric-card resolution-metric"><div class="metric-card-header"><span class="eyebrow">Tickets resolved</span><button class="metric-swap" type="button" data-action="cycle-staff-resolved-period" aria-label="Show the next resolved-ticket period" title="Show today, this week, or this month">↻</button></div><strong class="metric-value">${resolvedPeriod.value}</strong><span class="metric-footer"><span class="period-label">${resolvedPeriod.label}</span>${resolvedPeriod.detail}</span></article><article class="metric-card"><span class="eyebrow">Route corrections</span><strong class="metric-value">${serverMetrics.route_corrections ?? 2}</strong><span class="metric-footer"><span class="period-label">This week</span> Recorded for model review</span></article></section>`;
  if (isTicketPool) return `<div class="staff-workspace staff-workspace--pool"><section class="ticket-pool-page">${queueBanner}${table}</section></div>`;
  if (isMyTickets) return `
    <div class="staff-workspace staff-workspace--tickets">
    <div class="page-heading staff-worklist-heading"><div><span class="eyebrow">${staffName}'s workspace</span><h1>My tickets</h1><p>Review the tickets assigned to ${staffName}, reply where needed, and keep each customer informed.</p></div></div>
    ${table}
    ${state.staffTicketDialog ? renderStaffTicketDialog(state.staffTicketDialog) : ""}
    </div>`;
  return `
    <div class="staff-workspace staff-workspace--desk">
    <div class="page-heading"><div><span class="eyebrow">Technical Support</span><h1>My desk</h1><p>Focus on your assigned tickets, requested replies, and closure work.</p></div></div>
    ${queueBanner}
    ${deskMetrics}
    ${table}
    </div>`;
}

function getAdminTicket(ticketId) {
  return adminTickets.find((ticket) => ticket.id === ticketId)
    || serverAdminAttentionTickets.find((ticket) => ticket.id === ticketId)
    || state.ticketDetails.get(ticketId);
}

function forceCloseAdminTicket(ticketId, reason) {
  const ticket = getAdminTicket(ticketId);
  if (!ticket || ticket.status[0] === "Closed") {
    showToast("That ticket is already closed or no longer available.");
    return;
  }
  const administrator = getProfileDisplayName(accountProfiles.admin);
  const closure = {
    closedAt: "Today, 12:00",
    closedOrder: PROTOTYPE_TODAY.getTime(),
    reason,
    closedBy: administrator,
  };
  state.forceClosedTickets.set(ticketId, closure);
  state.claimedTicketAssignments.delete(ticketId);
  state.staffReroutedTicketIds.delete(ticketId);
  state.pendingClosureTicketIds.delete(ticketId);
  state.customerResolutionDates.delete(ticketId);
  state.waitingForCustomerSince.delete(ticketId);
  state.automaticallyResolvedTicketIds.delete(ticketId);
  setTicketStatus(ticketId, "Closed", "resolved", {
    updated: `Force closed by ${administrator}`,
    updatedDetail: closure.closedAt,
    routingFailed: false,
    overdue: false,
    forceClosed: true,
    forceCloseReason: reason,
    forceClosedBy: administrator,
    closedAt: closure.closedAt,
  });
  adminActivityEvents.unshift({
    tone: "signal",
    category: "Ticket",
    title: "Administrator force closed a ticket",
    detail: `${ticketId} was closed by ${administrator}. Reason: ${reason}`,
    actor: administrator,
    time: "JUST NOW",
  });
  auditLogRecords.unshift({
    timestamp: "19 Aug 2026, 12:00",
    actor: administrator,
    category: "Ticket",
    action: "Force closed ticket",
    record: ticketId,
    detail: `Closure reason: ${reason}`,
  });
  closeActiveDialog("adminTicketDialog", () => showToast(`${ticketId} was force closed and removed from active work.`));
}

function getAdminTicketAttentionReason(ticket) {
  if (ticket.routingFailed) return { label: "Routing failure", tone: "routing-failure", order: 1 };
  if (ticket.overdue) return { label: ticket.overdueLabel || "Overdue", tone: "overdue", order: 2 };
  return null;
}

function getAdminAttentionTickets() {
  return adminTickets
    .filter((ticket) => ticket.status?.[0] !== "Closed")
    .map((ticket) => ({ ticket, reason: getAdminTicketAttentionReason(ticket) }))
    .filter(({ reason }) => reason)
    .sort((left, right) => left.reason.order - right.reason.order);
}

function getAdminTicketSearchText(ticket, reason = null) {
  return [
    ticket.id,
    ticket.subject,
    ticket.request,
    ticket.customer,
    ticket.type,
    ticket.model,
    ticket.routingFailed ? "Routing failed" : ticket.queue,
    ticket.priority || "Unclassified",
    ticket.status?.[0],
    ["Waiting for Support", "Waiting for Customer"].includes(ticket.status?.[0]) ? "In progress" : "",
    ticket.assignee,
    ticket.updated,
    reason?.label,
  ].filter(Boolean).join(" ").toLowerCase();
}

function adminTicketMatchesFilters(ticket, reason = null) {
  const filters = state.adminTicketFilters;
  const search = state.adminTicketSearch.trim().toLowerCase();
  const queue = ticket.routingFailed ? "Routing failed" : (ticket.queue || "Unassigned");
  const priorityLabel = ticket.priority || "Unclassified";
  const statusMatches = filters.status === "all"
    || (filters.status === "In progress" && ["Waiting for Support", "Waiting for Customer"].includes(ticket.status?.[0]))
    || ticket.status?.[0] === filters.status;
  return (!search || getAdminTicketSearchText(ticket, reason).includes(search))
    && (filters.model === "all" || ticket.model === filters.model)
    && (filters.type === "all" || ticket.type === filters.type)
    && (filters.queue === "all" || queue === filters.queue)
    && (filters.priority === "all" || priorityLabel === filters.priority)
    && statusMatches
    && (filters.assignee === "all" || (ticket.assignee || "Unassigned") === filters.assignee);
}

function getFilteredAdminAttentionTickets() {
  return getAdminAttentionTickets().filter(({ ticket, reason }) => adminTicketMatchesFilters(ticket, reason));
}

function getFilteredAdminTickets() {
  return adminTickets.filter((ticket) => adminTicketMatchesFilters(ticket));
}

function getAdminSortValue(item, key, attentionOnly = false) {
  const ticket = attentionOnly ? item.ticket : item;
  const reason = attentionOnly ? item.reason : getAdminTicketAttentionReason(ticket);
  if (key === "reference") return Number(String(ticket.id || "").replace(/\D/g, "")) || 0;
  if (key === "model") return ticket.model || "";
  if (key === "queue") return ticket.routingFailed ? "Routing failed" : (ticket.queue || "Unassigned");
  if (key === "priority") return ({ High: 3, Medium: 2, Low: 1 }[ticket.priority] || 0);
  if (key === "status") return ticket.status?.[0] || "";
  if (key === "assignee") return ticket.assignee || "Unassigned";
  if (key === "updated") return getTicketUpdatedTimestamp(ticket);
  if (key === "attention") return reason?.label || "";
  return "";
}

function sortAdminTicketRecords(records, attentionOnly = false) {
  const { key, direction } = state.adminTicketSort;
  return records.slice().sort((left, right) => {
    const leftValue = getAdminSortValue(left, key, attentionOnly);
    const rightValue = getAdminSortValue(right, key, attentionOnly);
    let comparison;
    if (typeof leftValue === "number" && typeof rightValue === "number") comparison = leftValue - rightValue;
    else comparison = String(leftValue).localeCompare(String(rightValue), undefined, { sensitivity: "base" });
    if (comparison === 0) comparison = String(getAdminSortValue(left, "reference", attentionOnly)).localeCompare(String(getAdminSortValue(right, "reference", attentionOnly)));
    return direction === "asc" ? comparison : -comparison;
  });
}

function adminFilterOptions() {
  const queues = [...new Set(adminTickets.map((ticket) => ticket.routingFailed ? "Routing failed" : (ticket.queue || "Unassigned")).filter(Boolean))].sort();
  const assignees = [...new Set(adminTickets.map((ticket) => ticket.assignee || "Unassigned").filter(Boolean))].sort();
  return { queues, assignees };
}

function getAdminAttentionCounts() {
  if (serverSessionIsActive() && state.serverData.adminOverview) {
    return {
      routingFailures: Number(state.serverData.adminOverview.routing_failures || 0),
      overdue: Number(state.serverData.adminOverview.overdue || 0),
    };
  }
  return adminTickets.reduce((counts, ticket) => {
    if (ticket.routingFailed) counts.routingFailures += 1;
    if (ticket.overdue) counts.overdue += 1;
    return counts;
  }, { routingFailures: 0, overdue: 0 });
}

function getAdminOverviewPeriod() {
  return adminOverviewPeriods.find((period) => period.key === state.adminOverviewPeriod) || adminOverviewPeriods[0];
}

function getAdminOverviewMetrics() {
  const period = getAdminOverviewPeriod();
  const serverOverview = state.serverData.adminOverview;
  if (serverSessionIsActive() && serverOverview) {
    const serverPeriod = { ...period, label: String(serverOverview.period || period.key).replace(/^./, (character) => character.toUpperCase()) };
    const routeCorrections = Number(serverOverview.route_corrections || 0);
    return {
      period: serverPeriod,
      ticketsProcessed: Number(serverOverview.tickets_processed || 0),
      openBacklog: Number(serverOverview.open_backlog || 0),
      highPriority: Number(serverOverview.high_priority || 0),
      routeCorrections,
      routeCorrectionRate: Number(serverOverview.tickets_processed || 0) ? (routeCorrections / Number(serverOverview.tickets_processed)) * 100 : 0,
      routingFailures: Number(serverOverview.routing_failures || 0),
      overdue: Number(serverOverview.overdue || 0),
    };
  }
  const routeCorrections = period.routeCorrections + adminTickets.filter((ticket) => ticket.routeCorrected).length;
  const attention = getAdminAttentionCounts();
  return {
    period,
    ticketsProcessed: period.ticketsProcessed,
    openBacklog: period.openBacklog,
    highPriority: period.highPriority,
    routeCorrections,
    routeCorrectionRate: period.ticketsProcessed ? (routeCorrections / period.ticketsProcessed) * 100 : 0,
    routingFailures: attention.routingFailures,
    overdue: attention.overdue,
  };
}

function getAdminOverduePeriod() {
  const serverOverview = state.serverData.adminOverdueOverview || state.serverData.adminOverview;
  if (serverSessionIsActive() && serverOverview) {
    const counts = {};
    (serverOverview.sla_breaches_by_queue || []).forEach((item) => { counts[item.queue] = Number(item.overdue || 0); });
    return { key: state.adminOverduePeriod, label: state.adminOverduePeriod, counts, total: Object.values(counts).reduce((sum, value) => sum + value, 0) };
  }
  return adminOverduePeriods.find((period) => period.key === state.adminOverduePeriod) || adminOverduePeriods[0];
}

function getAdminSlaBreachesByQueue(period) {
  const queueNames = serverSessionIsActive() && state.serverData.queuesStaff?.queues?.length
    ? state.serverData.queuesStaff.queues.map((queue) => queue.name)
    : adminQueueOptions;
  return queueNames.map((queue) => ({ queue, count: period.counts[queue] || 0 }));
}

function renderAdminOverdueQueueRows(period) {
  const queues = getAdminSlaBreachesByQueue(period);
  const largestCount = Math.max(...queues.map((queue) => queue.count), 1);
  return queues.map(({ queue, count }) => {
    const width = count ? Math.max(10, Math.round((count / largestCount) * 100)) : 0;
    return `<div class="bar-row${count ? "" : " zero"}"><span class="bar-label">${escapeHtml(queue)}</span><span class="bar-track" aria-hidden="true"><span class="bar-fill gold" style="width: ${width}%"></span></span><span class="bar-value">${count}</span></div>`;
  }).join("");
}

function renderAdminTicketManagementBadges() {
  const attention = getAdminAttentionCounts();
  const labels = [];
  if (attention.routingFailures) labels.push(`${attention.routingFailures} routing failure${attention.routingFailures === 1 ? "" : "s"}`);
  if (attention.overdue) labels.push(`${attention.overdue} overdue ticket${attention.overdue === 1 ? "" : "s"}`);
  if (!labels.length) return "";
  return `<span class="nav-badges admin-attention-badges" aria-label="${labels.join(", ")}">${attention.routingFailures ? `<span class="nav-badge action" title="Routing failures">${attention.routingFailures}</span>` : ""}${attention.overdue ? `<span class="nav-badge warm" title="Overdue tickets">${attention.overdue}</span>` : ""}</span>`;
}

function renderAdminTicketRows(tickets, attentionOnly = false) {
  if (!tickets.length) return `<tr><td colspan="${attentionOnly ? 8 : 9}"><p class="table-empty">${attentionOnly ? "No tickets require attention right now." : "No tickets are available."}</p></td></tr>`;
  return tickets.map((item) => {
    const ticket = attentionOnly ? item.ticket : item;
    const reason = attentionOnly ? item.reason : getAdminTicketAttentionReason(ticket);
    const queue = ticket.routingFailed ? '<span class="routing-failed-label">Routing failed</span>' : escapeHtml(ticket.queue || "Unassigned");
    const modelTone = ticket.model === "Joint" ? "open" : "draft";
    const actionLabel = ticket.routingFailed ? "Reroute" : "View details";
    return `<tr class="${reason ? "admin-attention-row" : ""}"><td><span class="ticket-code">${ticket.id}</span></td><td><span class="ticket-subject">${escapeHtml(ticket.subject)}</span><span class="muted">${escapeHtml(ticket.customer)} · ${escapeHtml(ticket.type)}</span></td><td><span class="status ${modelTone}">${ticket.model}</span></td><td>${queue}</td><td>${ticket.priority ? priority(ticket.priority) : "—"}</td><td>${renderAdminTicketStatus(ticket)}</td>${attentionOnly ? `<td><span class="attention-reason ${reason.tone}">${reason.label}</span></td>` : `<td>${escapeHtml(ticket.assignee)}</td><td class="muted">${escapeHtml(ticket.updated)}</td>`}<td><button class="button ${ticket.routingFailed ? "signal" : "secondary"} row-action" type="button" data-action="manage-admin-ticket" data-ticket-id="${ticket.id}">${actionLabel}</button></td></tr>`;
  }).join("");
}

function renderAdminSortHeader(key, label) {
  const isSorted = state.adminTicketSort.key === key;
  const direction = isSorted ? state.adminTicketSort.direction : "none";
  const indicator = isSorted ? (direction === "asc" ? "↑" : "↓") : "↕";
  const sortState = isSorted ? (direction === "asc" ? "ascending" : "descending") : "none";
  return `<th aria-sort="${sortState}"><button class="table-sort${isSorted ? " active" : ""}" type="button" data-action="sort-admin-tickets" data-sort-key="${key}" aria-pressed="${isSorted}" title="Sort by ${label}">${label}<span aria-hidden="true">${indicator}</span></button></th>`;
}

function renderAdminTicketStatus(ticket) {
  if (["Waiting for Support", "Waiting for Customer"].includes(ticket.status[0])) {
    return status("In progress", "progress");
  }
  return status(ticket.status[0], ticket.status[1]);
}

async function openAdminTicket(ticketId) {
  if (!getAdminTicket(ticketId)) {
    showToast("That ticket is no longer available in Ticket Management.");
    return;
  }
  state.page = "tickets";
  state.customerTicketDialog = null;
  state.staffTicketDialog = null;
  state.adminTicketDialog = ticketId;
  render();
  if (serverSessionIsActive()) await refreshServerTicketDetail(ticketId, "admin");
}

function renderAdminModelMetadata(ticket) {
  const confidence = ticket.predictionConfidence
    ? `<small class="admin-model-confidence">Queue ${ticket.predictionConfidence.queue}% · Priority ${ticket.predictionConfidence.priority}%</small>`
    : `<small class="admin-model-confidence unavailable">No prediction recorded</small>`;
  return `<span class="status ${ticket.model === "Joint" ? "open" : "draft"}">${ticket.model}</span>${confidence}`;
}

function renderAdminPreviousPrediction(ticket) {
  if (!ticket.reroutedByStaff || !ticket.originalPrediction) return "";
  const { queue, priority: originalPriority } = ticket.originalPrediction;
  return `<div class="admin-previous-prediction"><dt>Previous model prediction</dt><dd><span><small>Queue</small><strong>${escapeHtml(queue || "—")}</strong></span><span><small>Priority</small><strong>${escapeHtml(originalPriority || "—")}</strong></span><em>Staff requested manual rerouting.</em></dd></div>`;
}

function renderAdminConversation(ticket) {
  const detailMessages = state.ticketDetails.get(ticket.id)?.messages;
  if (Array.isArray(detailMessages) && detailMessages.length) {
    return `<section class="admin-ticket-conversation"><div class="admin-conversation-heading"><h3>Conversation</h3><span>Read only</span></div><div class="conversation">${detailMessages.map((message) => `<article class="conversation-message ${message.author_role === "CUSTOMER" ? "customer-message" : "staff-message"}"><span>${escapeHtml(message.author || "Support team")}</span><p>${escapeHtml(message.body || "")}</p></article>`).join("")}</div></section>`;
  }
  const conversation = staffTicketConversations[ticket.id] || {};
  const customerMessage = conversation.customerMessage || ticket.request;
  const staffMessage = conversation.staffMessage || "No staff response has been recorded for this ticket yet.";
  const staffName = ticket.assignee === "Unassigned" ? "Support team" : ticket.assignee;
  return `<section class="admin-ticket-conversation"><div class="admin-conversation-heading"><h3>Conversation</h3><span>Read only</span></div><div class="conversation"><article class="conversation-message customer-message"><span>${escapeHtml(ticket.customer)}</span><p>${escapeHtml(customerMessage)}</p></article><article class="conversation-message staff-message"><span>${escapeHtml(staffName)}</span><p>${escapeHtml(staffMessage)}</p></article></div></section>`;
}

function renderAdminTicketDialog(ticketId) {
  const ticket = getAdminTicket(ticketId);
  if (!ticket) return "";
  const queueNames = serverSessionIsActive() && state.serverData.queuesStaff?.queues?.length
    ? state.serverData.queuesStaff.queues.map((queue) => queue.name)
    : adminQueueOptions;
  const queueOptions = queueNames.map((queue) => `<option value="${escapeHtml(queue)}" ${ticket.queue === queue ? "selected" : ""}>${escapeHtml(queue)}</option>`).join("");
  const assigneeOptions = renderAdminAssigneeOptions(ticket.queue, ticket.assignee);
  const priorityOptions = adminPriorityOptions.map((item) => `<option value="${item}" ${ticket.priority === item ? "selected" : ""}>${item}</option>`).join("");
  const routeSelection = ticket.queue ? queueOptions : `<option value="" selected disabled>Select a queue</option>${queueOptions}`;
  const isClosed = ticket.status[0] === "Closed";
  const managementForm = isClosed ? "" : `<form id="admin-ticket-management-form" class="admin-ticket-actions" data-ticket-id="${ticket.id}"><div class="form-grid"><div class="form-field"><label for="admin-ticket-queue">Route to</label><select id="admin-ticket-queue" name="admin-ticket-queue" required>${routeSelection}</select></div><div class="form-field"><label for="admin-ticket-assignee">Assign to</label><select id="admin-ticket-assignee" name="admin-ticket-assignee" required>${assigneeOptions}</select></div><div class="form-field"><label for="admin-ticket-priority">Priority</label><select id="admin-ticket-priority" name="admin-ticket-priority" required>${ticket.priority ? priorityOptions : `<option value="" selected disabled>Select priority</option>${priorityOptions}`}</select></div></div><div class="form-actions"><button class="button signal" type="submit">Save ticket changes</button><button class="button secondary" type="button" data-action="close-admin-ticket">Cancel</button></div></form>`;
  const forceCloseControl = isClosed
    ? `<section class="admin-closed-state"><strong>${ticket.forceClosed ? "Force closed by administrator" : "Ticket closed automatically"}</strong><p>${ticket.forceClosed ? `Reason: ${escapeHtml(ticket.forceCloseReason || "Not recorded")}` : escapeHtml(ticket.closureReason || "Customer did not reopen the resolved ticket within 3 days.")}</p></section>`
    : `<form id="admin-force-close-form" class="admin-force-close" data-ticket-id="${ticket.id}"><div class="admin-force-close-copy"><span class="eyebrow">Administrative action</span><strong>Force close ticket</strong><p>Use only when no further support action is required. The customer and staff cannot reopen it.</p></div><div class="form-field"><label for="admin-force-close-reason">Closure reason</label><textarea id="admin-force-close-reason" name="admin-force-close-reason" maxlength="500" required placeholder="Explain why this ticket must be closed."></textarea></div><div class="form-actions"><button class="button admin-force-close-button" type="submit">Force close ticket</button></div></form>`;
  return `
    <div class="ticket-dialog-backdrop" role="presentation"><section class="ticket-dialog admin-ticket-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-ticket-dialog-title"><header class="ticket-dialog-header"><div><span class="ticket-code">${ticket.id}</span><h2 id="admin-ticket-dialog-title">${escapeHtml(ticket.subject)}</h2></div><button class="dialog-close" type="button" data-action="close-admin-ticket" aria-label="Close ticket details">×</button></header><dl class="ticket-dialog-meta"><div><dt>Customer</dt><dd>${escapeHtml(ticket.customer)}</dd></div><div><dt>Ticket type</dt><dd>${escapeHtml(ticket.type)}</dd></div><div><dt>Model used</dt><dd class="admin-model-used">${renderAdminModelMetadata(ticket)}</dd></div>${renderAdminPreviousPrediction(ticket)}<div><dt>Priority</dt><dd>${ticket.priority ? priority(ticket.priority) : "—"}</dd></div><div><dt>Status</dt><dd>${renderAdminTicketStatus(ticket)}</dd></div><div><dt>Current assignee</dt><dd>${escapeHtml(ticket.assignee)}</dd></div></dl><div class="ticket-dialog-body"><section class="admin-ticket-request"><h3>Customer request</h3><p>${escapeHtml(ticket.request)}</p></section>${renderAdminConversation(ticket)}<div class="admin-ticket-note"><span aria-hidden="true">↳</span><span><strong>Customer communication is staff-only.</strong> Administrators can review the conversation, adjust the route, priority, and assignee, force close a ticket with a recorded reason, but cannot reply to the customer.</span></div>${forceCloseControl}${managementForm}</div></section></div>`;
}

function renderAdminTicketManagement() {
  const serverMode = serverSessionIsActive() && Boolean(state.serverData.adminManagement);
  const management = state.serverData.adminManagement || {};
  const attentionSourceCount = serverMode ? Number(management.attention_total ?? serverAdminAttentionTickets.length) : getAdminAttentionTickets().length;
  const allSourceCount = serverMode ? Number(management.all_tickets_count ?? adminTickets.length) : adminTickets.length;
  const attentionTickets = serverMode
    ? serverAdminAttentionTickets.map((ticket) => ({ ticket, reason: getAdminTicketAttentionReason(ticket) }))
    : sortAdminTicketRecords(getFilteredAdminAttentionTickets(), true);
  const filteredTickets = serverMode ? adminTickets : sortAdminTicketRecords(getFilteredAdminTickets());
  const attentionPagination = serverMode
    ? {
      rows: attentionTickets,
      page: Number(management.attention_pagination?.page || state.adminAttentionPage || 1),
      total: Number(management.attention_pagination?.total || attentionTickets.length),
      totalPages: Number(management.attention_pagination?.total_pages || 1),
    }
    : paginateTableRows(attentionTickets, state.adminAttentionPage);
  const allPagination = serverMode
    ? {
      rows: filteredTickets,
      page: Number(management.all_pagination?.page || state.adminAllTicketsPage || 1),
      total: Number(management.all_pagination?.total || filteredTickets.length),
      totalPages: Number(management.all_pagination?.total_pages || 1),
    }
    : paginateTableRows(filteredTickets, state.adminAllTicketsPage);
  const attentionRows = renderAdminTicketRows(attentionPagination.rows, true);
  const allRows = renderAdminTicketRows(allPagination.rows);
  const filterOptions = serverMode
    ? {
      queues: management.filter_options?.queues || adminFilterOptions().queues,
      assignees: management.filter_options?.assignees || adminFilterOptions().assignees,
    }
    : adminFilterOptions();
  const filterCount = Object.values(state.adminTicketFilters).filter((value) => value !== "all").length;
  const filterSelect = (name, label, options) => `<label><span>${label}</span><select data-admin-ticket-filter="${name}" aria-label="Filter tickets by ${label.toLowerCase()}"><option value="all" ${state.adminTicketFilters[name] === "all" ? "selected" : ""}>All ${label.toLowerCase()}</option>${options.map((option) => `<option value="${escapeHtml(option)}" ${state.adminTicketFilters[name] === option ? "selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
  const adminFilters = state.adminTicketFiltersOpen ? `<div class="admin-ticket-filters" role="group" aria-label="Filter ticket management"><div class="admin-ticket-filter-grid">${filterSelect("model", "Models", ["Joint", "Separate"])}${filterSelect("type", "Ticket types", ["Incident", "Request", "Problem", "Change"])}${filterSelect("queue", "Queues", filterOptions.queues)}${filterSelect("priority", "Priorities", ["High", "Medium", "Low", "Unclassified"])}${filterSelect("status", "Statuses", ["Open", "In progress", "Resolved", "Reopened", "Closed"])}${filterSelect("assignee", "Assignees", filterOptions.assignees)}</div><button class="button text" type="button" data-action="clear-admin-ticket-filters">Clear filters</button></div>` : "";
  const filteredAllCount = serverMode ? Number(management.filtered_all_count ?? allPagination.total) : filteredTickets.length;
  const adminSearch = `<form id="admin-ticket-search-form" class="admin-ticket-searchbar"><label for="admin-ticket-search">Search tickets</label><div class="admin-ticket-search-input"><input id="admin-ticket-search" name="admin-ticket-search" type="search" value="${escapeHtml(state.adminTicketSearch)}" placeholder="Ticket ID, title, customer, queue, or assignee" /><button class="admin-ticket-search-clear" type="button" data-action="clear-admin-ticket-search" aria-label="Clear ticket search" ${state.adminTicketSearch ? "" : "disabled"}>×</button></div><button class="button secondary" type="submit">Search</button><button class="button secondary" type="button" data-action="toggle-admin-ticket-filters" aria-expanded="${state.adminTicketFiltersOpen}">${filterCount ? `Filters (${filterCount})` : "Filter tickets"}</button><span class="admin-ticket-result-count">Showing ${filteredAllCount} of ${allSourceCount} tickets</span></form>${adminFilters}`;
  const attentionReference = renderAdminSortHeader("reference", "Reference");
  const attentionHeaders = `${attentionReference}<th>Customer request</th>${renderAdminSortHeader("model", "Model")}${renderAdminSortHeader("queue", "Queue")}${renderAdminSortHeader("priority", "Priority")}${renderAdminSortHeader("status", "Status")}${renderAdminSortHeader("attention", "Attention reason")}<th><span class="sr-only">Actions</span></th>`;
  const allHeaders = `${attentionReference}<th>Customer request</th>${renderAdminSortHeader("model", "Model")}${renderAdminSortHeader("queue", "Queue")}${renderAdminSortHeader("priority", "Priority")}${renderAdminSortHeader("status", "Status")}${renderAdminSortHeader("assignee", "Assignee")}${renderAdminSortHeader("updated", "Updated")}<th><span class="sr-only">Actions</span></th>`;
  return `
    <div class="page-heading"><div><span class="eyebrow">Administration</span><h1>Ticket management</h1><p>Review ticket details, correct routing, and assign ownership. Customer replies remain with support staff.</p></div></div>
    <section class="admin-ticket-management-note"><span aria-hidden="true">↳</span><span><strong>Admin controls affect ownership and routing only.</strong> Use the ticket dialog to reroute or reassign a ticket; staff handle every customer response.</span></section>
    <section class="panel admin-ticket-controls">${adminSearch}</section>
    <section class="panel table-panel admin-ticket-table admin-management-attention"><div class="panel-head"><div><h2>Requires attention</h2><p>Routing failures and tickets that have passed their service deadline.</p></div><span class="performance-total">${attentionTickets.length} of ${attentionSourceCount} tickets</span></div><div class="admin-ticket-table-wrap"><table class="data-table"><thead><tr>${attentionHeaders}</tr></thead><tbody>${attentionRows}</tbody></table></div>${renderTablePagination("paginate-admin-attention", attentionPagination, "tickets", "adminAttentionPage")}</section>
    <section class="panel table-panel admin-ticket-table admin-ticket-directory"><div class="panel-head"><div><h2>All tickets</h2><p>Every ticket in the service desk, including reopened and high-priority work.</p></div><span class="performance-total">${filteredTickets.length} of ${allSourceCount} tickets</span></div><div class="admin-ticket-table-wrap"><table class="data-table"><thead><tr>${allHeaders}</tr></thead><tbody>${allRows}</tbody></table></div>${renderTablePagination("paginate-admin-all-tickets", allPagination, "tickets", "adminAllTicketsPage")}</section>
    ${state.adminTicketDialog ? renderAdminTicketDialog(state.adminTicketDialog) : ""}`;
}

function renderAdminActivity() {
  const isAuditHistory = state.adminActivityView === "audit";
  const normalizedQuery = state.auditQuery.trim().toLowerCase();
  const matchingAuditRecords = serverSessionIsActive()
    ? auditLogRecords
    : auditLogRecords.filter((record) => {
    const categoryMatches = state.auditCategory === "all" || record.category === state.auditCategory;
    const text = `${record.timestamp} ${record.actor} ${record.category} ${record.action} ${record.record} ${record.detail}`.toLowerCase();
    return categoryMatches && (!normalizedQuery || text.includes(normalizedQuery));
  });
  const activityItems = adminActivityEvents.map((event) => `
    <article class="admin-activity-item">
      <span class="activity-dot ${event.tone}" aria-hidden="true"></span>
      <div>
        <div class="admin-activity-meta"><span class="audit-category ${event.category.toLowerCase()}">${event.category}</span><time>${event.time}</time></div>
        <h2>${event.title}</h2>
        <p>${event.detail}</p>
        <span class="admin-activity-actor">Recorded by ${event.actor}</span>
      </div>
    </article>`).join("");
  const auditRows = matchingAuditRecords.length
    ? matchingAuditRecords.map((record) => `
      <tr>
        <td><time class="audit-time">${escapeHtml(record.timestamp)}</time></td>
        <td><strong>${escapeHtml(record.actor)}</strong></td>
        <td><span class="audit-category ${record.category.toLowerCase()}">${escapeHtml(record.category)}</span></td>
        <td><strong>${escapeHtml(record.action)}</strong><span class="muted">${escapeHtml(record.detail)}</span></td>
        <td><span class="audit-record">${escapeHtml(record.record)}</span></td>
      </tr>`).join("")
    : '<tr><td colspan="5"><p class="table-empty">No audit records match the current search.</p></td></tr>';
  const auditHistory = `
    <form id="audit-search-form" class="audit-controls">
      <div class="audit-search-control"><label for="audit-query">Search audit history</label><div class="audit-search-input"><input id="audit-query" name="audit-query" type="text" value="${escapeHtml(state.auditQuery)}" placeholder="Ticket ID, user, event, or detail" /><button class="audit-search-clear" type="button" data-action="clear-audit-search" aria-label="Clear audit search" ${state.auditQuery ? "" : "disabled"}>×</button></div></div>
      <label><span>Event type</span><select data-audit-category aria-label="Filter audit history by event type"><option value="all" ${state.auditCategory === "all" ? "selected" : ""}>All event types</option><option value="Routing" ${state.auditCategory === "Routing" ? "selected" : ""}>Routing</option><option value="Ticket" ${state.auditCategory === "Ticket" ? "selected" : ""}>Ticket</option><option value="Model" ${state.auditCategory === "Model" ? "selected" : ""}>Model</option><option value="Access" ${state.auditCategory === "Access" ? "selected" : ""}>Access</option></select></label>
      <div class="audit-control-actions"><button class="button secondary" type="submit">Search</button><button class="button text" type="button" data-action="clear-audit-filters">Clear</button></div>
      <span class="audit-result-count">Showing ${matchingAuditRecords.length} of ${serverSessionIsActive() ? Number(state.serverData.audit?.total || matchingAuditRecords.length) : auditLogRecords.length} records</span>
    </form>
    <div class="audit-table-wrap"><table class="data-table audit-table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Type</th><th>Event</th><th>Record</th></tr></thead><tbody>${auditRows}</tbody></table></div>`;
  const activityFeed = `
    <div class="admin-activity-layout">
      <section class="panel"><div class="panel-head"><div><h2>Operational activity</h2><p>High-signal events that may need an administrator's attention.</p></div><span class="performance-total">${adminActivityEvents.length} recent events</span></div><div class="admin-activity-list">${activityItems}</div></section>
    </div>`;
  return `
    <div class="page-heading audit-page-heading"><div><span class="eyebrow">Administration</span><h1>Activity &amp; audit log</h1><p>Review operational signals now, then trace the full history behind each ticket, model, and account change.</p></div><div class="audit-retention"><strong>${serverSessionIsActive() ? Number(state.serverData.audit?.total || auditLogRecords.length) : auditLogRecords.length}</strong><span>records available</span></div></div>
    <section class="audit-intro" aria-label="Switch activity and audit views"><button class="audit-intro-choice ${!isAuditHistory ? "active" : ""}" type="button" data-action="set-admin-activity-view" data-view="feed" aria-pressed="${!isAuditHistory}"><span class="eyebrow">Activity feed</span><span>Short, prioritised updates for day-to-day operations.</span></button><button class="audit-intro-choice ${isAuditHistory ? "active" : ""}" type="button" data-action="set-admin-activity-view" data-view="audit" aria-pressed="${isAuditHistory}"><span class="eyebrow">Audit history</span><span>A searchable record of who changed what, and when.</span></button></section>
    <section class="panel audit-workspace"><div class="tabs audit-tabs" role="tablist" aria-label="Activity and audit views"><button class="tab ${!isAuditHistory ? "active" : ""}" type="button" role="tab" aria-selected="${!isAuditHistory}" data-action="set-admin-activity-view" data-view="feed">Activity feed</button><button class="tab ${isAuditHistory ? "active" : ""}" type="button" role="tab" aria-selected="${isAuditHistory}" data-action="set-admin-activity-view" data-view="audit">Audit history</button></div>${isAuditHistory ? auditHistory : activityFeed}</section>`;
}

function getStaffUser(userId) {
  return staffUsers.find((user) => user.id === userId);
}

function getFilteredStaffUsers() {
  if (serverSessionIsActive()) return staffUsers;
  return state.staffQueueFilter === "all"
    ? staffUsers
    : staffUsers.filter((user) => user.queue === state.staffQueueFilter);
}

function getQueueDashboardData() {
  const serverQueues = state.serverData.queuesStaff?.queues;
  if (serverSessionIsActive() && Array.isArray(serverQueues) && serverQueues.length) {
    return serverQueues.map((metric) => ({
      ...metric,
      queue: metric.name,
      staffCount: Number(metric.staff_count || 0),
      highPriority: Number(metric.high_priority || 0),
      sla: metric.period_sla_met_percent == null ? "—" : `${metric.period_sla_met_percent}%`,
    }));
  }
  return queueDashboardMetrics.map((metric) => ({
    ...metric,
    staffCount: staffUsers.filter((user) => user.queue === metric.queue).length,
  }));
}

function getAllQueuesSummary() {
  const queues = getQueueDashboardData();
  if (serverSessionIsActive() && queues.length) {
    const serverSummary = queues.reduce((summary, queue) => {
      const resolved = Number(queue.period_resolved || 0);
      const breaches = Number(queue.period_sla_breaches || 0);
      return {
        backlog: summary.backlog + Number(queue.backlog || 0),
        unassigned: summary.unassigned + Number(queue.unassigned || 0),
        highPriority: summary.highPriority + Number(queue.highPriority || 0),
        periodReceived: summary.periodReceived + Number(queue.period_received || 0),
        periodResolved: summary.periodResolved + resolved,
        periodSlaBreaches: summary.periodSlaBreaches + breaches,
        metCount: summary.metCount + Math.max(0, resolved - breaches),
      };
    }, {
      backlog: 0,
      unassigned: 0,
      highPriority: 0,
      periodReceived: 0,
      periodResolved: 0,
      periodSlaBreaches: 0,
      metCount: 0,
    });
    const periodSlaMet = serverSummary.periodResolved
      ? Number(((serverSummary.metCount / serverSummary.periodResolved) * 100).toFixed(2))
      : null;
    return {
      id: "all",
      queue: "All queues",
      backlog: serverSummary.backlog,
      unassigned: serverSummary.unassigned,
      highPriority: serverSummary.highPriority,
      period_received: serverSummary.periodReceived,
      period_resolved: serverSummary.periodResolved,
      period_sla_breaches: serverSummary.periodSlaBreaches,
      period_sla_met_percent: periodSlaMet,
      queueCount: queues.length,
      staffCount: Number(state.serverData.queuesStaff?.all_staff_count || staffUsers.length),
    };
  }
  const total = queues.reduce((summary, queue) => ({
    backlog: summary.backlog + queue.backlog,
    unassigned: summary.unassigned + queue.unassigned,
    highPriority: summary.highPriority + queue.highPriority,
    weightedSla: summary.weightedSla + (Number.parseInt(queue.sla, 10) * queue.backlog),
  }), { backlog: 0, unassigned: 0, highPriority: 0, weightedSla: 0 });
  return {
    ...total,
    queueCount: queues.length,
    staffCount: staffUsers.length,
    sla: `${Math.round(total.weightedSla / total.backlog)}%`,
  };
}

function getSelectedQueueMetrics() {
  if (state.staffQueueFilter === "all") return getAllQueuesSummary();
  return getQueueDashboardData().find((queue) => queue.queue === state.staffQueueFilter) || getAllQueuesSummary();
}

function getQueueDashboardPeriod() {
  return queueDashboardPeriods.find((period) => period.key === state.queueDashboardPeriod) || queueDashboardPeriods[1];
}

function getOperationalQueueMetrics(queue, period) {
  if (serverSessionIsActive() && queue?.id) {
    const received = Number(queue.period_received || 0);
    const resolved = Number(queue.period_resolved || 0);
    return {
      ...queue,
      ticketsReceived: received,
      ticketsResolved: resolved,
      slaBreaches: Number(queue.period_sla_breaches || 0),
      sla: queue.period_sla_met_percent == null ? "—" : `${queue.period_sla_met_percent}%`,
    };
  }
  const receivedBase = (queue.backlog * 3) + (queue.unassigned * 2) + queue.highPriority;
  const ticketsReceived = Math.round(receivedBase * period.factor);
  const slaValue = Math.max(0, Math.min(100, Number.parseInt(queue.sla, 10) + period.slaOffset));
  const slaBreaches = Math.round(ticketsReceived * ((100 - slaValue) / 100));
  return {
    ...queue,
    ticketsReceived,
    ticketsResolved: Math.max(0, ticketsReceived - slaBreaches),
    slaBreaches,
    sla: `${slaValue}%`,
  };
}

function getQueueWorkloadTrend(metric, period) {
  const variations = [0.84, 1.06, 0.93, 1.12, 0.97, 1.03, 1.08];
  const average = metric.ticketsReceived / period.graphLabels.length;
  return period.graphLabels.map((_, index) => Math.max(0, Math.round(average * variations[index])));
}

function staffStatusClass(status) {
  return status.toLowerCase().replace(/[^a-z]+/g, "-");
}

function getStaffResolvedSummary(user) {
  return user.resolved[state.staffUserResolvedPeriod] || user.resolved.month;
}

function getStaffPrioritySla(summary) {
  if (summary?.slaByPriority) {
    const valueFor = (key) => summary.slaByPriority[key]?.sla_met_percent;
    return {
      high: valueFor("high") == null ? "—" : `${valueFor("high")}%`,
      medium: valueFor("medium") == null ? "—" : `${valueFor("medium")}%`,
      low: valueFor("low") == null ? "—" : `${valueFor("low")}%`,
    };
  }
  const overall = Number.parseInt(summary.sla, 10);
  if (Number.isNaN(overall)) return { high: "—", medium: "—", low: "—" };
  return {
    high: `${Math.max(0, overall - 4)}%`,
    medium: `${overall}%`,
    low: `${Math.min(100, overall + 3)}%`,
  };
}

function renderStaffUserDialog(userId) {
  const isNew = userId === "new";
  const user = isNew ? {
    id: "new", firstName: "", lastName: "", email: "", phone: "", queue: "", title: "Support specialist",
  } : getStaffUser(userId);
  if (!user) return "";
  const summary = !isNew ? getStaffResolvedSummary(user) : null;
  const prioritySla = summary ? getStaffPrioritySla(summary) : null;
  const periodControls = ["today", "week", "month"].map((period) => `<button class="metric-period-button${period === state.staffUserResolvedPeriod ? " active" : ""}" type="button" data-action="set-staff-user-resolved-period" data-period="${period}" aria-pressed="${period === state.staffUserResolvedPeriod}">${period === "today" ? "Today" : period === "week" ? "Week" : "Month"}</button>`).join("");
  const queueNames = serverSessionIsActive() && state.serverData.queuesStaff?.queues?.length
    ? state.serverData.queuesStaff.queues.map((queue) => queue.name)
    : staffQueueOptions;
  const queueOptions = [`<option value="">Select a queue</option>`, ...queueNames.map((queue) => `<option value="${escapeHtml(queue)}" ${user.queue === queue ? "selected" : ""}>${escapeHtml(queue)}</option>`)].join("");
  const deleteControl = !isNew ? (state.staffDeleteConfirmId === user.id
    ? `<div class="staff-delete-confirm"><strong>Deactivate ${escapeHtml(getProfileDisplayName(user))}?</strong><span>This prevents sign-in and removes the account from active queue assignment.</span><div><button class="button danger" type="button" data-action="confirm-delete-staff-user" data-staff-id="${user.id}">Deactivate staff member</button><button class="button secondary" type="button" data-action="cancel-staff-delete">Cancel</button></div></div>`
    : `<button class="button danger staff-delete-button" type="button" data-action="delete-staff-user" data-staff-id="${user.id}">Deactivate staff member</button>`) : "";
  const summaryPanel = isNew
    ? `<aside class="staff-user-summary staff-user-summary-empty"><span class="eyebrow">Resolved work</span><h3>Performance appears after ticket activity</h3><p>Once this staff member resolves tickets, their Today, Week, and Month summaries will be available here.</p></aside>`
    : `<aside class="staff-user-summary"><div class="staff-summary-head"><div><span class="eyebrow">Resolved work</span><h3>${escapeHtml(getProfileDisplayName(user))}</h3><p>Completed tickets for the selected period.</p></div><div class="metric-period-switcher staff-summary-periods" role="group" aria-label="Select staff resolved work period">${periodControls}</div></div><div class="staff-summary-metrics"><article><span class="eyebrow">Tickets resolved</span><strong>${summary.count}</strong><small>${state.staffUserResolvedPeriod === "today" ? "Today" : state.staffUserResolvedPeriod === "week" ? "This week" : "This month"}</small></article><section class="staff-sla-section"><div class="staff-overall-sla"><div><span class="eyebrow">Overall SLA met</span><strong>${summary.sla}</strong><small>Resolved within SLA</small></div><span class="staff-sla-caption">By priority</span></div><div class="staff-priority-sla-grid"><article class="high"><span>High</span><strong>${prioritySla.high}</strong></article><article class="medium"><span>Medium</span><strong>${prioritySla.medium}</strong></article><article class="low"><span>Low</span><strong>${prioritySla.low}</strong></article></div></section><article><span class="eyebrow">Average resolution</span><strong>${summary.time}</strong><small>Time to resolve</small></article></div><div class="staff-summary-activity"><span class="staff-status ${staffStatusClass(user.status)}"><i></i>${escapeHtml(user.status)}</span><span>${user.activeTickets} active ticket${user.activeTickets === 1 ? "" : "s"} · ${user.waitingReply} awaiting reply</span></div></aside>`;
  const emailField = `<label>Work email<input name="staff-email" type="email" required value="${escapeHtml(user.email)}" ${isNew ? "" : "readonly"} /></label>`;
  const passwordField = isNew && serverSessionIsActive() ? `<label>Temporary password<input name="staff-password" type="password" minlength="8" required placeholder="Set an initial sign-in password" /></label>` : "";
  return `<div class="ticket-dialog-backdrop" data-action="close-staff-user" role="presentation"><section class="ticket-dialog staff-user-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-user-dialog-title"><header class="ticket-dialog-header staff-user-dialog-header"><div class="staff-dialog-person"><span class="staff-avatar large">${isNew ? "+" : escapeHtml(getProfileInitials(user))}</span><div><span class="eyebrow">${isNew ? "New staff member" : "Staff member"}</span><h2 id="staff-user-dialog-title">${isNew ? "Add staff member" : escapeHtml(getProfileDisplayName(user))}</h2><p>${isNew ? "Create an account and assign its first support queue." : `${escapeHtml(user.title)} · ${escapeHtml(user.queue)}`}</p></div></div><button class="dialog-close" type="button" data-action="close-staff-user" aria-label="Close staff details">×</button></header><div class="staff-user-dialog-body"><form id="staff-user-form" data-staff-id="${user.id}" class="staff-user-form"><div class="form-section-heading"><span class="eyebrow">Account and assignment</span><h3>${isNew ? "Staff details" : "Update staff details"}</h3><p>Update the staff profile and assign the queue where this member can work.</p></div><div class="profile-name-grid"><label>First name<input name="staff-first-name" required value="${escapeHtml(user.firstName)}" /></label><label>Last name<input name="staff-last-name" required value="${escapeHtml(user.lastName)}" /></label></div>${emailField}${passwordField}<label>Phone number<input name="staff-phone" type="tel" value="${escapeHtml(user.phone)}" /></label><label>Role title<input name="staff-title" required value="${escapeHtml(user.title)}" /></label><label>Assigned queue<select name="staff-queue" required>${queueOptions}</select></label><div class="form-actions"><button class="button signal" type="submit">${isNew ? "Create staff member" : "Save staff changes"}</button><button class="button secondary close-staff-user-button" type="button" data-action="close-staff-user">Cancel</button></div>${deleteControl}</form>${summaryPanel}</div></section></div>`;
}

function renderQueueDashboard() {
  const period = getQueueDashboardPeriod();
  const selected = getOperationalQueueMetrics(getSelectedQueueMetrics(), period);
  const selectedQueueLabel = state.staffQueueFilter === "all" ? "All queues" : state.staffQueueFilter;
  const queueNames = serverSessionIsActive() && state.serverData.queuesStaff?.queues?.length
    ? state.serverData.queuesStaff.queues.map((queue) => queue.name)
    : staffQueueOptions;
  const queueOptions = [`<option value="all" ${state.staffQueueFilter === "all" ? "selected" : ""}>All queues</option>`, ...queueNames.map((queue) => `<option value="${escapeHtml(queue)}" ${state.staffQueueFilter === queue ? "selected" : ""}>${escapeHtml(queue)}</option>`)].join("");
  const periodControls = queueDashboardPeriods.map((item) => `<button class="metric-period-button${item.key === period.key ? " active" : ""}" type="button" data-action="set-queue-dashboard-period" data-period="${item.key}" aria-pressed="${item.key === period.key}">${item.key === "week" ? "Week" : item.key === "month" ? "Month" : item.key === "quarter" ? "Quarter" : "Year"}</button>`).join("");
  const trendValues = getQueueWorkloadTrend(selected, period);
  const trendMaximum = Math.max(...trendValues, 1);
  const pointStep = trendValues.length > 1 ? 210 / (trendValues.length - 1) : 0;
  const trendPoints = trendValues.map((value, index) => `${18 + (index * pointStep)},${90 - Math.round((value / trendMaximum) * 60)}`).join(" ");
  const trendArea = `18,90 ${trendPoints} 228,90`;
  const staffCount = selected.staffCount ?? staffUsers.length;
  const selectionDescription = state.staffQueueFilter === "all"
    ? "A consolidated view of every support queue and the staff directory."
    : `Business operations and assigned staff for ${selectedQueueLabel}.`;
  return `<section class="queue-dashboard" aria-labelledby="queue-dashboard-title"><div class="queue-dashboard-head"><div><span class="eyebrow">Queue operations</span><h2 id="queue-dashboard-title">${escapeHtml(selectedQueueLabel)}</h2><p>${escapeHtml(selectionDescription)}</p></div><div class="queue-dashboard-controls"><label class="queue-dashboard-filter" for="queue-dashboard-filter"><span>Dashboard queue</span><select id="queue-dashboard-filter" aria-label="Dashboard queue" data-staff-queue-filter>${queueOptions}</select></label><div class="queue-period-control"><span>Reporting period</span><div class="metric-period-switcher" role="group" aria-label="Select queue dashboard reporting period">${periodControls}</div></div></div></div><section class="queue-kpi-grid" aria-label="Selected queue operational metrics"><article><span class="eyebrow">Tickets received</span><strong>${selected.ticketsReceived}</strong><small>${period.label}</small></article><article><span class="eyebrow">Tickets resolved</span><strong>${selected.ticketsResolved}</strong><small>${state.staffQueueFilter === "all" ? `${selected.queueCount} queues` : `${staffCount} staff assigned`}</small></article><article><span class="eyebrow">SLA breaches</span><strong>${selected.slaBreaches}</strong><small>Exceeded the target</small></article><article><span class="eyebrow">SLA met</span><strong>${selected.sla}</strong><small>Resolved within SLA</small></article></section><article class="queue-trend-panel queue-business-trend-panel"><div class="panel-head"><div><span class="eyebrow">Business operations graph</span><h3>Ticket intake · ${period.label}</h3></div><strong>${selected.ticketsReceived} received</strong></div><div class="queue-trend-chart"><svg viewBox="0 0 246 108" role="img" aria-label="Ticket intake trend for ${escapeHtml(selectedQueueLabel)} during ${escapeHtml(period.label)}"><line x1="18" y1="90" x2="228" y2="90"></line><line x1="18" y1="60" x2="228" y2="60"></line><line x1="18" y1="30" x2="228" y2="30"></line><polygon points="${trendArea}"></polygon><polyline points="${trendPoints}"></polyline>${trendValues.map((value, index) => `<circle cx="${18 + (index * pointStep)}" cy="${90 - Math.round((value / trendMaximum) * 60)}" r="3"></circle>`).join("")}</svg><div class="queue-trend-labels" style="grid-template-columns: repeat(${period.graphLabels.length}, 1fr);">${period.graphLabels.map((label) => `<span>${label}</span>`).join("")}</div></div></article></section>`;
}

function renderAdminUsers() {
  const displayedUsers = getFilteredStaffUsers();
  const cards = displayedUsers.length ? displayedUsers.map((user) => {
    const resolvedMonth = user.resolved.month;
    return `<article class="staff-card"><div class="staff-card-top"><span class="staff-avatar">${escapeHtml(getProfileInitials(user))}</span><div class="staff-card-identity"><h2>${escapeHtml(getProfileDisplayName(user))}</h2><p>${escapeHtml(user.title)}</p></div><span class="staff-status ${staffStatusClass(user.status)}"><i></i>${escapeHtml(user.status)}</span></div><div class="staff-card-queue"><span class="eyebrow">Assigned queue</span><strong>${escapeHtml(user.queue)}</strong></div><div class="staff-card-metrics"><div><span>Active</span><strong>${user.activeTickets}</strong></div><div><span>Reply needed</span><strong>${user.waitingReply}</strong></div><div><span>Resolved this month</span><strong>${resolvedMonth.count}</strong></div></div><div class="staff-card-footer"><span>${escapeHtml(user.email)}</span><button class="button secondary" type="button" data-action="view-staff-user" data-staff-id="${user.id}">View details</button></div></article>`;
  }).join("") : `<div class="staff-directory-empty"><strong>No staff match this queue.</strong><p>Select another queue or choose All queues to view the full team.</p></div>`;
  const selectedQueueLabel = state.staffQueueFilter === "all" ? "All queues" : state.staffQueueFilter;
  return `<div class="page-heading staff-directory-heading"><div><span class="eyebrow">Administration</span><h1>Queues &amp; staff</h1><p>Monitor queue workload, then manage the people assigned to each support area.</p></div></div>${renderQueueDashboard()}<section class="staff-directory-section"><div class="staff-directory-section-head"><div><span class="eyebrow">Staff directory</span><h2>${escapeHtml(selectedQueueLabel)}</h2><p>Staff members assigned to the queue selected above.</p></div><div class="heading-actions"><button class="button signal" type="button" data-action="create-staff-user">Add staff member</button></div></div><section class="staff-directory-toolbar panel"><span class="staff-directory-selection">Selected in queue dashboard: <strong>${escapeHtml(selectedQueueLabel)}</strong></span><span class="staff-directory-count"><strong>${displayedUsers.length}</strong> of ${staffUsers.length} staff members</span></section><section class="staff-card-grid">${cards}</section></section>${state.staffUserDialog ? renderStaffUserDialog(state.staffUserDialog) : ""}`;
}

function renderAdmin() {
  if (state.page === "models") return renderModelCentre();
  if (state.page === "tickets") return renderAdminTicketManagement();
  if (state.page === "activity") return renderAdminActivity();
  if (state.page === "users" || state.page === "queues") return renderAdminUsers();
  const metrics = getAdminOverviewMetrics();
  const periodControls = adminOverviewPeriods.map((period) => `<button class="metric-period-button${period.key === metrics.period.key ? " active" : ""}" type="button" data-action="set-admin-overview-period" data-period="${period.key}" aria-pressed="${period.key === metrics.period.key}">${period.key === "day" ? "Day" : period.key === "week" ? "Week" : "Month"}</button>`).join("");
  const overduePeriod = getAdminOverduePeriod();
  const overdueQueueRows = renderAdminOverdueQueueRows(overduePeriod);
  const overdueTotal = Object.values(overduePeriod.counts).reduce((total, count) => total + count, 0);
  const overduePeriodControls = adminOverduePeriods.map((period) => `<button class="metric-period-button${period.key === overduePeriod.key ? " active" : ""}" type="button" data-action="set-admin-overdue-period" data-period="${period.key}" aria-pressed="${period.key === overduePeriod.key}">${period.key === "month" ? "Month" : period.key === "quarter" ? "Quarter" : "Year"}</button>`).join("");
  const activeModel = modelPerformance[state.activeModel];
  const deployment = (state.serverData.deployments?.deployments || []).find((item) => item.family === state.activeModel);
  const formatLiveScore = (deploymentValue, fallback) => {
    if (!deployment) return fallback;
    return deploymentValue == null ? "—" : `${(Number(deploymentValue) * 100).toFixed(2)}%`;
  };
  const activeQueueF1 = formatLiveScore(deployment?.live_queue_macro_f1, activeModel.queueMetrics.find(([label]) => label === "Macro F1")[1]);
  const activePriorityF1 = formatLiveScore(deployment?.live_priority_macro_f1, activeModel.priorityMetrics.find(([label]) => label === "Macro F1")[1]);
  return `
    <div class="page-heading"><div><span class="eyebrow">Operations command desk</span><h1>Route with evidence, not guesswork.</h1><p>Monitor the live ticket flow and the model decisions shaping each queue.</p></div><div class="heading-actions"><button class="button secondary" data-page="users">User centre</button><button class="button signal" data-page="tickets">Review tickets</button></div></div>
    <section class="model-banner"><div class="model-token">${activeModel.token}</div><div><strong>${activeModel.name} ${state.activeModel === "joint" ? "is" : "are"} routing new tickets</strong><p>Live queue macro F1 ${activeQueueF1} · Live priority macro F1 ${activePriorityF1}</p></div><div class="model-banner-actions"><span class="live-dot">LIVE</span><button class="button secondary" data-page="models">Manage model</button></div></section>
    <div class="admin-metric-period-bar"><span class="eyebrow">Metric period</span><div class="metric-period-switcher" role="group" aria-label="Select Admin overview metric period">${periodControls}</div></div>
    <section class="metric-grid"><article class="metric-card"><div class="metric-card-header"><span class="eyebrow">Tickets processed</span><span class="metric-period-label">${metrics.period.label}</span></div><strong class="metric-value">${metrics.ticketsProcessed}</strong><span class="metric-footer">Tickets routed in this period</span></article><article class="metric-card"><div class="metric-card-header"><span class="eyebrow">Open backlog</span><span class="metric-period-label">${metrics.period.label}</span></div><strong class="metric-value">${metrics.openBacklog}</strong><span class="metric-footer"><span class="trend warn">${metrics.highPriority}</span> High priority</span></article><article class="metric-card"><div class="metric-card-header"><span class="eyebrow">Route corrections</span><span class="metric-period-label">${metrics.period.label}</span></div><strong class="metric-value">${metrics.routeCorrectionRate.toFixed(1)}%</strong><span class="metric-footer">${metrics.routeCorrections} ticket${metrics.routeCorrections === 1 ? "" : "s"} rerouted</span></article><article class="metric-card"><span class="eyebrow">Routing failures</span><strong class="metric-value">${metrics.routingFailures}</strong><span class="metric-footer"><span class="trend warn">${metrics.overdue}</span> Overdue now</span></article></section>
     <section class="two-column"><article class="panel overdue-queue-panel"><div class="panel-head"><div><h2>SLA breaches by queue</h2><p>Recorded tickets that exceeded their SLA in the selected period.</p></div><div class="overdue-panel-actions"><span class="performance-total">${overdueTotal} total</span><div class="metric-period-switcher" role="group" aria-label="Select SLA breach reporting period">${overduePeriodControls}</div></div></div><div class="panel-body"><div class="bar-list">${overdueQueueRows}</div></div></article><article class="panel"><div class="panel-head"><div><h2>Decision trail</h2><p>Events requiring an administrator’s attention.</p></div><button class="button text" data-page="activity">All activity</button></div><div class="panel-body"><div class="activity-list">${adminActivityEvents.slice(0, 3).map((event) => `<div class="activity-item"><span class="activity-dot ${escapeHtml(event.tone || "")}"></span><div><strong>${escapeHtml(event.title)}</strong><p>${escapeHtml(event.detail)}</p><time>${escapeHtml(event.time)}</time></div></div>`).join("") || '<p class="table-empty">No recent operational events.</p>'}</div></div></article></section>
    ${renderAdminTicketTable()}`;
}

function renderAdminTicketTable() {
  const serverOverview = state.serverData.adminOverview;
  const attentionTickets = serverSessionIsActive() && serverOverview
    ? (serverOverview.tickets_requiring_attention || []).map((ticket) => ({ ticket: normalizeServerTicket(ticket), reason: getAdminTicketAttentionReason(normalizeServerTicket(ticket)) }))
    : getAdminAttentionTickets();
  const recentAttentionTickets = attentionTickets
    .slice()
    .sort((left, right) => sortTicketsMostRecent(left.ticket, right.ticket))
    .slice(0, TICKET_TABLE_PREVIEW_SIZE);
  const rows = renderAdminTicketRows(recentAttentionTickets, true);
  return `<section class="panel table-panel admin-attention-table"><div class="panel-head"><div><h2>Tickets requiring attention</h2><p>The five most recently updated routing failures and overdue tickets.</p></div><button class="button text" data-page="tickets">View all tickets</button></div><table class="data-table"><thead><tr><th>Reference</th><th>Customer request</th><th>Model</th><th>Queue</th><th>Priority</th><th>Status</th><th>Attention reason</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderModelCentre() {
  if (state.modelDashboard) return renderModelDashboard(state.modelDashboard);
  const joint = state.activeModel === "joint";
  const activeModel = modelPerformance[state.activeModel];
  const deployments = state.serverData.deployments?.deployments || [];
  const deploymentFor = (family) => deployments.find((item) => item.family === family);
  const jointDeployment = deploymentFor("joint");
  const separateDeployment = deploymentFor("separate");
  const trainingScore = (deployment, key, fallback) => {
    if (!serverSessionIsActive() || deployment?.[key] == null) return fallback;
    return `${(Number(deployment[key]) * 100).toFixed(2)}%`;
  };
  const fallbackScore = (model, label) => model?.[label]?.find(([name]) => name === "Macro F1")?.[1] || "—";
  const modelUpdate = (deployment, fallback) => {
    const raw = deployment?.version || fallback;
    if (!raw) return "Update date unavailable";
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) {
      const stamp = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(date);
      return `Updated ${stamp}`;
    }
    return `Updated ${raw}`;
  };
  const reviewedCount = (deployment, fallback) => deployment?.live_reviewed_count == null ? fallback : Number(deployment.live_reviewed_count).toLocaleString("en-US");
  const renderCompareScores = (deployment, model) => `<div class="compare-stats"><div><strong>${trainingScore(deployment, "queue_macro_f1", fallbackScore(model, "queueMetrics"))}</strong><small>Queue macro F1 · training</small></div><div><strong>${trainingScore(deployment, "priority_macro_f1", fallbackScore(model, "priorityMetrics"))}</strong><small>Priority macro F1 · training</small></div></div>`;
  return `
    <div class="page-heading"><div><span class="eyebrow">Model centre</span><h1>Choose the active fixed model.</h1><p>Switch which saved model routes future tickets. Both model artifacts remain unchanged after deployment.</p></div></div>
     <section class="model-compare"><article class="compare-card ${joint ? "selected" : ""}"><span class="eyebrow">${joint ? "Active routing model" : "Fixed model"}</span><h3>Joint model</h3><p>One queue-and-priority prediction with type-aware routing.</p>${renderCompareScores(jointDeployment, modelPerformance.joint)}<div class="form-actions"><button class="button ${joint ? "secondary" : "signal"}" data-action="activate-joint"${joint ? " disabled" : ""}>${joint ? "Currently active" : "Use Joint model"}</button><button class="button text" data-action="show-joint">Open dashboard</button></div></article><article class="compare-card ${!joint ? "selected" : ""}"><span class="eyebrow">${!joint ? "Active routing model" : "Fixed model"}</span><h3>Separate models</h3><p>Independent queue and priority pipelines with type-aware routing.</p>${renderCompareScores(separateDeployment, modelPerformance.separate)}<div class="form-actions"><button class="button ${!joint ? "secondary" : "signal"}" data-action="activate-separate"${!joint ? " disabled" : ""}>${!joint ? "Currently active" : "Use Separate models"}</button><button class="button text" data-action="show-separate">Open dashboard</button></div></article></section>
    <section class="model-centre-support"><article class="panel deployment-control-panel"><div class="panel-head"><div><h2>Deployment status</h2><p>Choose which fixed model receives new customer submissions.</p></div><span class="live-dot">LIVE</span></div><div class="panel-body"><dl class="deployment-facts"><div><dt>Routing new tickets</dt><dd>${activeModel.name}</dd></div><div><dt>Applies to</dt><dd>Future submissions only</dd></div><div><dt>Existing tickets</dt><dd>Keep their original prediction</dd></div><div><dt>Read-only artifacts</dt><dd>Joint and Separate artifacts are read-only</dd></div></dl><div class="model-inspection-note"><span aria-hidden="true">↳</span><p><strong>Switching affects only new tickets.</strong> Administrators may choose Joint or Separate models, but this system does not retrain models or receive new artifacts after go-live.</p></div></div></article><article class="panel model-register-panel"><div class="panel-head"><div><h2>Evidence register</h2><p>Evaluation records stay separate for a fair comparison.</p></div></div><div class="model-register-row model-register-head"><span>Model</span><span>Updated</span><span>Reviewed</span><span>Status</span></div><div class="model-register-row"><strong>Joint</strong><span>${escapeHtml(modelUpdate(jointDeployment, modelPerformance.joint.version))}</span><span>${reviewedCount(jointDeployment, modelPerformance.joint.reviewed)} tickets</span><span class="register-status ${joint ? "active" : ""}">${joint ? "Active" : "Fixed"}</span></div><div class="model-register-row"><strong>Separate</strong><span>${escapeHtml(modelUpdate(separateDeployment, modelPerformance.separate.version))}</span><span>${reviewedCount(separateDeployment, modelPerformance.separate.reviewed)} tickets</span><span class="register-status ${!joint ? "active" : ""}">${!joint ? "Active" : "Fixed"}</span></div><div class="panel-footnote">Only tickets that reached closed status are included in live macro-F1 evaluation.</div></article></section>`;
}

function renderModelMetricRows(metrics) {
  return metrics.map(([label, value]) => `<div class="model-metric-row"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function getServerModelOperationalData(modelKey, periodKey) {
  if (!serverSessionIsActive()) return null;
  const data = state.serverData.modelOperational;
  if (!data || data.family !== modelKey || data.period !== periodKey) return null;
  const formatAccuracy = (value) => value == null ? "—" : `${(Number(value) * 100).toFixed(2)}%`;
  return {
    total: Number(data.total || 0),
    reviewed: Number(data.reviewed_count || 0),
    queuePredictions: (data.queue_predictions || []).map((item) => [item.queue || "Unclassified", Number(item.count || 0)]),
    priorityPredictions: (data.priority_predictions || []).map((item) => [item.priority || "Unclassified", Number(item.count || 0)]),
    queueAccuracy: formatAccuracy(data.queue_accuracy),
    priorityAccuracy: formatAccuracy(data.priority_accuracy),
    queueMacroF1: formatAccuracy(data.queue_macro_f1),
    priorityMacroF1: formatAccuracy(data.priority_macro_f1),
    queueWrongCount: Number(data.queue_wrong_count || 0),
    priorityWrongCount: Number(data.priority_wrong_count || 0),
    version: data.version || "",
  };
}

function renderModelDashboard(modelKey) {
  const model = modelPerformance[modelKey];
  const isActive = state.activeModel === modelKey;
  const serverOperational = getServerModelOperationalData(modelKey, state.modelOperationalPeriod);
  const operationalPeriod = serverOperational
    ? { label: state.modelOperationalPeriod === "month" ? "Month" : state.modelOperationalPeriod === "quarter" ? "Quarter" : "Year", queuePredictions: serverOperational.queuePredictions, priorityPredictions: serverOperational.priorityPredictions }
    : model.operationalPeriods[state.modelOperationalPeriod] || model.operationalPeriods.month;
  const displayedModel = serverOperational
    ? { ...model, processed: serverOperational.total, reviewed: serverOperational.reviewed, queueMacroF1: serverOperational.queueMacroF1, priorityMacroF1: serverOperational.priorityMacroF1 }
    : { ...model, queueMacroF1: model.queueMetrics.find(([label]) => label === "Macro F1")?.[1] || "—", priorityMacroF1: model.priorityMetrics.find(([label]) => label === "Macro F1")?.[1] || "—" };
  const liveRate = (wrongCount) => serverOperational?.reviewed
    ? `${((wrongCount / serverOperational.reviewed) * 100).toFixed(1)}%`
    : "—";
  const evaluationMetrics = serverOperational
    ? {
      queue: [
        ["Live accuracy", serverOperational.queueAccuracy],
        ["Live macro F1", serverOperational.queueMacroF1],
        ["Reviewed outcomes", serverOperational.reviewed.toLocaleString("en-US")],
        ["Correction rate", liveRate(serverOperational.queueWrongCount)],
      ],
      priority: [
        ["Live accuracy", serverOperational.priorityAccuracy],
        ["Live macro F1", serverOperational.priorityMacroF1],
        ["Reviewed outcomes", serverOperational.reviewed.toLocaleString("en-US")],
        ["Correction rate", liveRate(serverOperational.priorityWrongCount)],
      ],
    }
    : { queue: model.queueMetrics, priority: model.priorityMetrics };
  const totalPredictions = operationalPeriod.priorityPredictions.reduce((total, [, count]) => total + count, 0);
  const largestQueue = Math.max(...operationalPeriod.queuePredictions.map(([, count]) => count), 1);
  const queuePredictions = operationalPeriod.queuePredictions.map(([label, count]) => {
    const width = Math.max(5, Math.round((count / largestQueue) * 100));
    const share = ((count / totalPredictions) * 100).toFixed(1);
    return `<div class="prediction-volume-row"><span class="prediction-volume-label">${label}</span><span class="prediction-volume-track" aria-hidden="true"><span style="width: ${width}%"></span></span><strong>${count.toLocaleString("en-US")}</strong><small>${share}%</small></div>`;
  }).join("");
  const priorityPredictions = operationalPeriod.priorityPredictions.map(([label, count]) => {
    const share = ((count / totalPredictions) * 100).toFixed(1);
    return `<div class="priority-volume-row ${label.toLowerCase()}"><span class="priority-volume-label">${label} priority</span><strong>${count.toLocaleString("en-US")}</strong><span>${share}% of this model’s predictions</span></div>`;
  }).join("");
  const operationalPeriodControls = ["month", "quarter", "year"].map((period) => `<button class="metric-period-button${period === state.modelOperationalPeriod ? " active" : ""}" type="button" data-action="set-model-operational-period" data-period="${period}" aria-pressed="${period === state.modelOperationalPeriod}">${period === "month" ? "Month" : period === "quarter" ? "Quarter" : "Year"}</button>`).join("");
  return `
     <div class="model-dashboard-back"><button class="button text model-back-button" type="button" data-action="back-model-centre"><span aria-hidden="true">←</span> Back to Model centre</button></div>
     <div class="page-heading model-dashboard-heading"><div><span class="eyebrow">Model centre / Performance dashboard</span><h1>${displayedModel.name}</h1><p>${displayedModel.description}</p></div><div class="model-dashboard-identity"><span class="model-token">${displayedModel.token}</span><div><span class="${isActive ? "live-dot" : "availability-label"}">${isActive ? "Routing new tickets" : "Fixed model"}</span></div></div></div>
     <section class="metric-grid model-dashboard-metrics"><article class="metric-card"><span class="eyebrow">Processed by model</span><strong class="metric-value">${displayedModel.processed}</strong><span class="metric-footer">Recorded ticket predictions</span></article><article class="metric-card"><span class="eyebrow">Reviewed outcomes</span><strong class="metric-value">${displayedModel.reviewed}</strong><span class="metric-footer">Closed tickets in selected period</span></article><article class="metric-card"><span class="eyebrow">Live queue macro F1</span><strong class="metric-value">${displayedModel.queueMacroF1}</strong><span class="metric-footer">Final queue versus original prediction</span></article><article class="metric-card"><span class="eyebrow">Live priority macro F1</span><strong class="metric-value">${displayedModel.priorityMacroF1}</strong><span class="metric-footer">Final priority versus original prediction</span></article></section>
     <section class="model-evaluation-grid"><article class="panel model-evaluation-panel"><div class="panel-head"><div><span class="eyebrow">${serverOperational ? "Live routing task" : "Routing task"}</span><h2>Queue prediction</h2><p>${serverOperational ? "Dynamic outcomes from closed tickets attributed to this model." : "Training evaluation for assigning the support queue."}</p></div></div><div class="model-metric-list">${renderModelMetricRows(evaluationMetrics.queue)}</div></article><article class="panel model-evaluation-panel"><div class="panel-head"><div><span class="eyebrow">${serverOperational ? "Live urgency task" : "Urgency task"}</span><h2>Priority prediction</h2><p>${serverOperational ? "Dynamic outcomes from closed tickets attributed to this model." : "Training evaluation for low, medium, and high priority."}</p></div></div><div class="model-metric-list">${renderModelMetricRows(evaluationMetrics.priority)}</div></article></section>
    <div class="model-operational-period-bar"><div><span class="eyebrow">Operational reporting period</span><p>${operationalPeriod.label} prediction records for this model.</p></div><div class="metric-period-switcher" role="group" aria-label="Select operational reporting period">${operationalPeriodControls}</div></div>
    <section class="model-operational-grid"><article class="panel queue-volume-panel"><div class="panel-head"><div><span class="eyebrow">Operational distribution</span><h2>Tickets predicted by queue</h2><p>Tickets routed during the selected period, grouped by predicted destination.</p></div><span class="performance-total">${totalPredictions.toLocaleString("en-US")} total</span></div><div class="panel-body"><div class="prediction-volume-list">${queuePredictions}</div></div></article><article class="panel priority-volume-panel"><div class="panel-head"><div><span class="eyebrow">Operational distribution</span><h2>Tickets predicted by priority</h2><p>Tickets routed during the selected period, grouped by predicted urgency.</p></div><span class="performance-total">${totalPredictions.toLocaleString("en-US")} total</span></div><div class="priority-volume-list">${priorityPredictions}</div><div class="panel-footnote">Counts represent the model’s recorded predictions in the selected period, not the original training dataset.</div></article></section>`;
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
    state.modelDashboard = null;
    if (state.page === "tickets") {
      state.customerTicketsPage = 1;
      state.adminAttentionPage = 1;
      state.adminAllTicketsPage = 1;
    }
    if (state.page === "assigned") state.staffMyTicketsPage = 1;
    if (state.page === "unassigned") state.staffTicketPoolPage = 1;
    if (state.page === "new-ticket") {
      state.activeDraftId = null;
      state.customerFormRequestKey = createCustomerRequestKey();
      resetCustomerRequest();
      state.emptyDraftPrompt = false;
    }
    if (state.page !== "tickets") {
      state.customerTicketDialog = null;
      state.adminTicketDialog = null;
    }
    if (state.page === "tickets" && state.role === "admin") state.adminTicketDialog = null;
    if (state.page !== "assigned") state.staffTicketDialog = null;
    render();
    refreshAfterPageNavigation();
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (!action) return;
  if (action === "go-dashboard") {
    event.preventDefault();
    state.accountMenuOpen = false;
    state.customerTicketDialog = null;
    state.staffTicketDialog = null;
    state.adminTicketDialog = null;
    state.activeDraftId = null;
    state.emptyDraftPrompt = false;
    state.page = "dashboard";
    render();
    refreshAfterPageNavigation();
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
    refreshAfterPageNavigation();
    return;
  }
  if (action === "log-out") {
    state.accountMenuOpen = false;
    logOutOfServerSession();
    return;
  }
  if (action === "forgot-password") {
    showToast("Password recovery will be provided by the Django account service.");
    return;
  }
  if (action === "new-ticket") { state.activeDraftId = null; state.customerFormRequestKey = createCustomerRequestKey(); resetCustomerRequest(); state.emptyDraftPrompt = false; state.page = "new-ticket"; render(); return; }
  if (action === "customer-request-select-type") {
    syncCustomerRequestValues(event.target.closest("#ticket-form"));
    state.customerRequestValues = { ...currentCustomerRequestValues(), issueChoice: event.target.closest("[data-issue-choice]").dataset.issueChoice };
    state.customerRequestError = "";
    state.emptyDraftPrompt = false;
    render();
    window.ticketMotion?.animateCustomerChoice(main);
    return;
  }
  if (action === "customer-request-next-step") {
    const values = syncCustomerRequestValues(event.target.closest("#ticket-form"));
    if (state.customerRequestStep === 1) {
      if (!values.issueChoice) {
        showCustomerRequestError("Choose the option that best describes your request before continuing.");
        return;
      }
      state.customerRequestStep = 2;
    } else if (state.customerRequestStep === 2) {
      if (!values.subject || !values.body) {
        const fieldId = !values.subject ? "subject" : "description";
        showCustomerRequestError("Add both a subject and a description before reviewing your request.", fieldId);
        return;
      }
      state.customerRequestStep = 3;
    }
    state.customerRequestError = "";
    state.emptyDraftPrompt = false;
    render();
    return;
  }
  if (action === "customer-request-previous-step") {
    syncCustomerRequestValues(event.target.closest("#ticket-form"));
    state.customerRequestStep = Math.max(1, state.customerRequestStep - 1);
    state.customerRequestError = "";
    state.emptyDraftPrompt = false;
    render();
    return;
  }
  if (action === "view-customer-ticket") {
    openCustomerTicket(event.target.closest("[data-ticket-id]").dataset.ticketId);
    return;
  }
  if (action === "view-staff-ticket") {
    openStaffTicket(event.target.closest("[data-ticket-id]").dataset.ticketId);
    return;
  }
  if (action === "continue-draft") {
    continueCustomerDraft(event.target.closest("[data-draft-id]").dataset.draftId);
    return;
  }
  if (action === "discard-draft") {
    const draftId = event.target.closest("[data-draft-id]").dataset.draftId;
    if (serverSessionIsActive()) {
      void discardCustomerDraft(draftId);
      return;
    }
    state.discardedDraftIds.add(draftId);
    if (state.activeDraftId === draftId) state.activeDraftId = null;
    state.emptyDraftPrompt = false;
    render();
    showToast(`${draftId} was discarded.`);
    return;
  }
  if (action === "mark-customer-resolved") {
    const ticketId = event.target.closest("[data-ticket-id]").dataset.ticketId;
    if (serverSessionIsActive()) {
      void markCustomerTicketResolved(ticketId);
      return;
    }
    markTicketResolved(ticketId);
    render();
    showToast(`${ticketId} will close automatically after three days unless reopened.`);
    return;
  }
  if (action === "reopen-customer-ticket") {
    const ticketId = event.target.closest("[data-ticket-id]").dataset.ticketId;
    if (serverSessionIsActive()) {
      void reopenCustomerTicket(ticketId);
      return;
    }
    state.pendingClosureTicketIds.delete(ticketId);
    state.customerResolutionDates.delete(ticketId);
    state.automaticallyResolvedTicketIds.delete(ticketId);
    setTicketStatus(ticketId, "Reopened", "waiting", {
      updated: "Reopened by customer",
      updatedDetail: "Waiting for support reply",
    });
    render();
    showToast(`${ticketId} was reopened and returned to the support team.`);
    return;
  }
  if (action === "close-customer-ticket") {
    closeActiveDialog("customerTicketDialog");
    return;
  }
  if (action === "close-staff-ticket") {
    closeActiveDialog("staffTicketDialog");
    return;
  }
  if (action === "reroute-staff-ticket") {
    const ticketId = event.target.closest("[data-ticket-id]").dataset.ticketId;
    if (serverSessionIsActive()) {
      void rerouteServerTicket(ticketId);
      return;
    }
    rerouteStaffTicketToAdmin(ticketId);
    return;
  }
  if (action === "manage-admin-ticket") {
    openAdminTicket(event.target.closest("[data-ticket-id]").dataset.ticketId);
    return;
  }
  if (action === "close-admin-ticket") {
    closeActiveDialog("adminTicketDialog");
    return;
  }
  if (action === "create-staff-user") {
    state.staffUserDialog = "new";
    state.staffDeleteConfirmId = null;
    state.staffUserResolvedPeriod = "month";
    render();
    return;
  }
  if (action === "set-staff-queue-dashboard") {
    state.staffQueueFilter = event.target.closest("[data-queue]").dataset.queue;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "set-queue-dashboard-period") {
    state.queueDashboardPeriod = event.target.closest("[data-period]").dataset.period;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "view-staff-user") {
    state.staffUserDialog = event.target.closest("[data-staff-id]").dataset.staffId;
    state.staffDeleteConfirmId = null;
    state.staffUserResolvedPeriod = "month";
    render();
    if (serverSessionIsActive()) void loadServerStaffSummary(state.staffUserDialog, state.staffUserResolvedPeriod).then(() => render());
    return;
  }
  if (action === "close-staff-user") {
    if (event.target.closest(".staff-user-dialog") && !event.target.closest(".dialog-close, .close-staff-user-button")) return;
    closeActiveDialog("staffUserDialog");
    return;
  }
  if (action === "set-staff-user-resolved-period") {
    state.staffUserResolvedPeriod = event.target.closest("[data-period]").dataset.period;
    if (serverSessionIsActive() && state.staffUserDialog !== "new") {
      void loadServerStaffSummary(state.staffUserDialog, state.staffUserResolvedPeriod).then(() => render());
    } else render();
    return;
  }
  if (action === "delete-staff-user") {
    state.staffDeleteConfirmId = event.target.closest("[data-staff-id]").dataset.staffId;
    render();
    return;
  }
  if (action === "cancel-staff-delete") {
    state.staffDeleteConfirmId = null;
    render();
    return;
  }
  if (action === "confirm-delete-staff-user") {
    const userId = event.target.closest("[data-staff-id]").dataset.staffId;
    if (serverSessionIsActive()) {
      if (window.confirm("Deactivate this staff account? It will no longer be able to sign in or receive new tickets.")) void deactivateServerStaffUser(userId);
      return;
    }
    const index = staffUsers.findIndex((user) => user.id === userId);
    if (index === -1) {
      showToast("That staff member is no longer available.");
      return;
    }
    const [removedUser] = staffUsers.splice(index, 1);
    const assignmentIndex = assignmentStaffUsers.findIndex((user) => user.id === userId);
    if (assignmentIndex !== -1) assignmentStaffUsers.splice(assignmentIndex, 1);
    state.staffUserDialog = null;
    state.staffDeleteConfirmId = null;
    render();
    showToast(`${getProfileDisplayName(removedUser)} was removed from the staff directory.`);
    return;
  }
  if (action === "set-admin-activity-view") {
    state.adminActivityView = event.target.closest("[data-view]").dataset.view;
    render();
    return;
  }
  if (action === "set-admin-overview-period") {
    state.adminOverviewPeriod = event.target.closest("[data-period]").dataset.period;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "set-admin-overdue-period") {
    state.adminOverduePeriod = event.target.closest("[data-period]").dataset.period;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "clear-audit-filters") {
    state.auditQuery = "";
    state.auditCategory = "all";
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "clear-audit-search") {
    state.auditQuery = "";
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "keep-empty-draft") {
    state.emptyDraftPrompt = false;
    render();
    return;
  }
  if (action === "discard-empty-draft") {
    const draftId = state.activeDraftId;
    if (draftId) state.discardedDraftIds.add(draftId);
    state.activeDraftId = null;
    state.emptyDraftPrompt = false;
    state.page = "tickets";
    render();
    showToast(draftId ? `${draftId} was discarded.` : "Empty ticket discarded.");
    return;
  }
  if (action === "save-draft") {
    const form = event.target.closest("#ticket-form");
    if (!form) return;
    const values = syncCustomerRequestValues(form);
    if (!values.subject && !values.body && !values.issueChoice) {
      state.emptyDraftPrompt = true;
      render();
      return;
    }
    saveCustomerDraft(form);
    return;
  }
  if (action === "cycle-staff-resolved-period") {
    const currentIndex = staffResolvedPeriods.findIndex((period) => period.key === state.staffResolvedPeriod);
    state.staffResolvedPeriod = staffResolvedPeriods[(currentIndex + 1) % staffResolvedPeriods.length].key;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "set-staff-performance-period") {
    state.staffPerformancePeriod = event.target.closest("[data-period]").dataset.period;
    state.staffPerformancePage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "staff-performance-page") {
    const direction = event.target.closest("[data-direction]").dataset.direction;
    const currentPage = Number(state.serverData.staffPerformance?.page || state.staffPerformancePage || 1);
    const totalPages = Math.max(1, Math.ceil(Number(state.serverData.staffPerformance?.total || 0) / Number(state.serverData.staffPerformance?.page_size || 5)));
    state.staffPerformancePage = Math.max(1, Math.min(totalPages, currentPage + (direction === "next" ? 1 : -1)));
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "paginate-customer-tickets") {
    const direction = event.target.closest("[data-direction]").dataset.direction;
    if (serverSessionIsActive()) { moveServerTablePage(action, direction); void refreshServerData(); }
    else { moveTablePage("customerTicketsPage", direction, getTableTotalForAction(action)); render(); }
    return;
  }
  if (action === "paginate-staff-ticket-pool") {
    const direction = event.target.closest("[data-direction]").dataset.direction;
    if (serverSessionIsActive()) { moveServerTablePage(action, direction); void refreshServerData(); }
    else { moveTablePage("staffTicketPoolPage", direction, getTableTotalForAction(action)); render(); }
    return;
  }
  if (action === "paginate-staff-my-tickets") {
    const direction = event.target.closest("[data-direction]").dataset.direction;
    if (serverSessionIsActive()) { moveServerTablePage(action, direction); void refreshServerData(); }
    else { moveTablePage("staffMyTicketsPage", direction, getTableTotalForAction(action)); render(); }
    return;
  }
  if (action === "paginate-admin-attention") {
    const direction = event.target.closest("[data-direction]").dataset.direction;
    if (serverSessionIsActive()) { moveServerTablePage(action, direction); void refreshServerData(); }
    else { moveTablePage("adminAttentionPage", direction, getTableTotalForAction(action)); render(); }
    return;
  }
  if (action === "paginate-admin-all-tickets") {
    const direction = event.target.closest("[data-direction]").dataset.direction;
    if (serverSessionIsActive()) { moveServerTablePage(action, direction); void refreshServerData(); }
    else { moveTablePage("adminAllTicketsPage", direction, getTableTotalForAction(action)); render(); }
    return;
  }
  if (action === "toggle-ticket-pool-filters") {
    state.ticketPoolFiltersOpen = !state.ticketPoolFiltersOpen;
    render();
    return;
  }
  if (action === "clear-ticket-pool-filters") {
    state.ticketPoolFilters = { priority: "all", type: "all" };
    state.staffTicketPoolPage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "toggle-my-tickets-filters") {
    state.myTicketsFiltersOpen = !state.myTicketsFiltersOpen;
    render();
    return;
  }
  if (action === "clear-my-tickets-filters") {
    state.myTicketsFilters = { priority: "all", status: "all" };
    state.staffMyTicketsPage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "toggle-admin-ticket-filters") {
    state.adminTicketFiltersOpen = !state.adminTicketFiltersOpen;
    render();
    return;
  }
  if (action === "clear-admin-ticket-filters") {
    state.adminTicketFilters = { model: "all", type: "all", queue: "all", priority: "all", status: "all", assignee: "all" };
    state.adminAttentionPage = 1;
    state.adminAllTicketsPage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "clear-admin-ticket-search") {
    state.adminTicketSearch = "";
    state.adminAttentionPage = 1;
    state.adminAllTicketsPage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "clear-staff-my-tickets-search") {
    state.myTicketsSearch = "";
    state.staffMyTicketsPage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "sort-admin-tickets") {
    const sortKey = event.target.closest("[data-sort-key]").dataset.sortKey;
    const defaultDirection = ["priority", "updated"].includes(sortKey) ? "desc" : "asc";
    state.adminTicketSort = {
      key: sortKey,
      direction: state.adminTicketSort.key === sortKey
        ? (state.adminTicketSort.direction === "asc" ? "desc" : "asc")
        : defaultDirection,
    };
    state.adminAttentionPage = 1;
    state.adminAllTicketsPage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "sort-ticket-pool") {
    const sortKey = event.target.closest("[data-sort-key]").dataset.sortKey;
    const defaultDirection = sortKey === "priority" ? "desc" : "asc";
    state.ticketPoolSort = {
      key: sortKey,
      direction: state.ticketPoolSort.key === sortKey
        ? (state.ticketPoolSort.direction === "asc" ? "desc" : "asc")
        : defaultDirection,
    };
    state.staffTicketPoolPage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "sort-my-tickets") {
    const sortKey = event.target.closest("[data-sort-key]").dataset.sortKey;
    const defaultDirection = sortKey === "priority" ? "desc" : "asc";
    state.myTicketsSort = {
      key: sortKey,
      direction: state.myTicketsSort.key === sortKey
        ? (state.myTicketsSort.direction === "asc" ? "desc" : "asc")
        : defaultDirection,
    };
    state.staffMyTicketsPage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (action === "claim") {
    const ticketId = event.target.closest("[data-ticket-id]").dataset.ticketId;
    if (serverSessionIsActive()) {
      void claimServerTicket(ticketId);
      return;
    }
    state.claimedTicketAssignments.set(ticketId, getActiveProfile().id);
    render();
    showToast(`${ticketId} was claimed and moved to My tickets.`);
    return;
  }
  if (action === "filter") { showToast("Filters will apply to the ticket queryset in Django."); return; }
  if (action === "placeholder") { showToast("This management table will be connected during Django implementation."); return; }
  if (action === "activate-joint") {
    if (serverSessionIsActive()) void activateServerModel("joint");
    else { state.activeModel = "joint"; render(); showToast("Joint model will route future ticket submissions."); }
    return;
  }
  if (action === "activate-separate") {
    if (serverSessionIsActive()) void activateServerModel("separate");
    else { state.activeModel = "separate"; render(); showToast("Separate models will route future ticket submissions."); }
    return;
  }
  if (action === "show-joint") {
    state.modelDashboard = "joint";
    state.serverData.modelOperational = null;
    render();
    if (serverSessionIsActive()) void refreshServerModelOperational("joint", state.modelOperationalPeriod);
    return;
  }
  if (action === "show-separate") {
    state.modelDashboard = "separate";
    state.serverData.modelOperational = null;
    render();
    if (serverSessionIsActive()) void refreshServerModelOperational("separate", state.modelOperationalPeriod);
    return;
  }
  if (action === "back-model-centre") { state.modelDashboard = null; render(); return; }
  if (action === "set-model-operational-period") {
    state.modelOperationalPeriod = event.target.closest("[data-period]").dataset.period;
    if (serverSessionIsActive()) void refreshServerModelOperational(state.modelDashboard, state.modelOperationalPeriod);
    else render();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.matches("[data-table-page-input]")) {
    event.preventDefault();
    goToTablePage(event.target.dataset.tablePageInput, event.target.value);
    return;
  }
  if (event.key === "Enter" && event.target.matches("[data-server-page-input]")) {
    event.preventDefault();
    goToStaffPerformancePage(event.target.value);
    return;
  }
  if (event.key === "Escape" && state.staffUserDialog) {
    closeActiveDialog("staffUserDialog");
    return;
  }
  if (event.key === "Escape" && state.adminTicketDialog) {
    closeActiveDialog("adminTicketDialog");
    return;
  }
  if (event.key === "Escape" && state.staffTicketDialog) {
    closeActiveDialog("staffTicketDialog");
    return;
  }
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
  const requestField = event.target.closest("#ticket-form [data-customer-request-field]");
  if (!requestField) return;
  state.customerRequestValues = {
    ...currentCustomerRequestValues(),
    [requestField.dataset.customerRequestField]: requestField.value,
  };
  if (state.customerRequestError) state.customerRequestError = "";
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

document.addEventListener("change", (event) => {
  if (event.target.matches("[data-table-page-input]")) {
    goToTablePage(event.target.dataset.tablePageInput, event.target.value);
    return;
  }
  if (event.target.matches("[data-server-page-input]")) {
    goToStaffPerformancePage(event.target.value);
    return;
  }
  if (event.target.dataset.staffQueueFilter !== undefined) {
    state.staffQueueFilter = event.target.value;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (event.target.dataset.auditCategory !== undefined) {
    state.auditCategory = event.target.value;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  const ticketPoolFilterName = event.target.dataset.ticketPoolFilter;
  if (ticketPoolFilterName) {
    state.ticketPoolFilters[ticketPoolFilterName] = event.target.value;
    state.staffTicketPoolPage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  const myTicketsFilterName = event.target.dataset.myTicketsFilter;
  if (!myTicketsFilterName) return;
  state.myTicketsFilters[myTicketsFilterName] = event.target.value;
  state.staffMyTicketsPage = 1;
  if (serverSessionIsActive()) void refreshServerData();
  else render();
});

document.addEventListener("change", (event) => {
  if (event.target.id === "admin-ticket-queue") {
    const form = event.target.closest("#admin-ticket-management-form");
    const assigneeSelect = form?.elements?.["admin-ticket-assignee"];
    if (!assigneeSelect) return;
    const previousAssignee = assigneeSelect.value;
    assigneeSelect.innerHTML = renderAdminAssigneeOptions(event.target.value, previousAssignee);
    if (!getAssignmentStaffNames(event.target.value).includes(previousAssignee)) {
      assigneeSelect.value = "Unassigned";
    }
    return;
  }
  const adminFilterName = event.target.dataset.adminTicketFilter;
  if (!adminFilterName) return;
  state.adminTicketFilters[adminFilterName] = event.target.value;
  state.adminAttentionPage = 1;
  state.adminAllTicketsPage = 1;
  if (serverSessionIsActive()) void refreshServerData();
  else render();
});

document.addEventListener("input", (event) => {
  if (event.target.id === "audit-query") {
    const clearButton = event.target.closest(".audit-search-input")?.querySelector(".audit-search-clear");
    if (clearButton) clearButton.disabled = !event.target.value;
    return;
  }
  if (event.target.id === "admin-ticket-search") {
    const clearButton = event.target.closest(".admin-ticket-search-input")?.querySelector(".admin-ticket-search-clear");
    if (clearButton) clearButton.disabled = !event.target.value;
    return;
  }
  if (event.target.id === "staff-my-tickets-search") {
    const clearButton = event.target.closest(".staff-my-tickets-search-input")?.querySelector("button");
    if (clearButton) clearButton.disabled = !event.target.value;
  }
});

document.addEventListener("submit", (event) => {
  if (event.target.id === "admin-ticket-search-form") {
    event.preventDefault();
    const formData = new FormData(event.target);
    state.adminTicketSearch = String(formData.get("admin-ticket-search") || "").trim();
    state.adminAttentionPage = 1;
    state.adminAllTicketsPage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (event.target.id === "staff-my-tickets-search-form") {
    event.preventDefault();
    const formData = new FormData(event.target);
    state.myTicketsSearch = String(formData.get("staff-my-tickets-search") || "").trim();
    state.staffMyTicketsPage = 1;
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (event.target.id === "staff-user-form") {
    event.preventDefault();
    const form = event.target;
    if (serverSessionIsActive()) {
      void saveServerStaffUser(form);
      return;
    }
    const formData = new FormData(form);
    const firstName = String(formData.get("staff-first-name") || "").trim();
    const lastName = String(formData.get("staff-last-name") || "").trim();
    const email = String(formData.get("staff-email") || "").trim().toLowerCase();
    const phone = String(formData.get("staff-phone") || "").trim();
    const title = String(formData.get("staff-title") || "").trim();
    const queue = String(formData.get("staff-queue") || "");
    const userId = form.dataset.staffId;
    if (!firstName || !lastName || !email || !title || !queue) {
      showToast("Complete the staff name, email, role title, and assigned queue.");
      return;
    }
    const duplicateEmail = staffUsers.some((user) => user.id !== userId && user.email.toLowerCase() === email);
    if (duplicateEmail) {
      showToast("A staff member with this email address already exists.");
      return;
    }
    if (userId === "new") {
      const idStem = `staff-${firstName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${lastName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      let newId = idStem;
      let suffix = 2;
      while (staffUsers.some((user) => user.id === newId)) {
        newId = `${idStem}-${suffix}`;
        suffix += 1;
      }
      const newUser = {
        id: newId, firstName, lastName, email, phone, title, queue,
        status: "Available", activeTickets: 0, waitingReply: 0,
        resolved: {
          today: { count: 0, sla: "—", time: "—" },
          week: { count: 0, sla: "—", time: "—" },
          month: { count: 0, sla: "—", time: "—" },
        },
      };
      staffUsers.push(newUser);
      assignmentStaffUsers.push({ ...newUser });
      state.staffUserDialog = newId;
      state.staffQueueFilter = "all";
      render();
      showToast(`${firstName} ${lastName} was added to ${queue}.`);
      return;
    }
    const user = getStaffUser(userId);
    if (!user) {
      showToast("That staff member is no longer available.");
      return;
    }
    Object.assign(user, { firstName, lastName, email, phone, title, queue });
    const assignmentUser = assignmentStaffUsers.find((item) => item.id === userId);
    if (assignmentUser) Object.assign(assignmentUser, { firstName, lastName, email, phone, title, queue });
    if (user.id === accountProfiles.staff.id) {
      accountProfiles.staff = { ...accountProfiles.staff, firstName, lastName, phone };
      roleDefinitions.staff.name = getProfileDisplayName(user);
      roleDefinitions.staff.title = queue;
    }
    render();
    showToast(`${firstName} ${lastName}'s staff record was updated.`);
    return;
  }
  if (event.target.id === "admin-force-close-form") {
    event.preventDefault();
    const ticketId = event.target.dataset.ticketId;
    const reason = String(new FormData(event.target).get("admin-force-close-reason") || "").trim();
    if (!reason) {
      showToast("Enter a closure reason before force closing this ticket.");
      return;
    }
    if (!window.confirm(`Force close ${ticketId}? The customer and staff will no longer be able to reopen it.`)) return;
    if (serverSessionIsActive()) {
      void forceCloseServerTicket(ticketId, reason);
      return;
    }
    forceCloseAdminTicket(ticketId, reason);
    return;
  }
  if (event.target.id === "admin-ticket-management-form") {
    event.preventDefault();
    const ticketId = event.target.dataset.ticketId;
    const ticket = getAdminTicket(ticketId);
    if (!ticket) {
      showToast("That ticket is no longer available in Ticket Management.");
      return;
    }
    const formData = new FormData(event.target);
    const nextQueue = String(formData.get("admin-ticket-queue") || "");
    const nextAssignee = String(formData.get("admin-ticket-assignee") || "Unassigned");
    const nextPriority = String(formData.get("admin-ticket-priority") || "");
    if (!nextQueue || !nextPriority) {
      showToast("Select a queue and priority before saving this ticket.");
      return;
    }
    if (serverSessionIsActive()) {
      void routeServerAdminTicket(ticketId, { queueName: nextQueue, assigneeName: nextAssignee, priorityValue: nextPriority });
      return;
    }
    const routeChanged = ticket.routingFailed || ticket.queue !== nextQueue || ticket.priority !== nextPriority;
    if (!ticket.originalPrediction && routeChanged) {
      ticket.originalPrediction = { queue: ticket.queue, priority: ticket.priority };
    }
    ticket.queue = nextQueue;
    ticket.assignee = nextAssignee;
    ticket.priority = nextPriority;
    ticket.routingFailed = false;
    if (routeChanged) ticket.routeCorrected = true;
    closeActiveDialog("adminTicketDialog", () => showToast(`${ticket.id} was updated with ${nextPriority} priority, routed to ${nextQueue}, and assigned to ${nextAssignee}.`));
    return;
  }
  if (event.target.id === "audit-search-form") {
    event.preventDefault();
    state.auditQuery = String(new FormData(event.target).get("audit-query") || "").trim();
    if (serverSessionIsActive()) void refreshServerData();
    else render();
    return;
  }
  if (event.target.id === "profile-form") {
    event.preventDefault();
    if (serverSessionIsActive()) {
      void saveServerProfile(event.target);
      return;
    }
    const formData = new FormData(event.target);
    accountProfiles[state.role] = {
      id: accountProfiles[state.role].id,
      firstName: String(formData.get("profile-first-name")).trim(),
      lastName: String(formData.get("profile-last-name")).trim(),
      email: accountProfiles[state.role].email,
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
    if (serverSessionIsActive()) {
      void changeServerPassword(event.target, { currentPassword, newPassword, confirmPassword }, error);
      return;
    }
    error.hidden = true;
    event.target.reset();
    showToast("New password saved.");
    return;
  }
  if (event.target.id === "customer-reply-form") {
    event.preventDefault();
    const ticketId = state.customerTicketDialog;
    const form = event.target;
    const body = String(new FormData(form).get("customer-reply") || "").trim();
    const error = form.querySelector("#customer-reply-error");
    if (!body) {
      error.textContent = "Write a reply before sending it to support.";
      error.hidden = false;
      form.elements["customer-reply"]?.focus();
      return;
    }
    error.hidden = true;
    if (serverSessionIsActive()) {
      void replyToCustomerTicket(ticketId, body, error, form);
      return;
    }
    setTicketStatus(ticketId, "Waiting for Support", "waiting", {
      updated: "Customer replied",
      updatedDetail: "Waiting for support reply",
    });
    state.waitingForCustomerSince.delete(ticketId);
    closeActiveDialog("customerTicketDialog", () => showToast("Reply sent. Your ticket is now back with the support team."));
    return;
  }
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (form.id === "public-login-form") {
    event.preventDefault();
    const formData = new FormData(form);
    startPrototypeSession(String(formData.get("login-email") || ""));
    return;
  }
  if (form.id === "ticket-form") {
    event.preventDefault();
    syncCustomerRequestValues(form);
    const formData = new FormData(form);
    const subject = String(formData.get("subject") || "").trim();
    const description = String(formData.get("description") || "").trim();
    const issueChoice = String(formData.get("issue-choice") || "");
    if (!subject || !description || !issueChoice) {
      state.customerRequestStep = !issueChoice ? 1 : 2;
      const fieldId = !issueChoice ? "" : !subject ? "subject" : "description";
      showCustomerRequestError("Enter a subject, describe the issue, and select what best describes it before submitting.", fieldId);
      return;
    }
    state.customerRequestError = "";
    if (serverSessionIsActive()) {
      void submitServerCustomerTicket(form);
      return;
    }
    if (state.customerActionPending) return;
    setCustomerTicketActionPending(form, true, "submit");
    const submittedDraftId = state.activeDraftId;
    if (submittedDraftId) state.discardedDraftIds.add(submittedDraftId);
    state.activeDraftId = null;
    state.customerFormRequestKey = "";
    resetCustomerRequest();
    showToast(submittedDraftId ? "Draft submitted. The routing result will appear in your ticket timeline." : "Ticket submitted. The routing result will appear in your ticket timeline.");
    state.page = "tickets";
    window.setTimeout(() => {
      setCustomerTicketActionPending(form, false);
      render();
    }, 650);
    return;
  }
  if (form.id === "staff-reply-form") {
    event.preventDefault();
    const reply = String(new FormData(form).get("staff-reply") || "").trim();
    const error = form.querySelector("#staff-reply-error");
    if (!reply) {
      error.textContent = "Write a reply before sending it to the customer.";
      error.hidden = false;
      form.elements["staff-reply"].focus();
      return;
    }
    error.hidden = true;
    if (serverSessionIsActive()) {
      void replyToStaffTicket(state.staffTicketDialog, reply, error, form);
      return;
    }
    const ticket = getStaffTicket(state.staffTicketDialog);
    if (ticket) {
      staffTicketConversations[ticket.id] = {
        ...(staffTicketConversations[ticket.id] || {}),
        customerMessage: staffTicketConversations[ticket.id]?.customerMessage || `The customer needs help with: ${ticket.subject}.`,
        staffMessage: reply,
      };
      setTicketStatus(ticket.id, "Waiting for Customer", "waiting", {
        updated: "Support replied",
        updatedDetail: "Waiting for customer response",
      });
      state.waitingForCustomerSince.set(ticket.id, PROTOTYPE_TODAY.toISOString());
    }
    closeActiveDialog("staffTicketDialog", () => showToast(`Reply sent to ${ticket?.createdBy || "the customer"}.`));
  }
});

const serverSession = getServerSession();
if (serverSession) startServerSession(serverSession);
else {
  render();
  showLoginScreen();
}

window.setInterval(() => {
  if (!serverSessionIsActive() || state.serverLoading) return;
  if (["new-ticket", "edit-profile", "change-password"].includes(state.page)) return;
  if (state.customerTicketDialog || state.staffTicketDialog || state.adminTicketDialog || state.staffUserDialog) return;
  void refreshServerData();
}, 60_000);
