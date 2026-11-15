/* Tally Music page script. Settings live only in this browser. Without JavaScript every page still reads and every link works. */
(function () {
  "use strict";
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private window: settings just won't stick */ } }

  var pref = get("tm.platform") || "";
  var hideCovers = get("tm.hideCovers") === "1";
  if (hideCovers) document.body.setAttribute("data-covers", "0");

  // preferred platform first and highlighted
  document.querySelectorAll(".ls").forEach(function (box) {
    if (!pref) return;
    var links = Array.prototype.slice.call(box.querySelectorAll("a[data-p]"));
    links.forEach(function (a) { if (a.dataset.p === pref) { a.classList.add("pref"); box.insertBefore(a, box.firstChild); } });
  });

  // official players load only when asked
  document.addEventListener("click", function (ev) {
    var b = ev.target.closest && ev.target.closest(".load-embed");
    if (!b) return;
    var f = document.createElement("iframe");
    f.src = b.dataset.src; f.height = b.dataset.h; f.loading = "lazy";
    f.allow = "autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture";
    f.referrerPolicy = "strict-origin-when-cross-origin";
    f.title = "Player";
    b.parentNode.querySelector(".embed-slot").appendChild(f);
    b.remove();
  });

  // feed tools: search, unseen only, mark all seen. "Seen" is remembered only in this browser.
  var tools = document.querySelector(".tools");
  if (tools) {
    var cards = Array.prototype.slice.call(document.querySelectorAll("article[data-seen-key]"));
    var seen = {};
    try { seen = JSON.parse(get("tm.seen") || "{}"); } catch (e) { seen = {}; }
    var q = document.getElementById("q"), un = document.getElementById("unseen"), count = document.getElementById("tally-count");
    var none = document.getElementById("none-left");
    un.checked = get("tm.unseenOnly") === "1";
    function apply() {
      var term = q.value.trim().toLowerCase(), shown = 0;
      cards.forEach(function (c) {
        var isSeen = !!seen[c.dataset.seenKey];
        c.classList.toggle("seen", isSeen);
        var hit = !term || c.textContent.toLowerCase().indexOf(term) !== -1;
        var show = hit && !(un.checked && isSeen);
        c.hidden = !show; if (show) shown++;
      });
      document.querySelectorAll("section").forEach(function (sec) {
        if (sec.querySelector("article[data-seen-key]")) sec.hidden = !sec.querySelector("article[data-seen-key]:not([hidden])");
      });
      count.textContent = shown + " of " + cards.length + " shown";
      none.hidden = shown > 0;
    }
    q.addEventListener("input", apply);
    un.addEventListener("change", function () { set("tm.unseenOnly", un.checked ? "1" : "0"); apply(); });
    document.getElementById("markseen").addEventListener("click", function () {
      var now = Date.now();
      cards.forEach(function (c) { seen[c.dataset.seenKey] = now; });
      var keys = Object.keys(seen);
      if (keys.length > 3000) keys.sort(function (a, b) { return seen[a] - seen[b]; }).slice(0, keys.length - 3000).forEach(function (k) { delete seen[k]; });
      set("tm.seen", JSON.stringify(seen)); apply();
    });
    tools.hidden = false; apply();
  }

  // settings page
  if (document.body.dataset.page === "settings.html") {
    document.querySelectorAll('input[name="platform"]').forEach(function (r) {
      r.checked = r.value === pref;
      r.addEventListener("change", function () { set("tm.platform", r.value); });
    });
    var hc = document.getElementById("hide-covers");
    if (hc) { hc.checked = hideCovers; hc.addEventListener("change", function () { set("tm.hideCovers", hc.checked ? "1" : "0"); }); }
  }

  // workbench: only present when the page is served by ./workbench.sh on this computer
  var tokenMeta = document.querySelector('meta[name="workbench-token"]');
  if (!tokenMeta) return;
  var token = tokenMeta.content;
  function api(path, body) {
    return fetch(path, { method: body ? "POST" : "GET", headers: { "X-Workbench-Token": token, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }
  api("api/stations").then(function (j) {
    if (!j.stations.length) return;
    document.querySelectorAll("article[data-id], article[data-url]").forEach(function (card) {
      var box = card.querySelector(".save");
      if (!box) return;
      if (card.classList.contains("post") && !card.dataset.url) return;
      var sel = document.createElement("select");
      sel.setAttribute("aria-label", "Station");
      j.stations.forEach(function (s) { var o = document.createElement("option"); o.value = s.slug; o.textContent = s.title; sel.appendChild(o); });
      var btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Save to station";
      var msg = document.createElement("span"); msg.className = "done";
      btn.addEventListener("click", function () {
        var body = { station: sel.value };
        if (card.dataset.id) body.ref = card.dataset.id;
        else { body.ref = card.dataset.url; body.title = card.dataset.title; }
        btn.disabled = true;
        api("api/station/add", body).then(function () { msg.textContent = "Saved"; }).catch(function (e) { msg.textContent = e.message; btn.disabled = false; });
      });
      box.append(sel, btn, msg); box.hidden = false;
    });
  }).catch(function () { /* not served by the workbench */ });
})();
