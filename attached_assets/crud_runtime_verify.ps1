$ErrorActionPreference = "Stop"

$baseUrl = "http://localhost:5002"

function Invoke-Api {
  param(
    [string]$Method,
    [string]$Path,
    [object]$Body,
    [Microsoft.PowerShell.Commands.WebRequestSession]$Session,
    [int[]]$ExpectedStatus = @(200)
  )

  $uri = "$baseUrl$Path"
  $jsonBody = $null
  if ($null -ne $Body) {
    $jsonBody = $Body | ConvertTo-Json -Depth 50
  }

  $response = $null
  $rawBody = ""
  $statusCode = 0

  try {
    $response = Invoke-WebRequest -Uri $uri -Method $Method -WebSession $Session -ContentType "application/json" -Body $jsonBody -UseBasicParsing
    $statusCode = [int]$response.StatusCode
    $rawBody = [string]$response.Content
  } catch {
    if ($_.Exception.Response) {
      $httpResponse = $_.Exception.Response
      $statusCode = [int]$httpResponse.StatusCode
      $reader = New-Object System.IO.StreamReader($httpResponse.GetResponseStream())
      $rawBody = $reader.ReadToEnd()
      $reader.Close()
    } else {
      throw
    }
  }

  if ($ExpectedStatus -notcontains $statusCode) {
    throw "Unexpected status for $Method $Path -> $statusCode; body: $rawBody"
  }

  $data = $null
  if (-not [string]::IsNullOrWhiteSpace($rawBody)) {
    $trimmed = $rawBody.Trim()
    if ($trimmed.StartsWith("{") -or $trimmed.StartsWith("[")) {
      try {
        $data = $trimmed | ConvertFrom-Json -Depth 50
      } catch {
        $data = $null
      }
    }
  }

  return [PSCustomObject]@{
    Status = $statusCode
    Data = $data
    Raw = $rawBody
  }
}

function Assert-True {
  param([bool]$Condition, [string]$Message)
  if (-not $Condition) {
    throw $Message
  }
}

$results = New-Object System.Collections.Generic.List[string]
function Record-Result {
  param([string]$Label)
  $results.Add("PASS: $Label") | Out-Null
  Write-Host "[PASS] $Label"
}

$cleanup = @{
  chapters = New-Object System.Collections.Generic.List[string]
  chapterUsers = New-Object System.Collections.Generic.List[string]
  barangayUsers = New-Object System.Collections.Generic.List[string]
  members = New-Object System.Collections.Generic.List[string]
  projectReports = New-Object System.Collections.Generic.List[string]
  chapterOfficers = New-Object System.Collections.Generic.List[string]
  chapterKpis = New-Object System.Collections.Generic.List[string]
  kpiTemplates = New-Object System.Collections.Generic.List[string]
  kpiCompletions = New-Object System.Collections.Generic.List[string]
  mouSubmissions = New-Object System.Collections.Generic.List[string]
  chapterRequests = New-Object System.Collections.Generic.List[string]
  nationalRequests = New-Object System.Collections.Generic.List[string]
}

$adminSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$chapterASession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$chapterBSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$barangayASession = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$chapterA = $null
$chapterB = $null
$barangayAUser = $null
$barangayBUser = $null

try {
  Invoke-Api -Method "POST" -Path "/api/auth/login" -Body @{ username = "admin"; password = "admin123" } -Session $adminSession | Out-Null
  Record-Result "Admin login"

  $seed = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
  $chapters = @((Invoke-Api -Method "GET" -Path "/api/chapters" -Body $null -Session $adminSession).Data)
  while ($chapters.Count -lt 2) {
    $chapterIndex = $chapters.Count + 1
    $createdChapter = (Invoke-Api -Method "POST" -Path "/api/chapters" -Body @{
      name = "CRUD Runtime Chapter $chapterIndex $seed"
      location = "Runtime Test"
      contact = "09000000000"
      contactPerson = "Runtime Tester"
      email = "crud.runtime.$chapterIndex.$seed@example.com"
      facebookLink = ""
      instagramLink = ""
      nextgenBatch = ""
      photo = ""
      latitude = ""
      longitude = ""
    } -Session $adminSession).Data
    $cleanup.chapters.Add($createdChapter.id) | Out-Null

    $chapters = @((Invoke-Api -Method "GET" -Path "/api/chapters" -Body $null -Session $adminSession).Data)
  }
  if ($cleanup.chapters.Count -gt 0) {
    Record-Result "Created fallback chapter records"
  }

  $chapterA = $chapters[0]
  $chapterB = $chapters[1]

  $password = "Pass1234!"

  $chapterAUser = (Invoke-Api -Method "POST" -Path "/api/chapter-users" -Body @{
    chapterId = $chapterA.id
    username = "crud_chapter_a_$seed"
    password = $password
    isActive = $true
    mustChangePassword = $false
  } -Session $adminSession).Data
  $cleanup.chapterUsers.Add($chapterAUser.id) | Out-Null

  $chapterBUser = (Invoke-Api -Method "POST" -Path "/api/chapter-users" -Body @{
    chapterId = $chapterB.id
    username = "crud_chapter_b_$seed"
    password = $password
    isActive = $true
    mustChangePassword = $false
  } -Session $adminSession).Data
  $cleanup.chapterUsers.Add($chapterBUser.id) | Out-Null
  Record-Result "Created chapter test users"

  $barangayAUser = (Invoke-Api -Method "POST" -Path "/api/barangay-users" -Body @{
    chapterId = $chapterA.id
    barangayName = "CRUD Barangay A $seed"
    username = "crud_barangay_a_$seed"
    password = $password
    isActive = $true
    mustChangePassword = $false
  } -Session $adminSession).Data
  $cleanup.barangayUsers.Add($barangayAUser.id) | Out-Null

  $barangayBUser = (Invoke-Api -Method "POST" -Path "/api/barangay-users" -Body @{
    chapterId = $chapterB.id
    barangayName = "CRUD Barangay B $seed"
    username = "crud_barangay_b_$seed"
    password = $password
    isActive = $true
    mustChangePassword = $false
  } -Session $adminSession).Data
  $cleanup.barangayUsers.Add($barangayBUser.id) | Out-Null
  Record-Result "Created barangay test users"

  Invoke-Api -Method "POST" -Path "/api/auth/login" -Body @{ username = $chapterAUser.username; password = $password } -Session $chapterASession | Out-Null
  Invoke-Api -Method "POST" -Path "/api/auth/login" -Body @{ username = $chapterBUser.username; password = $password } -Session $chapterBSession | Out-Null
  Invoke-Api -Method "POST" -Path "/api/auth/login" -Body @{ username = $barangayAUser.username; password = $password } -Session $barangayASession | Out-Null
  Record-Result "Chapter/Barangay login"

  # Project reports CRUD + ownership checks
  $report = (Invoke-Api -Method "POST" -Path "/api/project-reports" -Body @{
    projectName = "CRUD Runtime Report $seed"
    projectWriteup = "Initial writeup"
    facebookPostLink = "https://facebook.com/runtime/$seed"
    collaborationType = "NONE"
  } -Session $chapterASession).Data
  $cleanup.projectReports.Add($report.id) | Out-Null

  Invoke-Api -Method "PUT" -Path "/api/project-reports/$($report.id)" -Body @{ projectWriteup = "Updated writeup" } -Session $chapterASession | Out-Null
  Invoke-Api -Method "PUT" -Path "/api/project-reports/$($report.id)" -Body @{ projectWriteup = "Forbidden update" } -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "DELETE" -Path "/api/project-reports/$($report.id)" -Body $null -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "DELETE" -Path "/api/project-reports/$($report.id)" -Body $null -Session $chapterASession | Out-Null
  $cleanup.projectReports.Remove($report.id) | Out-Null
  Record-Result "Project reports ownership + delete"

  # Chapter KPI admin create/delete
  $chapterKpi = (Invoke-Api -Method "POST" -Path "/api/chapter-kpis" -Body @{
    chapterId = $chapterA.id
    year = 2026
    kpisJson = @{ runtime = "ok" }
  } -Session $adminSession).Data
  $cleanup.chapterKpis.Add($chapterKpi.id) | Out-Null
  Invoke-Api -Method "DELETE" -Path "/api/chapter-kpis/$($chapterKpi.id)" -Body $null -Session $adminSession | Out-Null
  $cleanup.chapterKpis.Remove($chapterKpi.id) | Out-Null
  Record-Result "Chapter KPI delete endpoint"

  # Member patch role restrictions
  $member = (Invoke-Api -Method "POST" -Path "/api/members" -Body @{
    fullName = "Runtime Member $seed"
    age = 28
    chapterId = $chapterA.id
    barangayId = $barangayAUser.id
    contactNumber = "09171234567"
    registeredVoter = $false
    isActive = $true
  } -Session $adminSession).Data
  $cleanup.members.Add($member.id) | Out-Null

  Invoke-Api -Method "PATCH" -Path "/api/members/$($member.id)" -Body @{ barangayId = $barangayBUser.id } -Session $chapterASession -ExpectedStatus @(400) | Out-Null
  Invoke-Api -Method "PATCH" -Path "/api/members/$($member.id)" -Body @{ fullName = "Chapter Updated Member"; barangayId = $barangayAUser.id } -Session $chapterASession | Out-Null
  Invoke-Api -Method "PATCH" -Path "/api/members/$($member.id)" -Body @{ chapterId = $chapterB.id } -Session $barangayASession -ExpectedStatus @(400) | Out-Null
  Invoke-Api -Method "PATCH" -Path "/api/members/$($member.id)" -Body @{ fullName = "Barangay Updated Member" } -Session $barangayASession | Out-Null
  Invoke-Api -Method "PATCH" -Path "/api/members/$($member.id)" -Body @{ fullName = "Forbidden Chapter B Edit" } -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Record-Result "Member patch role + ownership checks"

  # Chapter officers ownership checks
  $officer = (Invoke-Api -Method "POST" -Path "/api/chapter-officers" -Body @{
    level = "chapter"
    position = "Runtime Officer"
    fullName = "Officer A"
    contactNumber = "09170000001"
    chapterEmail = "officer.a@example.com"
  } -Session $chapterASession).Data
  $cleanup.chapterOfficers.Add($officer.id) | Out-Null

  Invoke-Api -Method "GET" -Path "/api/chapter-officers?chapterId=$($chapterA.id)" -Body $null -Session $chapterASession | Out-Null
  Invoke-Api -Method "GET" -Path "/api/chapter-officers?chapterId=$($chapterA.id)" -Body $null -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "GET" -Path "/api/chapter-officers?barangayId=$($barangayBUser.id)&level=barangay" -Body $null -Session $barangayASession -ExpectedStatus @(403) | Out-Null

  Invoke-Api -Method "PUT" -Path "/api/chapter-officers/$($officer.id)" -Body @{ fullName = "Officer A Updated" } -Session $chapterASession | Out-Null
  Invoke-Api -Method "PUT" -Path "/api/chapter-officers/$($officer.id)" -Body @{ fullName = "Officer B Forbidden" } -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "DELETE" -Path "/api/chapter-officers/$($officer.id)" -Body $null -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "DELETE" -Path "/api/chapter-officers/$($officer.id)" -Body $null -Session $chapterASession | Out-Null
  $cleanup.chapterOfficers.Remove($officer.id) | Out-Null
  Record-Result "Chapter officers ownership + delete"

  # KPI completion CRUD + ownership checks
  $kpiTemplate = (Invoke-Api -Method "POST" -Path "/api/kpi-templates" -Body @{
    name = "Runtime KPI Template $seed"
    description = "Runtime test KPI template"
    timeframe = "quarterly"
    inputType = "numeric"
    year = 2026
    quarter = 1
    targetValue = 10
    scope = "chapter"
    isActive = $true
  } -Session $adminSession).Data
  $cleanup.kpiTemplates.Add($kpiTemplate.id) | Out-Null

  $kpiCompletion = (Invoke-Api -Method "POST" -Path "/api/kpi-completions" -Body @{
    kpiTemplateId = $kpiTemplate.id
    numericValue = 3
    isCompleted = $false
  } -Session $chapterASession).Data
  $cleanup.kpiCompletions.Add($kpiCompletion.id) | Out-Null

  Invoke-Api -Method "GET" -Path "/api/kpi-completions?chapterId=$($chapterA.id)&year=2026&quarter=1" -Body $null -Session $chapterASession | Out-Null
  Invoke-Api -Method "GET" -Path "/api/kpi-completions?chapterId=$($chapterA.id)&year=2026&quarter=1" -Body $null -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "PUT" -Path "/api/kpi-completions/$($kpiCompletion.id)" -Body @{ numericValue = 5 } -Session $chapterASession | Out-Null
  Invoke-Api -Method "POST" -Path "/api/kpi-completions/$($kpiCompletion.id)/mark-complete" -Body @{} -Session $chapterASession | Out-Null
  Invoke-Api -Method "PUT" -Path "/api/kpi-completions/$($kpiCompletion.id)" -Body @{ numericValue = 9 } -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "DELETE" -Path "/api/kpi-completions/$($kpiCompletion.id)" -Body $null -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "DELETE" -Path "/api/kpi-completions/$($kpiCompletion.id)" -Body $null -Session $chapterASession | Out-Null
  $cleanup.kpiCompletions.Remove($kpiCompletion.id) | Out-Null

  Invoke-Api -Method "DELETE" -Path "/api/kpi-templates/$($kpiTemplate.id)" -Body $null -Session $adminSession | Out-Null
  $cleanup.kpiTemplates.Remove($kpiTemplate.id) | Out-Null
  Record-Result "KPI completions CRUD + ownership"

  # MOU submissions ownership checks
  $mou = (Invoke-Api -Method "POST" -Path "/api/mou-submissions" -Body @{
    driveFolderUrl = "https://drive.google.com/drive/folders/runtime-$seed"
    driveFileLink = "https://example.com/runtime-$seed"
  } -Session $chapterASession).Data
  $cleanup.mouSubmissions.Add($mou.id) | Out-Null

  Invoke-Api -Method "PATCH" -Path "/api/mou-submissions/$($mou.id)" -Body @{ driveFileLink = "https://example.com/runtime-updated-$seed" } -Session $chapterASession | Out-Null
  Invoke-Api -Method "PATCH" -Path "/api/mou-submissions/$($mou.id)" -Body @{ driveFileLink = "https://example.com/forbidden" } -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "DELETE" -Path "/api/mou-submissions/$($mou.id)" -Body $null -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "DELETE" -Path "/api/mou-submissions/$($mou.id)" -Body $null -Session $chapterASession | Out-Null
  $cleanup.mouSubmissions.Remove($mou.id) | Out-Null
  Record-Result "MOU submission patch/delete ownership"

  # Chapter requests ownership checks
  $chapterRequest = (Invoke-Api -Method "POST" -Path "/api/chapter-requests" -Body @{
    type = "funding_request"
    proposedActivityName = "Runtime Request $seed"
    rationale = "Runtime rationale"
    howNationalCanHelp = "Runtime support"
    details = "Runtime details"
  } -Session $chapterASession).Data
  $cleanup.chapterRequests.Add($chapterRequest.id) | Out-Null

  Invoke-Api -Method "DELETE" -Path "/api/chapter-requests/$($chapterRequest.id)" -Body $null -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "DELETE" -Path "/api/chapter-requests/$($chapterRequest.id)" -Body $null -Session $chapterASession | Out-Null
  $cleanup.chapterRequests.Remove($chapterRequest.id) | Out-Null
  Record-Result "Chapter requests delete ownership"

  # National requests ownership checks
  $nationalRequest = (Invoke-Api -Method "POST" -Path "/api/national-requests" -Body @{
    subject = "Runtime National Request $seed"
    message = "Runtime message"
    dateNeeded = (Get-Date).AddDays(7).ToString("o")
  } -Session $chapterASession).Data
  $cleanup.nationalRequests.Add($nationalRequest.id) | Out-Null

  Invoke-Api -Method "DELETE" -Path "/api/national-requests/$($nationalRequest.id)" -Body $null -Session $chapterBSession -ExpectedStatus @(403) | Out-Null
  Invoke-Api -Method "DELETE" -Path "/api/national-requests/$($nationalRequest.id)" -Body $null -Session $chapterASession | Out-Null
  $cleanup.nationalRequests.Remove($nationalRequest.id) | Out-Null
  Record-Result "National requests delete ownership"

  Write-Host ""
  Write-Host "All runtime checks passed:" -ForegroundColor Green
  $results | ForEach-Object { Write-Host "  $_" }

} finally {
  # Best-effort cleanup (admin-only resources)
  foreach ($id in @($cleanup.projectReports)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/project-reports/$id" -Body $null -Session $adminSession -ExpectedStatus @(200,403,404) | Out-Null } catch {}
  }
  foreach ($id in @($cleanup.kpiCompletions)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/kpi-completions/$id" -Body $null -Session $adminSession -ExpectedStatus @(200,403,404) | Out-Null } catch {}
  }
  foreach ($id in @($cleanup.kpiTemplates)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/kpi-templates/$id" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null } catch {}
  }
  foreach ($id in @($cleanup.chapterKpis)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/chapter-kpis/$id" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null } catch {}
  }
  foreach ($id in @($cleanup.mouSubmissions)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/mou-submissions/$id" -Body $null -Session $chapterASession -ExpectedStatus @(200,403,404) | Out-Null } catch {}
  }
  foreach ($id in @($cleanup.chapterOfficers)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/chapter-officers/$id" -Body $null -Session $chapterASession -ExpectedStatus @(200,403,404) | Out-Null } catch {}
  }
  foreach ($id in @($cleanup.chapterRequests)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/chapter-requests/$id" -Body $null -Session $chapterASession -ExpectedStatus @(200,403,404) | Out-Null } catch {}
  }
  foreach ($id in @($cleanup.nationalRequests)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/national-requests/$id" -Body $null -Session $chapterASession -ExpectedStatus @(200,403,404) | Out-Null } catch {}
  }
  foreach ($id in @($cleanup.members)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/members/$id" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null } catch {}
  }
  foreach ($id in @($cleanup.barangayUsers)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/barangay-users/$id" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null } catch {}
  }
  foreach ($id in @($cleanup.chapterUsers)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/chapter-users/$id" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null } catch {}
  }
  foreach ($id in @($cleanup.chapters)) {
    try { Invoke-Api -Method "DELETE" -Path "/api/chapters/$id" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null } catch {}
  }
}
