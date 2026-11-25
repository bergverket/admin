# admin.bergverket.no

Tomt skall for Bergverkets interne dashbord. **Ingen data ligger her.** Siden henter `data.json` og `dashbord.svg` fra det private repoet `bergverket/bergverket-hq` (branch `dashbord`), og `kundeemner.json` (branch `kundeemner`, fanen «Kundeemner») med hver persons egen GitHub-lesenøkkel, som bare lagres i nettleseren.

Slik lager du nøkkel og hvordan dashbordet tegnes: se `docs/dashbord.md` i bergverket-hq.

Publiseres med GitHub Pages fra `main`. DNS: `admin` CNAME → `bergverket.github.io` (Domeneshop).
