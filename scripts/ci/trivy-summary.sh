#!/usr/bin/env bash
# Turn a Trivy JSON report into a Markdown summary and apply the severity
# policy from docs/ci/image-scanning.md.
#
# Usage: trivy-summary.sh <trivy-report.json>
#
# Environment:
#   FAIL_SEVERITIES  comma separated severities that fail the run (default CRITICAL)
#   MAX_ROWS         most rows shown in the findings table (default 100)
#   GITHUB_STEP_SUMMARY  if set, the Markdown is appended there, else printed
#
# The report is expected to contain only findings that have a fix available
# and are not covered by .trivyignore (the scan step filters those out).
# Exit code: 0 = policy met, 1 = a failing severity is present or the report
# is unusable.
set -euo pipefail

report="${1:?usage: trivy-summary.sh <trivy-report.json>}"
fail_sev="${FAIL_SEVERITIES:-CRITICAL}"
max_rows="${MAX_ROWS:-100}"
out="${GITHUB_STEP_SUMMARY:-/dev/stdout}"

if [ ! -s "$report" ] || ! jq -e . "$report" >/dev/null 2>&1; then
  echo "::error::Trivy report '$report' is missing or not valid JSON; the scan did not complete"
  {
    echo "## Image vulnerability scan"
    echo
    echo "The scan did not produce a usable report. Treated as a failure, re-run the job."
  } >> "$out"
  exit 1
fi

# One flat list of findings: severity, id, package, installed, fixed, title, url.
findings="$(jq -c '
  [ (.Results // [])[] | (.Target) as $t
    | (.Vulnerabilities // [])[]
    | { sev: .Severity, id: .VulnerabilityID, pkg: .PkgName,
        installed: (.InstalledVersion // ""), fixed: (.FixedVersion // ""),
        title: ((.Title // "") | gsub("[\\r\\n|]+"; " ") | .[0:90]),
        url: (.PrimaryURL // ""), target: $t } ]
  | sort_by( {"CRITICAL":0,"HIGH":1}[.sev] // 2, .id, .pkg )' "$report")"

count() { jq --arg s "$1" '[.[] | select(.sev == $s)] | length' <<<"$findings"; }
critical="$(count CRITICAL)"
high="$(count HIGH)"
total="$(jq 'length' <<<"$findings")"

failing=0
IFS=',' read -r -a fail_list <<<"$fail_sev"
for s in "${fail_list[@]}"; do
  s="${s// /}"
  n="$(count "$s")"
  failing=$((failing + n))
done

{
  echo "## Image vulnerability scan"
  echo
  echo "Image built from \`Dockerfile\` (the deployment Dockerfile), scanned for HIGH and CRITICAL findings that have a fix available."
  echo "Findings covered by \`.trivyignore\` are not listed. Policy: fail on **${fail_sev}**, warn on the rest. See \`docs/ci/image-scanning.md\`."
  echo
  echo "| Severity | Findings |"
  echo "| --- | ---: |"
  echo "| CRITICAL | ${critical} |"
  echo "| HIGH | ${high} |"
  echo
  if [ "$total" -eq 0 ]; then
    echo "No HIGH or CRITICAL findings with a fix available."
  else
    echo "| Severity | ID | Package | Installed | Fixed in | Title |"
    echo "| --- | --- | --- | --- | --- | --- |"
    jq -r --argjson max "$max_rows" '
      .[0:$max][]
      | "| \(.sev) | " + (if .url != "" then "[\(.id)](\(.url))" else .id end)
        + " | `\(.pkg)` | `\(.installed)` | `\(.fixed)` | \(.title) |"' <<<"$findings"
    if [ "$total" -gt "$max_rows" ]; then
      echo
      echo "Showing the first ${max_rows} of ${total} findings. The full list is in the \`trivy-report\` artifact."
    fi
  fi
  echo
  if [ "$failing" -gt 0 ]; then
    echo "**Result: failed.** ${failing} finding(s) at a failing severity (${fail_sev})."
  elif [ "$total" -gt 0 ]; then
    echo "**Result: passed with warnings.** ${total} finding(s), none at a failing severity (${fail_sev})."
  else
    echo "**Result: passed.**"
  fi
} >> "$out"

# Annotations. IDs and package names come from the Trivy database, so only
# those fields are used, not free text.
jq -r '.[] | "\(.sev)\t\(.id)\t\(.pkg)\t\(.installed)\t\(.fixed)"' <<<"$findings" |
  while IFS=$'\t' read -r sev id pkg installed fixed; do
    level=warning
    case ",${fail_sev// /}," in *",${sev},"*) level=error ;; esac
    echo "::${level} title=${sev} ${id}::${pkg} ${installed}, fixed in ${fixed}"
  done

if [ "$failing" -gt 0 ]; then
  exit 1
fi
