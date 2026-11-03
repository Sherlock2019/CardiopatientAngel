#!/usr/bin/env bash
# CardioWatch AI launcher — local machine or AWS EC2 (Amazon Linux 2023 / Ubuntu).
#
#   ./start.sh                 build + start everything, wait until healthy, print URLs
#   ./start.sh --install       also install Docker + Compose if missing (EC2 first run; needs sudo)
#   ./start.sh --public        listen on all interfaces (EC2). Restrict the Security Group to your IP!
#   ./start.sh --reset-data    regenerate the synthetic dataset and knowledge records
#   ./start.sh --stop | --logs | --status
#
# Synthetic data only. Not a medical device.
set -euo pipefail
cd "$(dirname "$0")"

INSTALL=0; PUBLIC=0; RESET=0; ACTION=up
for a in "$@"; do
  case "$a" in
    --install) INSTALL=1 ;;
    --public) PUBLIC=1 ;;
    --reset-data) RESET=1 ;;
    --stop) ACTION=stop ;;
    --logs) ACTION=logs ;;
    --status) ACTION=status ;;
    -h|--help) sed -n '2,12p' "$0"; exit 0 ;;
    *) echo "Unknown option: $a" >&2; exit 2 ;;
  esac
done

log() { printf '\033[1;34m[cardiowatch]\033[0m %s\n' "$*"; }
die() { printf '\033[1;31m[cardiowatch]\033[0m %s\n' "$*" >&2; exit 1; }

# --- EC2 detection (IMDSv2) --------------------------------------------------------------
EC2=0; PUBLIC_HOST=""
if TOKEN=$(curl -s -m 1 -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 60" 2>/dev/null) && [ -n "$TOKEN" ]; then
  EC2=1
  PUBLIC_HOST=$(curl -s -m 2 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)
fi

# --- Docker ------------------------------------------------------------------------------
install_docker() {
  log "Installing Docker…"
  . /etc/os-release
  if [[ "${ID:-}" == "amzn" ]]; then
    sudo dnf install -y docker git
    sudo mkdir -p /usr/local/lib/docker/cli-plugins
    ARCH=$(uname -m); [ "$ARCH" = "aarch64" ] || ARCH=x86_64
    sudo curl -fsSL "https://github.com/docker/compose/releases/latest/download/docker-compose-linux-${ARCH}" \
      -o /usr/local/lib/docker/cli-plugins/docker-compose
    sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-compose
    # buildx is needed by recent compose versions for builds
    BX=$(curl -fsSL https://api.github.com/repos/docker/buildx/releases/latest | grep -o '"tag_name": *"[^"]*"' | cut -d'"' -f4)
    BARCH=amd64; [ "$(uname -m)" = "aarch64" ] && BARCH=arm64
    sudo curl -fsSL "https://github.com/docker/buildx/releases/download/${BX}/buildx-${BX}.linux-${BARCH}" \
      -o /usr/local/lib/docker/cli-plugins/docker-buildx && sudo chmod +x /usr/local/lib/docker/cli-plugins/docker-buildx
  elif [[ "${ID:-}" == "ubuntu" || "${ID:-}" == "debian" ]]; then
    sudo apt-get update -y
    sudo apt-get install -y ca-certificates curl git
    curl -fsSL https://get.docker.com | sudo sh
  else
    die "Unsupported OS (${ID:-unknown}). Install Docker + the Compose plugin manually."
  fi
  sudo systemctl enable --now docker
  sudo usermod -aG docker "$USER" || true
}

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  [ "$INSTALL" = 1 ] || die "Docker with the Compose plugin is required. Re-run with --install (EC2) or install Docker Desktop."
  install_docker
fi
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  if sudo -n docker info >/dev/null 2>&1 || sudo docker info >/dev/null 2>&1; then DOCKER="sudo docker"; else die "Cannot talk to the Docker daemon."; fi
fi
COMPOSE="$DOCKER compose"

case "$ACTION" in
  stop) $COMPOSE down; exit 0 ;;
  logs) $COMPOSE logs -f --tail=100; exit 0 ;;
  status) $COMPOSE ps; exit 0 ;;
esac

# --- Configuration (.env with generated secrets, never committed) -------------------------
if [ ! -f .env ]; then
  log "Creating .env with random secrets"
  rnd() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
  DBPW=$(rnd)
  # A database volume created earlier keeps its original password; reuse the old default for it.
  if $DOCKER volume inspect cardiowatch_pgdata >/dev/null 2>&1; then
    log "Existing database volume found: keeping its password (reset with: $COMPOSE down -v)"
    DBPW=cardiowatch
  fi
  cat > .env <<EOF
SECRET_KEY=$(rnd)
POSTGRES_PASSWORD=${DBPW}
HOSPITAL_TZ=America/New_York
EOF
  chmod 600 .env
fi
set -a; . ./.env; set +a

# --- Ports: if another service already uses one, take the next free port and remember it in .env ---------
port_busy() { ss -ltn 2>/dev/null | awk '{print $4}' | grep -Eq "[:.]$1\$"; }
port_ours() { $DOCKER ps --filter "publish=$1" --format '{{.Names}}' 2>/dev/null | grep -q '^cardiowatch-'; }
pick_port() {
  local var=$1 want=${!1:-$2} p
  p=$want
  while port_busy "$p" && ! port_ours "$p"; do p=$((p + 1)); done
  [ "$p" != "$want" ] && log "Port $want is used by another service; using $p for $var"
  export "$var=$p"
  if grep -q "^$var=" .env; then sed -i "s/^$var=.*/$var=$p/" .env; else echo "$var=$p" >> .env; fi
}
pick_port API_PORT 8010
pick_port WEB_PORT 5180
pick_port MOBILE_PORT 8081

if [ "$PUBLIC" = 1 ] || { [ "$EC2" = 1 ] && [ -z "${BIND_ADDR:-}" ]; }; then export BIND_ADDR=0.0.0.0; else export BIND_ADDR="${BIND_ADDR:-127.0.0.1}"; fi
HOST="${PUBLIC_HOST:-localhost}"; [ "$BIND_ADDR" = "127.0.0.1" ] && HOST=localhost
export CORS_ORIGINS="http://${HOST}:${WEB_PORT:-5180},http://${HOST}:${MOBILE_PORT:-8081},http://localhost:5180,http://localhost:8081"

# --- Build & run --------------------------------------------------------------------------
MEM_MB=$(awk '/MemTotal/ {print int($2/1024)}' /proc/meminfo 2>/dev/null || echo 4096)
[ "$MEM_MB" -lt 3500 ] && log "Warning: ${MEM_MB} MB RAM. Image builds need ~4 GB (use t3.medium or larger, or add swap)."

if [ "$MEM_MB" -lt 6000 ]; then
  # Small instance: build one image at a time instead of three in parallel (avoids swap thrashing).
  for svc in backend frontend mobile; do
    log "Building $svc…"
    $COMPOSE build "$svc"
  done
else
  log "Building images…"
  $COMPOSE build
fi
log "Starting containers…"
$COMPOSE up -d

log "Waiting for the API to become healthy (migrations + synthetic data seeding)…"
for i in $(seq 1 120); do
  if curl -fs "http://127.0.0.1:${API_PORT:-8010}/health" >/dev/null 2>&1; then break; fi
  sleep 3
  [ "$i" = 120 ] && { $COMPOSE logs --tail=50 backend; die "API did not become healthy."; }
done

if [ "$RESET" = 1 ]; then
  log "Regenerating synthetic data and knowledge records…"
  $COMPOSE exec -T backend python -m app.seed --reset
fi

for port in "${WEB_PORT:-5180}" "${MOBILE_PORT:-8081}"; do
  # web containers start only after the API is healthy: give them up to a minute
  for i in $(seq 1 30); do
    curl -fs -o /dev/null "http://127.0.0.1:${port}/" && break
    sleep 2
    [ "$i" = 30 ] && { $COMPOSE ps; die "Service on port ${port} is not answering."; }
  done
done

cat <<EOF

  CardioWatch AI is running (synthetic data only)

  Clinical portal + Engineering Hub   http://${HOST}:${WEB_PORT:-5180}
  Patient mobile app (web build)      http://${HOST}:${MOBILE_PORT:-8081}
  API + OpenAPI docs                  http://${HOST}:${API_PORT:-8010}/docs

  Demo accounts are on the login screen (no passwords).
  Stop: ./start.sh --stop   Logs: ./start.sh --logs   Reset data: ./start.sh --reset-data
EOF
if [ "$BIND_ADDR" = "0.0.0.0" ]; then
  cat <<EOF

  EC2: open inbound TCP ${WEB_PORT:-5180}, ${MOBILE_PORT:-8081} and ${API_PORT:-8010} in the Security Group
       for YOUR IP only (demo identity switcher, no passwords). The database stays bound to localhost.
EOF
fi
