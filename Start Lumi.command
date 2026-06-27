#!/bin/bash
# Lumi Bookkeeping launcher — double-click to start the app and open it in your browser.
cd "/Users/chrissullivan/Claude/Projects/Lumi Bookkeeping" || { echo "Could not find the Lumi Bookkeeping folder."; read -n1; exit 1; }

# Install dependencies the first time, if needed
if [ ! -d node_modules ]; then
  echo "Setting up Lumi for the first time…"
  npm install
fi

# Open the browser a couple of seconds after the server starts
( sleep 2; open http://localhost:4000 ) &

echo "Starting Lumi Bookkeeping…"
echo "Leave this window open while you use the app. Close it to stop Lumi."
npm start
