#!/usr/bin/env bash
set -euo pipefail

archive=$1
name=$2
[[ "$name" =~ ^[a-zA-Z0-9-]+$ ]]
root=/opt/judgecall-sep
release="$root/releases/$name"
current="$root/current"
site=/etc/nginx/sites-available/judgecall-public-https
snippet=/etc/nginx/snippets/judgecall-sep.conf
vhost=/etc/nginx/sites-available/sep.judgecall.net
enabled=/etc/nginx/sites-enabled/sep.judgecall.net
unit=/etc/systemd/system/judgecall-sep.service
backups=/var/backups/judgecall-sep

install -d -m 755 "$root/releases"
install -d -m 700 "$backups"
mkdir "$release"
tar -xzf "$archive" --no-same-owner -C "$release"
test -s "$release/dist/index.html"
test -s "$release/server.mjs"
test "$(readlink -f "$enabled")" = "$vhost"
if ! getent passwd judgecall-sep >/dev/null; then
    useradd -r -U -d /var/lib/judgecall-sep -s /usr/sbin/nologin judgecall-sep
fi
install -d -o judgecall-sep -g judgecall-sep -m 700 /var/lib/judgecall-sep
previous=$(readlink -f "$current" || true)
cp -p "$site" "$backups/$name.nginx"
cp -p "$vhost" "$backups/$name.vhost"
if [[ -e "$unit" ]]; then cp -p "$unit" "$backups/$name.service"; fi
if [[ -e "$snippet" ]]; then cp -p "$snippet" "$backups/$name.conf"; fi

switch_to() {
    ln -sfn "$1" "$current.next"
    mv -Tf "$current.next" "$current"
}

restore_file() {
    if [[ -e "$1" ]]; then cp -p "$1" "$2"; else rm -f "$2"; fi
}

rollback() {
    trap - ERR
    cp -p "$backups/$name.nginx" "$site"
    cp -p "$backups/$name.vhost" "$vhost"
    restore_file "$backups/$name.conf" "$snippet"
    if [[ -n "$previous" && -d "$previous" ]]; then
        switch_to "$previous"
        restore_file "$backups/$name.service" "$unit"
        systemctl daemon-reload
        systemctl restart judgecall-sep || true
    else
        systemctl disable --now judgecall-sep || true
        restore_file "$backups/$name.service" "$unit"
        systemctl daemon-reload
        rm -f "$current"
    fi
    if nginx -t; then systemctl reload nginx || true; fi
    exit 1
}
trap rollback ERR

install -m 644 "$release/deploy/judgecall-sep.service" "$unit"
switch_to "$release"
systemctl daemon-reload
systemctl enable judgecall-sep
systemctl restart judgecall-sep
for trial in 1 2 3 4 5; do
    if curl -fs http://127.0.0.1:3104/api/session > /dev/null; then break; fi
    sleep 1
done
curl -fsS http://127.0.0.1:3104/ > /dev/null

install -m 644 "$release/deploy/judgecall-sep.conf" "$snippet"
install -m 644 "$release/deploy/sep.judgecall.net.conf" "$vhost"
python3 - "$site" <<'PY'
import re
import sys
from pathlib import Path

path = Path(sys.argv[1])
config = path.read_text()
include = "    include /etc/nginx/snippets/judgecall-sep.conf;"
if include not in config:
    marker = r"(?m)^(    root /var/www/judgecall/current;)$"
    new, count = re.subn(marker, r"\1" + "\n" + include, config)
    if count != 1:
        raise ValueError("Cannot locate unique JudgeCall index virtual host")
    path.write_text(new)
PY
nginx -t
systemctl reload nginx
verify_https() {
    curl -fSs --resolve sep.judgecall.net:443:127.0.0.1 "https://sep.judgecall.net$1" > /dev/null
}
for trial in 1 2 3 4 5; do
    if verify_https /api/session 2>/dev/null && verify_https / 2>/dev/null; then break; fi
    sleep 1
done
verify_https /api/session
verify_https /
trap - ERR
systemctl is-active judgecall-sep
