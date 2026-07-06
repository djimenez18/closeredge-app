#!/bin/sh
# docker-entrypoint-core.sh — runtime entrypoint for the closeredge-core container.
#
# Problem: Docker named volumes are created owned root:root, even when the image
# has a non-root USER.  The first write closeredge-core makes after the banner
# (init_rpc_token → write_token_file → create_dir_all) hits EACCES and the
# process exits with code 1.
#
# Fix (gosu pattern):
#   1. Start as root so we can chown the mount point(s).
#   2. mkdir -p + chown the workspace directory *before* any application code
#      runs, so the closeredge user owns it regardless of whether Docker created
#      the volume as root.
#   3. exec gosu closeredge to drop privileges and hand off to the binary.
#
# This is idempotent: if the directory already exists with the right ownership
# (image-baked or a re-used volume that was healed on a previous run) the chown
# is a no-op.  No manual "docker volume rm" is required when upgrading from a
# previously broken image.
#
# Requirements: gosu must be installed in the image (see Dockerfile).
# POSIX sh — no bashisms.
set -e

# Railway (and similar PaaS) inject a PORT env var at runtime.
# Bridge it into CLOSEREDGE_CORE_PORT so the binary listens on the
# platform-assigned port.  PORT always wins when it differs from the
# Dockerfile default (7788), because both env vars are baked into the
# image with the same default and Railway only overrides PORT.
if [ -n "${PORT}" ] && [ "${PORT}" != "${CLOSEREDGE_CORE_PORT}" ]; then
    echo "[docker-entrypoint] PORT=${PORT} overrides CLOSEREDGE_CORE_PORT=${CLOSEREDGE_CORE_PORT}"
    CLOSEREDGE_CORE_PORT="${PORT}"
    export CLOSEREDGE_CORE_PORT
elif [ -n "${PORT}" ]; then
    echo "[docker-entrypoint] PORT=${PORT} matches CLOSEREDGE_CORE_PORT=${CLOSEREDGE_CORE_PORT}"
fi

CLOSEREDGE_USER="closeredge"
CLOSEREDGE_UID="$(id -u "${CLOSEREDGE_USER}" 2>/dev/null || echo '')"

# The workspace path the core will actually write to.
# Prefer the env var if set; otherwise fall back to the image default.
WORKSPACE_DIR="${CLOSEREDGE_WORKSPACE:-/home/closeredge/.closeredge}"
# The home directory (where core.token is written when CLOSEREDGE_CORE_TOKEN is
# unset — see src/core/auth.rs default_root_closeredge_dir()).
HOME_CLOSEREDGE_DIR="/home/closeredge/.closeredge"

echo "[docker-entrypoint] uid=$(id -u), gid=$(id -g), user=$(id -un 2>/dev/null || echo unknown)"
echo "[docker-entrypoint] chowning workspace dirs for ${CLOSEREDGE_USER} (uid=${CLOSEREDGE_UID})"
echo "[docker-entrypoint] WORKSPACE_DIR=${WORKSPACE_DIR}"
echo "[docker-entrypoint] HOME_CLOSEREDGE_DIR=${HOME_CLOSEREDGE_DIR}"

# Ensure workspace dir exists and is owned by the closeredge user.
mkdir -p "${WORKSPACE_DIR}"
chown "${CLOSEREDGE_USER}:${CLOSEREDGE_USER}" "${WORKSPACE_DIR}"
echo "[docker-entrypoint] chown ${WORKSPACE_DIR} -> ${CLOSEREDGE_USER}:${CLOSEREDGE_USER} done"

# If WORKSPACE_DIR and HOME_CLOSEREDGE_DIR differ, heal the home dir too
# (core.token always lands in $HOME/.closeredge regardless of CLOSEREDGE_WORKSPACE).
if [ "${WORKSPACE_DIR}" != "${HOME_CLOSEREDGE_DIR}" ]; then
    mkdir -p "${HOME_CLOSEREDGE_DIR}"
    chown "${CLOSEREDGE_USER}:${CLOSEREDGE_USER}" "${HOME_CLOSEREDGE_DIR}"
    echo "[docker-entrypoint] chown ${HOME_CLOSEREDGE_DIR} -> ${CLOSEREDGE_USER}:${CLOSEREDGE_USER} done"
fi

echo "[docker-entrypoint] dropping privileges -> exec gosu ${CLOSEREDGE_USER} closeredge-core $*"
exec gosu "${CLOSEREDGE_USER}" closeredge-core "$@"
