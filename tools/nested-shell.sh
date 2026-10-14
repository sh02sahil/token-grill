#!/usr/bin/env bash
# Starts an isolated nested GNOME Shell, then enables, disables and re-enables
# the locally installed Token Grill build (PRACTICES T-3).
set -euo pipefail

# The bus name appears before the extension manager has scanned the extensions,
# so `info` fails at first; that counts as no state yet.
extension_state() {
    local info
    info="$(gnome-extensions info "$uuid" 2>/dev/null)" || return 0
    if [[ "$info" =~ State:\ ([A-Z_]+) ]]; then
        echo "${BASH_REMATCH[1]}"
    fi
}

wait_for_state() {
    local expected="$1" state=""
    for _ in {1..120}; do
        state="$(extension_state)"
        if [[ "$state" == "$expected" ]]; then
            echo "$uuid: State: $state"
            return 0
        fi
        kill -0 "$shell" 2>/dev/null || return 1
        sleep 0.25
    done
    echo "$uuid did not reach State: $expected (last: ${state:-unknown})." >&2
    return 1
}

# Runs inside the private D-Bus session.
run_nested() {
    # systemd-cat turns stderr into a journal stream, so GLib logs the nested
    # shell as structured entries under /usr/bin/gnome-shell.
    systemd-cat --identifier=gnome-shell-nested gnome-shell --devkit --wayland &
    shell=$!
    trap 'kill "$shell" 2>/dev/null || true' EXIT

    gdbus wait --session --timeout 30 org.gnome.Shell
    for _ in {1..120}; do
        [[ -n "$(extension_state)" ]] && break
        sleep 0.25
    done

    gnome-extensions enable "$uuid"
    wait_for_state ACTIVE
    gnome-extensions disable "$uuid"
    wait_for_state INACTIVE
    gnome-extensions enable "$uuid"
    wait_for_state ACTIVE

    cat <<EOF

Journal (all Shell processes):  journalctl -f -o cat /usr/bin/gnome-shell
Journal (nested shell only):    journalctl -f -o cat _PID=$shell
Preferences process:            journalctl -f -o cat /usr/bin/gjs

Use the nested session bus from another terminal:
    export DBUS_SESSION_BUS_ADDRESS=$DBUS_SESSION_BUS_ADDRESS
Lock:
    gdbus call --session --dest org.gnome.ScreenSaver --object-path /org/gnome/ScreenSaver --method org.gnome.ScreenSaver.Lock
Unlock with your password in the nested window, or:
    gdbus call --session --dest org.gnome.ScreenSaver --object-path /org/gnome/ScreenSaver --method org.gnome.ScreenSaver.SetActive false

Close the devkit window or press Ctrl+C to stop the nested shell.
EOF
    wait "$shell"
}

if [[ "${1:-}" == --in-session ]]; then
    uuid="$2"
    run_nested
    exit
fi

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
uuid="$(node -p 'require(process.argv[1]).uuid' "$root/metadata.json")"
data_home="${XDG_DATA_HOME:-$HOME/.local/share}"

# Token Grill writes aggregates to the data home and parser checkpoints to the
# state home. Isolating only one of them would let the nested instance advance
# the real checkpoints while its totals go to the scratch directory.
if [[ "$data_home" != "$HOME/.local/share" && -z "${XDG_STATE_HOME:-}" ]]; then
    echo "XDG_DATA_HOME is isolated but XDG_STATE_HOME is not." >&2
    echo "Set XDG_STATE_HOME to a scratch directory as well." >&2
    exit 1
fi

if [[ ! -f "$data_home/gnome-shell/extensions/$uuid/metadata.json" ]]; then
    echo "Token Grill is not installed as $uuid in $data_home." >&2
    echo "Run 'npm run install:local' with the same XDG_DATA_HOME first." >&2
    exit 1
fi

node - "$uuid" "$data_home/gnome-shell/extensions" \
    /usr/local/share/gnome-shell/extensions /usr/share/gnome-shell/extensions <<'EOF'
const fs = require('fs');
const path = require('path');

const [uuid, ...roots] = process.argv.slice(2);
for (const root of roots.filter(dir => fs.existsSync(dir))) {
    for (const entry of fs.readdirSync(root)) {
        const file = path.join(root, entry, 'metadata.json');
        if (!fs.existsSync(file))
            continue;
        const text = fs.readFileSync(file, 'utf8');
        if (!text.includes('Token Grill'))
            continue;
        const metadata = JSON.parse(text);
        if (metadata.uuid !== uuid) {
            console.error(`Conflicting Token Grill installation: ${metadata.uuid}`);
            console.error(`Path: ${path.dirname(file)}`);
            console.error(`Disable or uninstall it before testing ${uuid}.`);
            process.exit(1);
        }
    }
}
EOF

# The devkit viewer is a client of the host compositor. A forced backend such as
# GDK_BACKEND=x11 makes it connect to the nested shell's own Xwayland with the
# host's X cookie, so the viewer fails and the nested shell exits at once.
unset GDK_BACKEND

# A private D-Bus session keeps the host Shell and its windows untouched.
exec dbus-run-session -- bash "${BASH_SOURCE[0]}" --in-session "$uuid"
