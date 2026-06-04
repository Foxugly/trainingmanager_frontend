#!/usr/bin/env bash
# =============================================================================
# Training Manager frontend — Seed AWS SSM Parameter Store from a local .env.
#
#   bash deploy/seed-parameter-store.sh [--yes] ./prod.env
#
# The frontend config is PUBLIC (injected into the served HTML), so EVERY value
# is stored as a plain String — there are no secrets in a frontend prefix.
# Expected keys: API_BASE_URL, SENTRY_DSN, SENTRY_ENV, SENTRY_RELEASE, FEATURES.
#
# SAFETY (a wrong-prefix seed once clobbered a live site — these scripts differ
# only by SSM_PREFIX): prints the target PREFIX + a per-key plan before writing,
# requires re-typing the prefix to confirm (--yes to skip), and WARNS if a key
# name looks like a secret (it does not belong in a public frontend prefix).
#
# Idempotent (--overwrite). After seeding, on the box:
#   sudo systemctl restart tm-frontend-runtime-fetch
# =============================================================================
set -euo pipefail

SSM_PREFIX="/tm-frontend/prod"
AWS_REGION="eu-west-1"
# Keys that must NEVER appear in a public frontend prefix.
SECRET_REGEX='(SECRET|PASSWORD|_TOKEN|API_KEY|CLIENT_SECRET|PRIVATE)'

ASSUME_YES=0
ENV_FILE=""
for a in "$@"; do
    case "$a" in
        -y|--yes) ASSUME_YES=1 ;;
        -*) echo "Unknown option: $a" >&2; exit 2 ;;
        *)  ENV_FILE="$a" ;;
    esac
done
[ -n "$ENV_FILE" ] || { echo "Usage: $0 [--yes] <path-to-.env>" >&2; exit 1; }
[ -f "$ENV_FILE" ] || { echo "No such file: $ENV_FILE" >&2; exit 1; }

declare -a KEYS VALS
suspect=0
while IFS= read -r line || [ -n "$line" ]; do
    case "${line//[[:space:]]/}" in ''|\#*) continue ;; esac
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"; key="${key//[[:space:]]/}"
    val="${line#*=}"
    KEYS+=("$key"); VALS+=("$val")
    printf '%s' "$key" | grep -Eq "$SECRET_REGEX" && suspect=1
done < "$ENV_FILE"
[ "${#KEYS[@]}" -gt 0 ] || { echo "No KEY=VALUE lines in $ENV_FILE." >&2; exit 1; }

echo
echo "============================================================"
echo "  SEED → AWS SSM Parameter Store  (frontend, all String)"
echo "  PREFIX : $SSM_PREFIX        <-- writing here"
echo "  Region : $AWS_REGION"
echo "  File   : $ENV_FILE   (${#KEYS[@]} keys)"
echo "============================================================"
for k in "${KEYS[@]}"; do printf "  %-30s String\n" "$k"; done
echo "------------------------------------------------------------"
[ "$suspect" = 1 ] && echo "  WARNING: a key name looks like a SECRET — a frontend prefix is PUBLIC; remove it."

if [ "$ASSUME_YES" != 1 ]; then
    printf 'Re-type the prefix EXACTLY to proceed (anything else aborts):\n> '
    read -r ans
    if [ "$ans" != "$SSM_PREFIX" ]; then
        echo "Aborted — typed '$ans', expected '$SSM_PREFIX'. Nothing written."
        exit 1
    fi
fi

for i in "${!KEYS[@]}"; do
    aws ssm put-parameter --region "$AWS_REGION" \
        --name "$SSM_PREFIX/${KEYS[$i]}" --type String \
        --value "${VALS[$i]}" --overwrite >/dev/null
    echo "  seeded $SSM_PREFIX/${KEYS[$i]} (String)"
done
echo "Done. Seeded $SSM_PREFIX/* in $AWS_REGION."
echo "Apply on the box: sudo systemctl restart tm-frontend-runtime-fetch"
