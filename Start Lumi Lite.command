#!/bin/bash
# Lumi Bookkeeping Lite launcher — double-click to start the app and open it in your browser.
cd "/Users/chrissullivan/Claude/Projects/Lumi Bookkeeping/Lumi Bookkeeping Lite" || { echo "Could not find the Lumi Bookkeeping Lite folder."; read -n1; exit 1; }
if [ ! -d node_modules ]; then echo "Setting up Lumi Lite for the first time…"; npm install; fi
( sleep 2; open http://localhost:4100 ) &
echo "Starting Lumi Bookkeeping Lite…"
echo "Leave this window open while you use the app. Close it to stop."
npm start
