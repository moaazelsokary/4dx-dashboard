# PowerShell Script to Get Excel Data from OneDrive URL

# Add required assembly for HttpUtility
Add-Type -AssemblyName System.Web

# Configuration
$clientId = $env:CLIENT_ID
$clientSecret = $env:CLIENT_SECRET
$tenantId = $env:TENANT_ID

# Your OneDrive URL
$oneDriveUrl = "https://lifemaker-my.sharepoint.com/:x:/r/personal/hamed_ibrahim_lifemakers_org/_layouts/15/Doc.aspx?sourcedoc=%7B084A3748-79EC-41B1-B3EB-8ECED81E5C53%7D&file=Projects%20Dashboard%202025%20-%20Internal%20tracker.xlsx&fromShare=true&action=default&mobileredirect=true"

# Excel configuration
$worksheetName = "Overall Targets"  # Change this to your worksheet name
$rangeAddress = "A1:Z100"  # Change this to your desired range

# Function to get access token
function Get-AccessToken {
    $tokenUrl = "https://login.microsoftonline.com/$tenantId/oauth2/v2.0/token"
    $body = @{
        client_id     = $clientId
        scope         = "https://graph.microsoft.com/.default"
        client_secret = $clientSecret
        grant_type    = "client_credentials"
    }

    try {
        Write-Host "[INFO] Requesting access token..."
        $tokenResponse = Invoke-RestMethod -Uri $tokenUrl -Method Post -Body $body -ContentType "application/x-www-form-urlencoded"
        $accessToken = $tokenResponse.access_token

        if (-not $accessToken) {
            Write-Host "[ERROR] Failed to get access token"
            $tokenResponse | ConvertTo-Json -Depth 10 | Write-Host
            return $null
        }

        Write-Host "[SUCCESS] Successfully obtained access token"
        return $accessToken
    }
    catch {
        Write-Host "[ERROR] Failed to get access token: $($_.Exception.Message)"
        return $null
    }
}

# Function to extract file ID and user from OneDrive URL
function Extract-FileIdFromOneDriveUrl {
    param($oneDriveUrl)
    
    try {
        Write-Host "[INFO] Extracting file ID from OneDrive URL..."
        
        # Parse the URL to extract the sourcedoc parameter
        $uri = [System.Uri]$oneDriveUrl
        Write-Host "[DEBUG] URI: $uri"
        Write-Host "[DEBUG] Query: $($uri.Query)"
        Write-Host "[DEBUG] Path: $($uri.AbsolutePath)"
        
        $query = [System.Web.HttpUtility]::ParseQueryString($uri.Query)
        $sourcedoc = $query["sourcedoc"]
        $fileName = $query["file"]
        
        Write-Host "[DEBUG] Sourcedoc: $sourcedoc"
        Write-Host "[DEBUG] FileName: $fileName"
        
        # Extract user email from the URL path
        $pathParts = $uri.AbsolutePath.Split('/')
        Write-Host "[DEBUG] Path parts: $($pathParts -join ', ')"
        $userIndex = [array]::IndexOf($pathParts, "personal")
        Write-Host "[DEBUG] Personal index: $userIndex"
        
        if ($userIndex -ge 0 -and $userIndex -lt ($pathParts.Length - 1)) {
            $userEmail = $pathParts[$userIndex + 1]
            Write-Host "[DEBUG] User email: $userEmail"
        }
        else {
            Write-Host "[ERROR] Could not extract user email from URL"
            Write-Host "[DEBUG] Path parts length: $($pathParts.Length)"
            return $null
        }
        
        if ($sourcedoc) {
            # Remove the curly braces from the GUID
            $fileId = $sourcedoc.Trim('{}')
            Write-Host "[SUCCESS] Extracted file ID: $fileId"
            Write-Host "[SUCCESS] File name: $fileName"
            Write-Host "[SUCCESS] User email: $userEmail"
            return @{
                FileId = $fileId
                FileName = $fileName
                UserEmail = $userEmail
            }
        }
        else {
            Write-Host "[ERROR] Could not extract sourcedoc parameter from URL"
            return $null
        }
    }
    catch {
        Write-Host "[ERROR] Failed to parse OneDrive URL: $($_.Exception.Message)"
        return $null
    }
}

# Function to get file info by ID from OneDrive using user email
function Get-OneDriveFileInfoByEmail {
    param($accessToken, $userEmail, $fileId)
    
    $headers = @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type"  = "application/json"
    }

    $fileUrl = "https://graph.microsoft.com/v1.0/users/$userEmail/drive/items/$fileId"
    
    try {
        Write-Host "[INFO] Getting OneDrive file info for user: $userEmail, file ID: $fileId"
        $response = Invoke-RestMethod -Uri $fileUrl -Headers $headers -Method Get
        
        Write-Host "[SUCCESS] File found:"
        Write-Host "  Name: $($response.name)"
        Write-Host "  ID: $($response.id)"
        Write-Host "  Parent Folder ID: $($response.parentReference.id)"
        Write-Host "  Parent Path: $($response.parentReference.path)"
        
        return $response
    }
    catch {
        Write-Host "[ERROR] Failed to get OneDrive file info: $($_.Exception.Message)"
        return $null
    }
}

# Function to try different permission scopes for OneDrive access
function Test-DifferentPermissions {
    param($accessToken, $userEmail, $fileId)
    
    Write-Host "`n=== Testing Different Permission Approaches ==="
    
    # Test 1: Try with Files.Read.All scope
    Write-Host "[TEST 1] Trying with Files.Read.All permission..."
    try {
        $headers = @{
            "Authorization" = "Bearer $accessToken"
            "Content-Type"  = "application/json"
        }
        
        $fileUrl = "https://graph.microsoft.com/v1.0/users/$userEmail/drive/items/$fileId"
        $response = Invoke-RestMethod -Uri $fileUrl -Headers $headers -Method Get
        Write-Host "[SUCCESS] File access successful with current permissions!"
        return $response
    }
    catch {
        Write-Host "[ERROR] Files.Read.All failed: $($_.Exception.Message)"
    }
    
    # Test 2: Try with Sites.Read.All scope
    Write-Host "[TEST 2] Trying with Sites.Read.All permission..."
    try {
        $headers = @{
            "Authorization" = "Bearer $accessToken"
            "Content-Type"  = "application/json"
        }
        
        # Try accessing through sites endpoint
        $siteUrl = "https://graph.microsoft.com/v1.0/sites/lifemaker-my.sharepoint.com:/personal/$userEmail"
        $siteResponse = Invoke-RestMethod -Uri $siteUrl -Headers $headers -Method Get
        Write-Host "[SUCCESS] Site access successful!"
        
        $fileUrl = "https://graph.microsoft.com/v1.0/sites/$($siteResponse.id)/drive/items/$fileId"
        $response = Invoke-RestMethod -Uri $fileUrl -Headers $headers -Method Get
        Write-Host "[SUCCESS] File access successful through site!"
        return $response
    }
    catch {
        Write-Host "[ERROR] Sites.Read.All failed: $($_.Exception.Message)"
    }
    
    return $null
}

# Function to list worksheets in Excel file
function Get-ExcelWorksheets {
    param($accessToken, $userEmail, $fileId, $useSiteEndpoint = $false, $siteId = $null)
    
    $headers = @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type"  = "application/json"
    }

    if ($useSiteEndpoint -and $siteId) {
        $worksheetsUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/drive/items/$fileId/workbook/worksheets"
    }
    else {
        $worksheetsUrl = "https://graph.microsoft.com/v1.0/users/$userEmail/drive/items/$fileId/workbook/worksheets"
    }
    
    try {
        Write-Host "[INFO] Listing worksheets in Excel file..."
        $response = Invoke-RestMethod -Uri $worksheetsUrl -Headers $headers -Method Get
        
        if ($response.value) {
            Write-Host "[SUCCESS] Found $($response.value.Count) worksheets:"
            foreach ($worksheet in $response.value) {
                Write-Host "  - $($worksheet.name) (ID: $($worksheet.id))"
            }
            return $response.value
        }
        else {
            Write-Host "[ERROR] No worksheets found"
            return $null
        }
    }
    catch {
        Write-Host "[ERROR] Failed to get worksheets: $($_.Exception.Message)"
        return $null
    }
}

# Function to get Excel data from specific worksheet and range
function Get-ExcelData {
    param($accessToken, $userEmail, $fileId, $worksheetName, $rangeAddress, $useSiteEndpoint = $false, $siteId = $null, $worksheetId = $null)
    
    $headers = @{
        "Authorization" = "Bearer $accessToken"
        "Content-Type"  = "application/json"
    }

    # Use worksheet ID if available, otherwise use name
    if ($worksheetId) {
        $worksheetIdentifier = $worksheetId
    }
    else {
        # URL encode the worksheet name
        $worksheetIdentifier = [System.Web.HttpUtility]::UrlEncode($worksheetName)
    }
    
    if ($useSiteEndpoint -and $siteId) {
        $excelUrl = "https://graph.microsoft.com/v1.0/sites/$siteId/drive/items/$fileId/workbook/worksheets('$worksheetIdentifier')/range(address='$rangeAddress')"
    }
    else {
        $excelUrl = "https://graph.microsoft.com/v1.0/users/$userEmail/drive/items/$fileId/workbook/worksheets('$worksheetIdentifier')/range(address='$rangeAddress')"
    }
    
    try {
        Write-Host "[INFO] Getting Excel data from worksheet: $worksheetName, range: $rangeAddress"
        $response = Invoke-RestMethod -Uri $excelUrl -Headers $headers -Method Get
        
        if ($response.values) {
            Write-Host "[SUCCESS] Successfully retrieved Excel data"
            Write-Host "Data rows: $($response.values.Count)"
            return $response.values
        }
        else {
            Write-Host "[ERROR] No data found in the specified range"
            return $null
        }
    }
    catch {
        Write-Host "[ERROR] Failed to get Excel data: $($_.Exception.Message)"
        return $null
    }
}

# Function to save Excel data to file
function Save-ExcelDataToFile {
    param($data, $outputFile)
    
    try {
        Write-Host "[INFO] Saving Excel data to: $outputFile"
        
        # Ensure the output file is created or overwritten
        New-Item -Path $outputFile -ItemType File -Force | Out-Null
        
        if ($data) {
            Write-Host "[SUCCESS] Writing $($data.Count) rows to file..."
            foreach ($row in $data) {
                $line = $row -join ", "
                Write-Host $line
                Add-Content -Path $outputFile -Value $line -Encoding UTF8
            }
            Write-Host "[SUCCESS] Data saved successfully"
        }
        else {
            Write-Host "[WARNING] No data to save"
            Add-Content -Path $outputFile -Value "No data found in the specified range" -Encoding UTF8
        }
    }
    catch {
        Write-Host "[ERROR] Failed to save data: $($_.Exception.Message)"
        Add-Content -Path $outputFile -Value "Error: $($_.Exception.Message)" -Encoding UTF8
    }
}

# Main execution
try {
    Write-Host "=== Excel Data Extraction from OneDrive URL ==="
    Write-Host "URL: $oneDriveUrl"
    Write-Host "Worksheet: $worksheetName"
    Write-Host "Range: $rangeAddress"
    Write-Host ""

    # Extract file ID and user from URL
    $fileInfo = Extract-FileIdFromOneDriveUrl -oneDriveUrl $oneDriveUrl
    
    if (-not $fileInfo) {
        Write-Host "[ERROR] Could not extract file information from URL"
        exit 1
    }

    # Get access token
    $accessToken = Get-AccessToken
    if (-not $accessToken) {
        exit 1
    }

    # Get file info
    Write-Host "`n=== Getting File Information ==="
    $fileDetails = Get-OneDriveFileInfoByEmail -accessToken $accessToken -userEmail $fileInfo.UserEmail -fileId $fileInfo.FileId
    $useSiteEndpoint = $false
    $siteId = $null
    
    if (-not $fileDetails) {
        Write-Host "`n[INFO] Trying alternative permission approaches..."
        $fileDetails = Test-DifferentPermissions -accessToken $accessToken -userEmail $fileInfo.UserEmail -fileId $fileInfo.FileId
        if ($fileDetails) {
            $useSiteEndpoint = $true
            # Get site ID for the user's personal site
            $siteUrl = "https://graph.microsoft.com/v1.0/sites/lifemaker-my.sharepoint.com:/personal/$($fileInfo.UserEmail)"
            $siteResponse = Invoke-RestMethod -Uri $siteUrl -Headers @{"Authorization" = "Bearer $accessToken"; "Content-Type" = "application/json"} -Method Get
            $siteId = $siteResponse.id
        }
    }
    
    if ($fileDetails) {
        Write-Host "`n[SUCCESS] File found and accessible!"
        Write-Host "File Name: $($fileDetails.name)"
        Write-Host "File ID: $($fileDetails.id)"
        Write-Host "Using Site Endpoint: $useSiteEndpoint"
        if ($siteId) { Write-Host "Site ID: $siteId" }
        
        # List worksheets
        Write-Host "`n=== Listing Worksheets ==="
        $worksheets = Get-ExcelWorksheets -accessToken $accessToken -userEmail $fileInfo.UserEmail -fileId $fileDetails.id -useSiteEndpoint $useSiteEndpoint -siteId $siteId
        
        if ($worksheets) {
            # Find the target worksheet
            $targetWorksheet = $worksheets | Where-Object { $_.name -eq $worksheetName }
            if ($targetWorksheet) {
                Write-Host "[SUCCESS] Found worksheet: $($targetWorksheet.name) (ID: $($targetWorksheet.id))"
                
                # Get Excel data
                Write-Host "`n=== Getting Excel Data ==="
                $excelData = Get-ExcelData -accessToken $accessToken -userEmail $fileInfo.UserEmail -fileId $fileDetails.id -worksheetName $worksheetName -rangeAddress $rangeAddress -useSiteEndpoint $useSiteEndpoint -siteId $siteId -worksheetId $targetWorksheet.id
            }
            else {
                Write-Host "[ERROR] Worksheet '$worksheetName' not found"
                Write-Host "[INFO] Available worksheets:"
                foreach ($ws in $worksheets) {
                    Write-Host "  - $($ws.name)"
                }
                $excelData = $null
            }
            
            if ($excelData) {
                # Save data to file
                $outputFile = "$PSScriptRoot\excel_data_from_onedrive.txt"
                Save-ExcelDataToFile -data $excelData -outputFile $outputFile
                
                # Save summary
                $summaryFile = "$PSScriptRoot\excel_extraction_summary.txt"
                $summary = @()
                $summary += "=== Excel Data Extraction Summary ==="
                $summary += ""
                $summary += "Original URL: $oneDriveUrl"
                $summary += "File Name: $($fileDetails.name)"
                $summary += "File ID: $($fileDetails.id)"
                $summary += "User Email: $($fileInfo.UserEmail)"
                $summary += "Worksheet: $worksheetName"
                $summary += "Range: $rangeAddress"
                $summary += "Data Rows: $($excelData.Count)"
                $summary += ""
                $summary += "Available Worksheets:"
                foreach ($ws in $worksheets) {
                    $summary += "- $($ws.name) (ID: $($ws.id))"
                }
                
                [System.IO.File]::WriteAllLines($summaryFile, $summary, [System.Text.Encoding]::UTF8)
                Write-Host "`n[SUCCESS] Summary saved to: $summaryFile"
            }
            else {
                Write-Host "`n[ERROR] Could not retrieve Excel data"
                Write-Host "[INFO] Check if the worksheet name '$worksheetName' and range '$rangeAddress' are correct"
            }
        }
        else {
            Write-Host "`n[ERROR] Could not retrieve worksheets"
        }
    }
    else {
        Write-Host "`n[ERROR] Could not access the file"
        Write-Host "[INFO] This might be due to insufficient permissions in the app registration."
        Write-Host "[INFO] The app needs Files.Read.All or Sites.Read.All permissions."
    }
}
catch {
    Write-Host "[ERROR] An error occurred:"
    Write-Host "Message: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        Write-Host "Status Code: $($_.Exception.Response.StatusCode.value__)"
    }
    if ($_.ErrorDetails.Message) {
        Write-Host "[DETAILS] $($_.ErrorDetails.Message)"
    }
    
    # Save error to file
    $outputFile = "$PSScriptRoot\excel_data_from_onedrive.txt"
    Add-Content -Path $outputFile -Value "Error: $($_.Exception.Message)" -Encoding UTF8
} 