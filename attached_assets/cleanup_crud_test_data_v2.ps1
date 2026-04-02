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
    $jsonBody = $Body | ConvertTo-Json -Depth 100
  }

  $statusCode = 0
  $rawBody = ""

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
    try {
      $data = $rawBody | ConvertFrom-Json
    } catch {
      $data = $null
    }
  }

  return [PSCustomObject]@{
    Status = $statusCode
    Data = $data
    Raw = $rawBody
  }
}

function Is-TestString {
  param([string]$Value)
  if ([string]::IsNullOrWhiteSpace($Value)) { return $false }
  return ($Value -match "(?i)\bcrud\b") -or ($Value -match "(?i)runtime")
}

function Add-Count {
  param([hashtable]$Counts, [string]$Key)
  if (-not $Counts.ContainsKey($Key)) {
    $Counts[$Key] = 0
  }
  $Counts[$Key] = [int]$Counts[$Key] + 1
}

$adminSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-Api -Method "POST" -Path "/api/auth/login" -Body @{ username = "admin"; password = "admin123" } -Session $adminSession | Out-Null

$deleted = @{}

# --- Discover chapters and chapter users ---
$chapters = @((Invoke-Api -Method "GET" -Path "/api/chapters" -Body $null -Session $adminSession).Data)
$testChapterIdSet = New-Object 'System.Collections.Generic.HashSet[string]'
$chapterNameById = @{}

foreach ($chapter in $chapters) {
  $chapterId = [string]$chapter.id
  if ([string]::IsNullOrWhiteSpace($chapterId)) {
    continue
  }

  $chapterNameById[$chapterId] = [string]$chapter.name
  if (Is-TestString $chapter.name) {
    [void]$testChapterIdSet.Add($chapterId)
  }
}

$allChapterUsers = New-Object System.Collections.Generic.List[object]
$chapterUsersByChapter = @{}

foreach ($chapter in $chapters) {
  $chapterId = [string]$chapter.id
  if ([string]::IsNullOrWhiteSpace($chapterId)) {
    continue
  }

  $users = @((Invoke-Api -Method "GET" -Path "/api/chapters/$chapterId/users" -Body $null -Session $adminSession).Data)
  $chapterUsersByChapter[$chapterId] = $users

  foreach ($u in $users) {
    $allChapterUsers.Add([PSCustomObject]@{
      id = [string]$u.id
      username = [string]$u.username
      chapterId = $chapterId
    }) | Out-Null
  }
}

$testChapterUsers = @($allChapterUsers | Where-Object {
  Is-TestString $_.username -or $testChapterIdSet.Contains([string]$_.chapterId)
})

$chapterUserIdsToDeleteSet = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($u in $testChapterUsers) {
  [void]$chapterUserIdsToDeleteSet.Add([string]$u.id)
}

# --- Discover barangay users ---
$barangayUsers = @((Invoke-Api -Method "GET" -Path "/api/barangay-users" -Body $null -Session $adminSession).Data)
$testBarangayIdSet = New-Object 'System.Collections.Generic.HashSet[string]'

foreach ($bu in $barangayUsers) {
  if (Is-TestString $bu.username -or Is-TestString $bu.barangayName -or $testChapterIdSet.Contains([string]$bu.chapterId)) {
    [void]$testBarangayIdSet.Add([string]$bu.id)
  }
}

# --- Build chapter sessions for chapter-scoped delete routes ---
$chapterSessionById = @{}
$cleanupPassword = "CleanupPass1234!"

function Ensure-ChapterSession {
  param([string]$ChapterId)

  if ($chapterSessionById.ContainsKey($ChapterId)) {
    return $chapterSessionById[$ChapterId]
  }

  $candidateUser = $null
  $matches = @($testChapterUsers | Where-Object { [string]$_.chapterId -eq $ChapterId })
  if ($matches.Count -gt 0) {
    $candidateUser = $matches[0]
  }

  $username = ""
  $password = ""

  if ($null -ne $candidateUser) {
    $reset = Invoke-Api -Method "POST" -Path "/api/reset-password/chapter/$($candidateUser.id)" -Body @{} -Session $adminSession
    $username = [string]$candidateUser.username
    $password = [string]$reset.Data.temporaryPassword
  } else {
    $seed = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $safeChapter = $ChapterId.Replace("-", "").Substring(0, [Math]::Min(8, $ChapterId.Length))
    $username = "cleanup_ch_$safeChapter`_$seed"
    $createdUser = (Invoke-Api -Method "POST" -Path "/api/chapter-users" -Body @{
      chapterId = $ChapterId
      username = $username
      password = $cleanupPassword
      isActive = $true
      mustChangePassword = $false
    } -Session $adminSession).Data
    [void]$chapterUserIdsToDeleteSet.Add([string]$createdUser.id)
    $password = $cleanupPassword
  }

  $session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Invoke-Api -Method "POST" -Path "/api/auth/login" -Body @{ username = $username; password = $password } -Session $session | Out-Null
  $chapterSessionById[$ChapterId] = $session
  return $session
}

# --- Members cleanup (admin) ---
$members = @((Invoke-Api -Method "GET" -Path "/api/members" -Body $null -Session $adminSession).Data)
$membersToDelete = @($members | Where-Object {
  Is-TestString $_.fullName -or $testChapterIdSet.Contains([string]$_.chapterId) -or $testBarangayIdSet.Contains([string]$_.barangayId)
})
foreach ($m in $membersToDelete) {
  Invoke-Api -Method "DELETE" -Path "/api/members/$($m.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "members"
}

# --- Project reports cleanup (admin) ---
$projectReports = @((Invoke-Api -Method "GET" -Path "/api/project-reports" -Body $null -Session $adminSession).Data)
$reportsToDelete = @($projectReports | Where-Object {
  Is-TestString $_.projectName -or Is-TestString $_.projectWriteup -or Is-TestString $_.facebookPostLink -or $testChapterIdSet.Contains([string]$_.chapterId)
})
foreach ($r in $reportsToDelete) {
  Invoke-Api -Method "DELETE" -Path "/api/project-reports/$($r.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "projectReports"
}

# --- Chapter officers cleanup (chapter session required) ---
foreach ($chapter in $chapters) {
  $chapterId = [string]$chapter.id
  if ([string]::IsNullOrWhiteSpace($chapterId)) {
    continue
  }

  $officers = @((Invoke-Api -Method "GET" -Path "/api/chapter-officers?chapterId=$chapterId" -Body $null -Session $adminSession).Data)
  $targets = @($officers | Where-Object {
    Is-TestString $_.position -or Is-TestString $_.fullName -or $testChapterIdSet.Contains([string]$_.chapterId) -or $testBarangayIdSet.Contains([string]$_.barangayId)
  })

  foreach ($o in $targets) {
    $sess = Ensure-ChapterSession -ChapterId ([string]$o.chapterId)
    Invoke-Api -Method "DELETE" -Path "/api/chapter-officers/$($o.id)" -Body $null -Session $sess -ExpectedStatus @(200,404,403) | Out-Null
    Add-Count -Counts $deleted -Key "chapterOfficers"
  }
}

# --- KPI templates and completions cleanup ---
$kpiTemplates = @((Invoke-Api -Method "GET" -Path "/api/kpi-templates" -Body $null -Session $adminSession).Data)
$runtimeTemplateIdSet = New-Object 'System.Collections.Generic.HashSet[string]'
foreach ($tpl in $kpiTemplates) {
  if (Is-TestString $tpl.name -or Is-TestString $tpl.description) {
    [void]$runtimeTemplateIdSet.Add([string]$tpl.id)
  }
}

foreach ($chapter in $chapters) {
  $chapterId = [string]$chapter.id
  if ([string]::IsNullOrWhiteSpace($chapterId)) {
    continue
  }

  $completions = @((Invoke-Api -Method "GET" -Path "/api/kpi-completions?chapterId=$chapterId" -Body $null -Session $adminSession -ExpectedStatus @(200,400)).Data)
  if ($null -eq $completions) { continue }

  $toDelete = @($completions | Where-Object {
    $runtimeTemplateIdSet.Contains([string]$_.kpiTemplateId) -or $testChapterIdSet.Contains([string]$_.chapterId)
  })

  foreach ($kc in $toDelete) {
    $sess = Ensure-ChapterSession -ChapterId ([string]$kc.chapterId)
    Invoke-Api -Method "DELETE" -Path "/api/kpi-completions/$($kc.id)" -Body $null -Session $sess -ExpectedStatus @(200,404,403) | Out-Null
    Add-Count -Counts $deleted -Key "kpiCompletions"
  }
}

foreach ($tplId in $runtimeTemplateIdSet) {
  Invoke-Api -Method "DELETE" -Path "/api/kpi-templates/$tplId" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "kpiTemplates"
}

# --- Chapter KPI snapshots cleanup (admin) ---
$currentYear = (Get-Date).Year
foreach ($chapter in $chapters) {
  $chapterId = [string]$chapter.id
  if ([string]::IsNullOrWhiteSpace($chapterId)) {
    continue
  }

  for ($year = $currentYear - 2; $year -le $currentYear + 2; $year++) {
    $resp = Invoke-Api -Method "GET" -Path "/api/chapter-kpis/$chapterId/$year" -Body $null -Session $adminSession -ExpectedStatus @(200,404)
    if ($resp.Status -eq 404 -or $null -eq $resp.Data) { continue }

    $record = $resp.Data
    $jsonRaw = ""
    if ($null -ne $record.kpisJson) {
      try { $jsonRaw = ($record.kpisJson | ConvertTo-Json -Depth 50) } catch { $jsonRaw = "$($record.kpisJson)" }
    }

    if ($testChapterIdSet.Contains([string]$record.chapterId) -or (Is-TestString $jsonRaw)) {
      Invoke-Api -Method "DELETE" -Path "/api/chapter-kpis/$($record.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
      Add-Count -Counts $deleted -Key "chapterKpis"
    }
  }
}

# --- MOU submissions cleanup (chapter session required) ---
$mouSubmissions = @((Invoke-Api -Method "GET" -Path "/api/mou-submissions" -Body $null -Session $adminSession).Data)
$mouTargets = @($mouSubmissions | Where-Object {
  Is-TestString $_.driveFolderUrl -or Is-TestString $_.driveFileLink -or Is-TestString $_.uploadedFileUrl -or $testChapterIdSet.Contains([string]$_.chapterId)
})
foreach ($mou in $mouTargets) {
  $sess = Ensure-ChapterSession -ChapterId ([string]$mou.chapterId)
  Invoke-Api -Method "DELETE" -Path "/api/mou-submissions/$($mou.id)" -Body $null -Session $sess -ExpectedStatus @(200,404,403) | Out-Null
  Add-Count -Counts $deleted -Key "mouSubmissions"
}

# --- Chapter requests cleanup (admin allowed) ---
$chapterRequests = @((Invoke-Api -Method "GET" -Path "/api/chapter-requests" -Body $null -Session $adminSession).Data)
$chapterRequestTargets = @($chapterRequests | Where-Object {
  Is-TestString $_.proposedActivityName -or Is-TestString $_.details -or Is-TestString $_.rationale -or $testChapterIdSet.Contains([string]$_.chapterId)
})
foreach ($cr in $chapterRequestTargets) {
  Invoke-Api -Method "DELETE" -Path "/api/chapter-requests/$($cr.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "chapterRequests"
}

# --- National requests cleanup (admin allowed) ---
$nationalRequests = @((Invoke-Api -Method "GET" -Path "/api/national-requests" -Body $null -Session $adminSession).Data)
$nationalTargets = @($nationalRequests | Where-Object {
  Is-TestString $_.subject -or Is-TestString $_.message -or Is-TestString $_.adminReply -or $testChapterIdSet.Contains([string]$_.senderId) -or $testBarangayIdSet.Contains([string]$_.senderId)
})
foreach ($nr in $nationalTargets) {
  Invoke-Api -Method "DELETE" -Path "/api/national-requests/$($nr.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "nationalRequests"
}

# --- Delete test barangay users (admin) ---
$barangayUsers2 = @((Invoke-Api -Method "GET" -Path "/api/barangay-users" -Body $null -Session $adminSession).Data)
$barangayTargets = @($barangayUsers2 | Where-Object {
  Is-TestString $_.username -or Is-TestString $_.barangayName -or $testChapterIdSet.Contains([string]$_.chapterId)
})
foreach ($bu in $barangayTargets) {
  Invoke-Api -Method "DELETE" -Path "/api/barangay-users/$($bu.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "barangayUsers"
}

# --- Delete chapter users flagged for test cleanup + those in test chapters (admin) ---
$allChapterUsersAfter = New-Object System.Collections.Generic.List[object]
$remainingChaptersForUsers = @((Invoke-Api -Method "GET" -Path "/api/chapters" -Body $null -Session $adminSession).Data)
foreach ($chapter in $remainingChaptersForUsers) {
  $users = @((Invoke-Api -Method "GET" -Path "/api/chapters/$($chapter.id)/users" -Body $null -Session $adminSession).Data)
  foreach ($u in $users) {
    $allChapterUsersAfter.Add([PSCustomObject]@{
      id = [string]$u.id
      username = [string]$u.username
      chapterId = [string]$chapter.id
    }) | Out-Null
  }
}

$chapterUserTargets = @($allChapterUsersAfter | Where-Object {
  Is-TestString $_.username -or $testChapterIdSet.Contains([string]$_.chapterId) -or $chapterUserIdsToDeleteSet.Contains([string]$_.id)
})
foreach ($cu in $chapterUserTargets) {
  Invoke-Api -Method "DELETE" -Path "/api/chapter-users/$($cu.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "chapterUsers"
}

# --- Delete test chapters last ---
$testChapterTargets = @((Invoke-Api -Method "GET" -Path "/api/chapters" -Body $null -Session $adminSession).Data | Where-Object { Is-TestString $_.name })
foreach ($c in $testChapterTargets) {
  Invoke-Api -Method "DELETE" -Path "/api/chapters/$($c.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404,400) | Out-Null
  Add-Count -Counts $deleted -Key "chaptersAttempted"
}

# --- Verification ---
$chaptersFinal = @((Invoke-Api -Method "GET" -Path "/api/chapters" -Body $null -Session $adminSession).Data)
$remainingTestChapters = @($chaptersFinal | Where-Object { Is-TestString $_.name })
$exactTarget = @($chaptersFinal | Where-Object { [string]$_.name -eq "CRUD Chapter 1775144670888" })

$result = [PSCustomObject]@{
  deleted = $deleted
  remainingTestChapters = $remainingTestChapters
  exactTargetRemainingCount = $exactTarget.Count
}

$result | ConvertTo-Json -Depth 100
