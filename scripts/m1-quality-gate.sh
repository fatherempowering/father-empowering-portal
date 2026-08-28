#!/usr/bin/env bash

set -Eeuo pipefail

readonly M1_REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly M1_ARTIFACT_ROOT="${M1_ARTIFACT_ROOT:-${M1_REPOSITORY_ROOT}/artifacts/m1-gate}"
readonly M1_BASE_COMMIT="65c94cc991d3549137de51827edd66b473cc8e31"
readonly M1_APP_URL="${M1_APP_URL:-http://127.0.0.1:3000}"
readonly M1_APP_LOG="${M1_ARTIFACT_ROOT}/application.log"
readonly M1_APP_PID_FILE="${M1_ARTIFACT_ROOT}/application.pid"
readonly M1_WORKER_LOG="${M1_ARTIFACT_ROOT}/worker.log"
readonly M1_WORKER_PID_FILE="${M1_ARTIFACT_ROOT}/worker.pid"
readonly M1_SUPABASE_WORKDIR="${M1_REPOSITORY_ROOT}/apps/portal"
export SUPABASE_WORKDIR="${M1_SUPABASE_WORKDIR}"
export SUPABASE_TELEMETRY_DISABLED=true
export DO_NOT_TRACK=1

M1_SUPABASE_STARTED=0
M1_APP_STARTED=0
M1_WORKER_STARTED=0
M1_FAILURE_STATE=BLOCKED
M1_ENV_FILE=""

mkdir -p "${M1_ARTIFACT_ROOT}"
rm -f "${M1_APP_PID_FILE}"
rm -f "${M1_WORKER_PID_FILE}"
# Evidence is unsafe by default. Only a completed successful scan removes this
# marker, so timeout/SIGKILL and missing tooling fail closed in CI.
: > "${M1_ARTIFACT_ROOT}/UNSAFE_ARTIFACTS_DO_NOT_UPLOAD"

record_summary() {
  local state="$1"
  {
    echo "state=${state}"
    echo "commit=$(git -C "${M1_REPOSITORY_ROOT}" rev-parse HEAD)"
    echo "date_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } > "${M1_ARTIFACT_ROOT}/summary.txt"
}

stop_background_processes() {
  if [[ "${M1_WORKER_STARTED}" == "1" ]] && [[ -f "${M1_WORKER_PID_FILE}" ]]; then
    kill "$(<"${M1_WORKER_PID_FILE}")" 2>/dev/null || true
    wait "$(<"${M1_WORKER_PID_FILE}")" 2>/dev/null || true
    M1_WORKER_STARTED=0
  fi

  if [[ "${M1_APP_STARTED}" == "1" ]] && [[ -f "${M1_APP_PID_FILE}" ]]; then
    kill "$(<"${M1_APP_PID_FILE}")" 2>/dev/null || true
    wait "$(<"${M1_APP_PID_FILE}")" 2>/dev/null || true
    M1_APP_STARTED=0
  fi
}

cleanup() {
  local exit_code=$?

  stop_background_processes

  if [[ "${M1_SUPABASE_STARTED}" == "1" ]] && [[ "${M1_KEEP_SERVICES:-0}" != "1" ]]; then
    pnpm --filter @father-empowering/portal exec supabase stop \
      --workdir "${M1_SUPABASE_WORKDIR}" --no-backup >/dev/null 2>&1 || true
  fi

  if [[ -n "${M1_ENV_FILE}" ]] && [[ -f "${M1_ENV_FILE}" ]]; then
    rm -f -- "${M1_ENV_FILE}"
  fi

  # Always scan after processes have stopped and logs have flushed. CI relies
  # on the marker to suppress evidence upload even when an earlier gate exits.
  verify_artifacts_safe > "${M1_ARTIFACT_ROOT}/artifact-safety.log" 2>&1 || true

  if [[ ${exit_code} -ne 0 ]]; then
    record_summary "${M1_FAILURE_STATE}"
  fi
}

trap cleanup EXIT

run_logged() {
  local log_name="$1"
  shift
  "$@" 2>&1 | tee "${M1_ARTIFACT_ROOT}/${log_name}.log"
}

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "BLOCKED: commande requise absente: $1" >&2
    record_summary BLOCKED
    exit 2
  fi
}

verify_no_skipped_m1_tests() {
  local scan_status
  if rg -n --glob '*.{ts,tsx,js,mjs,sql}' \
    '(describe|it|test)\.(skip|todo)|\bskip\s*\(|\btodo\s*\(' \
    apps/portal/src apps/portal/tests apps/portal/supabase/tests 2>/dev/null; then
    echo "FAIL: un test M1 obligatoire est ignoré ou TODO." >&2
    return 1
  else
    scan_status=$?
    if [[ ${scan_status} -gt 1 ]]; then
      echo "FAIL: le scan des tests ignorés a rencontré une erreur de lecture." >&2
      return 1
    fi
  fi
}

verify_legacy_unchanged() {
  local changed_path
  local changed_paths_file
  changed_paths_file="$(mktemp "${TMPDIR:-/tmp}/father-empowering-legacy-diff.XXXXXX")"
  if ! git -C "${M1_REPOSITORY_ROOT}" diff --name-only -z \
    "${M1_BASE_COMMIT}" -- > "${changed_paths_file}"; then
    rm -f -- "${changed_paths_file}"
    echo "FAIL: impossible de comparer le portail legacy au commit de référence." >&2
    return 1
  fi
  while IFS= read -r -d '' changed_path; do
    case "${changed_path}" in
      .github/workflows/m1-ci.yml | \
      .gitignore | \
      apps/portal/* | \
      docs/quality/M1-GATE.md | \
      package.json | \
      pnpm-lock.yaml | \
      pnpm-workspace.yaml | \
      scripts/m1-*)
        ;;
      *)
        rm -f -- "${changed_paths_file}"
        echo "FAIL: fichier legacy modifié hors périmètre M1: ${changed_path}" >&2
        return 1
        ;;
    esac
  done < "${changed_paths_file}"
  rm -f -- "${changed_paths_file}"
}

verify_artifacts_safe() {
  local unsafe_marker="${M1_ARTIFACT_ROOT}/UNSAFE_ARTIFACTS_DO_NOT_UPLOAD"
  local scan_status
  local secret
  if ! command -v rg >/dev/null 2>&1; then
    : > "${unsafe_marker}"
    echo "FAIL: le scan des artefacts ne peut pas être exécuté." >&2
    return 1
  fi
  if rg --quiet -i \
    "#token=[A-Za-z0-9_-]{32,}|[\"']?otp[\"']?[[:space:]]*[:=][[:space:]]*[\"']?[0-9]{6}|[\"']?(invitationToken|opaqueToken|rawToken)[\"']?[[:space:]]*[:=][[:space:]]*[\"']?[A-Za-z0-9_-]{32,}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}|sb_(secret|publishable)_[A-Za-z0-9_-]{20,}" \
    "${M1_ARTIFACT_ROOT}" 2>/dev/null; then
    : > "${unsafe_marker}"
    echo "FAIL: un artefact M1 contient un motif de jeton ou OTP brut." >&2
    return 1
  else
    scan_status=$?
    if [[ ${scan_status} -gt 1 ]]; then
      : > "${unsafe_marker}"
      echo "FAIL: le scan des artefacts a rencontré une erreur de lecture." >&2
      return 1
    fi
  fi
  for secret in \
    "${SUPABASE_SERVICE_ROLE_KEY:-}" \
    "${NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:-}" \
    "${SUPABASE_ANON_KEY:-}" \
    "${INVITATION_TOKEN_SECRET:-}" \
    "${OUTBOX_WORKER_SECRET:-}"; do
    if [[ -n "${secret}" ]]; then
      if rg --fixed-strings --quiet "${secret}" "${M1_ARTIFACT_ROOT}"; then
        : > "${unsafe_marker}"
        echo "FAIL: un artefact M1 contient une clé d'environnement locale." >&2
        return 1
      else
        scan_status=$?
        if [[ ${scan_status} -gt 1 ]]; then
          : > "${unsafe_marker}"
          echo "FAIL: le scan exact des clés a rencontré une erreur de lecture." >&2
          return 1
        fi
      fi
    fi
  done
  rm -f "${unsafe_marker}"
}

verify_client_bundle_has_no_server_secrets() {
  local client_bundle="${M1_REPOSITORY_ROOT}/apps/portal/.next/static"
  local scan_status
  local secret
  if [[ ! -d "${client_bundle}" ]]; then
    echo "FAIL: le bundle navigateur attendu est absent." >&2
    return 1
  fi
  for secret in \
    "${SUPABASE_SERVICE_ROLE_KEY:-}" \
    "${INVITATION_TOKEN_SECRET:-}" \
    "${OUTBOX_WORKER_SECRET:-}"; do
    if [[ -n "${secret}" ]]; then
      if rg --fixed-strings --quiet "${secret}" "${client_bundle}"; then
        echo "FAIL: un secret serveur est présent dans le bundle navigateur." >&2
        return 1
      else
        scan_status=$?
        if [[ ${scan_status} -gt 1 ]]; then
          echo "FAIL: le scan du bundle navigateur a rencontré une erreur de lecture." >&2
          return 1
        fi
      fi
    fi
  done
}

export_local_supabase_environment() {
  M1_ENV_FILE="$(mktemp "${TMPDIR:-/tmp}/father-empowering-m1-env.XXXXXX")"
  node "${M1_REPOSITORY_ROOT}/scripts/m1-supabase-env.mjs" \
    "${M1_ENV_FILE}"

  # The file contains credentials generated by the disposable local Supabase
  # instance only. The helper rejects non-loopback URLs.
  set -a
  # shellcheck disable=SC1091
  source "${M1_ENV_FILE}"
  set +a
}

start_application() {
  pnpm --filter @father-empowering/portal start \
    >"${M1_APP_LOG}" 2>&1 &
  echo "$!" > "${M1_APP_PID_FILE}"
  M1_APP_STARTED=1

  node "${M1_REPOSITORY_ROOT}/scripts/m1-wait-for-http.mjs" \
    "${M1_APP_URL}" 60000
}

start_worker() {
  pnpm --filter @father-empowering/portal worker:m1 \
    >"${M1_WORKER_LOG}" 2>&1 &
  echo "$!" > "${M1_WORKER_PID_FILE}"
  M1_WORKER_STARTED=1

  # Detect an immediately failing worker before any email-dependent test.
  sleep 1
  if ! kill -0 "$(<"${M1_WORKER_PID_FILE}")" 2>/dev/null; then
    echo "BLOCKED: le worker M1 n'est pas resté actif." >&2
    return 2
  fi
}

cd "${M1_REPOSITORY_ROOT}"

require_command node
require_command pnpm
require_command git
require_command rg

{
  node --version
  pnpm --version
  pnpm --filter @father-empowering/portal exec supabase --version
  pnpm --filter @father-empowering/portal exec playwright --version
} > "${M1_ARTIFACT_ROOT}/versions.txt"

M1_FAILURE_STATE=FAIL
run_logged legacy verify_legacy_unchanged
run_logged static verify_no_skipped_m1_tests
run_logged unit pnpm test:unit
run_logged lint pnpm lint
run_logged typecheck pnpm typecheck

M1_FAILURE_STATE=BLOCKED
require_command docker
if ! pnpm --filter @father-empowering/portal exec supabase start \
  --workdir "${M1_SUPABASE_WORKDIR}" >/dev/null 2>&1; then
  echo "BLOCKED: Supabase local n'a pas pu démarrer (sortie masquée pour protéger les clés)." >&2
  exit 2
fi
M1_SUPABASE_STARTED=1
if ! pnpm --filter @father-empowering/portal exec supabase db reset --local \
  --workdir "${M1_SUPABASE_WORKDIR}" --yes >/dev/null 2>&1; then
  echo "BLOCKED: la base Supabase locale jetable n'a pas pu être réinitialisée." >&2
  exit 2
fi
export_local_supabase_environment

M1_FAILURE_STATE=FAIL
run_logged rls pnpm --filter @father-empowering/portal exec supabase test db \
  --workdir "${M1_SUPABASE_WORKDIR}"
run_logged build pnpm build
run_logged bundle-secrets verify_client_bundle_has_no_server_secrets

start_application
M1_FAILURE_STATE=BLOCKED
start_worker
M1_FAILURE_STATE=FAIL
run_logged integration pnpm --filter @father-empowering/portal test:integration
run_logged e2e pnpm --filter @father-empowering/portal exec playwright test \
  --config apps/portal/tests/e2e/playwright.config.ts
# No process may still append a token or OTP after the final successful scan.
stop_background_processes
run_logged artifact-safety verify_artifacts_safe

record_summary PASS
echo "PASS: gate M1 réussi sur $(git rev-parse --short HEAD)."
