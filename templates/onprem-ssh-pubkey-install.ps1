# On-Prem 部署服务器 — 为 Claude 装 SSH 公钥(一次性 onboarding)
# 决策/SOP:engineering-standards ADR-043 / standards/onprem-server-ssh-ops-standard.md
#
# 用法:
#   1) 本机(Mac)取公钥:  cat ~/.ssh/id_sys_deploy.pub
#   2) 填入下方 $pubKey
#   3) 整段贴到服务器【管理员】PowerShell 执行
# 适用:目标账户为【管理员组】(公钥进 administrators_authorized_keys + 锁 ACL)。
#       普通用户见 standard(放 C:\Users\<user>\.ssh\authorized_keys 即可)。
#
# 前置(若服务器尚未开 OpenSSH Server,先跑一次):
#   Add-WindowsCapability -Online -Name "OpenSSH.Server~~~~0.0.1.0"
#   Start-Service sshd; Set-Service -Name sshd -StartupType Automatic
#   New-ItemProperty -Path "HKLM:\SOFTWARE\OpenSSH" -Name DefaultShell `
#     -Value "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -PropertyType String -Force
#   # 防火墙规则 OpenSSH-Server-In-TCP 通常自动创建,核对:Get-NetFirewallRule -Name *ssh*

$pubKey  = "<PASTE_PUBKEY_HERE>"   # ← 填 ~/.ssh/id_sys_deploy.pub 一整行(ssh-ed25519 AAAA... claude-...)
$keyFile = "$env:ProgramData\ssh\administrators_authorized_keys"

if (-not (Test-Path $keyFile)) { New-Item -ItemType File -Path $keyFile -Force | Out-Null }

# 追加公钥(去重)
$existing = Get-Content $keyFile -ErrorAction SilentlyContinue
if ($existing -notcontains $pubKey) {
    Add-Content -Path $keyFile -Value $pubKey -Encoding ascii
    Write-Host "[OK] 公钥已写入"
} else {
    Write-Host "[SKIP] 公钥已存在"
}

# ACL:去继承 + 只留 SYSTEM(*S-1-5-18) + Administrators(*S-1-5-32-544);SID 兼容中文系统
icacls $keyFile /inheritance:r /grant "*S-1-5-18:F" /grant "*S-1-5-32-544:F" | Out-Null
# 关键坑:/inheritance:r 清不掉显式 Authenticated Users(*S-1-5-11),必须显式移除,否则严格模式拒钥
icacls $keyFile /remove:g "*S-1-5-11" | Out-Null

Restart-Service sshd

# 自检(应只剩 SYSTEM + Administrators)
Write-Host "`n=== authorized_keys ==="; Get-Content $keyFile
Write-Host "`n=== ACL ==="; icacls $keyFile
Write-Host "`n=== sshd ==="; Get-Service sshd
