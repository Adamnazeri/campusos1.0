#!/usr/bin/env bash
# scripts/offsite-backup.sh
# Menyulitkan fail sandaran SQLite (./backups/*.db) terlebih dahulu dan menghantarnya ke storan luar pelayan.
# PENTING (PDPA 2010): Pangkalan data mengandungi data peribadi pelajar & waris.
# Jangan muat naik fail .db mentah ke awan tanpa penyulitan (guna `age` atau remote `rclone crypt`).
#
# Keperluan:
#   - rclone (telah dikonfigurasi dengan `rclone config`, cth. remote bernama `offsite`)
#   - Pilihan A (lalai): `age` (https://github.com/FiloSottile/age) dengan kunci awam penerima (`AGE_RECIPIENT`)
#   - Pilihan B: tetapkan `USE_RCLONE_CRYPT=1` jika remote rclone itu sendiri sudah berjenis `crypt` (cth. `offsite-crypt:campusos-backups`)
#
# Contoh penggunaan manual:
#   AGE_RECIPIENT="age1ql3z7hjy54pw3hyww5ayyfg7zqgvc7w3j2elw8zmrj2kg5sfn9aqmcac8p" \
#   RCLONE_REMOTE="offsite:campusos-backups" \
#   ./scripts/offsite-backup.sh

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
RCLONE_REMOTE="${RCLONE_REMOTE:-offsite:campusos-backups}"
AGE_RECIPIENT="${AGE_RECIPIENT:-}"
USE_RCLONE_CRYPT="${USE_RCLONE_CRYPT:-0}"
REMOTE_RETENTION_DAYS="${REMOTE_RETENTION_DAYS:-30}"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "[ralat] Folder sandaran tidak ditemui: $BACKUP_DIR" >&2
  exit 1
fi

if ! command -v rclone >/dev/null 2>&1; then
  echo "[ralat] 'rclone' tidak dipasang. Pasang dahulu: https://rclone.org/install/" >&2
  exit 1
fi

shopt -s nullglob
DB_FILES=("$BACKUP_DIR"/campusos-*.db)
if [[ ${#DB_FILES[@]} -eq 0 ]]; then
  echo "[amaran] Tiada fail sandaran campusos-*.db dalam $BACKUP_DIR" >&2
  exit 0
fi

if [[ "$USE_RCLONE_CRYPT" == "1" ]]; then
  # Pilihan B: Remote rclone sudah dikonfigurasi sebagai jenis `crypt`
  echo "[info] Menyalin sandaran ke remote rclone crypt ($RCLONE_REMOTE)..."
  rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --include "campusos-*.db" --transfers 2
else
  # Pilihan A (lalai): Sulitkan setiap fail .db dengan `age` sebelum dimuat naik
  if [[ -z "$AGE_RECIPIENT" ]]; then
    echo "[ralat] Tetapkan AGE_RECIPIENT (kunci awam age1...) atau USE_RCLONE_CRYPT=1." >&2
    exit 1
  fi
  if ! command -v age >/dev/null 2>&1; then
    echo "[ralat] 'age' tidak dipasang (cth. apt install age). Pasang 'age' atau guna USE_RCLONE_CRYPT=1." >&2
    exit 1
  fi

  STAGE_DIR="$(mktemp -d)"
  trap 'rm -rf "$STAGE_DIR"' EXIT

  for db_file in "${DB_FILES[@]}"; do
    base_name="$(basename "$db_file")"
    age -r "$AGE_RECIPIENT" -o "$STAGE_DIR/${base_name}.age" "$db_file"
  done

  echo "[info] Memuat naik ${#DB_FILES[@]} fail sandaran tersulit (.db.age) ke $RCLONE_REMOTE..."
  rclone copy "$STAGE_DIR" "$RCLONE_REMOTE" --include "campusos-*.db.age" --transfers 2
fi

# Bersihkan salinan luar pelayan yang melebihi tempoh simpanan (lalai: 30 hari)
rclone delete "$RCLONE_REMOTE" --min-age "${REMOTE_RETENTION_DAYS}d" || true
echo "[berjaya] Sandaran luar pelayan selesai ($(date -u +"%Y-%m-%dT%H:%M:%SZ"))."
