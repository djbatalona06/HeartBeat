#!/bin/bash
#
# What a Claude Code on the web session needs before it can check its own work.
#
# The problem this solves happened: a change to `app/tools/visual.mjs` was
# pushed after every local gate passed, and broke CI for six consecutive runs.
# It could not have been caught locally, because `npm run visual` needs
# `app/dist`, `npm run build` needs the .NET SDK for the Phaser/WASM game core,
# and a fresh web container has no `dotnet`. The failure was only ever visible
# from CI, three commits later.
#
# So the SDK is installed here rather than remembered. A session that can run
# `APP_BASE=/ npm run build` can run the visual walk, and a change to the build
# or to the harness can be proven before it is pushed.
#
# ## Why apt and not dot.net/v1/dotnet-install.sh
#
# The install script is the documented route and `ci.yml` uses the equivalent
# (`actions/setup-dotnet@v6`), but it downloads from
# `builds.dotnet.microsoft.com`, which the web container's egress proxy denies
# with a 403 by organization policy. Ubuntu 24.04's own `universe` archive
# carries `dotnet-sdk-10.0`, which is reachable, so that is the channel. If this
# ever needs to move back, the pin to match is `net10.0` — see the `TargetFramework`
# in `game/*/*.csproj`.
#
# Synchronous on purpose: the container caches after this completes, so the
# first session pays the install and later ones do not. Async would start
# sessions sooner and reintroduce the exact race this exists to close — a test
# running before its toolchain is there.
set -euo pipefail

# Local machines have their own toolchains and their own opinions. This only
# provisions the disposable container.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}"

SUDO=""
if [ "$(id -u)" -ne 0 ]; then
  SUDO="sudo -n"
fi

# `install` rather than `ci`, so the cached container state is worth something
# on the next session. Workspaces: this must run from the repo root.
echo "==> npm install"
npm install --no-fund --no-audit

# `command -v` rather than `[ -x /usr/bin/dotnet ]`: the base image ships
# /usr/bin/dotnet as a symlink to a target that is not there, and a broken
# symlink is not executable, so this answers the question that matters — can
# the shell actually run it.
if command -v dotnet >/dev/null 2>&1; then
  echo "==> dotnet $(dotnet --version) already present"
else
  echo "==> installing the .NET SDK (needed by npm run build)"
  # The refresh is not optional. The image's package index is older than the
  # archive pool, so installing straight away fetches URLs that have already
  # moved and fails with a wall of 404s. Blocked third-party PPAs make this
  # print warnings and still succeed, hence the `|| true`.
  $SUDO env DEBIAN_FRONTEND=noninteractive apt-get update || true
  if $SUDO env DEBIAN_FRONTEND=noninteractive \
      apt-get install -y --no-install-recommends dotnet-sdk-10.0; then
    echo "==> dotnet $(dotnet --version) installed"
  else
    # Loud, but not fatal. npm deps are in by this point, so most work can
    # still proceed; what cannot is the build and the visual walk, and a
    # session that does not know that is how CI broke in the first place.
    echo "!!  The .NET SDK did not install." >&2
    echo "!!  'npm run build', 'npm run visual' and 'npm test' (game:test) will" >&2
    echo "!!  NOT run in this session. Do not push a change to the build or to" >&2
    echo "!!  app/tools/ without proving it somewhere that can run them." >&2
    exit 0
  fi
fi

# The WASM half of the game core. `ci.yml` installs the same workload straight
# after setup-dotnet; without it the build fails on the browser-wasm target
# rather than on anything to do with the app.
if dotnet workload list 2>/dev/null | grep -q '^wasm-tools'; then
  echo "==> wasm-tools workload already installed"
else
  echo "==> installing the wasm-tools workload"
  dotnet workload install wasm-tools || {
    echo "!!  wasm-tools did not install; 'npm run build' will fail on browser-wasm." >&2
    exit 0
  }
fi

# The app ships no analytics and calls no third party, which is a ground rule
# rather than an oversight. The dotnet CLI reports usage by default; this keeps
# the toolchain to the same standard as the thing it builds.
# Guarded because `set -u` would abort here when the hook is run by hand
# rather than by the session, which is exactly how it gets tested.
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  echo 'export DOTNET_CLI_TELEMETRY_OPTOUT=1' >> "$CLAUDE_ENV_FILE"
fi

echo "==> ready: build, visual walk and the full test suite can all run"
