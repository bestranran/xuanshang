#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
bash -n "$ROOT/deploy.sh"
TMP_DIR="$(mktemp -d)"
CREATED_COMPOSE_ENV=0
cleanup() {
  if [[ "$CREATED_COMPOSE_ENV" -eq 1 ]]; then rm -f "$ROOT/deploy/.env"; fi
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT
XUANSHANG_ENV_FILE="$TMP_DIR/.env" XUANSHANG_LOCK_FILE="$TMP_DIR/lock" "$ROOT/deploy.sh" --self-test
grep -q 'POSTGRES_PASSWORD' "$ROOT/deploy/docker-compose.yml"
grep -q 'APP_MASTER_KEY' "$ROOT/deploy.sh"
grep -q 'target: web' "$ROOT/deploy/docker-compose.yml"
grep -q 'try_files {path} {path}.html /200.html' "$ROOT/deploy/Caddyfile"
grep -q 'max-size: "10m"' "$ROOT/deploy/docker-compose.yml"
grep -q 'condition: service_healthy' "$ROOT/deploy/docker-compose.yml"
grep -q 'save_deployed_version' "$ROOT/deploy.sh"
grep -q 'BACKUP_RETENTION_DAYS=14' "$ROOT/deploy.sh"
grep -q 'smoke_test' "$ROOT/deploy.sh"
! grep -Eq 'EPAY_KEY=|SMTP_PASSWORD=|AWS_S3_IAM_SECRET_KEY=' "$ROOT/deploy/docker-compose.yml"
if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
  if [[ ! -f "$ROOT/deploy/.env" ]]; then cp "$TMP_DIR/.env" "$ROOT/deploy/.env"; CREATED_COMPOSE_ENV=1; fi
  docker compose -f "$ROOT/deploy/docker-compose.yml" --env-file "$ROOT/deploy/.env" config --quiet
fi
printf '%s\n' "deployment tests passed"
