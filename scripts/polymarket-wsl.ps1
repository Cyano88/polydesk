param([Parameter(ValueFromRemainingArguments=$true)][string[]]$PluginArgs)
$taskOwnerRoot = [Environment]::GetFolderPath('UserProfile')
$taskWalletHome = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.onchainos')).Trim()
$taskConfigDir = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.config\polymarket')).Trim()
$taskBinary = (wsl.exe --exec wslpath -u (Join-Path $taskOwnerRoot '.local\bin\polydesk-polymarket-linux')).Trim()
if (!$taskWalletHome -or !$taskConfigDir -or !$taskBinary) { throw 'Could not resolve the existing local wallet paths.' }
$taskBuilderCode = '0x873845696727f985cc6a23dcdffaefefd3f47a712dd8a02f1a938cac615844db' # Public PolyDesk code confirmed by owner, 2026-09-10.
if ($env:POLYMARKET_BUILDER_CODE -and $env:POLYMARKET_BUILDER_CODE -ne $taskBuilderCode) { throw 'Builder code conflicts with the verified PolyDesk profile.' }
if ($PluginArgs[0] -in @('buy','sell') -and $taskBuilderCode -notmatch '^0x[0-9a-fA-F]{64}$') { throw 'Set the verified public POLYMARKET_BUILDER_CODE before trading.' }
# Original Windows binary is preserved. The Linux CLI hash is verified in the audit.
& wsl.exe --exec env "POLYMARKET_BUILDER_CODE=$taskBuilderCode" "ONCHAINOS_HOME=$taskWalletHome" "POLYMARKET_CONFIG_DIR=$taskConfigDir" 'POLYMARKET_ONCHAINOS_BIN=/root/.local/bin/onchainos' $taskBinary @PluginArgs
exit $LASTEXITCODE
