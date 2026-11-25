// Bergverket HQ: henter dashbordet fra det private repoet med brukerens egen lesenøkkel.
// Ingen data ligger i denne siden. Nøkkelen lagres bare i nettleseren (localStorage).
(function () {
  "use strict";
  var REPO = "bergverket/bergverket-hq";
  var BRANCH = "dashbord";
  var NOKKEL = "bergverket-hq-nokkel";
  var $ = function (id) { return document.getElementById(id); };
  var bildeUrl = null;

  function hentNokkel() { try { return localStorage.getItem(NOKKEL); } catch (e) { return null; } }
  function lagreNokkel(v) { try { localStorage.setItem(NOKKEL, v); } catch (e) {} }
  function slettNokkel() { try { localStorage.removeItem(NOKKEL); } catch (e) {} }

  function api(fil, nokkel, raw) {
    return fetch("https://api.github.com/repos/" + REPO + "/contents/" + fil + "?ref=" + BRANCH + "&t=" + Date.now(), {
      headers: { Authorization: "Bearer " + nokkel, Accept: raw ? "application/vnd.github.raw" : "application/vnd.github+json" },
      cache: "no-store"
    }).then(function (r) {
      if (r.status === 401) throw new Error("Nøkkelen virker ikke (utløpt eller feil). Lag en ny.");
      if (r.status === 403 || r.status === 404) throw new Error("Nøkkelen har ikke lesetilgang til bergverket-hq, eller dashbordet er ikke laget ennå. Sjekk at eier er «bergverket», repoet er valgt og Contents er Read-only.");
      if (!r.ok) throw new Error("GitHub svarte " + r.status + ". Prøv igjen om litt.");
      return r;
    });
  }

  function visInn(melding) {
    $("vis").hidden = true; $("meny").hidden = true; $("inn").hidden = false;
    $("feil").hidden = !melding; $("feil").textContent = melding || "";
    $("nokkel").focus();
  }

  function last(nokkel, stille) {
    if (!stille) { $("laster").hidden = false; }
    $("inn").hidden = true; $("vis").hidden = false; $("meny").hidden = false;
    return api("dashbord.svg", nokkel, true)
      .then(function (r) { return r.blob(); })
      .then(function (b) {
        var url = URL.createObjectURL(new Blob([b], { type: "image/svg+xml" }));
        var img = $("dashbord");
        img.onload = function () { if (bildeUrl) URL.revokeObjectURL(bildeUrl); bildeUrl = url; };
        img.src = url; img.hidden = false; $("laster").hidden = true;
        return api("data.json", nokkel, true).then(function (r) { return r.json(); }).then(function (d) {
          var t = new Date(d.oppdatert);
          $("stempel").textContent = "TEGNET " + t.toLocaleString("nb-NO", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(",", " KL.");
        }).catch(function () {});
      })
      .catch(function (e) {
        if (stille) return;
        visInn(e.message);
      });
  }

  $("skjema").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var v = $("nokkel").value.trim();
    if (!v) return;
    api("data.json", v, true).then(function () {
      lagreNokkel(v); $("nokkel").value = ""; last(v);
    }).catch(function (e) { visInn(e.message); });
  });
  $("ut").addEventListener("click", function () { slettNokkel(); $("dashbord").hidden = true; visInn(""); });
  $("oppdater").addEventListener("click", function () { var n = hentNokkel(); if (n) last(n, true); });

  // Hent på nytt hvert femte minutt og når fanen blir synlig igjen
  setInterval(function () { var n = hentNokkel(); if (n && !document.hidden) last(n, true); }, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", function () { var n = hentNokkel(); if (n && !document.hidden) last(n, true); });

  var n = hentNokkel();
  if (n) last(n); else visInn("");
})();
