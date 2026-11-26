/* form.js: the Form block (cms/widgets/contact_form.py). Checks the boxes in the browser (the server checks again),
   sends in the background (files too), then shows the thank-you message or goes to the chosen page. */
(function () {
  "use strict";
  function fieldOf(el) { return el.closest(".tw-field"); }
  function clearErrors(form) {
    form.querySelectorAll(".tw-invalid").forEach(function (f) { f.classList.remove("tw-invalid"); });
    form.querySelectorAll(".tw-err").forEach(function (e) { e.remove(); });
    var top = form.querySelector(".tw-form-error"); top.hidden = true; top.textContent = "";
  }
  function mark(el, text) {
    var f = fieldOf(el) || el;
    f.classList.add("tw-invalid");
    var e = document.createElement("small"); e.className = "tw-err"; e.textContent = text;
    f.appendChild(e);
    if (el.setAttribute) el.setAttribute("aria-invalid", "true");
  }
  function check(form) {
    var first = null;
    form.querySelectorAll("input, select, textarea").forEach(function (el) {
      if (el.type === "hidden" || el.name === "_hp" || el.closest(".hp")) return;
      var msg = "";
      if (el.type === "file" && el.files && el.files[0]) {
        var max = (+el.dataset.maxMb || 5) * 1024 * 1024;
        if (el.files[0].size > max) msg = "That file is larger than " + el.dataset.maxMb + " MB.";
      }
      if (!msg && el.type === "radio") {
        if (el.required && !form.querySelector('input[name="' + el.name + '"]:checked')) msg = "Please choose one.";
      } else if (!msg && !el.checkValidity()) {
        msg = el.validity.valueMissing ? (el.type === "checkbox" ? "Please tick this box." : "Please fill this in.") :
              el.validity.typeMismatch ? (el.type === "email" ? "Please check the email address." : "Please check this.") : el.validationMessage;
      }
      if (msg && !(fieldOf(el) || el).classList.contains("tw-invalid")) { mark(el, msg); first = first || el; }
    });
    form.querySelectorAll("fieldset[data-required]").forEach(function (fs) {
      if (!fs.querySelector("input:checked")) { mark(fs.querySelector("input"), "Please tick at least one."); first = first || fs.querySelector("input"); }
    });
    if (first) first.focus();
    return !first;
  }
  document.querySelectorAll("form.tw-form").forEach(function (form) {
    if (/^mailto:/.test(form.getAttribute("action") || "")) return;   // an exported site: the email app opens
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      clearErrors(form);
      if (!check(form)) return;
      var note = form.querySelector(".tw-form-note"), top = form.querySelector(".tw-form-error"), button = form.querySelector(".tw-submit");
      if (form.dataset.preview) { note.textContent = "Preview: the form works once the site is published. " + (form.dataset.success || ""); return; }
      button.disabled = true;
      fetch(form.action, { method: "POST", body: new FormData(form), headers: { Accept: "application/json" } })
        .then(function (r) { return r.json().catch(function () { return { ok: r.ok }; }).then(function (j) { j.status = r.status; return j; }); })
        .then(function (j) {
          if (!j.ok) {
            var el = j.field && form.querySelector('[name="' + j.field + '"]');
            if (el) { mark(el, j.error); el.focus(); }
            top.textContent = j.error || (j.status === 429 ? "Too many messages from here. Please try again later." : "Sorry, that didn't send. Please call or email us instead.");
            top.hidden = false; return;
          }
          if (form.dataset.redirect) { location.href = form.dataset.redirect; return; }
          form.reset(); form.classList.add("tw-sent");
          note.textContent = form.dataset.success || "Thank you! Your message is on its way.";
          note.setAttribute("tabindex", "-1"); note.focus();
        })
        .catch(function () { top.textContent = "Sorry, that didn't send. Please check your connection and try again."; top.hidden = false; })
        .then(function () { button.disabled = false; });
    });
  });
})();
