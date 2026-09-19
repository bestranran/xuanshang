#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly DEPLOY_DIR="$SCRIPT_DIR/deploy"
readonly ENV_FILE="${XUANSHANG_ENV_FILE:-$DEPLOY_DIR/.env}"
readonly COMPOSE_FILE="$DEPLOY_DIR/docker-compose.yml"
readonly BACKUP_DIR="$DEPLOY_DIR/backups"
readonly VERSION_FILE="$DEPLOY_DIR/.deployed-version"
readonly LOCK_FILE="${XUANSHANG_LOCK_FILE:-/tmp/xuanshang-deploy.lock}"
COMPOSE=()
LAST_BACKUP=""

green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*" >&2; }
die() { red "错误：$*"; exit 1; }
confirm() { local answer; read -r -p "$1 [y/N] " answer; [[ "$answer" =~ ^[Yy]$ ]]; }
require_env() { [[ -f "$ENV_FILE" ]] || die "尚未安装，请先选择“首次安装”"; }

as_root() {
  if [[ ${EUID:-$(id -u)} -eq 0 ]]; then "$@"; else sudo "$@"; fi
}

detect_compose() {
  if docker compose version >/dev/null 2>&1; then COMPOSE=(docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE");
  elif command -v docker-compose >/dev/null 2>&1; then COMPOSE=(docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE");
  else return 1; fi
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && detect_compose; then return; fi
  yellow "正在安装 Docker Engine 与 Compose 插件……"
  command -v curl >/dev/null 2>&1 || {
    if command -v apt-get >/dev/null 2>&1; then as_root apt-get update; as_root apt-get install -y curl ca-certificates;
    elif command -v dnf >/dev/null 2>&1; then as_root dnf install -y curl ca-certificates;
    else die "无法自动安装 curl，请先安装 curl"; fi
  }
  local installer; installer="$(mktemp)"
  curl -fsSL https://get.docker.com -o "$installer"
  as_root sh "$installer"
  rm -f "$installer"
  as_root systemctl enable --now docker
  detect_compose || die "Docker Compose 安装失败"
  if [[ ${EUID:-$(id -u)} -ne 0 ]]; then yellow "当前命令继续使用 sudo；重新登录后可直接使用 docker。"; fi
}

dc() {
  if [[ ${EUID:-$(id -u)} -eq 0 ]] || docker info >/dev/null 2>&1; then
    "${COMPOSE[@]}" "$@"
  else
    sudo --preserve-env=APP_VERSION "${COMPOSE[@]}" "$@"
  fi
}

install_prerequisites() {
  if command -v git >/dev/null 2>&1 && command -v curl >/dev/null 2>&1 && command -v openssl >/dev/null 2>&1; then return; fi
  yellow "正在安装 Git、curl、OpenSSL 与 CA 证书……"
  if command -v apt-get >/dev/null 2>&1; then
    as_root apt-get update
    as_root apt-get install -y git curl openssl ca-certificates
  elif command -v dnf >/dev/null 2>&1; then
    as_root dnf install -y git curl openssl ca-certificates
  else
    die "无法识别系统包管理器，请先安装 git、curl、openssl 和 ca-certificates"
  fi
}

git_version() { git -C "$SCRIPT_DIR" rev-parse --short=12 HEAD 2>/dev/null || printf 'local'; }
deployed_version() { [[ -s "$VERSION_FILE" ]] && head -n 1 "$VERSION_FILE" || printf 'local'; }
save_deployed_version() {
  local tmp="$VERSION_FILE.tmp"
  printf '%s\n' "$1" > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$VERSION_FILE"
}
use_deployed_version() { APP_VERSION="$(deployed_version)"; export APP_VERSION; }

preflight_host() {
  [[ "$(uname -s)" == "Linux" ]] || die "生产安装器只支持 Linux VPS"
  command -v git >/dev/null 2>&1 || die "缺少 git"
  command -v openssl >/dev/null 2>&1 || die "缺少 openssl"
  command -v curl >/dev/null 2>&1 || die "缺少 curl"
  local free_kb
  free_kb="$(df -Pk "$SCRIPT_DIR" | awk 'NR==2 {print $4}')"
  [[ "$free_kb" =~ ^[0-9]+$ && "$free_kb" -ge 8388608 ]] || die "可用磁盘不足 8 GB"
  if [[ -r /proc/meminfo ]]; then
    local memory_kb
    memory_kb="$(awk '/MemTotal/ {print $2}' /proc/meminfo)"
    if [[ "$memory_kb" =~ ^[0-9]+$ && "$memory_kb" -lt 3900000 ]]; then
      yellow "内存少于 4 GB；生产镜像构建可能失败，请先配置 swap。"
    fi
  fi
}

generate_env() {
  local domain="$1"
  if [[ -f "$ENV_FILE" ]]; then
    yellow "检测到现有配置：$ENV_FILE（不会覆盖）"
    return
  fi
  local db_password jwt_secret master_key relay_password tmp
  db_password="$(openssl rand -hex 24)"
  jwt_secret="$(openssl rand -base64 48 | tr -d '\n')"
  master_key="$(openssl rand -base64 32 | tr -d '\n')"
  relay_password="$(openssl rand -hex 24)"
  tmp="$(mktemp "$(dirname "$ENV_FILE")/.env.XXXXXX")"
  {
    printf 'DOMAIN=%s\n' "$domain"
    printf 'POSTGRES_DB=xuanshang\nPOSTGRES_USER=xuanshang\nPOSTGRES_PASSWORD=%s\n' "$db_password"
    printf 'JWT_SECRET=%s\nAPP_MASTER_KEY=%s\n' "$jwt_secret" "$master_key"
    printf 'RELAY_USERNAME=wasp\nRELAY_PASSWORD=%s\n' "$relay_password"
    printf 'ADMIN_EMAILS=\nAPP_VERSION=local\nBACKUP_RETENTION_DAYS=14\n'
  } > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$ENV_FILE"
  green "已生成并保护数据库密码、JWT 密钥和主加密密钥。"
}

wait_healthy() {
  local deadline=$((SECONDS + 180)) app_status relay_status
  while (( SECONDS < deadline )); do
    app_status="$(dc ps app --format json 2>/dev/null || true)"
    relay_status="$(dc ps mail-relay --format json 2>/dev/null || true)"
    if [[ "$app_status" == *'"Health":"healthy"'* ]] && [[ "$relay_status" == *'"Health":"healthy"'* ]]; then return 0; fi
    sleep 3
  done
  dc ps
  red "应用未在 3 分钟内通过健康检查，请查看日志"
  return 1
}

smoke_test() {
  local domain attempt
  domain="$(sed -n 's/^DOMAIN=//p' "$ENV_FILE" | head -n 1)"
  [[ -n "$domain" ]] || { red "配置中缺少 DOMAIN"; return 1; }
  for attempt in {1..18}; do
    if curl -fsS --max-time 10 "https://$domain/" >/dev/null 2>&1; then
      green "公网 HTTPS 冒烟检查通过。"
      return 0
    fi
    sleep 5
  done
  red "无法通过 https://$domain/ 访问站点；请检查 DNS、80/443 端口和 Caddy 日志"
  return 1
}

backup_db() {
  require_env; detect_compose || die "未找到 Docker Compose"; use_deployed_version
  mkdir -p "$BACKUP_DIR"
  dc up -d db
  local ready=0
  for _ in {1..30}; do dc exec -T db sh -c 'pg_isready -U "$POSTGRES_USER" -d "$POSTGRES_DB"' >/dev/null 2>&1 && { ready=1; break; }; sleep 1; done
  [[ "$ready" -eq 1 ]] || die "数据库未就绪"
  local target="$BACKUP_DIR/xuanshang-$(date +%Y%m%d-%H%M%S).dump" tmp="$BACKUP_DIR/.backup.tmp" retention_days
  dc exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc' > "$tmp"
  [[ -s "$tmp" ]] || { rm -f "$tmp"; die "备份为空"; }
  mv "$tmp" "$target"; chmod 600 "$target"
  LAST_BACKUP="$target"
  retention_days="$(sed -n 's/^BACKUP_RETENTION_DAYS=//p' "$ENV_FILE" | head -n 1)"
  [[ "$retention_days" =~ ^[0-9]+$ ]] || retention_days=14
  find "$BACKUP_DIR" -maxdepth 1 -type f -name 'xuanshang-*.dump' -mtime "+$retention_days" -delete
  green "数据库已备份：$target"
}

migrate_db() {
  require_env; detect_compose || die "未找到 Docker Compose"
  dc up -d db
  dc run --rm app db-migrate-prod || return 1
  green "数据库迁移完成。"
}

first_install() {
  install_prerequisites
  preflight_host
  install_docker
  local domain
  read -r -p "请输入已解析到本机公网 IP 的域名（如 task.example.com）：" domain
  [[ "$domain" =~ ^[A-Za-z0-9.-]+$ && "$domain" == *.* ]] || die "域名格式无效"
  mkdir -p "$BACKUP_DIR"
  generate_env "$domain"
  domain="$(sed -n 's/^DOMAIN=//p' "$ENV_FILE" | head -n 1)"
  detect_compose
  APP_VERSION="$(git_version)"; export APP_VERSION
  yellow "开始构建生产镜像（首次通常需要 5–15 分钟）……"
  dc build --pull
  dc up -d db
  migrate_db
  dc up -d mail-relay app caddy
  wait_healthy || die "首次安装失败"
  smoke_test || die "容器已经启动，但公网验收失败"
  save_deployed_version "$APP_VERSION"
  green "安装完成：https://$domain"
  printf '%s\n' "Caddy 会自动申请并续期 Let's Encrypt 证书。请确认 DNS 已生效且防火墙开放 TCP 80/443 与 UDP 443。"
  printf '%s\n' "请先在网页注册账号，然后从菜单选择“创建首位管理员”并输入该账号邮箱。"
}

update_app() {
  require_env; detect_compose || die "未找到 Docker Compose"
  if [[ -n "$(git -C "$SCRIPT_DIR" status --porcelain --untracked-files=no)" ]]; then die "代码目录有未提交修改，为避免覆盖已停止更新"; fi
  local old_version new_version
  old_version="$(deployed_version)"
  git -C "$SCRIPT_DIR" pull --ff-only
  new_version="$(git_version)"
  APP_VERSION="$new_version"; export APP_VERSION
  yellow "正在构建版本 $new_version；构建期间现有服务继续运行。"
  dc build --pull || die "新版本构建失败；现有服务未被替换"
  backup_db
  APP_VERSION="$new_version"; export APP_VERSION
  migrate_db || die "数据库迁移失败；现有服务仍在运行。备份：$LAST_BACKUP"
  if ! dc up -d --remove-orphans mail-relay app caddy || ! wait_healthy || ! smoke_test; then
    red "新版本验收失败，正在恢复应用镜像 $old_version。"
    APP_VERSION="$old_version"; export APP_VERSION
    dc up -d --no-build --remove-orphans mail-relay app caddy || true
    wait_healthy || true
    die "已尝试恢复旧镜像；数据库迁移不会自动倒退。更新前备份：$LAST_BACKUP"
  fi
  save_deployed_version "$new_version"
  green "更新完成。"
}

restore_db() {
  require_env; detect_compose || die "未找到 Docker Compose"; use_deployed_version
  mkdir -p "$BACKUP_DIR"
  dc up -d db
  local files=() choice target
  while IFS= read -r file; do files+=("$file"); done < <(find "$BACKUP_DIR" -maxdepth 1 -type f -name '*.dump' -print | sort -r)
  ((${#files[@]})) || die "没有可用备份"
  printf '%s\n' "可用备份："; select target in "${files[@]}" "取消"; do [[ "$target" == "取消" ]] && return; [[ -n "$target" ]] && break; done
  dc exec -T db pg_restore --list < "$target" >/dev/null || die "备份文件校验失败"
  confirm "恢复会替换当前数据库内容，是否先创建安全备份并继续？" || return
  backup_db
  read -r -p "请输入 RESTORE 确认恢复：" choice; [[ "$choice" == "RESTORE" ]] || { yellow "已取消"; return; }
  dc stop app mail-relay
  dc exec -T db sh -c 'dropdb -U "$POSTGRES_USER" --if-exists --force "$POSTGRES_DB"'
  dc exec -T db sh -c 'createdb -U "$POSTGRES_USER" "$POSTGRES_DB"'
  dc exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < "$target"
  dc up -d mail-relay app
  wait_healthy || die "数据库已恢复，但应用健康检查失败"
  green "数据库恢复完成。"
}

promote_admin() {
  require_env; detect_compose || die "未找到 Docker Compose"; use_deployed_version
  local email result
  read -r -p "请输入已注册账号的完整邮箱：" email
  [[ "$email" == *@*.* ]] || die "邮箱格式无效"
  confirm "确认将 $email 设为管理员？" || return
  result="$(printf '%s\n' 'UPDATE "User" SET "isAdmin"=true WHERE lower(email)=lower(:'"'"'email'"'"') RETURNING id;' | dc exec -T db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v "email=$1" -tA' _ "$email")"
  [[ -n "$result" ]] || die "未找到该账号，请先在网页完成注册"
  green "管理员权限已授予：$email"
}

uninstall_app() {
  require_env; detect_compose || die "未找到 Docker Compose"
  local typed
  read -r -p "请输入 UNINSTALL 确认停止并移除应用容器：" typed; [[ "$typed" == "UNINSTALL" ]] || return
  dc down
  yellow "数据库卷、证书、配置和备份均已保留。"
  if confirm "是否连同数据库卷和证书卷一并删除？此操作不可恢复"; then
    read -r -p "请输入 DELETE-DATA 再次确认：" typed
    if [[ "$typed" == "DELETE-DATA" ]]; then backup_db; dc down -v; green "数据卷已删除，备份仍保留在 $BACKUP_DIR"; fi
  fi
}

status_app() { require_env; detect_compose || die "未找到 Docker Compose"; use_deployed_version; printf '部署版本：%s\n' "$APP_VERSION"; dc ps; }
logs_app() { require_env; detect_compose || die "未找到 Docker Compose"; use_deployed_version; dc logs --tail=200 -f app mail-relay caddy db; }
start_app() { require_env; detect_compose || die "未找到 Docker Compose"; use_deployed_version; dc up -d; wait_healthy || die "启动后健康检查失败"; }
stop_app() { require_env; detect_compose || die "未找到 Docker Compose"; use_deployed_version; dc stop; }
restart_app() { require_env; detect_compose || die "未找到 Docker Compose"; use_deployed_version; dc restart; wait_healthy || die "重启后健康检查失败"; }

self_test() {
  [[ -f "$COMPOSE_FILE" && -f "$DEPLOY_DIR/Dockerfile" && -f "$DEPLOY_DIR/Caddyfile" ]] || die "部署文件缺失"
  bash -n "$0"
  if [[ "$ENV_FILE" != "$DEPLOY_DIR/.env" ]]; then
    mkdir -p "$(dirname "$ENV_FILE")"
    generate_env "self-test.example.com" >/dev/null
    local before after
    before="$(cksum "$ENV_FILE")"
    generate_env "must-not-overwrite.example.com" >/dev/null
    after="$(cksum "$ENV_FILE")"
    [[ "$before" == "$after" ]] || die "幂等性测试失败：现有密钥被覆盖"
    grep -q '^DOMAIN=self-test.example.com$' "$ENV_FILE" || die "配置生成测试失败"
  fi
  green "部署脚本自检通过。"
}

menu() {
  while true; do
    printf '\n%s\n' "========== 悬赏生产部署管理 =========="
    printf '%s\n' "1) 首次安装" "2) 更新" "3) 启动" "4) 停止" "5) 重启" "6) 状态" "7) 日志" "8) 数据库备份" "9) 数据库恢复" "10) 数据库迁移" "11) 创建首位管理员" "12) 卸载" "0) 退出"
    read -r -p "请选择：" choice
    case "$choice" in
      1) first_install;; 2) update_app;; 3) start_app;; 4) stop_app;; 5) restart_app;; 6) status_app;; 7) logs_app;; 8) backup_db;; 9) restore_db;; 10) use_deployed_version; migrate_db;; 11) promote_admin;; 12) uninstall_app;; 0) exit 0;; *) yellow "无效选择";;
    esac
  done
}

if command -v flock >/dev/null 2>&1; then
  exec 9>"$LOCK_FILE"
  flock -n 9 || die "另一个部署操作正在运行"
else
  LOCK_DIR="${LOCK_FILE}.d"
  mkdir "$LOCK_DIR" 2>/dev/null || die "另一个部署操作正在运行"
  trap 'rmdir "$LOCK_DIR" 2>/dev/null || true' EXIT
fi
case "${1:-}" in
  --self-test) self_test;;
  backup) backup_db;;
  status) status_app;;
  update) update_app;;
  "") menu;;
  *) die "未知参数：$1";;
esac
