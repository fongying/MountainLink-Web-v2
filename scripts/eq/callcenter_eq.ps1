$ErrorActionPreference = 'Stop'

# -----------------------
# Config (MVP: hard-coded)
# -----------------------
$webhookUrl = "http://localhost:5173/api/hooks/eq/trigger"
$secret = "mlink-dev-webhook-secret-change-me"

$county = "花蓮縣"
$town = "花蓮市"
$countySlug = "hualien"
$townSlug = "hualien"
$thresholdIntensity = 4
$estimatedIntensity = 4

$vendor = "eq-wakeup-bridge-win"
$version = "0.1.0"
$mode = "site-observation"

$logPath = Join-Path $PSScriptRoot "eq-bridge.log"

# Optional env override
if ($env:MLINK_WEBHOOK_URL) { $webhookUrl = $env:MLINK_WEBHOOK_URL }
if ($env:MLINK_WEBHOOK_SECRET) { $secret = $env:MLINK_WEBHOOK_SECRET }

function Write-Log {
  param(
    [string]$eventId,
    [string]$message
  )
  $ts = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff")
  Add-Content -Path $logPath -Value "[$ts] [$eventId] $message"
}

function New-HexHmacSha256 {
  param(
    [string]$secretValue,
    [string]$text
  )

  $hmac = [System.Security.Cryptography.HMACSHA256]::new([System.Text.Encoding]::UTF8.GetBytes($secretValue))
  try {
    $hash = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($text))
    return ([System.BitConverter]::ToString($hash)).Replace("-", "").ToLowerInvariant()
  }
  finally {
    $hmac.Dispose()
  }
}

function Get-OriginTimeIso {
  # Use +08:00 format for consistency with current call-center convention.
  $dto = [System.DateTimeOffset]::Now.ToOffset([System.TimeSpan]::FromHours(8))
  return $dto.ToString("yyyy-MM-ddTHH:mm:sszzz")
}

function Get-OriginTimeCompact {
  param([string]$originIso)

  $dto = [System.DateTimeOffset]::Parse($originIso)
  # Example: 20260301T101530+0800
  $offset = $dto.ToString("zzz").Replace(":", "")
  return $dto.ToString("yyyyMMddTHHmmss") + $offset
}

if ([string]::IsNullOrWhiteSpace($webhookUrl) -or [string]::IsNullOrWhiteSpace($secret)) {
  throw "Missing webhookUrl or secret. Set in script or env (MLINK_WEBHOOK_URL / MLINK_WEBHOOK_SECRET)."
}

$originTime = Get-OriginTimeIso
$originCompact = Get-OriginTimeCompact -originIso $originTime
$eventId = "obs-$originCompact-$countySlug-$townSlug-i$thresholdIntensity"

$payload = [ordered]@{
  eventId = $eventId
  originTime = $originTime
  source = "EQ_WAKEUP"
  site = [ordered]@{
    county = $county
    town = $town
  }
  thresholdIntensity = $thresholdIntensity
  estimatedIntensity = $estimatedIntensity
  message = "$county$town 發生有感地震，預估強度 $estimatedIntensity 級以上"
  raw = [ordered]@{
    vendor = $vendor
    version = $version
    mode = $mode
  }
}

$rawBody = $payload | ConvertTo-Json -Depth 6 -Compress
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
$signature = New-HexHmacSha256 -secretValue $secret -text "$timestamp.$rawBody"

$headers = @{
  "X-MLINK-Timestamp" = $timestamp
  "X-MLINK-Signature" = $signature
}

# Retry schedule: 1s, 3s, 10s (max 3 attempts)
$retryDelaysSec = @(1, 3, 10)

for ($i = 0; $i -lt $retryDelaysSec.Count; $i++) {
  $attempt = $i + 1
  try {
    $resp = Invoke-WebRequest `
      -Uri $webhookUrl `
      -Method POST `
      -ContentType "application/json; charset=utf-8" `
      -Headers $headers `
      -Body $rawBody `
      -UseBasicParsing `
      -TimeoutSec 10

    $statusCode = [int]$resp.StatusCode
    $content = ($resp.Content | Out-String).Trim()
    Write-Log -eventId $eventId -message "attempt=$attempt status=$statusCode body=$rawBody response=$content"
    exit 0
  }
  catch {
    $ex = $_.Exception
    $statusCode = 0
    $responseText = ""

    if ($ex.PSObject.Properties.Match("Response").Count -gt 0 -and $ex.Response) {
      try { $statusCode = [int]$ex.Response.StatusCode.value__ } catch { $statusCode = 0 }
      try {
        $reader = [System.IO.StreamReader]::new($ex.Response.GetResponseStream())
        $responseText = $reader.ReadToEnd()
        $reader.Dispose()
      } catch { $responseText = "" }
    }

    $msg = ($ex.Message -replace '\r?\n', ' ')
    Write-Log -eventId $eventId -message "attempt=$attempt status=$statusCode error=$msg response=$responseText"

    # Do not retry on 4xx (except 0/no-response).
    if ($statusCode -ge 400 -and $statusCode -lt 500) { exit 1 }

    if ($attempt -lt $retryDelaysSec.Count) {
      Start-Sleep -Seconds $retryDelaysSec[$i]
    }
  }
}

exit 1
