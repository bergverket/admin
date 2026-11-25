// Bergverket HQ – interaktivt dashbord.
// Siden har ingen data. Den henter data.json og dashbord.svg fra branchen «dashbord»
// i det private repoet bergverket-hq med brukerens egen lesenøkkel (lagres bare i nettleseren).
(function () {
  "use strict";
  var REPO = "bergverket/bergverket-hq", BRANCH = "dashbord", NOKKEL = "bergverket-hq-nokkel", VALG = "bergverket-hq-valg";
  var GH = "https://github.com/" + REPO;
  var FASER = [["lead", "Lead"], ["avtalt", "Avtalt"], ["bygges", "Bygges"], ["drift", "Drift"]];
  var FOLK = { fabian: { navn: "Fabian", farge: "#e57a41", login: "faborska" }, viktor: { navn: "Viktor", farge: "#7fb2c9", login: "viktormellberg" } };
  var GAMMEL = 14;

  var $ = function (id) { return document.getElementById(id); };
  var D = null, bildeUrl = null, ikkeFunnetData = false;
  var valg = les(VALG) || {};
  valg.hvem = valg.hvem || "alle"; valg.oppg = valg.oppg || "alle"; valg.dager = valg.dager || 14;
  var sok = "", loggVis = 10, meg = null;

  // ---------- lagring (kan feile i privat modus)
  function les(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
  function skriv(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function nokkel() { var n = les(NOKKEL); return typeof n === "string" ? n : null; }

  // ---------- DOM-hjelper (bare textContent, aldri innerHTML med data)
  function h(tag, attr, barn) {
    var el = document.createElement(tag);
    if (attr) Object.keys(attr).forEach(function (k) {
      var v = attr[k];
      if (v == null || v === false) return;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.slice(0, 2) === "on") el.addEventListener(k.slice(2), v);
      else if (k === "style") el.style.cssText = v;
      else el.setAttribute(k, v === true ? "" : v);
    });
    (barn || []).forEach(function (b) { if (b != null && b !== false) el.appendChild(typeof b === "string" ? document.createTextNode(b) : b); });
    return el;
  }
  function tom(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
  function svg(tag, attr) { var el = document.createElementNS("http://www.w3.org/2000/svg", tag); Object.keys(attr || {}).forEach(function (k) { el.setAttribute(k, attr[k]); }); return el; }

  // ---------- tid
  function dato(s) { if (!s) return null; var d = new Date(String(s).length <= 10 ? s + "T12:00:00" : s); return isNaN(d) ? null : d; }
  function dagStart(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function dagerMellom(a, b) { return Math.round((dagStart(b) - dagStart(a)) / 864e5); }
  function kort(d) { return d ? String(d.getDate()).padStart(2, "0") + "." + String(d.getMonth() + 1).padStart(2, "0") : ""; }
  function siden(d) {
    if (!d) return "";
    var m = Math.round((Date.now() - d) / 6e4);
    if (m < 1) return "nå nettopp"; if (m < 60) return m + " min siden";
    var t = Math.round(m / 60); if (t < 24) return t + " t siden";
    var dg = Math.round(t / 24); return dg === 1 ? "i går" : dg + " d siden";
  }

  // ---------- GitHub
  function api(fil, n, type) {
    return fetch("https://api.github.com/repos/" + REPO + "/contents/" + fil + "?ref=" + BRANCH + "&t=" + Date.now(), {
      headers: { Authorization: "Bearer " + n, Accept: "application/vnd.github.raw" }, cache: "no-store"
    }).then(function (r) {
      if (r.status === 401) throw new Error("Nøkkelen virker ikke (utløpt eller feil). Lag en ny.");
      if (r.status === 403 || r.status === 404) throw new Error("Nøkkelen har ikke lesetilgang til bergverket-hq, eller dashbordet er ikke laget ennå. Sjekk at eier er «bergverket», repoet er valgt og Contents er Read-only.");
      if (!r.ok) throw new Error("GitHub svarte " + r.status + ". Prøv igjen om litt.");
      return type === "blob" ? r.blob() : r.json();
    });
  }
  function hvemErJeg(n) {
    return fetch("https://api.github.com/user", { headers: { Authorization: "Bearer " + n } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (u) {
        if (!u) return null;
        var l = (u.login || "").toLowerCase();
        return Object.keys(FOLK).filter(function (k) { return FOLK[k].login === l; })[0] || null;
      }).catch(function () { return null; });
  }

  // ---------- visning av tilstand
  function visInn(melding) {
    ["hq", "laster", "verktoy", "bilde-vis"].forEach(function (id) { $(id).hidden = true; });
    $("inn").hidden = false; $("feil").hidden = !melding; $("feil").textContent = melding || ""; $("nokkel").focus();
  }
  function last(n, stille) {
    if (!stille) { $("laster").hidden = false; $("inn").hidden = true; }
    return api("data.json", n).then(function (d) {
      D = d; $("laster").hidden = true; $("verktoy").hidden = false;
      if (!$("bilde-vis").hidden) return;
      $("hq").hidden = false; tegn();
    }).catch(function (e) { if (!stille) visInn(e.message); });
  }

  // ---------- filter
  function eierTreff(e) { return valg.hvem === "alle" || e === valg.hvem || e === "begge"; }
  function sokTreff() {
    if (!sok) return true;
    var t = Array.prototype.join.call(arguments, " ").toLowerCase();
    return t.indexOf(sok) !== -1;
  }
  function ansvarligNokkel(a) { a = (a || "").toLowerCase(); return a.indexOf("begge") !== -1 ? "begge" : (FOLK[a] ? a : ""); }

  function chip(e) {
    var n = e === "begge" ? "Begge" : (FOLK[e] ? FOLK[e].navn : "Ingen eier");
    return h("span", { class: "chip " + (e || "ingen"), text: n });
  }

  // ---------- tegning
  function tegn() {
    if (!D) return;
    var na = new Date();
    tegnTopp(na); tegnKpi(na); tegnFlyt(na); tegnFolk(); tegnKanban(na); tegnGraf(na); tegnLogg(); tegnPrs();
    document.querySelectorAll(".seg button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.hvem === valg.hvem)); });
    document.querySelectorAll("#oppg-filter button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.f === valg.oppg)); });
    document.querySelectorAll("#periode button").forEach(function (b) { b.setAttribute("aria-pressed", String(+b.dataset.d === valg.dager)); });
  }

  function apneIssues() { return (D.issues || []).filter(function (i) { return i.state === "open"; }); }

  function tegnTopp(na) {
    var t = na.getHours(), hilsen = t < 5 ? "God natt" : t < 10 ? "God morgen" : t < 17 ? "Hei" : t < 23 ? "God kveld" : "God natt";
    var h1 = tom($("hilsen"));
    h1.appendChild(document.createTextNode(hilsen + (meg ? ", " : "") ));
    if (meg) h1.appendChild(h("em", { text: FOLK[meg].navn }));
    h1.appendChild(document.createTextNode("."));
    var hvem = valg.hvem !== "alle" ? valg.hvem : meg;
    var mine = hvem ? apneIssues().filter(function (i) { return i.eier === hvem || i.eier === "begge"; }).length : 0;
    var uten = apneIssues().filter(function (i) { return !i.eier; }).length;
    var aktive = D.kunder.filter(function (k) { return k.status !== "lead"; }).length;
    var o = tom($("oppsummering"));
    o.appendChild(document.createTextNode(aktive + " aktive kunder, "));
    o.appendChild(h("b", { text: apneIssues().length + " åpne oppgaver" }));
    if (hvem) { o.appendChild(document.createTextNode(", " + mine + " av dem merket med " + FOLK[hvem].navn)); }
    if (uten) { o.appendChild(document.createTextNode(". " + uten + " mangler eier.")); } else o.appendChild(document.createTextNode("."));
    $("tegnet").textContent = "· tegnet " + siden(dato(D.oppdatert));
    // nedtelling til neste frist
    var fr = D.kunder.filter(function (k) { var d = dato(k.frist); return d && dagStart(d) >= dagStart(na); })
      .sort(function (a, b) { return dato(a.frist) - dato(b.frist); })[0];
    $("nedtelling").hidden = !fr;
    if (fr) {
      $("ned-hva").textContent = (fr.frist_hva || "Frist") + " · " + kort(dato(fr.frist));
      $("ned-kunde").textContent = fr.navn + " →"; $("ned-kunde").onclick = function () { apneKunde(fr); };
      oppdaterNedtelling(fr);
    }
  }
  function oppdaterNedtelling(fr) {
    var mal = dato(fr.frist); mal.setHours(0, 0, 0, 0);
    var ms = Math.max(0, mal - Date.now()), d = Math.floor(ms / 864e5), t = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60;
    var el = tom($("ned-tall"));
    [[d, "d"], [t, "t"], [m, "m"]].forEach(function (p) { el.appendChild(document.createTextNode(String(p[0]))); el.appendChild(h("small", { text: p[1] })); });
  }

  function sparkline(verdier, farge) {
    var b = 70, hh = 26, maks = Math.max.apply(null, verdier.concat([1]));
    var s = svg("svg", { viewBox: "0 0 " + b + " " + hh, class: "spark", "aria-hidden": "true", width: b, height: hh });
    var pts = verdier.map(function (v, i) { return (i * b / (verdier.length - 1)).toFixed(1) + "," + (hh - 2 - v / maks * (hh - 4)).toFixed(1); });
    s.appendChild(svg("polyline", { points: pts.join(" "), fill: "none", stroke: farge, "stroke-width": "1.6", "stroke-linejoin": "round" }));
    return s;
  }
  function perDag(liste, felt, dager, na) {
    var ut = []; for (var i = dager - 1; i >= 0; i--) { ut.push(0); }
    liste.forEach(function (x) { var d = dato(x[felt]); if (!d) return; var i = dagerMellom(d, na); if (i >= 0 && i < dager) ut[dager - 1 - i]++; });
    return ut;
  }

  function tegnKpi(na) {
    var el = tom($("kpi"));
    var lukket7 = (D.issues || []).filter(function (i) { var d = dato(i.lukket); return d && dagerMellom(d, na) <= 7; });
    var merget7 = (D.prs || []).filter(function (p) { var d = dato(p.merget); return d && dagerMellom(d, na) <= 7; });
    var apnePr = (D.prs || []).filter(function (p) { return p.state === "open"; });
    var gamle = D.kunder.filter(function (k) { var d = dato(k.oppdatert); return d && dagerMellom(d, na) > GAMMEL; });
    var aktive = D.kunder.filter(function (k) { return k.status !== "lead"; });
    var fliser = [
      { t: aktive.length, n: "Aktive kunder", u: D.kunder.filter(function (k) { return k.status === "lead"; }).length + " leads i tillegg", mal: "h-flyt" },
      { t: apneIssues().length, n: "Åpne oppgaver", u: apneIssues().filter(function (i) { return i.pagar; }).length + " pågår · " + apneIssues().filter(function (i) { return !i.eier; }).length + " uten eier", mal: "h-oppg", spark: perDag(D.issues || [], "opprettet", 14, na), sf: "#a2a8ac" },
      { t: lukket7.length, n: "Ferdig, 7 dager", u: "Lukkede issues", mal: "h-oppg", farge: lukket7.length ? "var(--gronn)" : null, spark: perDag(D.issues || [], "lukket", 14, na), sf: "#8cc59a" },
      { t: merget7.length, n: "PR-er merget, 7 d", u: apnePr.length + " åpne til gjennomsyn", mal: "prs", spark: perDag(D.prs || [], "merget", 14, na), sf: "#b49ae6" },
      { t: gamle.length, n: "Trenger oppdatering", u: gamle.length ? gamle.map(function (k) { return k.navn; }).join(", ") : "Alle kunder er ferske", mal: "h-flyt", farge: gamle.length ? "var(--rod)" : "var(--gronn)", varm: !!gamle.length }
    ];
    fliser.forEach(function (f) {
      var tall = h("div", { class: "t", style: f.farge ? "color:" + f.farge : null }, [String(f.t)]);
      if (f.spark) tall.appendChild(sparkline(f.spark, f.sf));
      el.appendChild(h("button", { type: "button", class: "tall-kort" + (f.varm ? " varm" : ""), onclick: function () { var m = $(f.mal); if (m) m.scrollIntoView({ behavior: "smooth", block: "start" }); } },
        [h("p", { class: "etikett", text: f.n }), tall, h("div", { class: "u", text: f.u })]));
    });
  }

  function tegnFlyt(na) {
    var el = tom($("flyt"));
    FASER.forEach(function (f) {
      var alle = D.kunder.filter(function (k) { return k.status === f[0]; });
      var mine = alle.filter(function (k) { return eierTreff(ansvarligNokkel(k.ansvarlig)) && sokTreff(k.navn, k.neste, k.ansvarlig, (k.kort_om || []).join(" ")); });
      var kol = h("div", { class: "fase" + (alle.length ? " aktiv" : "") }, [
        h("div", { class: "fase-hode" }, [h("h3", { text: f[1] }), h("span", { class: "ant", text: String(alle.length) })])
      ]);
      if (!mine.length) kol.appendChild(h("div", { class: "tom", text: alle.length ? "Skjult av filteret" : "Ingen her ennå" }));
      mine.forEach(function (k) {
        var opp = dato(k.oppdatert), ds = opp ? dagerMellom(opp, na) : null, gammel = ds != null && ds > GAMMEL;
        var nl = k.neste_liste || [], ferdig = nl.filter(function (x) { return x.ferdig; }).length;
        var fr = dato(k.frist), dTil = fr ? dagerMellom(na, fr) : null;
        kol.appendChild(h("button", { type: "button", class: "kunde" + (gammel ? " gammel" : ""), onclick: function () { apneKunde(k); } }, [
          h("h4", { text: k.navn }),
          chip(ansvarligNokkel(k.ansvarlig)),
          h("p", { text: "Neste: " + (k.neste ? k.neste.replace(/^\((Fabian|Viktor|Begge)[^)]*\)\s*/, "") : "ikke satt") }),
          h("div", { class: "fot-l" }, [
            h("span", { text: ds == null ? "Aldri oppdatert" : ds === 0 ? "Oppdatert i dag" : "Oppdatert for " + ds + " d siden" }),
            fr ? h("span", { class: "frist", text: (k.frist_hva || "Frist") + " " + kort(fr) + (dTil != null && dTil >= 0 ? " · " + dTil + " d" : "") }) : null
          ]),
          nl.length ? h("div", { class: "fremdrift", title: ferdig + " av " + nl.length + " neste steg gjort" }, [h("i", { style: "width:" + Math.round(ferdig / nl.length * 100) + "%" })]) : null
        ]));
      });
      el.appendChild(kol);
    });
  }

  function tegnFolk() {
    var el = tom($("folk"));
    Object.keys(FOLK).forEach(function (k) {
      var p = FOLK[k], st = (D.folk || {})[k] || {};
      var mine = apneIssues().filter(function (i) { return i.eier === k || i.eier === "begge"; });
      var felt = function (etk, v) { return h("div", { class: "felt" }, [h("p", { class: "etikett", text: etk }), h("p", { text: v || "–" })]); };
      el.appendChild(h("button", { type: "button", class: "person" + (valg.hvem === k ? " valgt" : ""), style: "--pf:" + p.farge, "aria-pressed": String(valg.hvem === k),
        onclick: function () { settHvem(valg.hvem === k ? "alle" : k); } }, [
        h("div", { class: "person-hode" }, [h("span", { class: "avatar", text: p.navn[0] }), h("h3", { text: p.navn }), h("p", { class: "etikett", text: "Oppdatert " + (st.oppdatert || "–") })]),
        felt("Jobber med", st.jobber), felt("Neste", st.neste), felt(st.trenger_fra || "Trenger", st.trenger),
        h("div", { class: "mine" }, [h("span", { class: "stort", text: String(mine.length) }), h("span", { class: "etikett", text: "åpne oppgaver merket med " + p.navn }),
          h("span", { class: "liste", text: mine.length ? mine.slice(0, 4).map(function (i) { return "#" + i.nr + " " + i.tittel; }).join(" · ") : "Ingen issues med eier eller til-" + k })])
      ]));
    });
  }

  function oppgTreff(i) {
    var lab = i.labels.map(function (l) { return l.toLowerCase(); });
    if (valg.oppg === "kunde" && lab.indexOf("kunde") === -1) return false;
    if (valg.oppg === "intern" && lab.indexOf("intern") === -1) return false;
    if (valg.oppg === "uten" && i.eier) return false;
    return eierTreff(i.eier) && sokTreff("#" + i.nr, i.tittel, i.labels.join(" "));
  }
  function tegnKanban(na) {
    var el = tom($("kanban"));
    var issues = D.issues || [];
    var kol = [
      ["Å gjøre", "#a2a8ac", issues.filter(function (i) { return i.state === "open" && !i.pagar; }), ""],
      ["Pågår", "#e57a41", issues.filter(function (i) { return i.state === "open" && i.pagar; }), ""],
      ["Ferdig, 7 d", "#8cc59a", issues.filter(function (i) { var d = dato(i.lukket); return i.state === "closed" && d && dagerMellom(d, na) <= 7; }), " ferdig"]
    ];
    kol.forEach(function (k) {
      var vis = k[2].filter(oppgTreff).sort(function (a, b) { return a.nr - b.nr; });
      var c = h("div", { class: "kol" + k[3] }, [h("div", { class: "kol-hode" }, [h("span", { class: "prikk", style: "background:" + k[1] }), h("h3", { text: k[0] }), h("span", { class: "n", style: "color:" + k[1], text: String(vis.length) })])]);
      if (!vis.length) c.appendChild(h("div", { class: "tom", text: k[2].length ? "Skjult av filteret" : "Tomt" }));
      vis.forEach(function (i) {
        var erKunde = i.labels.some(function (l) { return l.toLowerCase() === "kunde"; });
        var alder = dato(i.state === "closed" ? i.lukket : i.opprettet);
        c.appendChild(h("button", { type: "button", class: "oppg", onclick: function () { apneIssue(i); } }, [
          h("span", { class: "nr" + (erKunde ? " k" : ""), text: "#" + i.nr }),
          h("span", { class: "tit", text: i.tittel }),
          h("span", { class: "meta" }, [chip(i.eier), h("span", { text: (i.state === "closed" ? "lukket " : "åpnet ") + siden(alder) }), i.kommentarer ? h("span", { text: "💬 " + i.kommentarer }) : null])
        ]));
      });
      el.appendChild(c);
    });
  }

  // ---------- aktivitet: STATUS-logg + kundelogg
  function aktivitet() {
    var a = (D.logg || []).map(function (l) { return { dato: l.dato, hvem: l.hvem, tekst: l.tekst, kunde: "" }; });
    D.kunder.forEach(function (k) { (k.logg || []).forEach(function (l) { a.push({ dato: l.dato, hvem: l.hvem, tekst: l.tekst, kunde: k.navn }); }); });
    // stabil sortering: nyeste dato først, ellers original rekkefølge
    return a.map(function (x, i) { x.i = i; return x; }).sort(function (x, y) { return (y.dato > x.dato) - (y.dato < x.dato) || x.i - y.i; });
  }
  function tegnGraf(na) {
    var el = tom($("graf")), dager = valg.dager, akt = aktivitet();
    var b = 600, hh = 150, bunn = 128, sb = b / dager;
    var tell = []; for (var i = 0; i < dager; i++) tell.push({ fabian: 0, viktor: 0, linjer: [] });
    akt.forEach(function (a) {
      if (!eierTreff(a.hvem)) return;
      var d = dato(a.dato); if (!d) return; var i = dagerMellom(d, na); if (i < 0 || i >= dager) return;
      var t = tell[dager - 1 - i]; if (a.hvem in t) t[a.hvem]++; t.linjer.push(a);
    });
    var maks = Math.max.apply(null, tell.map(function (t) { return t.fabian + t.viktor; }).concat([1]));
    var s = svg("svg", { viewBox: "0 0 " + b + " " + hh, preserveAspectRatio: "none", role: "img", "aria-label": "Aktivitet per dag siste " + dager + " dager" });
    [0.5, 1].forEach(function (f) { s.appendChild(svg("line", { x1: 0, x2: b, y1: bunn - (bunn - 14) * f, y2: bunn - (bunn - 14) * f, stroke: "#2c3338", "stroke-dasharray": "3 5" })); });
    tell.forEach(function (t, n) {
      var x = n * sb + 2, w = Math.max(2, sb - 4), hf = (bunn - 14) * t.fabian / maks, hv = (bunn - 14) * t.viktor / maks;
      var g = svg("g", { class: "stolpe", tabindex: "0" });
      g.appendChild(svg("rect", { x: n * sb, y: 0, width: sb, height: hh, fill: "transparent" }));
      g.appendChild(svg("rect", { x: x, y: bunn - 2, width: w, height: 2, fill: "#2c3338" }));
      if (hf) g.appendChild(svg("rect", { x: x, y: bunn - hf, width: w, height: hf, rx: 2, fill: "#e57a41" }));
      if (hv) g.appendChild(svg("rect", { x: x, y: bunn - hf - hv - (hf ? 2 : 0), width: w, height: hv, rx: 2, fill: "#7fb2c9" }));
      var dag = new Date(na); dag.setDate(dag.getDate() - (dager - 1 - n));
      if (n === 0 || n === dager - 1 || n === Math.floor(dager / 2)) {
        var tx = svg("text", { x: n * sb + sb / 2, y: hh - 4, "text-anchor": n === 0 ? "start" : n === dager - 1 ? "end" : "middle", fill: "#6f777c", "font-size": "11", "font-family": "IBM Plex Mono" });
        tx.textContent = n === dager - 1 ? "I dag" : kort(dag); s.appendChild(tx);
      }
      var vis = function (ev) {
        var tips = $("graf-tips"); tom(tips);
        tips.appendChild(h("b", { text: kort(dag) + " · " + (t.fabian + t.viktor) + " linjer" }));
        if (!t.linjer.length) tips.appendChild(document.createTextNode("Ingen logg denne dagen"));
        t.linjer.slice(0, 4).forEach(function (l) { tips.appendChild(h("div", { text: (FOLK[l.hvem] ? FOLK[l.hvem].navn : l.hvem) + ": " + l.tekst })); });
        if (t.linjer.length > 4) tips.appendChild(h("div", { text: "+ " + (t.linjer.length - 4) + " til" }));
        tips.hidden = false;
        var r = $("graf").getBoundingClientRect(), kx = (n + 0.5) / dager * r.width;
        tips.style.left = Math.min(Math.max(8, kx - 120), r.width - 250) + "px"; tips.style.top = "8px";
      };
      g.addEventListener("mouseenter", vis); g.addEventListener("focus", vis);
      g.addEventListener("mouseleave", function () { $("graf-tips").hidden = true; }); g.addEventListener("blur", function () { $("graf-tips").hidden = true; });
      s.appendChild(g);
    });
    el.appendChild(s);
  }
  function tegnLogg() {
    var el = tom($("tidslinje"));
    var akt = aktivitet().filter(function (a) { return eierTreff(a.hvem) && sokTreff(a.tekst, a.kunde); });
    akt.slice(0, loggVis).forEach(function (a) {
      var f = FOLK[a.hvem];
      el.appendChild(h("li", null, [
        h("span", { class: "p", style: f ? "background:" + f.farge : null }),
        h("span", { class: "d", text: kort(dato(a.dato)) }),
        h("span", { class: "h", style: f ? "color:" + f.farge : null, text: f ? f.navn : (a.hvem || "–") }),
        h("span", null, [a.tekst, a.kunde ? h("span", { class: "k", text: a.kunde }) : null])
      ]));
    });
    if (!akt.length) el.appendChild(h("li", null, [h("span"), h("span"), h("span"), h("span", { class: "hint", text: "Ingen aktivitet som passer filteret." })]));
    $("mer-logg").hidden = akt.length <= loggVis;
  }
  function tegnPrs() {
    var el = tom($("prs"));
    var liste = (D.prs || []).filter(function (p) { return sokTreff("#" + p.nr, p.tittel, p.av); }).slice(0, 8);
    liste.forEach(function (p) {
      var st = p.state === "open" ? (p.draft ? "utkast" : "åpen") : p.merget ? "merget " + siden(dato(p.merget)) : "lukket";
      el.appendChild(h("a", { class: "pr", href: p.url, target: "_blank", rel: "noopener" }, [
        h("span", { class: "nr", text: "#" + p.nr }), h("span", { text: p.tittel }),
        h("span", { class: "st " + (p.state === "open" ? "open" : p.merget ? "merget" : ""), text: st + " · " + p.av })
      ]));
    });
    if (!liste.length) el.appendChild(h("div", { class: "tom", text: "Ingen pull requests" }));
  }

  // ---------- skuff (detaljer)
  var forrigeFokus = null;
  function apneSkuff(innhold) {
    forrigeFokus = document.activeElement;
    var s = tom($("skuff-innhold")); innhold.forEach(function (x) { if (x) s.appendChild(x); });
    $("skuff").hidden = false; $("skygge").hidden = false; document.body.classList.add("laast"); $("lukk").focus();
  }
  function lukkSkuff() {
    if ($("skuff").hidden) return;
    $("skuff").hidden = true; $("skygge").hidden = true; document.body.classList.remove("laast");
    if (forrigeFokus) forrigeFokus.focus();
  }
  function liste(tittel, punkter) {
    if (!punkter || !punkter.length) return null;
    return h("div", null, [h("h3", { text: tittel }), h("ul", null, punkter.map(function (p) {
      return typeof p === "string" ? h("li", { text: p }) : h("li", { class: p.ferdig ? "ok" : null, text: p.tekst });
    }))]);
  }
  function apneKunde(k) {
    var idx = FASER.map(function (f) { return f[0]; }).indexOf(k.status), fr = dato(k.frist);
    apneSkuff([
      h("p", { class: "etikett", text: "Kunde · " + k.status }),
      h("h2", { id: "skuff-tittel", text: k.navn }),
      h("div", { class: "rad-meta" }, [chip(ansvarligNokkel(k.ansvarlig)), fr ? h("span", { class: "lab kunde-l", text: (k.frist_hva || "Frist") + " " + kort(fr) + " · " + dagerMellom(new Date(), fr) + " d" }) : null,
        h("span", { class: "liten-l", text: "Oppdatert " + (k.oppdatert || "–") })]),
      h("div", { class: "fase-vis" }, FASER.map(function (f, i) { return h("span", { class: i <= idx ? "ja" : null, text: f[1] }); })),
      liste("Kort om kunden", k.kort_om),
      liste("Neste steg", k.neste_liste),
      liste("Venter på kunden", k.venter_liste),
      liste("Logg", (k.logg || []).slice(0, 8).map(function (l) { return kort(dato(l.dato)) + " · " + l.tekst; })),
      h("div", null, [
        h("a", { class: "knapp", href: GH + "/blob/main/kunder/" + k.slug + "/kunde.md", target: "_blank", rel: "noopener", text: "Åpne kunde.md" }),
        h("a", { class: "knapp sek", href: GH + "/blob/main/kunder/" + k.slug + "/logg.md", target: "_blank", rel: "noopener", text: "Logg" }),
        h("a", { class: "knapp sek", href: GH + "/edit/main/kunder/" + k.slug + "/kunde.md", target: "_blank", rel: "noopener", text: "Rediger" })
      ])
    ]);
  }
  function apneIssue(i) {
    apneSkuff([
      h("p", { class: "etikett", text: "Issue #" + i.nr + " · " + (i.state === "open" ? (i.pagar ? "pågår" : "å gjøre") : "lukket") }),
      h("h2", { id: "skuff-tittel", text: i.tittel }),
      h("div", { class: "rad-meta" }, [chip(i.eier)].concat(i.labels.map(function (l) { return h("span", { class: "lab" + (l.toLowerCase() === "kunde" ? " kunde-l" : ""), text: l }); }))),
      h("p", { class: "liten-l", text: "Åpnet " + siden(dato(i.opprettet)) + " · sist endret " + siden(dato(i.oppdatert)) + (i.kommentarer ? " · " + i.kommentarer + " kommentarer" : "") }),
      i.tekst ? h("div", null, [h("h3", { text: "Beskrivelse" }), h("pre", { text: i.tekst + (i.tekst.length >= 600 ? " …" : "") })]) : null,
      h("div", null, [h("a", { class: "knapp", href: i.url, target: "_blank", rel: "noopener", text: "Åpne på GitHub" })]),
      h("p", { class: "liten-l", style: "margin-top:18px", text: "Eier: assign issuet eller label til-fabian/til-viktor. «Pågår»: label pågår." })
    ]);
  }

  // ---------- hendelser
  function settHvem(v) { valg.hvem = v; skriv(VALG, valg); tegn(); }
  document.querySelectorAll(".seg button").forEach(function (b) { b.addEventListener("click", function () { settHvem(b.dataset.hvem); }); });
  document.querySelectorAll("#oppg-filter button").forEach(function (b) { b.addEventListener("click", function () { valg.oppg = b.dataset.f; skriv(VALG, valg); tegn(); }); });
  document.querySelectorAll("#periode button").forEach(function (b) { b.addEventListener("click", function () { valg.dager = +b.dataset.d; skriv(VALG, valg); tegn(); }); });
  $("sok").addEventListener("input", function (e) { sok = e.target.value.trim().toLowerCase(); tegn(); });
  $("mer-logg").addEventListener("click", function () { loggVis += 15; tegnLogg(); });
  $("meny-knapp").addEventListener("click", function () { var a = $("meny").hidden; $("meny").hidden = !a; $("meny-knapp").setAttribute("aria-expanded", String(a)); });
  document.addEventListener("click", function (e) { if (!$("meny").hidden && !e.target.closest("#meny") && e.target !== $("meny-knapp")) $("meny").hidden = true; });
  $("lukk").addEventListener("click", lukkSkuff); $("skygge").addEventListener("click", lukkSkuff);
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { lukkSkuff(); $("meny").hidden = true; return; }
    var iFelt = /INPUT|TEXTAREA/.test((document.activeElement || {}).tagName || "");
    if (iFelt || $("hq").hidden) return;
    if (e.key === "/") { e.preventDefault(); $("sok").focus(); }
    if (e.key === "r") { var n = nokkel(); if (n) last(n, true); }
  });
  $("vis-bilde").addEventListener("click", function () {
    var n = nokkel(); if (!n) return; $("meny").hidden = true;
    if (!$("bilde-vis").hidden) { $("bilde-vis").hidden = true; $("hq").hidden = false; $("vis-bilde").textContent = "Vis som bilde"; return; }
    api("dashbord.svg", n, "blob").then(function (b) {
      if (bildeUrl) URL.revokeObjectURL(bildeUrl);
      bildeUrl = URL.createObjectURL(new Blob([b], { type: "image/svg+xml" }));
      $("dashbord").src = bildeUrl; $("hq").hidden = true; $("bilde-vis").hidden = false; $("vis-bilde").textContent = "Vis interaktivt";
    }).catch(function () {});
  });
  $("skjema").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var v = $("nokkel").value.trim(); if (!v) return;
    api("data.json", v).then(function () { skriv(NOKKEL, v); $("nokkel").value = ""; start(v); }).catch(function (e) { visInn(e.message); });
  });
  $("ut").addEventListener("click", function () { try { localStorage.removeItem(NOKKEL); } catch (e) {} D = null; meg = null; visInn(""); });

  function start(n) {
    hvemErJeg(n).then(function (m) { meg = m; if (D) tegnTopp(new Date()); });
    last(n);
  }
  setInterval(function () { var n = nokkel(); if (n && !document.hidden) last(n, true); }, 5 * 60 * 1000);
  setInterval(function () {
    var k = new Date(); $("klokke").textContent = String(k.getHours()).padStart(2, "0") + "." + String(k.getMinutes()).padStart(2, "0");
    if (D && !$("hq").hidden) { tegnTopp(k); }
  }, 30 * 1000);
  document.addEventListener("visibilitychange", function () { var n = nokkel(); if (n && !document.hidden) last(n, true); });
  (function () { var k = new Date(); $("klokke").textContent = String(k.getHours()).padStart(2, "0") + "." + String(k.getMinutes()).padStart(2, "0"); })();

  var n = nokkel();
  if (n) start(n); else visInn("");
})();
