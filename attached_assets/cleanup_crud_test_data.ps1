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
    $trimmed = $rawBody.Trim()
    if ($trimmed.StartsWith("{") -or $trimmed.StartsWith("[")) {
      try {
        $data = $trimmed | ConvertFrom-Json -Depth 100
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
$deleted = @{}

# Admin login
Invoke-Api -Method "POST" -Path "/api/auth/login" -Body @{ username = "admin"; password = "admin123" } -Session $adminSession | Out-Null

# Identify test chapters
$chapters = @((Invoke-Api -Method "GET" -Path "/api/chapters" -Body $null -Session $adminSession).Data)
$testChapters = @($chapters | Where-Object { Is-TestString $_.name })
$testChapterIds = @($testChapters | ForEach-Object { $_.id })
$testChapterIdSet = New-Object 'System.Collections.Generic.HashSet[string]'
$testChapterIds | ForEach-Object { [void]$testChapterIdSet.Add([string]$_) }

# Accounts (both chapter and barangay)
$allAccounts = @((Invoke-Api -Method "GET" -Path "/api/all-accounts" -Body $null -Session $adminSession).Data)
$testChapterUsers = @($allAccounts | Where-Object {
  $_.accountType -eq "Chapter" -and (
    Is-TestString $_.username -or $testChapterIdSet.Contains([string]$_.id) -or ($testChapters | ForEach-Object { $_.name } | ForEach-Object { $_ -eq $_.accountName } | Where-Object { $_ } | Measure-Object).Count -gt 0
  )
})

$barangayUsers = @((Invoke-Api -Method "GET" -Path "/api/barangay-users" -Body $null -Session $adminSession).Data)
$testBarangayUsers = @($barangayUsers | Where-Object {
  Is-TestString $_.username -or Is-TestString $_.barangayName -or $testChapterIdSet.Contains([string]$_.chapterId)
})
$testBarangayIds = @($testBarangayUsers | ForEach-Object { $_.id })
$testBarangayIdSet = New-Object 'System.Collections.Generic.HashSet[string]'
$testBarangayIds | ForEach-Object { [void]$testBarangayIdSet.Add([string]$_) }

# Members
$members = @((Invoke-Api -Method "GET" -Path "/api/members" -Body $null -Session $adminSession).Data)
$membersToDelete = @($members | Where-Object {
  Is-TestString $_.fullName -or $testChapterIdSet.Contains([string]$_.chapterId) -or $testBarangayIdSet.Contains([string]$_.barangayId)
})
foreach ($m in $membersToDelete) {
  Invoke-Api -Method "DELETE" -Path "/api/members/$($m.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "members"
}

# Project reports
$projectReports = @((Invoke-Api -Method "GET" -Path "/api/project-reports" -Body $null -Session $adminSession).Data)
$reportsToDelete = @($projectReports | Where-Object {
  Is-TestString $_.projectName -or Is-TestString $_.projectWriteup -or Is-TestString $_.facebookPostLink -or $testChapterIdSet.Contains([string]$_.chapterId)
})
foreach ($r in $reportsToDelete) {
  Invoke-Api -Method "DELETE" -Path "/api/project-reports/$($r.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "projectReports"
}

# Chapter officers (query per chapter)
foreach ($chapter in $chapters) {
  $officers = @((Invoke-Api -Method "GET" -Path "/api/chapter-officers?chapterId=$($chapter.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,400)).Data)
  if ($null -eq $officers) { continue }

  $officersToDelete = @($officers | Where-Object {
    Is-TestString $_.position -or Is-TestString $_.fullName -or $testChapterIdSet.Contains([string]$_.chapterId) -or $testBarangayIdSet.Contains([string]$_.barangayId)
  })

  foreach ($o in $officersToDelete) {
    Invoke-Api -Method "DELETE" -Path "/api/chapter-officers/$($o.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
    Add-Count -Counts $deleted -Key "chapterOfficers"
  }
}

# KPI templates with runtime/crud markers
$kpiTemplates = @((Invoke-Api -Method "GET" -Path "/api/kpi-templates" -Body $null -Session $adminSession).Data)
$runtimeTemplateIds = @()
foreach ($tpl in $kpiTemplates) {
  if (Is-TestString $tpl.name -or Is-TestString $tpl.description) {
    $runtimeTemplateIds += [string]$tpl.id
  }
}
$runtimeTemplateIdSet = New-Object 'System.Collections.Generic.HashSet[string]'
$runtimeTemplateIds | ForEach-Object { [void]$runtimeTemplateIdSet.Add($_) }

# KPI completions per chapter
foreach ($chapter in $chapters) {
  $completions = @((Invoke-Api -Method "GET" -Path "/api/kpi-completions?chapterId=$($chapter.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,400)).Data)
  if ($null -eq $completions) { continue }

  $completionsToDelete = @($completions | Where-Object {
    $runtimeTemplateIdSet.Contains([string]$_.kpiTemplateId) -or $testChapterIdSet.Contains([string]$_.chapterId)
  })

  foreach ($kc in $completionsToDelete) {
    Invoke-Api -Method "DELETE" -Path "/api/kpi-completions/$($kc.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,403,404) | Out-Null
    Add-Count -Counts $deleted -Key "kpiCompletions"
  }
}

# Delete runtime templates
foreach ($tplId in $runtimeTemplateIds) {
  Invoke-Api -Method "DELETE" -Path "/api/kpi-templates/$tplId" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "kpiTemplates"
}

# Chapter KPI snapshots per chapter/year if in test chapter or runtime payload marker
$currentYear = (Get-Date).Year
foreach ($chapter in $chapters) {
  for ($year = $currentYear - 2; $year -le $currentYear + 2; $year++) {
    $resp = Invoke-Api -Method "GET" -Path "/api/chapter-kpis/$($chapter.id)/$year" -Body $null -Session $adminSession -ExpectedStatus @(200,404)
    if ($resp.Status -eq 404 -or $null -eq $resp.Data) { continue }
    $kpiRecord = $resp.Data

    $kpiJsonRaw = ""
    if ($null -ne $kpiRecord.kpisJson) {
      try { $kpiJsonRaw = ($kpiRecord.kpisJson | ConvertTo-Json -Depth 50) } catch { $kpiJsonRaw = "$($kpiRecord.kpisJson)" }
    }

    if ($testChapterIdSet.Contains([string]$kpiRecord.chapterId) -or (Is-TestString $kpiJsonRaw)) {
      Invoke-Api -Method "DELETE" -Path "/api/chapter-kpis/$($kpiRecord.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
      Add-Count -Counts $deleted -Key "chapterKpis"
    }
  }
}

# MOU submissions
$mouSubmissions = @((Invoke-Api -Method "GET" -Path "/api/mou-submissions" -Body $null -Session $adminSession).Data)
$mouToDelete = @($mouSubmissions | Where-Object {
  $url1 = [string]$_.driveFolderUrl
  $url2 = [string]$_.driveFileLink
  Is-TestString $url1 -or Is-TestString $url2 -or $testChapterIdSet.Contains([string]$_.chapterId)
})
foreach ($mou in $mouToDelete) {
  Invoke-Api -Method "DELETE" -Path "/api/mou-submissions/$($mou.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,403,404) | Out-Null
  Add-Count -Counts $deleted -Key "mouSubmissions"
}

# Chapter requests
$chapterRequests = @((Invoke-Api -Method "GET" -Path "/api/chapter-requests" -Body $null -Session $adminSession).Data)
$chapterRequestsToDelete = @($chapterRequests | Where-Object {
  Is-TestString $_.proposedActivityName -or Is-TestString $_.details -or Is-TestString $_.rationale -or $testChapterIdSet.Contains([string]$_.chapterId)
})
foreach ($cr in $chapterRequestsToDelete) {
  Invoke-Api -Method "DELETE" -Path "/api/chapter-requests/$($cr.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "chapterRequests"
}

# National requests
$nationalRequests = @((Invoke-Api -Method "GET" -Path "/api/national-requests" -Body $null -Session $adminSession).Data)
$nationalToDelete = @($nationalRequests | Where-Object {
  Is-TestString $_.subject -or Is-TestString $_.message -or Is-TestString $_.adminReply -or $testChapterIdSet.Contains([string]$_.senderId) -or $testBarangayIdSet.Contains([string]$_.senderId)
})
foreach ($nr in $nationalToDelete) {
  Invoke-Api -Method "DELETE" -Path "/api/national-requests/$($nr.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "nationalRequests"
}

# Re-fetch accounts before deleting test chapters
$allAccounts2 = @((Invoke-Api -Method "GET" -Path "/api/all-accounts" -Body $null -Session $adminSession).Data)
$chapterUsersToDelete = @($allAccounts2 | Where-Object {
  $_.accountType -eq "Chapter" -and (Is-TestString $_.username -or $testChapterIdSet.Contains([string]$_.chapterId))
})
foreach ($cu in $chapterUsersToDelete) {
  Invoke-Api -Method "DELETE" -Path "/api/chapter-users/$($cu.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "chapterUsers"
}

$barangayUsers2 = @((Invoke-Api -Method "GET" -Path "/api/barangay-users" -Body $null -Session $adminSession).Data)
$barangayToDelete = @($barangayUsers2 | Where-Object {
  Is-TestString $_.username -or Is-TestString $_.barangayName -or $testChapterIdSet.Contains([string]$_.chapterId)
})
foreach ($bu in $barangayToDelete) {
  Invoke-Api -Method "DELETE" -Path "/api/barangay-users/$($bu.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404) | Out-Null
  Add-Count -Counts $deleted -Key "barangayUsers"
}

# Delete test chapters last
foreach ($c in $testChapters) {
  Invoke-Api -Method "DELETE" -Path "/api/chapters/$($c.id)" -Body $null -Session $adminSession -ExpectedStatus @(200,404,400) | Out-Null
  Add-Count -Counts $deleted -Key "chaptersAttempted"
}

# Verification snapshot for requested chapter-like names
$remainingChapters = @((Invoke-Api -Method "GET" -Path "/api/chapters" -Body $null -Session $adminSession).Data)
$remainingTestChapters = @($remainingChapters | Where-Object { Is-TestString $_.name })

$summary = [PSCustomObject]@{
  deleted = $deleted
  remainingTestChapters = $remainingTestChapters
}

$summary | ConvertTo-Json -Depth 20
