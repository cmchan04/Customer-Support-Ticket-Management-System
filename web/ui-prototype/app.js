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
      ["04", "Users", "users"],
      ["05", "Queues", "queues"],
      ["—", "Records"],
      ["06", "Activity & audit log", "activity"],
    ],
  },
};

const PROTOTYPE_TODAY = new Date("2026-08-19T12:00:00");
const CUSTOMER_CLOSURE_WINDOW_DAYS = 3;
const CLOSED_TICKETS_PAGE_SIZE = 5;

const state = {
  role: "admin",
  page: "dashboard",
  activeModel: "joint",
  modelDashboard: null,
  modelOperationalPeriod: "month",
  customerTicketDialog: null,
  staffTicketDialog: null,
  adminTicketDialog: null,
  activeDraftId: null,
  pendingClosureTicketIds: new Set(),
  customerResolutionDates: new Map([["TKT-000104", "2026-08-17T09:00:00"]]),
  discardedDraftIds: new Set(),
  accountMenuOpen: false,
  accountReturnPage: "dashboard",
  staffResolvedPeriod: "today",
  staffPerformancePeriod: "week",
  closedTicketsPage: 1,
  ticketPoolFiltersOpen: false,
  ticketPoolFilters: { priority: "all", type: "all" },
  ticketPoolSort: { key: "ticketId", direction: "desc" },
  myTicketsFiltersOpen: false,
  myTicketsFilters: { priority: "all", status: "all" },
  myTicketsSort: { key: "lastUpdated", direction: "asc" },
  claimedTicketAssignments: new Map(),
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

const staffAssignedTickets = [
  { id: "TKT-000126", subject: "Password reset email does not arrive", createdBy: "Daniel Wong", type: "Incident", priority: "High", status: ["Reply needed", "waiting"], updated: "42 min ago", updatedOrder: 42 },
  { id: "TKT-000132", subject: "VPN connection drops after password change", createdBy: "Lina Tan", type: "Incident", priority: "High", status: ["In progress", "progress"], updated: "2 h ago", updatedOrder: 120 },
  { id: "TKT-000119", subject: "System is slow after the latest update", createdBy: "Jessica Low", type: "Problem", priority: "Medium", status: ["Waiting for customer", "waiting"], updated: "Yesterday", updatedOrder: 1440 },
  { id: "TKT-000104", subject: "Unable to install the desktop client", createdBy: "Mohd Firdaus", type: "Request", priority: "Low", status: ["In progress", "progress"], updated: "12 Aug", updatedOrder: 11520 },
];

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

const staffClosedTicketHistory = [
  { id: "TKT-000098", subject: "Browser certificate warning", createdBy: "Alicia Yeo", type: "Incident", priority: "Medium", status: ["Closed", "resolved"], closedAt: "Today, 11:16", closedOrder: 10, resolvedIn: "1 h 26 min" },
  { id: "TKT-000091", subject: "Desktop client sign-in issue", createdBy: "Hakim Salleh", type: "Incident", priority: "High", status: ["Closed", "resolved"], closedAt: "Today, 09:42", closedOrder: 9, resolvedIn: "2 h 08 min" },
  { id: "TKT-000086", subject: "VPN profile needs updating", createdBy: "Nadia Osman", type: "Request", priority: "Low", status: ["Closed", "resolved"], closedAt: "Yesterday", closedOrder: 8, resolvedIn: "3 h 01 min" },
  { id: "TKT-000081", subject: "Desktop application crashes on launch", createdBy: "Jason Goh", type: "Incident", priority: "High", status: ["Closed", "resolved"], closedAt: "Yesterday", closedOrder: 7, resolvedIn: "2 h 34 min" },
  { id: "TKT-000075", subject: "Cannot complete multi-factor setup", createdBy: "Nur Syafiqah", type: "Request", priority: "Medium", status: ["Closed", "resolved"], closedAt: "16 Aug", closedOrder: 6, resolvedIn: "1 h 49 min" },
  { id: "TKT-000072", subject: "Recurring VPN authentication prompt", createdBy: "Yong Wei", type: "Problem", priority: "High", status: ["Closed", "resolved"], closedAt: "15 Aug", closedOrder: 5, resolvedIn: "2 h 17 min" },
  { id: "TKT-000065", subject: "Desktop client sync failure", createdBy: "Siti Hajar", type: "Problem", priority: "Medium", status: ["Closed", "resolved"], closedAt: "13 Aug", closedOrder: 4, resolvedIn: "3 h 04 min" },
  { id: "TKT-000053", subject: "Account recovery cannot complete", createdBy: "Kai Ling", type: "Incident", priority: "High", status: ["Closed", "resolved"], closedAt: "11 Aug", closedOrder: 3, resolvedIn: "4 h 11 min" },
  { id: "TKT-000047", subject: "VPN client fails after update", createdBy: "Mohan Kumar", type: "Incident", priority: "Medium", status: ["Closed", "resolved"], closedAt: "8 Aug", closedOrder: 2, resolvedIn: "2 h 56 min" },
  { id: "TKT-000041", subject: "Network printer unavailable", createdBy: "Evelyn Tan", type: "Request", priority: "Low", status: ["Closed", "resolved"], closedAt: "5 Aug", closedOrder: 1, resolvedIn: "1 h 37 min" },
];

const accountProfiles = {
  customer: { id: "customer-maya-lim", firstName: "Maya", lastName: "Lim", email: "maya.lim@example.com", phone: "+60 12-345 6789" },
  staff: { id: "staff-arun-patel", firstName: "Arun", lastName: "Patel", email: "arun.patel@example.com", phone: "+60 12-456 7890" },
  admin: { id: "admin-aisha-tan", firstName: "Aisha", lastName: "Tan", email: "aisha.tan@example.com", phone: "+60 12-567 8901" },
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
  { id: "TKT-000121", subject: "Please update my billing address", customer: "Maya Lim", type: "Request", request: "I reopened this request because the billing address shown on my account still has not changed.", priority: "Medium", model: "Separate", queue: "Billing and Payments", assignee: "Billing team", status: ["Reopened", "reopened"], updated: "Yesterday, 16:18", routingFailed: false, reopened: true },
  { id: "TKT-000128", subject: "Unable to access the staff portal", customer: "Maya Lim", type: "Incident", request: "I cannot access the staff portal after signing in. The page returns me to the login screen.", priority: "High", model: "Joint", queue: "Technical Support", assignee: "Arun Patel", status: ["Open", "open"], updated: "18 min ago", routingFailed: false, reopened: false },
  { id: "TKT-000125", subject: "Charge appears twice on invoice", customer: "Amir Hasan", type: "Incident", request: "The same monthly charge appears twice on my invoice and I need it reviewed before the payment due date.", priority: "High", model: "Separate", queue: "Billing and Payments", assignee: "Billing team", status: ["In progress", "progress"], updated: "39 min ago", routingFailed: false, reopened: false },
  { id: "TKT-000118", subject: "Company VPN access is still unavailable", customer: "Rina Abdullah", type: "Incident", request: "I still cannot connect to the company VPN and need access restored before I can continue my work.", priority: "Medium", model: "Joint", queue: "Technical Support", assignee: "Arun Patel", status: ["Open", "open"], updated: "Yesterday, 13:20", routingFailed: false, reopened: false, overdue: true, overdueLabel: "2 h overdue" },
  { id: "TKT-000110", subject: "Refund request has not been reviewed", customer: "Wei Jian", type: "Request", request: "I submitted a refund request but have not received an update on its review or the next step.", priority: "Low", model: "Separate", queue: "Billing and Payments", assignee: "Billing team", status: ["In progress", "progress"], updated: "Yesterday, 10:12", routingFailed: false, reopened: false, overdue: true, overdueLabel: "1 day overdue" },
  { id: "TKT-000104", subject: "Unable to install the desktop client", customer: "Mohd Firdaus", type: "Request", request: "I need help installing the desktop client on my work computer. The setup stops before the installation is complete.", priority: "Low", model: "Joint", queue: "Technical Support", assignee: "Arun Patel", status: ["Customer resolved", "pending-close"], updated: "12 Aug", routingFailed: false, reopened: false },
];

const adminQueueOptions = ["Technical Support", "Product Support", "Customer Service", "Billing and Payments"];
const adminAssigneeOptions = ["Unassigned", "Arun Patel", "Priya Nair", "Billing team", "Product Support team"];
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
        queuePredictions: [["Technical Support", 43], ["Product Support", 28], ["Customer Service", 21], ["IT Support", 17], ["Billing and Payments", 14], ["Returns and Exchanges", 7], ["Service Outages and Maintenance", 6], ["Sales and Pre-Sales", 5], ["Human Resources", 3], ["General Inquiry", 2]],
        priorityPredictions: [["High", 57], ["Medium", 59], ["Low", 30]],
      },
      quarter: {
        label: "This quarter",
        queuePredictions: [["Technical Support", 123], ["Product Support", 80], ["Customer Service", 62], ["IT Support", 50], ["Billing and Payments", 41], ["Returns and Exchanges", 21], ["Service Outages and Maintenance", 18], ["Sales and Pre-Sales", 13], ["Human Resources", 9], ["General Inquiry", 6]],
        priorityPredictions: [["High", 165], ["Medium", 171], ["Low", 87]],
      },
      year: {
        label: "This year",
        queuePredictions: [["Technical Support", 373], ["Product Support", 242], ["Customer Service", 189], ["IT Support", 153], ["Billing and Payments", 125], ["Returns and Exchanges", 64], ["Service Outages and Maintenance", 53], ["Sales and Pre-Sales", 40], ["Human Resources", 27], ["General Inquiry", 18]],
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
        queuePredictions: [["Technical Support", 27], ["Product Support", 18], ["Customer Service", 14], ["IT Support", 11], ["Billing and Payments", 9], ["Returns and Exchanges", 5], ["Service Outages and Maintenance", 4], ["Sales and Pre-Sales", 3], ["Human Resources", 2], ["General Inquiry", 1]],
        priorityPredictions: [["High", 37], ["Medium", 38], ["Low", 19]],
      },
      quarter: {
        label: "This quarter",
        queuePredictions: [["Technical Support", 79], ["Product Support", 51], ["Customer Service", 40], ["IT Support", 33], ["Billing and Payments", 27], ["Returns and Exchanges", 14], ["Service Outages and Maintenance", 11], ["Sales and Pre-Sales", 9], ["Human Resources", 6], ["General Inquiry", 4]],
        priorityPredictions: [["High", 107], ["Medium", 111], ["Low", 56]],
      },
      year: {
        label: "This year",
        queuePredictions: [["Technical Support", 239], ["Product Support", 155], ["Customer Service", 122], ["IT Support", 98], ["Billing and Payments", 81], ["Returns and Exchanges", 41], ["Service Outages and Maintenance", 34], ["Sales and Pre-Sales", 26], ["Human Resources", 18], ["General Inquiry", 12]],
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

function getAvailableTicketPoolTickets() {
  return ticketPoolTickets.filter((ticket) => !state.claimedTicketAssignments.has(ticket.id));
}

function getTicketClosureDetails(ticketId) {
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
  return { ...ticket, status: ["Customer resolved", "pending-close"], closure };
}

function getClaimedStaffTickets() {
  return ticketPoolTickets
    .filter((ticket) => state.claimedTicketAssignments.get(ticket.id) === getActiveProfile().id)
    .map((ticket) => getStaffTicketRecord({ ...ticket, status: ["Open", "open"], updated: "Just claimed", updatedOrder: 0 }));
}

function getStaffWorkTickets() {
  return [...getClaimedStaffTickets(), ...staffAssignedTickets.map((ticket) => getStaffTicketRecord(ticket))];
}

function getStaffActiveTickets() {
  return getStaffWorkTickets().filter((ticket) => !ticket.closure?.isClosed);
}

function getClosedStaffTickets() {
  const automaticallyClosed = getStaffWorkTickets().filter((ticket) => ticket.closure?.isClosed);
  const automaticIds = new Set(automaticallyClosed.map((ticket) => ticket.id));
  return [...automaticallyClosed, ...staffClosedTicketHistory.filter((ticket) => !automaticIds.has(ticket.id))]
    .sort((left, right) => (right.closedOrder || 0) - (left.closedOrder || 0));
}

function getClaimedTicketCountForStaff(staffId) {
  return ticketPoolTickets.filter((ticket) => (
    state.claimedTicketAssignments.get(ticket.id) === staffId && !getTicketClosureDetails(ticket.id)?.isClosed
  )).length;
}

function getStaffPendingReplyCount() {
  return getStaffActiveTickets().filter((ticket) => ticket.status[0] === "Reply needed").length;
}

function getAssignedStaffName(staffId) {
  const profile = Object.values(accountProfiles).find((item) => item.id === staffId);
  return profile ? getProfileDisplayName(profile) : "Assigned staff";
}

function getStaffTicket(ticketId) {
  return getStaffActiveTickets().find((ticket) => ticket.id === ticketId)
    || getClosedStaffTickets().find((ticket) => ticket.id === ticketId);
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
      ? getStaffPendingReplyCount()
      : state.role === "staff" && page === "unassigned"
        ? getAvailableTicketPoolTickets().length
        : state.role === "staff" && page === "assigned"
          ? staffAssignedTickets.length + claimedTicketCount
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
  return match ? match[1] : "Dashboard";
}

function setRole(role) {
  state.role = role;
  state.page = "dashboard";
  state.modelDashboard = null;
  state.customerTicketDialog = null;
  state.staffTicketDialog = null;
  state.adminTicketDialog = null;
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
  const isStaff = state.role === "staff";
  breadcrumb.hidden = isCustomer;
  breadcrumb.textContent = isCustomer
    ? ""
    : isStaff
      ? `${getProfileDisplayName(getActiveProfile())} · ${roleDefinitions.staff.title}`
      : `${state.role.charAt(0).toUpperCase() + state.role.slice(1)} / ${pageTitle()}`;
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
    <div class="account-form-shell"><form id="profile-form" class="form-card account-form-card"><section class="account-identity-strip"><span class="account-profile-avatar avatar-${state.role}">${getProfileInitials(profile)}</span><div><span class="eyebrow">Your account</span><strong>${escapeHtml(getProfileDisplayName(profile))}</strong><p>${definition.title}</p></div></section><div class="form-grid"><div class="form-field"><label for="profile-first-name">First name</label><input id="profile-first-name" name="profile-first-name" autocomplete="given-name" maxlength="40" value="${escapeHtml(profile.firstName)}" required /></div><div class="form-field"><label for="profile-last-name">Last name</label><input id="profile-last-name" name="profile-last-name" autocomplete="family-name" maxlength="40" value="${escapeHtml(profile.lastName)}" required /></div><div class="form-field full"><label for="profile-email">Email address</label><input id="profile-email" name="profile-email" type="email" autocomplete="email" maxlength="120" value="${escapeHtml(profile.email)}" readonly aria-readonly="true" required /></div><div class="form-field full"><label for="profile-phone">Phone number <span>Optional</span></label><input id="profile-phone" name="profile-phone" type="tel" autocomplete="tel" maxlength="30" value="${escapeHtml(profile.phone)}" placeholder="For example: +60 12-345 6789" /></div></div><div class="notice"><span aria-hidden="true">↳</span><span><strong>These details are visible only to you and authorised support staff.</strong> They help us identify your account and contact you about an active request.</span></div><div class="form-actions"><button class="button signal" type="submit">Save changes</button><button class="button secondary" type="button" data-action="return-from-account">Cancel</button></div></form></div>`;
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

function openStaffTicket(ticketId) {
  if (!getStaffTicket(ticketId)) {
    showToast("That ticket is no longer assigned to your desk.");
    return;
  }
  state.page = "assigned";
  state.customerTicketDialog = null;
  state.staffTicketDialog = ticketId;
  render();
}

function openClosedStaffTicket(ticketId) {
  if (!getClosedStaffTickets().some((ticket) => ticket.id === ticketId)) {
    showToast("That closed ticket is no longer available for review.");
    return;
  }
  state.page = "performance";
  state.customerTicketDialog = null;
  state.staffTicketDialog = ticketId;
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
    : '<div class="notice"><span aria-hidden="true">✓</span><span><strong>You marked this ticket as resolved.</strong> It will close automatically after three days unless you reopen it.</span></div>';
  const ticketAction = resolved
    ? finishedNotice
    : readyForClosure
      ? `${finishedNotice}<div class="form-actions"><button class="button signal" type="button" data-action="reopen-customer-ticket" data-ticket-id="${ticket.id}">Reopen ticket</button><button class="button secondary" type="button" data-action="close-customer-ticket">Close</button></div>`
      : '<form id="customer-reply-form" class="reply-form"><label for="customer-reply">Reply to support</label><textarea id="customer-reply" name="customer-reply" placeholder="Add the details requested by the support team." required></textarea><div class="form-actions"><button class="button signal" type="submit">Send reply</button><button class="button secondary" type="button" data-action="close-customer-ticket">Cancel</button></div></form>';
  return `
    <div class="ticket-dialog-backdrop">
      <section class="ticket-dialog" role="dialog" aria-modal="true" aria-labelledby="ticket-dialog-title">
        <header class="ticket-dialog-header"><div><span class="ticket-code">${ticketId}</span><h2 id="ticket-dialog-title">${ticket.subject}</h2></div><button class="dialog-close" type="button" data-action="close-customer-ticket" aria-label="Close ticket details">×</button></header>
        <dl class="ticket-dialog-meta"><div><dt>Priority</dt><dd>${priority(ticket.priority)}</dd></div><div><dt>Status</dt><dd>${status(statusLabel, statusTone)}</dd></div><div><dt>Last updated</dt><dd>${ticket.updatedDetail}</dd></div></dl>
        <div class="ticket-dialog-body"><h3>Conversation</h3><div class="conversation"><article class="conversation-message customer-message"><span>You</span><p>${ticket.request}</p></article><article class="conversation-message staff-message"><span>Support team</span><p>${ticket.response}</p></article></div>${ticketAction}</div>
      </section>
    </div>`;
}

function renderStaffTicketDialog(ticketId) {
  const ticket = getStaffTicket(ticketId);
  if (!ticket) return "";
  const isClosed = ticket.status[1] === "resolved";
  const conversation = staffTicketConversations[ticketId] || {
    customerMessage: `The customer needs help with: ${ticket.subject}.`,
    staffMessage: isClosed
      ? "This ticket was resolved and then closed after the customer review window ended."
      : "No reply has been sent yet. Review the request and give the customer a clear next step.",
  };
  const staffName = getProfileDisplayName(getActiveProfile());
  const lifecycleNotice = ticket.closure && !ticket.closure.isClosed
    ? `<div class="notice"><span aria-hidden="true">◷</span><span><strong>The customer marked this ticket as resolved.</strong> It remains in My tickets until ${formatClosureDate(ticket.closure.closesAt)}. ${getClosureCountdownLabel(ticket.closure)} unless the customer reopens it.</span></div>`
    : isClosed
      ? `<div class="notice"><span aria-hidden="true">✓</span><span><strong>This ticket is closed.</strong> Closed ${escapeHtml(ticket.closedAt || "after the three-day review window")} and available for review only.</span></div>`
      : "";
  const ticketAction = isClosed
    ? lifecycleNotice
    : `${lifecycleNotice}<form id="staff-reply-form" class="reply-form"><label for="staff-reply">Reply to ${escapeHtml(ticket.createdBy)}</label><textarea id="staff-reply" name="staff-reply" placeholder="Write a clear update, question, or next step for the customer." required></textarea><div class="form-actions"><button class="button signal" type="submit">Send reply</button><button class="button secondary" type="button" data-action="close-staff-ticket">Close</button></div></form>`;
  return `
    <div class="ticket-dialog-backdrop">
      <section class="ticket-dialog staff-ticket-dialog" role="dialog" aria-modal="true" aria-labelledby="staff-ticket-dialog-title">
        <header class="ticket-dialog-header"><div><span class="ticket-code">${escapeHtml(ticket.id)}</span><h2 id="staff-ticket-dialog-title">${escapeHtml(ticket.subject)}</h2></div><button class="dialog-close" type="button" data-action="close-staff-ticket" aria-label="Close ticket details">×</button></header>
        <dl class="ticket-dialog-meta"><div><dt>Customer</dt><dd>${escapeHtml(ticket.createdBy)}</dd></div><div><dt>Ticket type</dt><dd>${escapeHtml(ticket.type)}</dd></div><div><dt>Priority</dt><dd>${priority(ticket.priority)}</dd></div><div><dt>Status</dt><dd>${status(ticket.status[0], ticket.status[1])}</dd></div><div><dt>${isClosed ? "Closed" : "Last updated"}</dt><dd>${escapeHtml(ticket.closedAt || ticket.updated || "—")}</dd></div><div><dt>Assignee</dt><dd>${escapeHtml(staffName)}</dd></div></dl>
        <div class="ticket-dialog-body"><h3>Conversation</h3><div class="conversation"><article class="conversation-message customer-message"><span>${escapeHtml(ticket.createdBy)}</span><p>${escapeHtml(conversation.customerMessage)}</p></article><article class="conversation-message staff-message"><span>${escapeHtml(staffName)}</span><p>${escapeHtml(conversation.staffMessage)}</p></article></div>${ticketAction}</div>
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

function renderStaffPerformance(staffName) {
  const period = getStaffPerformancePeriod();
  const maximumCadence = Math.max(...period.cadence.map((item) => item.value), 1);
  const periodControls = staffPerformancePeriods.map((item) => `<button class="performance-period${item.key === period.key ? " active" : ""}" type="button" data-action="set-staff-performance-period" data-period="${item.key}" aria-pressed="${item.key === period.key}">${item.label}</button>`).join("");
  const cadence = period.cadence.map((item) => {
    const height = Math.max(10, Math.round((item.value / maximumCadence) * 100));
    return `<div class="performance-bar-column"><span class="performance-bar-value">${item.value}</span><span class="performance-bar-track"><span class="performance-bar" style="height: ${height}%"></span></span><span class="performance-bar-label">${item.label}</span></div>`;
  }).join("");
  const qualityRows = period.quality.map((item) => `<div class="quality-row"><div><strong>${item.label}</strong><p>${item.detail}</p></div><span>${item.value}</span></div>`).join("");
  const closedTickets = getClosedStaffTickets();
  const closedTicketPageCount = Math.max(1, Math.ceil(closedTickets.length / CLOSED_TICKETS_PAGE_SIZE));
  const closedTicketPage = Math.min(state.closedTicketsPage, closedTicketPageCount);
  if (state.closedTicketsPage !== closedTicketPage) state.closedTicketsPage = closedTicketPage;
  const closedTicketStart = (closedTicketPage - 1) * CLOSED_TICKETS_PAGE_SIZE;
  const closedTicketRows = closedTickets.slice(closedTicketStart, closedTicketStart + CLOSED_TICKETS_PAGE_SIZE);
  const outcomeRows = closedTicketRows.map((ticket) => `<tr><td><span class="ticket-code">${ticket.id}</span></td><td><span class="ticket-subject">${ticket.subject}</span><span class="muted">${ticket.createdBy} · ${ticket.type}</span></td><td class="muted">${ticket.closedAt}</td><td class="muted">${ticket.resolvedIn}</td><td>${status("Closed", "resolved")}</td><td><button class="button secondary row-action" type="button" data-action="review-closed-staff-ticket" data-ticket-id="${ticket.id}">Review</button></td></tr>`).join("");
  const pagination = `<div class="closed-ticket-pagination"><span>Showing ${closedTicketStart + 1}–${Math.min(closedTicketStart + CLOSED_TICKETS_PAGE_SIZE, closedTickets.length)} of ${closedTickets.length} closed tickets</span><div><button class="button secondary" type="button" data-action="previous-closed-tickets" ${closedTicketPage === 1 ? "disabled" : ""}>Previous</button><button class="button secondary" type="button" data-action="next-closed-tickets" ${closedTicketPage === closedTicketPageCount ? "disabled" : ""}>Next</button></div></div>`;
  return `
    <div class="page-heading performance-heading"><div><span class="eyebrow">${escapeHtml(staffName)}'s performance</span><h1>Your service results</h1><p>Track your resolved work, response speed, and service quality over time.</p></div><div class="performance-periods" role="group" aria-label="Select performance period">${periodControls}</div></div>
    <section class="metric-grid performance-metric-grid"><article class="metric-card"><span class="eyebrow">Tickets resolved</span><strong class="metric-value">${period.resolved}</strong><span class="metric-footer"><span class="trend">${period.resolvedNote.split(" ")[0]}</span> ${period.resolvedNote.replace(/^[^ ]+ /, "")}</span></article><article class="metric-card"><span class="eyebrow">Average first reply</span><strong class="metric-value">${period.firstReply}</strong><span class="metric-footer"><span class="trend">${period.firstReplyNote.split(" ").slice(0, 2).join(" ")}</span> ${period.firstReplyNote.split(" ").slice(2).join(" ")}</span></article><article class="metric-card"><span class="eyebrow">Average resolution</span><strong class="metric-value">${period.resolution}</strong><span class="metric-footer"><span class="trend">${period.resolutionNote.split(" ").slice(0, 2).join(" ")}</span> ${period.resolutionNote.split(" ").slice(2).join(" ")}</span></article><article class="metric-card"><span class="eyebrow">SLA met</span><strong class="metric-value">${period.sla}</strong><span class="metric-footer">${period.slaNote}</span></article></section>
    <section class="performance-detail-grid"><article class="panel performance-cadence-panel"><div class="panel-head"><div><h2>Resolution cadence</h2><p>Tickets resolved across ${period.label.toLowerCase()}.</p></div><span class="performance-total">${period.resolved} resolved</span></div><div class="panel-body"><div class="performance-cadence-chart">${cadence}</div><p class="performance-cadence-caption">Each column records resolved tickets in its time period.</p></div></article><article class="panel performance-quality-panel"><div class="panel-head"><div><h2>Quality review</h2><p>Personal service signals for ${period.label.toLowerCase()}.</p></div></div><div class="panel-body"><div class="quality-list">${qualityRows}</div><div class="performance-note"><span aria-hidden="true">✓</span><span><strong>Keep the momentum.</strong> Your reply speed remains inside the team target for this period.</span></div></div></article></section>
    <section class="panel performance-outcomes"><div class="panel-head"><div><h2>Recent resolved work</h2><p>Closed tickets are retained here for staff review.</p></div></div><table class="data-table"><thead><tr><th>Ticket ID</th><th>Customer issue</th><th>Closed</th><th>Resolved in</th><th>Outcome</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${outcomeRows}</tbody></table>${pagination}</section>
    ${state.staffTicketDialog ? renderStaffTicketDialog(state.staffTicketDialog) : ""}`;
}

function renderStaff() {
  const isMyDesk = state.page === "dashboard";
  const isTicketPool = state.page === "unassigned";
  const isMyTickets = state.page === "assigned";
  const isPerformance = state.page === "performance";
  const staffName = getProfileDisplayName(getActiveProfile());
  if (isPerformance) return renderStaffPerformance(staffName);
  const resolvedPeriod = getStaffResolvedPeriod();
  const assignedTickets = getStaffActiveTickets();
  const renderAssignedRows = (tickets, emptyMessage = "No assigned tickets match these filters.") => tickets.length
    ? tickets.map((ticket) => `<tr><td><span class="ticket-code">${ticket.id}</span></td><td><span class="ticket-subject">${ticket.subject}</span><span class="muted">${ticket.createdBy} · ${ticket.type}</span></td><td>${priority(ticket.priority)}</td><td>${renderStaffTicketStatus(ticket)}</td><td>${staffName}</td><td class="muted">${ticket.updated}</td><td><button class="button secondary" data-action="view-staff-ticket" data-ticket-id="${ticket.id}">Open</button></td></tr>`).join("")
    : `<tr><td colspan="7"><p class="table-empty">${emptyMessage}</p></td></tr>`;
  const renderTicketPoolRows = (tickets) => tickets.length
    ? tickets.map((ticket) => `<tr><td><span class="ticket-code">${ticket.id}</span></td><td><span class="ticket-subject">${ticket.subject}</span><span class="muted">${ticket.createdBy} · ${ticket.type}</span></td><td>${priority(ticket.priority)}</td><td class="muted">${ticket.createdAt}</td><td><button class="button signal" data-action="claim" data-ticket-id="${ticket.id}">Claim</button></td></tr>`).join("")
    : '<tr><td colspan="5"><p class="table-empty">No Ticket Pool tickets match these filters.</p></td></tr>';
  const recentAssignedRows = renderAssignedRows([...assignedTickets].sort((left, right) => left.updatedOrder - right.updatedOrder).slice(0, 3));
  const availableTicketPoolTickets = getAvailableTicketPoolTickets();
  const filteredTicketPoolTickets = availableTicketPoolTickets.filter((ticket) => (
    (state.ticketPoolFilters.priority === "all" || ticket.priority === state.ticketPoolFilters.priority)
    && (state.ticketPoolFilters.type === "all" || ticket.type === state.ticketPoolFilters.type)
  ));
  const priorityOrder = { High: 3, Medium: 2, Low: 1 };
  const sortedTicketPoolTickets = [...filteredTicketPoolTickets].sort((left, right) => {
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
  const unassignedRows = renderTicketPoolRows(sortedTicketPoolTickets);
  const filteredAssignedTickets = assignedTickets.filter((ticket) => (
    (state.myTicketsFilters.priority === "all" || ticket.priority === state.myTicketsFilters.priority)
    && (state.myTicketsFilters.status === "all" || ticket.status[0] === state.myTicketsFilters.status)
  ));
  const sortedAssignedTickets = [...filteredAssignedTickets].sort((left, right) => {
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
  const assignedRows = renderAssignedRows(sortedAssignedTickets);
  const tableTitle = isMyDesk ? "My active tickets" : isTicketPool ? "Technical Support tickets" : "Assigned work";
  const tableSubtitle = isMyDesk
    ? `The three most recently updated tickets assigned to ${staffName}.`
    : isTicketPool
      ? "Unassigned tickets available for you to claim."
      : `Tickets assigned to ${staffName}. Filter or sort to focus on your next action.`;
  const tableRows = isMyDesk ? recentAssignedRows : isTicketPool ? unassignedRows : assignedRows;
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
      <span class="ticket-pool-filter-count">Showing ${sortedTicketPoolTickets.length} of ${availableTicketPoolTickets.length} tickets</span>
    </div>` : "";
  const activeMyTicketsFilters = Number(state.myTicketsFilters.priority !== "all") + Number(state.myTicketsFilters.status !== "all");
  const myTicketsFilters = isMyTickets && state.myTicketsFiltersOpen ? `
    <div class="my-tickets-filters" role="group" aria-label="Filter ${staffName}'s assigned tickets">
      <label><span>Priority</span><select data-my-tickets-filter="priority" aria-label="Filter by priority"><option value="all" ${state.myTicketsFilters.priority === "all" ? "selected" : ""}>All priorities</option><option value="High" ${state.myTicketsFilters.priority === "High" ? "selected" : ""}>High priority</option><option value="Medium" ${state.myTicketsFilters.priority === "Medium" ? "selected" : ""}>Medium priority</option><option value="Low" ${state.myTicketsFilters.priority === "Low" ? "selected" : ""}>Low priority</option></select></label>
      <label><span>Status</span><select data-my-tickets-filter="status" aria-label="Filter by status"><option value="all" ${state.myTicketsFilters.status === "all" ? "selected" : ""}>All statuses</option><option value="Open" ${state.myTicketsFilters.status === "Open" ? "selected" : ""}>Open</option><option value="Reply needed" ${state.myTicketsFilters.status === "Reply needed" ? "selected" : ""}>Reply needed</option><option value="In progress" ${state.myTicketsFilters.status === "In progress" ? "selected" : ""}>In progress</option><option value="Waiting for customer" ${state.myTicketsFilters.status === "Waiting for customer" ? "selected" : ""}>Waiting for customer</option><option value="Customer resolved" ${state.myTicketsFilters.status === "Customer resolved" ? "selected" : ""}>Customer resolved</option></select></label>
      <button class="button text" type="button" data-action="clear-my-tickets-filters">Clear filters</button>
      <span class="my-tickets-filter-count">Showing ${sortedAssignedTickets.length} of ${assignedTickets.length} tickets</span>
    </div>` : "";
  const tableAction = isMyDesk
    ? '<button class="button text panel-head-action" type="button" data-page="assigned">View all tickets</button>'
    : isTicketPool
      ? `<button class="button secondary" type="button" data-action="toggle-ticket-pool-filters" aria-expanded="${state.ticketPoolFiltersOpen}">${activeTicketPoolFilters ? `Filters (${activeTicketPoolFilters})` : "Filter tickets"}</button>`
      : isMyTickets
        ? `<button class="button secondary" type="button" data-action="toggle-my-tickets-filters" aria-expanded="${state.myTicketsFiltersOpen}">${activeMyTicketsFilters ? `Filters (${activeMyTicketsFilters})` : "Filter tickets"}</button>`
      : '<button class="button secondary" type="button" data-action="filter">Filter list</button>';
  const tableFilters = isTicketPool ? ticketPoolFilters : isMyTickets ? myTicketsFilters : "";
  const table = `<section class="panel table-panel"><div class="panel-head"><div><h2>${tableTitle}</h2><p>${tableSubtitle}</p></div>${tableAction}</div>${tableFilters}<table class="data-table"><thead><tr>${tableHeaders}</tr></thead><tbody>${tableRows}</tbody></table></section>`;
  const queueBanner = `<section class="queue-banner"><div><span class="eyebrow">Your queue</span><h2>Technical Support</h2><p>System access, account, and technical troubleshooting requests.</p></div><div class="queue-count">QUEUE BACKLOG<strong>18</strong></div><div class="queue-count">UNASSIGNED<strong>${availableTicketPoolTickets.length}</strong></div><div class="queue-count">HIGH PRIORITY<strong>${availableTicketPoolTickets.filter((ticket) => ticket.priority === "High").length}</strong></div></section>`;
  const deskMetrics = `<section class="metric-grid"><article class="metric-card"><span class="eyebrow">My active tickets</span><strong class="metric-value">${assignedTickets.length}</strong><span class="metric-footer"><span class="trend warn">${getStaffPendingReplyCount()}</span> ticket waiting your reply</span></article><article class="metric-card"><span class="eyebrow">Pending closure</span><strong class="metric-value">2</strong><span class="metric-footer">Ready for your final review</span></article><article class="metric-card resolution-metric"><div class="metric-card-header"><span class="eyebrow">Tickets resolved</span><button class="metric-swap" type="button" data-action="cycle-staff-resolved-period" aria-label="Show the next resolved-ticket period" title="Show today, this week, or this month">↻</button></div><strong class="metric-value">${resolvedPeriod.value}</strong><span class="metric-footer"><span class="period-label">${resolvedPeriod.label}</span>${resolvedPeriod.detail}</span></article><article class="metric-card"><span class="eyebrow">Route corrections</span><strong class="metric-value">2</strong><span class="metric-footer"><span class="period-label">This week</span> Recorded for model review</span></article></section>`;
  if (isTicketPool) return `<section class="ticket-pool-page">${queueBanner}${table}</section>`;
  if (isMyTickets) return `
    <div class="page-heading staff-worklist-heading"><div><span class="eyebrow">${staffName}'s workspace</span><h1>My tickets</h1><p>Review the tickets assigned to ${staffName}, reply where needed, and keep each customer informed.</p></div></div>
    ${table}
    ${state.staffTicketDialog ? renderStaffTicketDialog(state.staffTicketDialog) : ""}`;
  return `
    <div class="page-heading"><div><span class="eyebrow">Technical Support</span><h1>My desk</h1><p>Focus on your assigned tickets, requested replies, and closure work.</p></div></div>
    ${queueBanner}
    ${deskMetrics}
    ${table}`;
}

function getAdminTicket(ticketId) {
  return adminTickets.find((ticket) => ticket.id === ticketId);
}

function getAdminTicketAttentionReason(ticket) {
  if (ticket.routingFailed) return { label: "Routing failure", tone: "routing-failure", order: 1 };
  if (ticket.overdue) return { label: ticket.overdueLabel || "Overdue", tone: "overdue", order: 2 };
  return null;
}

function getAdminAttentionTickets() {
  return adminTickets
    .map((ticket) => ({ ticket, reason: getAdminTicketAttentionReason(ticket) }))
    .filter(({ reason }) => reason)
    .sort((left, right) => left.reason.order - right.reason.order);
}

function getAdminAttentionCounts() {
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
  return adminOverduePeriods.find((period) => period.key === state.adminOverduePeriod) || adminOverduePeriods[0];
}

function getAdminSlaBreachesByQueue(period) {
  return adminQueueOptions.map((queue) => ({ queue, count: period.counts[queue] || 0 }));
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
    const queue = ticket.routingFailed ? '<span class="routing-failed-label">Routing failed</span>' : escapeHtml(ticket.queue);
    const modelTone = ticket.model === "Joint" ? "open" : "draft";
    const actionLabel = ticket.routingFailed ? "Reroute" : "View details";
    return `<tr class="${reason ? "admin-attention-row" : ""}"><td><span class="ticket-code">${ticket.id}</span></td><td><span class="ticket-subject">${escapeHtml(ticket.subject)}</span><span class="muted">${escapeHtml(ticket.customer)} · ${escapeHtml(ticket.type)}</span></td><td><span class="status ${modelTone}">${ticket.model}</span></td><td>${queue}</td><td>${ticket.priority ? priority(ticket.priority) : "—"}</td><td>${status(ticket.status[0], ticket.status[1])}</td>${attentionOnly ? `<td><span class="attention-reason ${reason.tone}">${reason.label}</span></td>` : `<td>${escapeHtml(ticket.assignee)}</td><td class="muted">${escapeHtml(ticket.updated)}</td>`}<td><button class="button ${ticket.routingFailed ? "signal" : "secondary"} row-action" type="button" data-action="manage-admin-ticket" data-ticket-id="${ticket.id}">${actionLabel}</button></td></tr>`;
  }).join("");
}

function openAdminTicket(ticketId) {
  if (!getAdminTicket(ticketId)) {
    showToast("That ticket is no longer available in Ticket Management.");
    return;
  }
  state.page = "tickets";
  state.customerTicketDialog = null;
  state.staffTicketDialog = null;
  state.adminTicketDialog = ticketId;
  render();
}

function renderAdminTicketDialog(ticketId) {
  const ticket = getAdminTicket(ticketId);
  if (!ticket) return "";
  const queueOptions = adminQueueOptions.map((queue) => `<option value="${queue}" ${ticket.queue === queue ? "selected" : ""}>${queue}</option>`).join("");
  const assigneeOptions = adminAssigneeOptions.map((assignee) => `<option value="${assignee}" ${ticket.assignee === assignee ? "selected" : ""}>${assignee}</option>`).join("");
  const routeSelection = ticket.queue ? queueOptions : `<option value="" selected disabled>Select a queue</option>${queueOptions}`;
  return `
    <div class="ticket-dialog-backdrop" role="presentation"><section class="ticket-dialog admin-ticket-dialog" role="dialog" aria-modal="true" aria-labelledby="admin-ticket-dialog-title"><header class="ticket-dialog-header"><div><span class="ticket-code">${ticket.id}</span><h2 id="admin-ticket-dialog-title">${escapeHtml(ticket.subject)}</h2></div><button class="dialog-close" type="button" data-action="close-admin-ticket" aria-label="Close ticket details">×</button></header><dl class="ticket-dialog-meta"><div><dt>Customer</dt><dd>${escapeHtml(ticket.customer)}</dd></div><div><dt>Ticket type</dt><dd>${escapeHtml(ticket.type)}</dd></div><div><dt>Model used</dt><dd><span class="status ${ticket.model === "Joint" ? "open" : "draft"}">${ticket.model}</span></dd></div><div><dt>Priority</dt><dd>${ticket.priority ? priority(ticket.priority) : "—"}</dd></div><div><dt>Status</dt><dd>${status(ticket.status[0], ticket.status[1])}</dd></div><div><dt>Current assignee</dt><dd>${escapeHtml(ticket.assignee)}</dd></div></dl><div class="ticket-dialog-body"><section class="admin-ticket-request"><h3>Customer request</h3><p>${escapeHtml(ticket.request)}</p></section><div class="admin-ticket-note"><span aria-hidden="true">↳</span><span><strong>Customer communication is staff-only.</strong> Administrators can adjust the route and assignee, but cannot reply to the customer.</span></div><form id="admin-ticket-management-form" class="admin-ticket-actions" data-ticket-id="${ticket.id}"><div class="form-grid"><div class="form-field"><label for="admin-ticket-queue">Route to</label><select id="admin-ticket-queue" name="admin-ticket-queue" required>${routeSelection}</select></div><div class="form-field"><label for="admin-ticket-assignee">Assign to</label><select id="admin-ticket-assignee" name="admin-ticket-assignee" required>${assigneeOptions}</select></div></div><div class="form-actions"><button class="button signal" type="submit">Save routing and assignment</button><button class="button secondary" type="button" data-action="close-admin-ticket">Cancel</button></div></form></div></section></div>`;
}

function renderAdminTicketManagement() {
  const attentionTickets = getAdminAttentionTickets();
  const attentionRows = renderAdminTicketRows(attentionTickets, true);
  const allRows = renderAdminTicketRows(adminTickets);
  return `
    <div class="page-heading"><div><span class="eyebrow">Administration</span><h1>Ticket management</h1><p>Review ticket details, correct routing, and assign ownership. Customer replies remain with support staff.</p></div></div>
    <section class="admin-ticket-management-note"><span aria-hidden="true">↳</span><span><strong>Admin controls affect ownership and routing only.</strong> Use the ticket dialog to reroute or reassign a ticket; staff handle every customer response.</span></section>
    <section class="panel table-panel admin-ticket-table admin-management-attention"><div class="panel-head"><div><h2>Requires attention</h2><p>Routing failures and tickets that have passed their service deadline.</p></div><span class="performance-total">${attentionTickets.length} tickets</span></div><div class="admin-ticket-table-wrap"><table class="data-table"><thead><tr><th>Reference</th><th>Customer request</th><th>Model</th><th>Queue</th><th>Priority</th><th>Status</th><th>Attention reason</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${attentionRows}</tbody></table></div></section>
    <section class="panel table-panel admin-ticket-table admin-ticket-directory"><div class="panel-head"><div><h2>All tickets</h2><p>Every ticket in the service desk, including reopened and high-priority work.</p></div><span class="performance-total">${adminTickets.length} tickets</span></div><div class="admin-ticket-table-wrap"><table class="data-table"><thead><tr><th>Reference</th><th>Customer request</th><th>Model</th><th>Queue</th><th>Priority</th><th>Status</th><th>Assignee</th><th>Updated</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${allRows}</tbody></table></div></section>
    ${state.adminTicketDialog ? renderAdminTicketDialog(state.adminTicketDialog) : ""}`;
}

function renderAdminActivity() {
  const isAuditHistory = state.adminActivityView === "audit";
  const normalizedQuery = state.auditQuery.trim().toLowerCase();
  const matchingAuditRecords = auditLogRecords.filter((record) => {
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
      <span class="audit-result-count">Showing ${matchingAuditRecords.length} of ${auditLogRecords.length} records</span>
    </form>
    <div class="audit-table-wrap"><table class="data-table audit-table"><thead><tr><th>Timestamp</th><th>Actor</th><th>Type</th><th>Event</th><th>Record</th></tr></thead><tbody>${auditRows}</tbody></table></div>`;
  const activityFeed = `
    <div class="admin-activity-layout">
      <section class="panel"><div class="panel-head"><div><h2>Operational activity</h2><p>High-signal events that may need an administrator's attention.</p></div><span class="performance-total">${adminActivityEvents.length} recent events</span></div><div class="admin-activity-list">${activityItems}</div></section>
    </div>`;
  return `
    <div class="page-heading audit-page-heading"><div><span class="eyebrow">Administration</span><h1>Activity &amp; audit log</h1><p>Review operational signals now, then trace the full history behind each ticket, model, and account change.</p></div><div class="audit-retention"><strong>${auditLogRecords.length}</strong><span>records in this prototype</span></div></div>
    <section class="audit-intro" aria-label="Switch activity and audit views"><button class="audit-intro-choice ${!isAuditHistory ? "active" : ""}" type="button" data-action="set-admin-activity-view" data-view="feed" aria-pressed="${!isAuditHistory}"><span class="eyebrow">Activity feed</span><span>Short, prioritised updates for day-to-day operations.</span></button><button class="audit-intro-choice ${isAuditHistory ? "active" : ""}" type="button" data-action="set-admin-activity-view" data-view="audit" aria-pressed="${isAuditHistory}"><span class="eyebrow">Audit history</span><span>A searchable record of who changed what, and when.</span></button></section>
    <section class="panel audit-workspace"><div class="tabs audit-tabs" role="tablist" aria-label="Activity and audit views"><button class="tab ${!isAuditHistory ? "active" : ""}" type="button" role="tab" aria-selected="${!isAuditHistory}" data-action="set-admin-activity-view" data-view="feed">Activity feed</button><button class="tab ${isAuditHistory ? "active" : ""}" type="button" role="tab" aria-selected="${isAuditHistory}" data-action="set-admin-activity-view" data-view="audit">Audit history</button></div>${isAuditHistory ? auditHistory : activityFeed}</section>`;
}

function renderAdmin() {
  if (state.page === "models") return renderModelCentre();
  if (state.page === "tickets") return renderAdminTicketManagement();
  if (state.page === "activity") return renderAdminActivity();
  if (state.page === "users" || state.page === "queues") {
    const label = state.page.charAt(0).toUpperCase() + state.page.slice(1);
    return `<div class="page-heading"><div><span class="eyebrow">Administration</span><h1>${label}</h1><p>Manage the people and routing structure behind the service desk.</p></div><div class="heading-actions"><button class="button signal" data-action="placeholder">Add ${state.page === "users" ? "staff member" : "record"}</button></div></div><section class="empty-state"><div><strong>${label} workspace</strong><p>This prototype keeps the focus on the ticket and model workflows. In Django, this page will use the matching administration table and filters.</p></div></section>`;
  }
  const metrics = getAdminOverviewMetrics();
  const periodControls = adminOverviewPeriods.map((period) => `<button class="metric-period-button${period.key === metrics.period.key ? " active" : ""}" type="button" data-action="set-admin-overview-period" data-period="${period.key}" aria-pressed="${period.key === metrics.period.key}">${period.key === "day" ? "Day" : period.key === "week" ? "Week" : "Month"}</button>`).join("");
  const overduePeriod = getAdminOverduePeriod();
  const overdueQueueRows = renderAdminOverdueQueueRows(overduePeriod);
  const overdueTotal = Object.values(overduePeriod.counts).reduce((total, count) => total + count, 0);
  const overduePeriodControls = adminOverduePeriods.map((period) => `<button class="metric-period-button${period.key === overduePeriod.key ? " active" : ""}" type="button" data-action="set-admin-overdue-period" data-period="${period.key}" aria-pressed="${period.key === overduePeriod.key}">${period.key === "month" ? "Month" : period.key === "quarter" ? "Quarter" : "Year"}</button>`).join("");
  const activeModel = modelPerformance[state.activeModel];
  const activeQueueF1 = activeModel.queueMetrics.find(([label]) => label === "Macro F1")[1];
  const activePriorityAccuracy = activeModel.priorityMetrics.find(([label]) => label === "Holdout accuracy")[1];
  return `
    <div class="page-heading"><div><span class="eyebrow">Operations command desk</span><h1>Route with evidence, not guesswork.</h1><p>Monitor the live ticket flow and the model decisions shaping each queue.</p></div><div class="heading-actions"><button class="button secondary" data-page="models">Model centre</button><button class="button signal" data-page="tickets">Review tickets</button></div></div>
    <section class="model-banner"><div class="model-token">${activeModel.token}</div><div><strong>${activeModel.name} ${state.activeModel === "joint" ? "is" : "are"} routing new tickets</strong><p>Version ${activeModel.version} · Queue macro F1 ${activeQueueF1} · Priority accuracy ${activePriorityAccuracy}</p></div><div class="model-banner-actions"><span class="live-dot">LIVE</span><button class="button secondary" data-page="models">Manage model</button></div></section>
    <div class="admin-metric-period-bar"><span class="eyebrow">Metric period</span><div class="metric-period-switcher" role="group" aria-label="Select Admin overview metric period">${periodControls}</div></div>
    <section class="metric-grid"><article class="metric-card"><div class="metric-card-header"><span class="eyebrow">Tickets processed</span><span class="metric-period-label">${metrics.period.label}</span></div><strong class="metric-value">${metrics.ticketsProcessed}</strong><span class="metric-footer">Tickets routed in this period</span></article><article class="metric-card"><div class="metric-card-header"><span class="eyebrow">Open backlog</span><span class="metric-period-label">${metrics.period.label}</span></div><strong class="metric-value">${metrics.openBacklog}</strong><span class="metric-footer"><span class="trend warn">${metrics.highPriority}</span> High priority</span></article><article class="metric-card"><div class="metric-card-header"><span class="eyebrow">Route corrections</span><span class="metric-period-label">${metrics.period.label}</span></div><strong class="metric-value">${metrics.routeCorrectionRate.toFixed(1)}%</strong><span class="metric-footer">${metrics.routeCorrections} ticket${metrics.routeCorrections === 1 ? "" : "s"} rerouted</span></article><article class="metric-card"><span class="eyebrow">Routing failures</span><strong class="metric-value">${metrics.routingFailures}</strong><span class="metric-footer"><span class="trend warn">${metrics.overdue}</span> Overdue now</span></article></section>
    <section class="two-column"><article class="panel overdue-queue-panel"><div class="panel-head"><div><h2>SLA breaches by queue</h2><p>Recorded tickets that exceeded their SLA in the selected period.</p></div><div class="overdue-panel-actions"><span class="performance-total">${overdueTotal} total</span><div class="metric-period-switcher" role="group" aria-label="Select SLA breach reporting period">${overduePeriodControls}</div></div></div><div class="panel-body"><div class="bar-list">${overdueQueueRows}</div></div></article><article class="panel"><div class="panel-head"><div><h2>Decision trail</h2><p>Events requiring an administrator’s attention.</p></div><button class="button text" data-page="activity">All activity</button></div><div class="panel-body"><div class="activity-list"><div class="activity-item"><span class="activity-dot signal"></span><div><strong>Three tickets need manual routing</strong><p>Classification failed before a queue could be assigned.</p><time>11:42 TODAY</time></div></div><div class="activity-item"><span class="activity-dot gold"></span><div><strong>Staff corrected a queue prediction</strong><p>TKT-000115 moved from Customer Service to Billing and Payments.</p><time>10:26 TODAY</time></div></div><div class="activity-item"><span class="activity-dot"></span><div><strong>Separate model dashboard updated</strong><p>Seven reviewed tickets were added to its live accuracy sample.</p><time>09:03 TODAY</time></div></div></div></div></article></section>
    ${renderAdminTicketTable()}`;
}

function renderAdminTicketTable() {
  const attentionTickets = getAdminAttentionTickets();
  const rows = renderAdminTicketRows(attentionTickets, true);
  return `<section class="panel table-panel admin-attention-table"><div class="panel-head"><div><h2>Tickets requiring attention</h2><p>Routing failures and tickets that have passed their service deadline.</p></div><button class="button text" data-page="tickets">View all tickets</button></div><table class="data-table"><thead><tr><th>Reference</th><th>Customer request</th><th>Model</th><th>Queue</th><th>Priority</th><th>Status</th><th>Attention reason</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>${rows}</tbody></table></section>`;
}

function renderModelCentre() {
  if (state.modelDashboard) return renderModelDashboard(state.modelDashboard);
  const joint = state.activeModel === "joint";
  const activeModel = modelPerformance[state.activeModel];
  return `
    <div class="page-heading"><div><span class="eyebrow">Model centre</span><h1>Choose the active fixed model.</h1><p>Switch which saved model routes future tickets. Both model artifacts remain unchanged after deployment.</p></div></div>
    <section class="model-compare"><article class="compare-card ${joint ? "selected" : ""}"><span class="eyebrow">${joint ? "Active routing model" : "Fixed model"}</span><h3>Joint model</h3><p>One queue-and-priority prediction with type-aware routing.</p><strong class="compare-stat">79.49% <small>queue F1</small></strong><div class="form-actions"><button class="button ${joint ? "secondary" : "signal"}" data-action="activate-joint"${joint ? " disabled" : ""}>${joint ? "Currently active" : "Use Joint model"}</button><button class="button text" data-action="show-joint">Open dashboard</button></div></article><article class="compare-card ${!joint ? "selected" : ""}"><span class="eyebrow">${!joint ? "Active routing model" : "Fixed model"}</span><h3>Separate models</h3><p>Independent queue and priority pipelines with type-aware routing.</p><strong class="compare-stat">78.90% <small>queue F1</small></strong><div class="form-actions"><button class="button ${!joint ? "secondary" : "signal"}" data-action="activate-separate"${!joint ? " disabled" : ""}>${!joint ? "Currently active" : "Use Separate models"}</button><button class="button text" data-action="show-separate">Open dashboard</button></div></article></section>
    <section class="model-centre-support"><article class="panel deployment-control-panel"><div class="panel-head"><div><h2>Deployment status</h2><p>Choose which fixed model receives new customer submissions.</p></div><span class="live-dot">LIVE</span></div><div class="panel-body"><dl class="deployment-facts"><div><dt>Routing new tickets</dt><dd>${activeModel.name}</dd></div><div><dt>Applies to</dt><dd>Future submissions only</dd></div><div><dt>Existing tickets</dt><dd>Keep their original prediction</dd></div><div><dt>Read-only model versions</dt><dd>Joint and Separate versions are read-only</dd></div></dl><div class="model-inspection-note"><span aria-hidden="true">↳</span><p><strong>Switching affects only new tickets.</strong> Administrators may choose Joint or Separate models, but this system does not retrain models or receive new model versions after go-live.</p></div></div></article><article class="panel model-register-panel"><div class="panel-head"><div><h2>Evidence register</h2><p>Evaluation records stay separate for a fair comparison.</p></div></div><div class="model-register-row model-register-head"><span>Model</span><span>Version</span><span>Reviewed</span><span>Status</span></div><div class="model-register-row"><strong>Joint</strong><span>2026.08.19</span><span>361 tickets</span><span class="register-status ${joint ? "active" : ""}">${joint ? "Active" : "Fixed"}</span></div><div class="model-register-row"><strong>Separate</strong><span>2026.08.18</span><span>214 tickets</span><span class="register-status ${!joint ? "active" : ""}">${!joint ? "Active" : "Fixed"}</span></div><div class="panel-footnote">Only staff-confirmed queue and priority outcomes are included in live evaluation.</div></article></section>`;
}

function renderModelMetricRows(metrics) {
  return metrics.map(([label, value]) => `<div class="model-metric-row"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function renderModelDashboard(modelKey) {
  const model = modelPerformance[modelKey];
  const isActive = state.activeModel === modelKey;
  const operationalPeriod = model.operationalPeriods[state.modelOperationalPeriod] || model.operationalPeriods.month;
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
    <div class="page-heading model-dashboard-heading"><div><span class="eyebrow">Model centre / Performance dashboard</span><h1>${model.name}</h1><p>${model.description}</p></div><div class="model-dashboard-identity"><span class="model-token">${model.token}</span><div><span class="${isActive ? "live-dot" : "availability-label"}">${isActive ? "Routing new tickets" : "Fixed model"}</span><small>Version ${model.version}</small></div></div></div>
    <section class="metric-grid model-dashboard-metrics"><article class="metric-card"><span class="eyebrow">Processed by model</span><strong class="metric-value">${model.processed}</strong><span class="metric-footer">Tickets retain their model version</span></article><article class="metric-card"><span class="eyebrow">Reviewed outcomes</span><strong class="metric-value">${model.reviewed}</strong><span class="metric-footer">Staff-confirmed evaluation sample</span></article><article class="metric-card"><span class="eyebrow">Live queue accuracy</span><strong class="metric-value">${model.queueAccuracy}</strong><span class="metric-footer">Confirmed queue outcomes</span></article><article class="metric-card"><span class="eyebrow">Live priority accuracy</span><strong class="metric-value">${model.priorityAccuracy}</strong><span class="metric-footer">Confirmed priority outcomes</span></article></section>
    <section class="model-evaluation-grid"><article class="panel model-evaluation-panel"><div class="panel-head"><div><span class="eyebrow">Routing task</span><h2>Queue prediction</h2><p>Evaluation metrics for assigning the support queue.</p></div></div><div class="model-metric-list">${renderModelMetricRows(model.queueMetrics)}</div></article><article class="panel model-evaluation-panel"><div class="panel-head"><div><span class="eyebrow">Urgency task</span><h2>Priority prediction</h2><p>Evaluation metrics for low, medium, and high priority.</p></div></div><div class="model-metric-list">${renderModelMetricRows(model.priorityMetrics)}</div></article></section>
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
    if (state.page === "new-ticket") state.activeDraftId = null;
    if (state.page !== "tickets") {
      state.customerTicketDialog = null;
      state.adminTicketDialog = null;
    }
    if (state.page === "tickets" && state.role === "admin") state.adminTicketDialog = null;
    if (state.page !== "assigned") state.staffTicketDialog = null;
    render();
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
  if (action === "view-staff-ticket") {
    openStaffTicket(event.target.closest("[data-ticket-id]").dataset.ticketId);
    return;
  }
  if (action === "review-closed-staff-ticket") {
    openClosedStaffTicket(event.target.closest("[data-ticket-id]").dataset.ticketId);
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
    state.customerResolutionDates.set(ticketId, PROTOTYPE_TODAY.toISOString());
    render();
    showToast(`${ticketId} will close automatically after three days unless reopened.`);
    return;
  }
  if (action === "reopen-customer-ticket") {
    const ticketId = event.target.closest("[data-ticket-id]").dataset.ticketId;
    state.pendingClosureTicketIds.delete(ticketId);
    state.customerResolutionDates.delete(ticketId);
    render();
    showToast(`${ticketId} was reopened and returned to the support team.`);
    return;
  }
  if (action === "close-customer-ticket") {
    state.customerTicketDialog = null;
    render();
    return;
  }
  if (action === "close-staff-ticket") {
    state.staffTicketDialog = null;
    render();
    return;
  }
  if (action === "manage-admin-ticket") {
    openAdminTicket(event.target.closest("[data-ticket-id]").dataset.ticketId);
    return;
  }
  if (action === "close-admin-ticket") {
    state.adminTicketDialog = null;
    render();
    return;
  }
  if (action === "set-admin-activity-view") {
    state.adminActivityView = event.target.closest("[data-view]").dataset.view;
    render();
    return;
  }
  if (action === "set-admin-overview-period") {
    state.adminOverviewPeriod = event.target.closest("[data-period]").dataset.period;
    render();
    return;
  }
  if (action === "set-admin-overdue-period") {
    state.adminOverduePeriod = event.target.closest("[data-period]").dataset.period;
    render();
    return;
  }
  if (action === "clear-audit-filters") {
    state.auditQuery = "";
    state.auditCategory = "all";
    render();
    return;
  }
  if (action === "clear-audit-search") {
    state.auditQuery = "";
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
  if (action === "set-staff-performance-period") {
    state.staffPerformancePeriod = event.target.closest("[data-period]").dataset.period;
    state.closedTicketsPage = 1;
    render();
    return;
  }
  if (action === "previous-closed-tickets") {
    state.closedTicketsPage = Math.max(1, state.closedTicketsPage - 1);
    render();
    return;
  }
  if (action === "next-closed-tickets") {
    const closedTicketPageCount = Math.max(1, Math.ceil(getClosedStaffTickets().length / CLOSED_TICKETS_PAGE_SIZE));
    state.closedTicketsPage = Math.min(closedTicketPageCount, state.closedTicketsPage + 1);
    render();
    return;
  }
  if (action === "toggle-ticket-pool-filters") {
    state.ticketPoolFiltersOpen = !state.ticketPoolFiltersOpen;
    render();
    return;
  }
  if (action === "clear-ticket-pool-filters") {
    state.ticketPoolFilters = { priority: "all", type: "all" };
    render();
    return;
  }
  if (action === "toggle-my-tickets-filters") {
    state.myTicketsFiltersOpen = !state.myTicketsFiltersOpen;
    render();
    return;
  }
  if (action === "clear-my-tickets-filters") {
    state.myTicketsFilters = { priority: "all", status: "all" };
    render();
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
    render();
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
    render();
    return;
  }
  if (action === "claim") {
    const ticketId = event.target.closest("[data-ticket-id]").dataset.ticketId;
    state.claimedTicketAssignments.set(ticketId, getActiveProfile().id);
    render();
    showToast(`${ticketId} was claimed and moved to My tickets.`);
    return;
  }
  if (action === "filter") { showToast("Filters will apply to the ticket queryset in Django."); return; }
  if (action === "placeholder") { showToast("This management table will be connected during Django implementation."); return; }
  if (action === "activate-joint") { state.activeModel = "joint"; render(); showToast("Joint model will route future ticket submissions."); return; }
  if (action === "activate-separate") { state.activeModel = "separate"; render(); showToast("Separate models will route future ticket submissions."); return; }
  if (action === "show-joint") { state.modelDashboard = "joint"; render(); return; }
  if (action === "show-separate") { state.modelDashboard = "separate"; render(); return; }
  if (action === "back-model-centre") { state.modelDashboard = null; render(); return; }
  if (action === "set-model-operational-period") {
    state.modelOperationalPeriod = event.target.closest("[data-period]").dataset.period;
    render();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.adminTicketDialog) {
    state.adminTicketDialog = null;
    render();
    return;
  }
  if (event.key === "Escape" && state.staffTicketDialog) {
    state.staffTicketDialog = null;
    render();
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
  if (event.target.id !== "new-password") return;
  updatePasswordRequirementState(event.target.value);
  const error = document.querySelector("#password-form-error");
  if (!error || error.hidden) return;
  const message = passwordRequirementError(event.target.value);
  error.textContent = message;
  error.hidden = !message;
});

document.addEventListener("change", (event) => {
  if (event.target.dataset.auditCategory !== undefined) {
    state.auditCategory = event.target.value;
    render();
    return;
  }
  const ticketPoolFilterName = event.target.dataset.ticketPoolFilter;
  if (ticketPoolFilterName) {
    state.ticketPoolFilters[ticketPoolFilterName] = event.target.value;
    render();
    return;
  }
  const myTicketsFilterName = event.target.dataset.myTicketsFilter;
  if (!myTicketsFilterName) return;
  state.myTicketsFilters[myTicketsFilterName] = event.target.value;
  render();
});

document.addEventListener("input", (event) => {
  if (event.target.id !== "audit-query") return;
  const clearButton = event.target.closest(".audit-search-input")?.querySelector(".audit-search-clear");
  if (clearButton) clearButton.disabled = !event.target.value;
});

document.addEventListener("submit", (event) => {
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
    if (!nextQueue) {
      showToast("Select a queue before saving this ticket.");
      return;
    }
    const routeChanged = ticket.routingFailed || ticket.queue !== nextQueue;
    ticket.queue = nextQueue;
    ticket.assignee = nextAssignee;
    ticket.routingFailed = false;
    if (routeChanged) ticket.routeCorrected = true;
    state.adminTicketDialog = null;
    render();
    showToast(`${ticket.id} was routed to ${nextQueue} and assigned to ${nextAssignee}.`);
    return;
  }
  if (event.target.id === "audit-search-form") {
    event.preventDefault();
    state.auditQuery = String(new FormData(event.target).get("audit-query") || "").trim();
    render();
    return;
  }
  if (event.target.id === "profile-form") {
    event.preventDefault();
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
  if (event.target.id === "staff-reply-form") {
    event.preventDefault();
    const ticket = getStaffTicket(state.staffTicketDialog);
    state.staffTicketDialog = null;
    render();
    showToast(`Reply sent to ${ticket?.createdBy || "the customer"}.`);
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
