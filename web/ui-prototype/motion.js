(function () {
  "use strict";

  const gsap = window.gsap;
  let pageTimeline;
  let dialogTimeline;
  let popoverTimeline;
  let toastTimeline;
  let loginTimeline;
  let customerFormTimeline;
  let customerPageTimeline;
  let dialogExiting = false;

  function prefersReducedMotion() {
    return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
  }

  function showImmediately(elements) {
    if (!gsap || !elements?.length) return;
    gsap.set(elements, {
      autoAlpha: 1,
      x: 0,
      y: 0,
      scale: 1,
      clearProps: "opacity,visibility,transform",
    });
  }

  function markAnimating(elements, active) {
    elements?.forEach((element) => element.classList.toggle("motion-running", active));
  }

  function animateCustomerRequestForm(requestPage, options = {}) {
    if (!gsap || !requestPage) return;
    customerFormTimeline?.kill();
    customerFormTimeline = null;

    const form = requestPage.querySelector(".customer-request-card");
    if (!form) return;

    const stepItems = form.querySelectorAll(".customer-request-step");
    const bodyItems = form.querySelectorAll(
      ".customer-request-body > .customer-request-copy, "
      + ".customer-request-body > .customer-request-selection, "
      + ".customer-request-body > .customer-request-fields, "
      + ".customer-request-body > .customer-request-review, "
      + ".customer-request-body > .customer-request-notice, "
      + ".customer-request-body > .customer-request-actions",
    );
    const typeCards = form.querySelectorAll(".customer-request-type");
    const targets = [form, ...stepItems, ...bodyItems, ...typeCards];

    if (options.skip || prefersReducedMotion()) {
      showImmediately(targets);
      markAnimating(targets, false);
      return;
    }

    markAnimating(targets, true);
    customerFormTimeline = gsap.timeline({ defaults: { ease: "power3.out" } });
    customerFormTimeline.eventCallback("onComplete", () => {
      showImmediately(targets);
      markAnimating(targets, false);
      customerFormTimeline = null;
    });
    if (stepItems.length) {
      customerFormTimeline.fromTo(
        stepItems,
        { autoAlpha: 0, y: -4 },
        { autoAlpha: 1, y: 0, duration: 0.18, stagger: 0.035, clearProps: "opacity,visibility,transform" },
      );
    }
    if (bodyItems.length) {
      customerFormTimeline.fromTo(
        bodyItems,
        { autoAlpha: 0, y: 7 },
        { autoAlpha: 1, y: 0, duration: 0.22, stagger: 0.04, clearProps: "opacity,visibility,transform" },
        stepItems.length ? "<0.07" : 0,
      );
    }
    if (typeCards.length) {
      customerFormTimeline.fromTo(
        typeCards,
        { autoAlpha: 0, y: 6 },
        { autoAlpha: 1, y: 0, duration: 0.2, stagger: 0.04, clearProps: "opacity,visibility,transform" },
        "<0.08",
      );
    }
  }

  function animateCustomerPage(root, customerPage, options = {}) {
    if (!gsap || !root || !customerPage) return;
    customerPageTimeline?.kill();
    customerPageTimeline = null;

    const sections = Array.from(customerPage.children).filter((element) => !element.hidden);
    const rows = customerPage.querySelectorAll(".customer-ticket-row");
    const targets = [...sections, ...rows];
    const isHome = customerPage.classList.contains("customer-home");
    const direction = isHome ? -1 : 1;

    if (options.skip || prefersReducedMotion()) {
      showImmediately(targets);
      markAnimating(targets, false);
      root.classList.remove("motion-running");
      return;
    }

    root.classList.add("motion-running");
    markAnimating(targets, true);
    customerPageTimeline = gsap.timeline({ defaults: { ease: "power3.out" } });
    customerPageTimeline.eventCallback("onComplete", () => {
      showImmediately(targets);
      markAnimating(targets, false);
      root.classList.remove("motion-running");
      customerPageTimeline = null;
    });
    if (sections.length) {
      customerPageTimeline.fromTo(
        sections,
        { autoAlpha: 0, x: direction * 12, y: 7 },
        { autoAlpha: 1, x: 0, y: 0, duration: 0.34, stagger: 0.07, clearProps: "opacity,visibility,transform" },
      );
    }
    if (rows.length) {
      customerPageTimeline.fromTo(
        rows,
        { autoAlpha: 0, y: 5 },
        { autoAlpha: 1, y: 0, duration: 0.2, stagger: 0.035, clearProps: "opacity,visibility,transform" },
        "<0.14",
      );
    }
  }

  function animatePage(root, options = {}) {
    if (!gsap || !root) return;
    pageTimeline?.kill();
    customerPageTimeline?.kill();
    customerPageTimeline = null;
    customerFormTimeline?.kill();
    customerFormTimeline = null;

    const customerPage = Array.from(root.children).find((element) => (
      element.matches(".customer-home, .customer-my-tickets-page, .customer-request-page") && !element.hidden
    ));
    const sections = customerPage
      ? Array.from(customerPage.children).filter((element) => !element.hidden)
      : Array.from(root.children).filter((element) => (
        !element.matches(".ticket-dialog-backdrop") && !element.hidden
      ));
    const isCustomerHomeOrTickets = customerPage?.matches(".customer-home, .customer-my-tickets-page");
    const isCustomerRequest = customerPage?.classList.contains("customer-request-page");

    // Home and My requests use a short, directional entrance so the destination
    // is clear without animating the surrounding shell or top navigation.
    if (isCustomerHomeOrTickets) {
      animateCustomerPage(root, customerPage, options);
      return;
    }

    // Keep the request page frame, heading, and guidance card fixed. Animate
    // only the fields inside the form when the step changes.
    if (isCustomerRequest) {
      showImmediately(sections);
      root.classList.remove("motion-running");
      animateCustomerRequestForm(customerPage, options);
      return;
    }

    if (!sections.length || options.skip || prefersReducedMotion()) {
      showImmediately(sections);
      root.classList.remove("motion-running");
      return;
    }

    root.classList.add("motion-running");
    pageTimeline = gsap.timeline({
      defaults: { duration: 0.38, ease: "power3.out" },
      onComplete: () => {
        showImmediately(sections);
        root.classList.remove("motion-running");
      },
    });
    pageTimeline.fromTo(
      sections,
      { autoAlpha: 0, y: 14 },
      { autoAlpha: 1, x: 0, y: 0, stagger: 0.045, clearProps: "opacity,visibility,transform" },
    );

    const metricValues = root.querySelectorAll(".metric-value, .compare-stat, .queue-count strong, .performance-total");
    if (metricValues.length) {
      pageTimeline.fromTo(
        metricValues,
        { autoAlpha: 0, y: 7 },
        { autoAlpha: 1, y: 0, duration: 0.26, stagger: 0.028, clearProps: "opacity,visibility,transform" },
        "<0.16",
      );
    }
  }

  function animateDialog(root) {
    if (!gsap || !root) return;
    dialogTimeline?.kill();
    dialogTimeline = null;
    dialogExiting = false;

    const backdrop = root.querySelector(".ticket-dialog-backdrop");
    const dialog = root.querySelector(".ticket-dialog");
    if (!backdrop || !dialog) return;

    const messages = dialog.querySelectorAll(".conversation-message, .admin-ticket-note, .staff-reroute-control, .reply-form, .admin-ticket-actions");
    if (prefersReducedMotion()) {
      showImmediately([backdrop, dialog, ...messages]);
      markAnimating([backdrop, dialog, ...messages], false);
      return;
    }

    markAnimating([backdrop, dialog, ...messages], true);
    dialogTimeline = gsap.timeline({ defaults: { ease: "power3.out" } });
    dialogTimeline.eventCallback("onComplete", () => {
      markAnimating([backdrop, dialog, ...messages], false);
      dialogTimeline = null;
    });
    dialogTimeline.fromTo(backdrop, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.16 });
    dialogTimeline.fromTo(
      dialog,
      { autoAlpha: 0, y: 10, scale: 0.995, transformOrigin: "50% 12%" },
      { autoAlpha: 1, y: 0, scale: 1, duration: 0.24 },
      "<0.02",
    );
    if (messages.length) {
      dialogTimeline.fromTo(
        messages,
        { autoAlpha: 0, y: 5 },
        { autoAlpha: 1, y: 0, duration: 0.16, stagger: 0.018, clearProps: "opacity,visibility,transform" },
        "<0.05",
      );
    }
  }

  function animateDialogExit(root, onComplete) {
    if (!gsap || !root) {
      onComplete?.();
      return;
    }

    const backdrop = root.querySelector(".ticket-dialog-backdrop");
    const dialog = root.querySelector(".ticket-dialog");
    if (!backdrop || !dialog || prefersReducedMotion()) {
      dialogTimeline?.kill();
      dialogTimeline = null;
      dialogExiting = false;
      onComplete?.();
      return;
    }

    if (dialogExiting) return;
    dialogExiting = true;
    dialogTimeline?.kill();
    const messages = dialog.querySelectorAll(".conversation-message, .admin-ticket-note, .staff-reroute-control, .reply-form, .admin-ticket-actions");
    markAnimating([backdrop, dialog, ...messages], true);
    dialogTimeline = gsap.timeline({ defaults: { ease: "power2.in" } });
    dialogTimeline.eventCallback("onComplete", () => {
      markAnimating([backdrop, dialog, ...messages], false);
      dialogTimeline = null;
      dialogExiting = false;
      onComplete?.();
    });
    dialogTimeline.to(dialog, { autoAlpha: 0, y: 8, scale: 0.995, duration: 0.16 });
    dialogTimeline.to(backdrop, { autoAlpha: 0, duration: 0.14 }, "<0.03");
  }

  function animateCustomerChoice(root) {
    if (!gsap || !root || prefersReducedMotion()) return;
    const selected = root.querySelector(".customer-request-type.is-selected");
    if (!selected) return;
    const check = selected.querySelector(".customer-request-type-check");
    gsap.fromTo(
      selected,
      { y: 4, scale: 0.985 },
      { y: 0, scale: 1, duration: 0.22, ease: "power2.out", clearProps: "transform" },
    );
    if (check) {
      gsap.fromTo(
        check,
        { scale: 0.7, autoAlpha: 0.35 },
        { scale: 1, autoAlpha: 1, duration: 0.2, ease: "back.out(1.7)", clearProps: "transform,opacity,visibility" },
      );
    }
  }

  function animateAccountMenu(menu, open) {
    if (!gsap || !menu || !open) return;
    popoverTimeline?.kill();
    if (prefersReducedMotion()) {
      showImmediately([menu]);
      markAnimating([menu], false);
      return;
    }

    const items = menu.querySelectorAll(".account-popover-profile, .account-menu-item, .account-menu-divider");
    markAnimating([menu, ...items], true);
    popoverTimeline = gsap.timeline({ defaults: { ease: "power2.out" } });
    popoverTimeline.eventCallback("onComplete", () => markAnimating([menu, ...items], false));
    popoverTimeline.fromTo(menu, { autoAlpha: 0, y: 8, scale: 0.98, transformOrigin: "right bottom" }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.24 });
    if (items.length) {
      popoverTimeline.fromTo(items, { autoAlpha: 0, y: 4 }, { autoAlpha: 1, y: 0, duration: 0.18, stagger: 0.025, clearProps: "opacity,visibility,transform" }, "<0.08");
    }
  }

  function enterLogin(screen) {
    if (!gsap || !screen) return;
    loginTimeline?.kill();
    const frame = screen.querySelector(".login-frame");
    const routeItems = screen.querySelectorAll(".login-route li");
    if (prefersReducedMotion()) {
      showImmediately([screen, frame, ...routeItems]);
      markAnimating([screen, frame, ...routeItems], false);
      return;
    }

    markAnimating([screen, frame, ...routeItems], true);
    loginTimeline = gsap.timeline({ defaults: { ease: "power3.out" } });
    loginTimeline.eventCallback("onComplete", () => markAnimating([screen, frame, ...routeItems], false));
    loginTimeline.fromTo(frame, { autoAlpha: 0, y: 18, scale: 0.985 }, { autoAlpha: 1, y: 0, scale: 1, duration: 0.46 });
    if (routeItems.length) {
      loginTimeline.fromTo(routeItems, { autoAlpha: 0, x: -10 }, { autoAlpha: 1, x: 0, duration: 0.24, stagger: 0.055, clearProps: "opacity,visibility,transform" }, "<0.18");
    }
  }

  function leaveLogin(screen, onComplete) {
    if (!gsap || !screen || prefersReducedMotion()) {
      onComplete?.();
      return;
    }
    loginTimeline?.kill();
    loginTimeline = gsap.to(screen, {
      autoAlpha: 0,
      y: -10,
      duration: 0.2,
      ease: "power2.in",
      onComplete: () => {
        gsap.set(screen, { clearProps: "opacity,visibility,transform" });
        markAnimating([screen], false);
        onComplete?.();
      },
    });
    markAnimating([screen], true);
  }

  function enterToast(toast) {
    if (!gsap || !toast || prefersReducedMotion()) return;
    toastTimeline?.kill();
    markAnimating([toast], true);
    toastTimeline = gsap.fromTo(toast, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.24, ease: "power2.out" });
  }

  function leaveToast(toast) {
    if (!gsap || !toast || prefersReducedMotion()) return;
    toastTimeline?.kill();
    toastTimeline = gsap.to(toast, { autoAlpha: 0, y: 8, duration: 0.16, ease: "power2.in", onComplete: () => markAnimating([toast], false) });
  }

  function bindPressFeedback() {
    document.addEventListener("pointerdown", (event) => {
      if (!gsap || prefersReducedMotion()) return;
      const target = event.target.closest("button, [role=button]");
      if (!target || target.disabled || target.getAttribute("aria-disabled") === "true") return;
      gsap.to(target, { scale: 0.985, duration: 0.08, ease: "power2.out", overwrite: "auto" });
      gsap.to(target, { scale: 1, duration: 0.2, delay: 0.08, ease: "power2.out", overwrite: "auto" });
    }, { passive: true });
  }

  window.ticketMotion = {
    animatePage,
    animateCustomerChoice,
    animateDialog,
    animateDialogExit,
    animateAccountMenu,
    enterLogin,
    leaveLogin,
    enterToast,
    leaveToast,
  };

  bindPressFeedback();
}());
