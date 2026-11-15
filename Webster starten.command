#!/bin/zsh
# Startet Webster: Doppelklick im Finder genügt. Zum Beenden dieses Fenster schließen.
cd "$(dirname "$0")"
if [ ! -d node_modules ]; then
  echo "Erster Start: Programmteile werden installiert …"
  npm install || { echo "Installation fehlgeschlagen."; read -k1; exit 1; }
fi
# Webster braucht Chrome oder Edge (Speichern in Projektordnern); sonst Standardbrowser
open_webster() {
  open -a "Google Chrome" http://localhost:5173 2>/dev/null || open -a "Microsoft Edge" http://localhost:5173 2>/dev/null || open http://localhost:5173
}
if curl -s -o /dev/null http://localhost:5173; then
  open_webster
  exit 0
fi
(sleep 2; open_webster) &
echo "Webster läuft unter http://localhost:5173 – zum Beenden dieses Fenster schließen."
npm run dev
