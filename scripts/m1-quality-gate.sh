#!/usr/bin/env bash

set -Eeuo pipefail

readonly M1_REPOSITORY_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly M1_ARTIFACT_ROOT="${M1_REPOSITORY_ROOT}/artifacts/m1-gate"
readonly M1_BASE_COMMIT="65c94cc991d3549137de51827edd66b473cc8e31"
readonly M1_APP_URL="http://127.0.0.1:3000"
readonly M1_APP_LOG="${M1_ARTIFACT_ROOT}/application.log"
readonly M1_APP_PID_FILE="${M1_ARTIFACT_ROOT}/application.pid"
readonly M1_WORKER_LOG="${M1_ARTIFACT_ROOT}/worker.log"
readonly M1_WORKER_PID_FILE="${M1_ARTIFACT_ROOT}/worker.pid"
readonly M1_WORKER_READY_FILE="${M1_ARTIFACT_ROOT}/worker.ready"
readonly M1_SUPABASE_WORKDIR="${M1_REPOSITORY_ROOT}/apps/portal"
readonly M1_PRIVATE_TEMP_ROOT="${RUNNER_TEMP:-${TMPDIR:-/tmp}}"

# The gate must never inherit credentials or destinations capable of reaching
# hosted services. The disposable local values are sourced only after Supabase
# has started and passed the loopback validation helper.
unset SUPABASE_ACCESS_TOKEN SUPABASE_PROJECT_ID SUPABASE_PROJECT_REF
unset SUPABASE_DB_PASSWORD SUPABASE_DB_URL SUPABASE_URL DATABASE_URL
unset PGHOST PGPORT PGDATABASE PGUSER PGPASSWORD
unset NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
unset NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY SUPABASE_ANON_KEY SUPABASE_SERVICE_ROLE_KEY
unset M1_TEST_SUPABASE_URL M1_TEST_SUPABASE_ANON_KEY M1_TEST_SUPABASE_SERVICE_ROLE_KEY
unset M1_TEST_INBUCKET_URL M1_TEST_DATABASE_URL RESEND_API_KEY
unset M1_EMAIL_TRANSPORT M1_TEST_SMTP_HOST M1_TEST_SMTP_PORT
unset INVITATION_TOKEN_SECRET OUTBOX_WORKER_SECRET INVITATION_EMAIL_FROM

export SUPABASE_WORKDIR="${M1_SUPABASE_WORKDIR}"
export SUPABASE_TELEMETRY_DISABLED=true
export DO_NOT_TRACK=1
export M1_APP_URL
export NEXT_PUBLIC_APP_URL="${M1_APP_URL}"
export M1_WORKER_READY_FILE

M1_SUPABASE_STARTED=0
M1_APP_STARTED=0
M1_WORKER_STARTED=0
M1_FAILURE_STATE=BLOCKED
M1_ARTIFACT_SAFETY_TAINTED=0
M1_ENV_FILE=""
M1_PRIVATE_LOGS=()

mkdir -p "${M1_ARTIFACT_ROOT}"
rm -f "${M1_APP_PID_FILE}"
rm -f "${M1_WORKER_PID_FILE}"
rm -f "${M1_WORKER_READY_FILE}"
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
  local private_log

  stop_background_processes

  if [[ "${M1_SUPABASE_STARTED}" == "1" ]]; then
    pnpm --filter @father-empowering/portal exec supabase stop \
      --workdir "${M1_SUPABASE_WORKDIR}" --no-backup >/dev/null 2>&1 || true
  fi

  if [[ -n "${M1_ENV_FILE}" ]] && [[ -f "${M1_ENV_FILE}" ]]; then
    rm -f -- "${M1_ENV_FILE}"
  fi

  # `${array[@]}` is an unbound expansion for an empty array under the Bash
  # 3.2 still shipped by macOS. The default keeps cleanup fail-closed and
  # portable without manufacturing a fake private-log path.
  for private_log in "${M1_PRIVATE_LOGS[@]-}"; do
    if [[ -n "${private_log}" ]]; then
      rm -f -- "${private_log}"
    fi
  done
  rm -f -- "${M1_WORKER_READY_FILE}"

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

mark_artifacts_unsafe() {
  M1_ARTIFACT_SAFETY_TAINTED=1
  : > "${M1_ARTIFACT_ROOT}/UNSAFE_ARTIFACTS_DO_NOT_UPLOAD"
}

run_sensitive_captured() {
  local log_name="$1"
  local destination="${M1_ARTIFACT_ROOT}/${log_name}.log"
  local private_log
  local command_status=0
  shift

  if ! private_log="$(mktemp "${M1_PRIVATE_TEMP_ROOT}/father-empowering-${log_name}.XXXXXX")"; then
    mark_artifacts_unsafe
    echo "FAIL: impossible de créer la capture privée ${log_name}." >&2
    return 1
  fi
  M1_PRIVATE_LOGS+=("${private_log}")
  if ! chmod 600 "${private_log}"; then
    mark_artifacts_unsafe
    rm -f -- "${private_log}"
    echo "FAIL: impossible de protéger la capture privée ${log_name}." >&2
    return 1
  fi

  if "$@" >"${private_log}" 2>&1; then
    command_status=0
  else
    command_status=$?
  fi

  if ! node "${M1_REPOSITORY_ROOT}/scripts/m1-log-safety.mjs" "${private_log}"; then
    mark_artifacts_unsafe
    rm -f -- "${private_log}"
    echo "FAIL: sortie sensible ${log_name} retenue et supprimée." >&2
    return 1
  fi

  rm -f -- "${destination}"
  if ! mv -- "${private_log}" "${destination}"; then
    mark_artifacts_unsafe
    rm -f -- "${private_log}"
    echo "FAIL: impossible de publier la preuve sûre ${log_name}." >&2
    return 1
  fi

  if [[ ${command_status} -eq 0 ]]; then
    echo "PASS: ${log_name} (sortie capturée et validée hors journal CI)."
  else
    echo "FAIL: ${log_name} a échoué; la sortie sûre reste dans les preuves." >&2
  fi
  return "${command_status}"
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
  if [[ "${M1_ARTIFACT_SAFETY_TAINTED}" == "1" ]]; then
    : > "${unsafe_marker}"
    echo "FAIL: une capture sensible antérieure a rendu les preuves non publiables." >&2
    return 1
  fi
  if ! node "${M1_REPOSITORY_ROOT}/scripts/m1-log-safety.mjs" \
    "${M1_ARTIFACT_ROOT}"; then
    mark_artifacts_unsafe
    echo "FAIL: les artefacts M1 ont été retenus par le scan de sécurité." >&2
    return 1
  fi
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
  (
    cd "${M1_REPOSITORY_ROOT}/apps/portal"
    exec ./node_modules/.bin/next start --hostname 127.0.0.1 --port 3000
  ) >"${M1_APP_LOG}" 2>&1 &
  echo "$!" > "${M1_APP_PID_FILE}"
  M1_APP_STARTED=1

  if ! node "${M1_REPOSITORY_ROOT}/scripts/m1-wait-for-http.mjs" \
    "${M1_APP_URL}" 60000; then
    if ! kill -0 "$(<"${M1_APP_PID_FILE}")" 2>/dev/null; then
      echo "BLOCKED: l'application M1 locale s'est arrêtée avant readiness." >&2
    fi
    return 2
  fi

  if ! kill -0 "$(<"${M1_APP_PID_FILE}")" 2>/dev/null; then
    echo "BLOCKED: l'application M1 locale n'est plus active après readiness." >&2
    return 2
  fi
}

start_worker() {
  local deadline=$((SECONDS + 15))
  local worker_pid

  rm -f -- "${M1_WORKER_READY_FILE}"
  node "${M1_REPOSITORY_ROOT}/scripts/m1-outbox-worker.mjs" \
    >"${M1_WORKER_LOG}" 2>&1 &
  echo "$!" > "${M1_WORKER_PID_FILE}"
  M1_WORKER_STARTED=1
  worker_pid="$(<"${M1_WORKER_PID_FILE}")"

  while (( SECONDS < deadline )); do
    if ! kill -0 "${worker_pid}" 2>/dev/null; then
      echo "BLOCKED: le worker M1 s'est arrêté avant readiness authentifiée." >&2
      return 2
    fi
    if [[ -s "${M1_WORKER_READY_FILE}" ]]; then
      if ! kill -0 "${worker_pid}" 2>/dev/null; then
        echo "BLOCKED: le worker M1 s'est arrêté après son signal de readiness." >&2
        return 2
      fi
      return 0
    fi
    sleep 0.25
  done

  echo "BLOCKED: le worker M1 n'a pas confirmé sa readiness authentifiée." >&2
  return 2
}

require_worker_ready() {
  if [[ ! -s "${M1_WORKER_READY_FILE}" ]] || \
    ! kill -0 "$(<"${M1_WORKER_PID_FILE}")" 2>/dev/null; then
    echo "BLOCKED: le worker M1 n'est pas prêt pour le parcours vertical." >&2
    return 2
  fi
}

list_playwright_tests() {
  M1_TEST_SUPABASE_URL="http://127.0.0.1:54321" \
  M1_TEST_SUPABASE_ANON_KEY="m1-config-only-anon" \
  M1_TEST_SUPABASE_SERVICE_ROLE_KEY="m1-config-only-service-role" \
  M1_TEST_INBUCKET_URL="http://127.0.0.1:54324" \
    pnpm --filter @father-empowering/portal exec playwright test \
      --config tests/e2e/playwright.config.ts --list
}

cd "${M1_REPOSITORY_ROOT}"

require_command node
require_command pnpm
require_command git
require_command rg

if [[ "${M1_APP_URL}" != "http://127.0.0.1:3000" ]] || \
  [[ "${NEXT_PUBLIC_APP_URL}" != "http://127.0.0.1:3000" ]]; then
  echo "BLOCKED: l'origine M1 locale canonique n'est pas verrouillée." >&2
  record_summary BLOCKED
  exit 2
fi

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
run_logged playwright-config list_playwright_tests

M1_FAILURE_STATE=BLOCKED
require_command docker
M1_SUPABASE_STARTED=1
if ! pnpm --filter @father-empowering/portal exec supabase start \
  --workdir "${M1_SUPABASE_WORKDIR}" >/dev/null 2>&1; then
  echo "BLOCKED: Supabase local n'a pas pu démarrer (sortie masquée pour protéger les clés)." >&2
  exit 2
fi
if ! pnpm --filter @father-empowering/portal exec supabase db reset --local \
  --workdir "${M1_SUPABASE_WORKDIR}" --yes >/dev/null 2>&1; then
  echo "BLOCKED: la base Supabase locale jetable n'a pas pu être réinitialisée." >&2
  exit 2
fi
export_local_supabase_environment

M1_FAILURE_STATE=FAIL
run_logged rls pnpm --filter @father-empowering/portal exec supabase test db --local \
  --workdir "${M1_SUPABASE_WORKDIR}"
run_logged build pnpm build
run_logged bundle-secrets verify_client_bundle_has_no_server_secrets

M1_FAILURE_STATE=BLOCKED
start_application
start_worker
require_worker_ready
M1_FAILURE_STATE=FAIL
run_sensitive_captured integration pnpm --filter @father-empowering/portal test:integration
M1_FAILURE_STATE=BLOCKED
require_worker_ready
M1_FAILURE_STATE=FAIL
run_sensitive_captured e2e pnpm --filter @father-empowering/portal exec playwright test \
  --config tests/e2e/playwright.config.ts
M1_FAILURE_STATE=BLOCKED
require_worker_ready
M1_FAILURE_STATE=FAIL
# No process may still append a token or OTP after the final successful scan.
stop_background_processes
if verify_artifacts_safe; then
  echo "PASS: artefacts M1 inspectés après l'arrêt de tous les producteurs." \
    > "${M1_ARTIFACT_ROOT}/artifact-safety.log"
else
  exit 1
fi

record_summary PASS
echo "PASS: gate M1 réussi sur $(git rev-parse --short HEAD)."
