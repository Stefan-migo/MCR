param(
    [Parameter(Mandatory=$true)]
    [string]$DuckDnsToken,
    [Parameter(Mandatory=$true)]
    [string]$DuckDnsDomain = "mcrmidi"
)

$ipv6 = (Get-NetIPAddress -AddressFamily IPv6 | Where-Object {
    $_.PrefixOrigin -eq "RouterAdvertisement" -and
    $_.SuffixOrigin -eq "Random" -and
    $_.AddressFamily -eq "IPv6"
}).IPAddress

if (-not $ipv6) {
    Write-Error "No stable IPv6 address found"
    exit 1
}

$result = Invoke-RestMethod "https://duckdns.org/update/$DuckDnsDomain/$DuckDnsToken/AAAA=$ipv6"
Write-Host "DuckDNS update: $result"

$envPath = Join-Path $PSScriptRoot "..\.env"
(Get-Content $envPath) -replace 'ANNOUNCED_IP=.*', "ANNOUNCED_IP=$ipv6" | Set-Content $envPath
(Get-Content $envPath) -replace 'MEDIASOUP_ANNOUNCED_IP=.*', "MEDIASOUP_ANNOUNCED_IP=$ipv6" | Set-Content $envPath

Write-Host "Updated .env to $ipv6"
Write-Host "Restart the backend for changes to take effect"
