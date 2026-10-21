#!/usr/bin/env bash
# Pelancar Satu-Klik CampusOS untuk macOS / Linux
cd "$(dirname "$0")"

if ! curl -fsS http://localhost:5174 >/dev/null 2>&1; then
  nohup npm run dev >/tmp/campusos-dev.log 2>&1 &
  for _ in {1..45}; do
    if curl -fsS http://localhost:5174 >/dev/null 2>&1; then
      break
    fi
    sleep 1
  done
fi

if command -v open >/dev/null 2>&1; then
  open "http://localhost:5174"
elif command -v xdg-open >/dev/null 2>&1; then
  xdg-open "http://localhost:5174"
fi
