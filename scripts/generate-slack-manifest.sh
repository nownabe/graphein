#!/usr/bin/env bash
#
# Interactive script to generate a Slack App manifest for Graphein.
#
# Prompts for environment-specific values (app name, URLs, etc.)
# and outputs a complete YAML manifest to stdout or a file.
# Selecting "Development mode" adds extra bot scopes needed for testing.
#
# Usage: ./scripts/generate-slack-manifest.sh
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Interactive prompt helpers
# ---------------------------------------------------------------------------

ask() {
  local question="$1"
  local default_value="$2"
  local suffix=""
  if [[ -n "$default_value" ]]; then
    suffix=" [$default_value]"
  fi
  printf "%s%s: " "$question" "$suffix" >&2
  local answer
  read -r answer
  if [[ -z "$answer" ]]; then
    echo "$default_value"
  else
    echo "$answer"
  fi
}

ask_yes_no() {
  local question="$1"
  local default_value="$2" # "yes" or "no"
  local hint
  if [[ "$default_value" == "yes" ]]; then
    hint="[Y/n]"
  else
    hint="[y/N]"
  fi
  printf "%s %s: " "$question" "$hint" >&2
  local answer
  read -r answer
  answer=$(echo "$answer" | tr '[:upper:]' '[:lower:]')
  if [[ -z "$answer" ]]; then
    [[ "$default_value" == "yes" ]] && return 0 || return 1
  fi
  [[ "$answer" == "y" || "$answer" == "yes" ]]
}

# ---------------------------------------------------------------------------
# YAML helpers
# ---------------------------------------------------------------------------

yaml_string() {
  local s="$1"
  # Quote if string contains YAML-special characters or leading/trailing whitespace
  local needs_quote=false
  case "$s" in
    *:* | *"#"* | *"{"* | *"}"* | *"["* | *"]"* | *","* | *"&"* | \
    *"*"* | *"?"* | *"|"* | *">"* | *"!"* | *"%"* | *"@"* | *'`'* | \
    *'"'* | *"'"* | " "* | *" " )
      needs_quote=true ;;
  esac
  if [[ "$needs_quote" == "true" ]]; then
    local escaped
    escaped=$(printf '%s' "$s" | sed 's/\\/\\\\/g; s/"/\\"/g')
    printf '"%s"' "$escaped"
  else
    printf '%s' "$s"
  fi
}

# ---------------------------------------------------------------------------
# Manifest builder
# ---------------------------------------------------------------------------

build_manifest() {
  local app_name="$1"
  local redirect_url="$2"
  local socket_mode="$3"
  local dev_mode="$4"

  local bot_scopes="    - channels:history
    - channels:read
    - chat:write
    - emoji:read
    - reactions:write
    - users:read
    - users:read.email
    - usergroups:read"

  if [[ "$dev_mode" == "true" ]]; then
    bot_scopes="$bot_scopes
    - reactions:read"
  fi

  local app_name_yaml
  app_name_yaml=$(yaml_string "$app_name")
  local redirect_url_yaml
  redirect_url_yaml=$(yaml_string "$redirect_url")

  cat <<YAML
display_information:
  name: $app_name_yaml
  description: Turn Slack messages into tasks, snippets, and kudos
  background_color: "#1a1a2e"
features:
  bot_user:
    display_name: $app_name_yaml
    always_online: true
  shortcuts:
    - name: $(yaml_string "${app_name}: Add Task")
      type: message
      callback_id: add_task
      description: Add a message to Graphein as a task
    - name: $(yaml_string "${app_name}: Add Snippet")
      type: message
      callback_id: add_snippet
      description: Add a message to Graphein as a snippet
    - name: $(yaml_string "${app_name}: Add Kudos")
      type: message
      callback_id: add_kudos
      description: Add a message to Graphein as kudos
oauth_config:
  redirect_urls:
    - $redirect_url_yaml
  scopes:
    bot:
$bot_scopes
settings:
  event_subscriptions:
    bot_events:
      - message.channels
  interactivity:
    is_enabled: true
  org_deploy_enabled: false
  socket_mode_enabled: $socket_mode
  token_rotation_enabled: false
YAML
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

echo "=== Graphein Slack App Manifest Generator ===" >&2
echo "" >&2

dev_mode="false"
if ask_yes_no "Development mode? (adds extra scopes for testing)" "no"; then
  dev_mode="true"
fi

app_name=$(ask "App name" "Graphein")

base_url=""
while [[ -z "$base_url" ]]; do
  base_url=$(ask "Base URL (e.g. https://abc123.ngrok.io)" "")
done

socket_mode="false"
if ask_yes_no "Enable Socket Mode?" "yes"; then
  socket_mode="true"
fi

redirect_url="${base_url%/}/auth/slack/callback"
echo "" >&2
echo "  Redirect URL: $redirect_url" >&2

manifest=$(build_manifest "$app_name" "$redirect_url" "$socket_mode" "$dev_mode")

echo "" >&2
echo "--- Generated Manifest (YAML) ---" >&2
echo "" >&2
echo "$manifest" >&2

output_path=$(ask "Write to file? (leave empty to skip)" "")
if [[ -n "$output_path" ]]; then
  echo "$manifest" > "$output_path"
  echo "" >&2
  echo "Written to $output_path" >&2
else
  echo "$manifest"
fi
