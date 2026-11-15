/* Manage page: edit tunings and sources. Works only when served by ./workbench.sh on this computer. */
(function () {
  "use strict";
  var root = document.getElementById("manage");
  var tokenMeta = document.querySelector('meta[name="workbench-token"]');
  if (!root || !tokenMeta) return;
  var token = tokenMeta.content;

  function api(path, body) {
    return fetch(path, { method: body ? "POST" : "GET", headers: { "X-Workbench-Token": token, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok) throw new Error(j.error || r.status); return j; }); });
  }
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { if (k === "text") n.textContent = attrs[k]; else if (k === "class") n.className = attrs[k]; else n.setAttribute(k, attrs[k]); });
    (kids || []).forEach(function (c) { n.appendChild(c); });
    return n;
  }
  function btn(label, fn, cls) { var b = el("button", { type: "button", text: label, "class": cls || "" }); b.addEventListener("click", fn); return b; }
  var note = el("p", { "class": "flash", role: "status" });
  function say(m, bad) { note.textContent = m; note.className = "flash" + (bad ? " bad" : ""); }
  function act(path, body, msg) { return api(path, body).then(function () { say(msg || "Saved. Applies on the next build."); load(); }).catch(function (e) { say(e.message, true); }); }
  function debounce(fn, ms) { var t; return function () { var a = arguments; clearTimeout(t); t = setTimeout(function () { fn.apply(null, a); }, ms); }; }

  function picker(placeholder, endpoint, key, render) {
    var input = el("input", { type: "search", placeholder: placeholder, "aria-label": placeholder, autocomplete: "off" });
    var list = el("ul", { "class": "hits" });
    input.addEventListener("input", debounce(function () {
      var q = input.value.trim();
      list.textContent = "";
      if (q.length < 2) return;
      api(endpoint + "?q=" + encodeURIComponent(q)).then(function (j) {
        list.textContent = "";
        (j[key] || []).forEach(function (h) { list.appendChild(render(h, function () { input.value = ""; list.textContent = ""; })); });
        if (!list.children.length) list.appendChild(el("li", { "class": "muted", text: "No match." }));
      }).catch(function (e) { say(e.message, true); });
    }, 350));
    return el("div", { "class": "picker" }, [input, list]);
  }


  // ---------- jumpstart: import artists from your own listening ----------
  function readFile(f) {
    return new Promise(function (res, rej) {
      if (f.size > 60 * 1024 * 1024) return rej(new Error(f.name + " is over 60 MB. Upload just the streaming-history or library files."));
      var r = new FileReader();
      r.onload = function () { res(String(r.result).split(",")[1] || ""); };
      r.onerror = function () { rej(new Error("Could not read " + f.name)); };
      r.readAsDataURL(f);
    });
  }

  function importPanel(t) {
    var followed = {};
    t.artists.forEach(function (a) { if (a.mbid) followed[a.mbid] = true; });
    var det = el("details", { "class": "import" }, [el("summary", { text: "Jump-start from your listening (import artists)" })]);
    var body = el("div", { "class": "import-body" });
    det.appendChild(body);
    body.appendChild(el("p", { "class": "muted", text: "Skip typing artists one by one. Use a file you downloaded from a streaming platform, a list of names, or a ListenBrainz profile. Your file is read here on your computer and is not saved or uploaded. Only each artist's name is sent to MusicBrainz so it can be matched." }));

    var howto = el("details", { "class": "howto" }, [el("summary", { text: "Where do I get my file?" })]);
    var hint = el("div", { "class": "muted" });
    hint.innerHTML = '<p><b>Spotify:</b> Account &rarr; Privacy settings &rarr; <a href="https://www.spotify.com/account/privacy/" rel="noopener noreferrer" target="_blank">Download your data</a>. "Extended streaming history" is the most complete but can take weeks; the basic account data arrives in days. Upload the .zip as it is.</p>' +
      '<p><b>Apple Music:</b> <a href="https://privacy.apple.com" rel="noopener noreferrer" target="_blank">privacy.apple.com</a> &rarr; Request a copy of your data &rarr; Apple Media Services information. Upload the .zip, or the play-activity .csv inside it.</p>' +
      '<p><b>TIDAL:</b> I could not confirm a self-serve export. Paste a list of artists instead, or send your listens to ListenBrainz.</p>' +
      '<p><b>Anything else</b> (Bandcamp collection, a spreadsheet, your notes): paste names, one per line.</p>' +
      '<p><b>ListenBrainz</b> has import tools for Spotify history and Last.fm on its own site; once it has your history, enter your username below and the artists arrive already matched.</p>' +
      '<p>Export layouts change. If a file finds nothing, paste a list.</p>';
    howto.appendChild(hint);
    body.appendChild(howto);

    var how = el("select", { "aria-label": "How many artists" });
    [20, 40, 60].forEach(function (n) { var o = el("option", { value: n, text: "Top " + n + " artists" }); if (n === 40) o.selected = true; how.appendChild(o); });
    var status = el("p", { "class": "muted", role: "status" });
    var review = el("div", { "class": "review" });
    var cancelled = false;

    // A: ListenBrainz
    var lbUser = el("input", { type: "text", placeholder: "ListenBrainz username", "aria-label": "ListenBrainz username" });
    var lbRange = el("select", { "aria-label": "Time range" });
    [["all_time", "All time"], ["this_year", "This year"], ["this_month", "This month"]].forEach(function (r) { lbRange.appendChild(el("option", { value: r[0], text: r[1] })); });
    var lbBtn = btn("Find my artists", function () {
      if (!lbUser.value.trim()) return say("Enter a ListenBrainz username.", true);
      status.textContent = "Asking ListenBrainz…"; review.textContent = "";
      api("api/import/listenbrainz?user=" + encodeURIComponent(lbUser.value.trim()) + "&range=" + lbRange.value).then(function (j) {
        status.textContent = ""; showReview(j.artists.slice(0, +how.value));
      }).catch(function (e) { status.textContent = ""; say(e.message, true); });
    });
    body.appendChild(el("h3", { text: "From ListenBrainz (already matched)" }));
    body.appendChild(el("div", { "class": "addrow" }, [lbUser, lbRange, lbBtn]));

    // B: file or pasted list
    var fileIn = el("input", { type: "file", accept: ".zip,.json,.csv,.txt", multiple: "multiple", "aria-label": "Export file" });
    var paste = el("textarea", { rows: 4, placeholder: "Or paste artist names, one per line", "aria-label": "Artist names" });
    var cancelBtn = btn("Cancel", function () { cancelled = true; status.textContent = "Cancelled."; }, "x");
    cancelBtn.hidden = true;
    var goBtn = btn("Find artists in my file or list", function () {
      cancelled = false; review.textContent = "";
      var jobs = [];
      Array.prototype.forEach.call(fileIn.files, function (f) { jobs.push(readFile(f).then(function (b64) { return api("api/import/parse", { name: f.name, data: b64, encoding: "base64", top: 500 }); })); });
      if (paste.value.trim()) jobs.push(api("api/import/parse", { name: "list.txt", data: paste.value, top: 500 }));
      if (!jobs.length) return say("Choose a file or paste a list first.", true);
      status.textContent = "Reading…";
      Promise.all(jobs).then(function (parts) {
        var merged = {};
        parts.forEach(function (p) { p.artists.forEach(function (a) { var k = a.name.toLowerCase(); if (!merged[k]) merged[k] = { name: a.name, plays: 0 }; merged[k].plays += a.plays; }); });
        var list = Object.keys(merged).map(function (k) { return merged[k]; }).sort(function (a, b) { return b.plays - a.plays; }).slice(0, +how.value);
        matchAll(list);
      }).catch(function (e) { status.textContent = ""; say(e.message, true); });
    });
    body.appendChild(el("h3", { text: "From a file or a list" }));
    body.appendChild(el("div", { "class": "addrow" }, [fileIn]));
    body.appendChild(paste);
    body.appendChild(el("div", { "class": "addrow" }, [how, goBtn, cancelBtn]));
    body.appendChild(status);
    body.appendChild(review);

    function matchAll(list) {
      var out = [], i = 0;
      cancelBtn.hidden = false;
      (function next() {
        if (cancelled) { cancelBtn.hidden = true; return; }
        if (i >= list.length) { cancelBtn.hidden = true; status.textContent = ""; return showReview(out); }
        status.textContent = "Matching artists with MusicBrainz… " + i + " of " + list.length;
        var chunk = list.slice(i, i + 4);
        api("api/import/match", { names: chunk.map(function (a) { return a.name; }) }).then(function (j) {
          j.results.forEach(function (r, n) { r.plays = chunk[n].plays; out.push(r); });
          i += chunk.length; next();
        }).catch(function (e) { cancelBtn.hidden = true; status.textContent = ""; say(e.message, true); });
      })();
    }

    function showReview(entries) {
      review.textContent = "";
      if (!entries.length) return say("Nothing to review.", true);
      var rows = [], genreBox = el("div", { "class": "chips" }), genreState = {};
      review.appendChild(el("h3", { text: "Review artists" }));
      review.appendChild(el("p", { "class": "muted", text: "Ticked artists will be followed. Unticked ones had no clear match: pick the right one from the list, or leave them out." }));
      var list = el("ul", { "class": "importlist" });
      entries.forEach(function (e) {
        var cands = e.candidates || [];
        var cb = el("input", { type: "checkbox", "aria-label": "Follow " + e.name });
        var sel = el("select", { "aria-label": "Match for " + e.name });
        sel.appendChild(el("option", { value: -1, text: "No match, skip" }));
        cands.forEach(function (c, ci) {
          var extra = [c.disambiguation, c.country, (c.tags || []).slice(0, 3).join("/")].filter(Boolean).join(", ");
          var o = el("option", { value: ci, text: c.name + (extra ? " (" + extra + ")" : "") });
          if (ci === e.pick) o.selected = true;
          sel.appendChild(o);
        });
        var cur = function () { return +sel.value >= 0 ? cands[+sel.value] : null; };
        var row = { cb: cb, sel: sel, cur: cur };
        var already = cur() && followed[cur().mbid];
        cb.checked = !!cur() && e.confident && !already;
        if (already) { cb.disabled = true; }
        sel.addEventListener("change", function () { var c = cur(); cb.disabled = !c || !!followed[c.mbid]; cb.checked = !!c && !followed[c.mbid]; refreshGenres(); });
        cb.addEventListener("change", refreshGenres);
        rows.push(row);
        list.appendChild(el("li", {}, [cb, el("span", { "class": "nm", text: e.name }), el("span", { "class": "muted", text: already ? "already followed" : (e.plays ? e.plays + " plays" : "") }), sel]));
      });
      review.appendChild(list);
      review.appendChild(el("h3", { text: "Suggested genres (from those artists' MusicBrainz tags)" }));
      review.appendChild(genreBox);
      var go = btn("Add to my tuning", function () {
        var arts = [], gens = [];
        rows.forEach(function (r) { var c = r.cur(); if (r.cb.checked && c) arts.push({ name: c.name, mbid: c.mbid }); });
        Object.keys(genreState).forEach(function (g) { if (genreState[g]) gens.push({ name: g, weight: 3 }); });
        if (!arts.length && !gens.length) return say("Nothing ticked.", true);
        api("api/tuning", { action: "artists_add", tuning: t.slug, artists: arts })
          .then(function () { return gens.length ? api("api/tuning", { action: "genres_add", tuning: t.slug, genres: gens }) : null; })
          .then(function () { say("Added " + arts.length + " artists and " + gens.length + " genres. Applies on the next build."); load(); })
          .catch(function (e) { say(e.message, true); });
      });
      review.appendChild(go);
      var timer;
      function refreshGenres() {
        clearTimeout(timer);
        timer = setTimeout(function () {
          var tags = rows.filter(function (r) { return r.cb.checked && r.cur(); }).map(function (r) { return r.cur().tags || []; });
          if (!tags.length) { genreBox.textContent = ""; return; }
          api("api/import/genres", { tags: tags }).then(function (j) {
            genreBox.textContent = "";
            j.genres.forEach(function (g, gi) {
              if (!(g.name in genreState)) genreState[g.name] = gi < 6;
              var lab = el("label", { "class": "gchip" });
              var c = el("input", { type: "checkbox" });
              c.checked = genreState[g.name];
              c.addEventListener("change", function () { genreState[g.name] = c.checked; });
              lab.appendChild(c); lab.appendChild(document.createTextNode(" " + g.name + " (" + g.count + ")"));
              genreBox.appendChild(lab);
            });
          }).catch(function () { /* suggestions are optional */ });
        }, 300);
      }
      refreshGenres();
    }
    return det;
  }

  function tuningBlock(t) {
    var box = el("section", { "class": "side" }, [el("h2", { text: t.name })]);
    box.appendChild(importPanel(t));
    // genres
    var g = el("ul", { "class": "chips" });
    t.genres.forEach(function (x) {
      var sel = el("select", { "aria-label": "Weight for " + x.name });
      for (var w = 1; w <= 5; w++) { var o = el("option", { value: w, text: "×" + w }); if (w === (x.weight || 3)) o.selected = true; sel.appendChild(o); }
      sel.addEventListener("change", function () { act("api/tuning", { action: "genre_weight", tuning: t.slug, name: x.name, weight: sel.value }); });
      g.appendChild(el("li", {}, [el("span", { text: x.name }), sel, btn("Remove", function () { act("api/tuning", { action: "genre_remove", tuning: t.slug, name: x.name }); }, "x")]));
    });
    box.appendChild(el("h3", { text: "Genres" }));
    box.appendChild(g);
    box.appendChild(picker("Add a genre (type to search MusicBrainz)", "api/genres", "genres", function (name, done) {
      return el("li", {}, [btn(name, function () { done(); act("api/tuning", { action: "genre_add", tuning: t.slug, name: name, weight: 3 }); })]);
    }));
    // artists
    var a = el("ul", { "class": "chips" });
    t.artists.forEach(function (x) {
      a.appendChild(el("li", {}, [el("span", { text: x.name }), btn("Remove", function () { act("api/tuning", { action: "artist_remove", tuning: t.slug, mbid: x.mbid }); }, "x")]));
    });
    box.appendChild(el("h3", { text: "Artists" }));
    box.appendChild(a);
    box.appendChild(picker("Add an artist (type to search MusicBrainz)", "api/artists", "artists", function (h, done) {
      var extra = [h.disambiguation, h.country, (h.tags || []).slice(0, 3).join("/")].filter(Boolean).join(", ");
      return el("li", {}, [btn(h.name + (extra ? "  (" + extra + ")" : ""), function () { done(); act("api/tuning", { action: "artist_add", tuning: t.slug, name: h.name, mbid: h.mbid }); })]);
    }));
    // muted
    var m = el("ul", { "class": "chips" });
    t.mute_genres.forEach(function (x) {
      m.appendChild(el("li", {}, [el("span", { text: x }), btn("Unmute", function () { act("api/tuning", { action: "mute_remove", tuning: t.slug, name: x }); }, "x")]));
    });
    box.appendChild(el("h3", { text: "Muted genres (releases with these tags are left out)" }));
    box.appendChild(m);
    box.appendChild(picker("Mute a genre", "api/genres", "genres", function (name, done) {
      return el("li", {}, [btn(name, function () { done(); act("api/tuning", { action: "mute_add", tuning: t.slug, name: name }); })]);
    }));
    // days
    var days = el("input", { type: "number", min: 1, max: 90, value: t.days, "aria-label": "Days back" });
    days.addEventListener("change", function () { act("api/tuning", { action: "days", tuning: t.slug, days: days.value }); });
    box.appendChild(el("p", { "class": "muted" }, [document.createTextNode("Look back "), days, document.createTextNode(" days")]));
    return box;
  }

  function sourcesBlock(d) {
    var box = el("section", { "class": "side" }, [el("h2", { text: "Sources" })]);
    var rows = el("ul", { "class": "chips rows" });
    d.sources.forEach(function (f) {
      var h = f.health || {};
      var status = !f.enabled ? "off" : h.error ? (h.failing || "") + h.error : (h.items || 0) + " posts";
      rows.appendChild(el("li", {}, [
        el("span", { text: f.name }), el("span", { "class": "muted", text: f.kind + " · " + status }),
        btn(f.enabled ? "Switch off" : "Switch on", function () { act("api/source", { action: f.enabled ? "disable" : "enable", id: f.id }); }),
        btn("Remove", function () { if (confirm("Remove " + f.name + "?")) act("api/source", { action: "remove", id: f.id }); }, "x")
      ]));
    });
    box.appendChild(rows);
    var url = el("input", { type: "url", placeholder: "Feed address (https://…)", "aria-label": "Feed address" });
    var name = el("input", { type: "text", placeholder: "Name", "aria-label": "Name" });
    var kind = el("select", { "aria-label": "Kind" });
    d.kinds.forEach(function (k) { kind.appendChild(el("option", { value: k, text: k })); });
    box.appendChild(el("div", { "class": "addrow" }, [url, name, kind, btn("Add source", function () {
      act("api/source", { action: "add", url: url.value, name: name.value, kind: kind.value }, "Source added. It is read on the next build.");
    })]));
    box.appendChild(el("p", { "class": "muted", text: "Add feeds publishers offer for reading (blogs, labels, subreddits as .rss, YouTube channel feeds). Streaming platforms are not sources." }));
    return box;
  }

  function load() {
    api("api/state").then(function (d) {
      root.textContent = "";
      root.appendChild(note);
      var bar = el("div", { "class": "buildbar" });
      var b = btn(d.build.running ? "Building…" : "Build now", function () { act("api/build", {}, "Build started. Reload in about a minute."); setTimeout(load, 4000); });
      if (d.build.running) b.disabled = true;
      bar.appendChild(b);
      bar.appendChild(el("span", { "class": "muted", text: d.build.error ? "Last build failed: " + d.build.error : d.build.last }));
      root.appendChild(bar);
      d.tunings.forEach(function (t) { root.appendChild(tuningBlock(t)); });
      var nt = el("input", { type: "text", placeholder: "New tuning name", "aria-label": "New tuning name" });
      root.appendChild(el("div", { "class": "addrow" }, [nt, btn("Add tuning", function () { act("api/tuning", { action: "new", name: nt.value }); })]));
      root.appendChild(sourcesBlock(d));
      if (d.build.running) setTimeout(load, 5000);
    }).catch(function (e) { root.textContent = "Could not reach the workbench: " + e.message; });
  }
  load();
})();
