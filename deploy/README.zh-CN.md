# 悬赏生产部署

## VPS 要求

- 64 位 Linux：Ubuntu 22.04/24.04、Debian 12、Rocky/AlmaLinux 9
- 最低 2 vCPU、4 GB RAM、25 GB SSD；构建期间建议 8 GB RAM，低内存机器应先配置 swap
- 一个已把 A/AAAA 记录解析到 VPS 的域名
- 防火墙和云安全组开放 TCP 22、80、443 及 UDP 443
- root 权限或可用的 `sudo`
- 出站可访问 GitHub、Docker Hub、npm 与 Let's Encrypt

安装器会检查 Linux、Git、OpenSSL、curl 和至少 8 GB 可用磁盘。Docker 不存在时会使用 Docker 官方安装脚本安装 Engine 与 Compose 插件。

## 私有 GitHub 仓库

私有仓库不能在没有凭据的全新 VPS 上直接克隆。推荐为这台 VPS 创建仓库级、只读 Deploy Key；不要把 Personal Access Token 写入命令、脚本或 Shell 历史。

在 VPS 上以 root 创建专用密钥：

```bash
sudo install -d -m 700 /root/.ssh
sudo ssh-keygen -t ed25519 -f /root/.ssh/xuanshang_deploy -N '' -C xuanshang-vps
sudo cat /root/.ssh/xuanshang_deploy.pub
```

把输出加入 GitHub 仓库的 `Settings → Deploy keys → Add deploy key`，不要勾选写权限。随后运行：

```bash
sudo bash -c 'set -Eeuo pipefail
if ! command -v git >/dev/null; then
  if command -v apt-get >/dev/null; then apt-get update && apt-get install -y git
  elif command -v dnf >/dev/null; then dnf install -y git
  else echo "请先安装 Git" >&2; exit 1
  fi
fi
export GIT_SSH_COMMAND="ssh -i /root/.ssh/xuanshang_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
test -d /opt/xuanshang/.git || git clone git@github.com:bestranran/xuanshang.git /opt/xuanshang
git -C /opt/xuanshang config core.sshCommand "ssh -i /root/.ssh/xuanshang_deploy -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"
cd /opt/xuanshang
exec bash deploy.sh'
```

脚本显示中文菜单后，选择 `1) 首次安装`，输入已经解析到本机的域名。安装器会：

1. 生成数据库密码、JWT 密钥、主加密密钥与内部邮件中继密钥；
2. 用当前 Git commit 作为镜像版本构建 Wasp 前后端；
3. 执行 Prisma 生产迁移；
4. 启动 PostgreSQL、Wasp/PgBoss、邮件中继和 Caddy；
5. 等待容器健康并请求公网 HTTPS 首页；
6. 只有全部通过才记录已部署版本。

Caddy 会自动申请并续期 Let's Encrypt 证书。首次安装必须等 DNS 生效后再执行。

## 首位管理员与后台配置

首次注册时如果尚未配置 SMTP，验证邮件只会写入服务器上的 `mail-relay` 容器日志。通过菜单查看日志、完成验证，再选择 `11) 创建首位管理员`。

登录后在“管理后台 → 系统设置”配置易支付、正式 SMTP、S3 兼容对象存储和平台费率。

管理员可以增加或扣减充值余额和收益余额。每次调整必须填写原因，并产生幂等钱包账本与管理员审计记录；管理员调整不是系统异常，而是被授权的余额发行或销毁。

## 日常操作

交互菜单：

```bash
cd /opt/xuanshang
sudo bash deploy.sh
```

也可以直接执行常用命令：

```bash
sudo bash deploy.sh status
sudo bash deploy.sh backup
sudo bash deploy.sh update
```

更新过程先检查工作区、拉取代码并构建 Git commit 版本镜像。构建成功后才备份和迁移数据库。新版本未通过容器健康检查或公网 HTTPS 冒烟检查时，脚本会尝试切回旧应用镜像。

数据库迁移不会自动倒退。已经在生产执行的迁移不能删除、改写或合并；后续只能追加迁移，并采用“先扩展、后迁移数据、最后清理旧结构”的兼容策略。

## 备份与恢复

备份保存在 `deploy/backups/`，权限为 600。自动生成的生产配置默认保留 14 天的定时命名备份，可在 `deploy/.env` 中调整：

```dotenv
BACKUP_RETENTION_DAYS=14
```

每天凌晨 3 点自动备份的 cron 示例：

```cron
0 3 * * * cd /opt/xuanshang && /usr/bin/bash deploy.sh backup >> /var/log/xuanshang-backup.log 2>&1
```

本机备份只能防止误操作，不能防止 VPS 或磁盘整体损坏。必须再把 `deploy/backups/` 加密同步到另一台机器或对象存储，并定期从副本执行恢复演练。

恢复操作会先校验归档、创建安全备份，并要求输入 `RESTORE`。恢复时应用和邮件中继会停止，数据库重建完成后再启动并执行健康检查。

## Cloudflare R2 视频存储

后台对象存储区域填写 `auto`，Endpoint 使用 R2 Bucket 的 S3 API 地址。API Token 至少需要对象读、写和删除权限。Bucket CORS 必须允许正式站点来源执行 `GET`、`HEAD`、`PUT`、`POST`，并在 `ExposeHeaders` 中加入 `ETag`。

建议在 R2 设置生命周期规则，自动终止超过 1 天仍未完成的 Multipart Upload。应用也会每小时清理超过 24 小时未完成或未绑定的上传，并在业务结束 30 天后清理非最终历史版本。

## 持久化与安全

- `deploy/.env` 权限为 600，且被 Git 忽略。
- 支付、SMTP、对象存储密钥由 `APP_MASTER_KEY` 以 AES-256-GCM 加密后存入 PostgreSQL。
- PostgreSQL、应用和邮件中继只连接内部 Docker 网络。
- Caddy 是唯一公开服务，只暴露 80/443。
- 所有容器日志限制为每个文件 10 MB、最多 5 个文件。
- 重复首次安装不会覆盖 `.env` 或数据库卷。
- 卸载默认保留数据库、证书、配置和备份。

## 上线检查

- [ ] 私有仓库 Deploy Key 只有读取权限
- [ ] DNS A/AAAA 记录正确，80/443 对公网开放
- [ ] `bash deploy/tests/test-deploy.sh` 通过
- [ ] 三个生产镜像构建成功
- [ ] 首次安装的健康检查和 HTTPS 冒烟检查通过
- [ ] 已创建管理员并配置正式 SMTP、支付和对象存储
- [ ] 使用小额真实订单验证支付异步通知和幂等入账
- [ ] 管理员增减两类余额后，钱包账本和审计日志一致
- [ ] 定时备份与异机同步生效，并完成过一次恢复演练
- [ ] 外部可用性、磁盘和内存告警已配置

本地静态自检：

```bash
bash deploy/tests/test-deploy.sh
```
