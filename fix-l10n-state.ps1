$ErrorActionPreference = "Stop"

$path = "E:\codexapp\script.js"
if (!(Test-Path -LiteralPath $path)) {
    throw "Cannot find $path"
}

$content = Get-Content -LiteralPath $path -Raw

if ($content -notmatch "function normalizeSharedTermKey") {
    $sharedHelpers = @'
function normalizeSharedTermKey(term) {
    return String(term || '')
        .trim()
        .replace(/\s+/g, '')
        .replace(/[，。！？、；："'"“”‘’（）()\[\]【】<>《》]/g, '')
        .toLowerCase();
}

function runAfterUiPaint(callback) {
    return new Promise((resolve, reject) => {
        requestAnimationFrame(() => {
            setTimeout(() => {
                Promise.resolve()
                    .then(callback)
                    .then(resolve, reject);
            }, 0);
        });
    });
}

'@
    $content = $content -replace "const API_PREFLIGHT_TIMEOUT_MS = 45000;\s*", "const API_PREFLIGHT_TIMEOUT_MS = 45000;`r`n`r`n$sharedHelpers"
}

$content = [regex]::Replace(
    $content,
    "function formatDurationSeconds\(ms\) \{\s*return ``\$\{Math\.max\(1, Math\.ceil\(ms / 1000\)\)\}[^`r`n]+;\s*\}",
@'
function formatDurationSeconds(ms) {
    const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}时 ${minutes}分 ${seconds}秒`;
    if (minutes > 0) return `${minutes}分 ${seconds}秒`;
    return `${Math.max(1, seconds)}秒`;
}
'@
)

$content = [regex]::Replace(
    $content,
    "function normalizeTermKey\(term\) \{\s*return String\(term \|\| ''\)\s*\.trim\(\)\s*\.replace\(/\\s\+/g, ''\)\s*\.replace\(/\[[^\r\n]+?\]/g, ''\)\s*\.toLowerCase\(\);\s*\}",
@'
function normalizeTermKey(term) {
        return normalizeSharedTermKey(term);
    }
'@
)

$content = $content -replace "function getIssueResultCount\(results = checkResults\) \{\s*return results\.filter\(result => result\.status === L10N_STATUS_ISSUE\)\.length;\s*\}", @'
function getDisplayCheckResults() {
        return checkResults.length > 0 ? checkResults : realtimeCheckResults;
    }

    function getIssueResultCount(results = getDisplayCheckResults()) {
        return results.filter(result => result.status === L10N_STATUS_ISSUE).length;
    }
'@

$content = $content -replace "function getSortedCheckResults\(results = checkResults\) \{", "function getSortedCheckResults(results = getDisplayCheckResults()) {"

$content = $content -replace "const issueCount = getIssueResultCount\(\);\s*const passCount = checkedCount - issueCount;", "const displayResultsList = getDisplayCheckResults();`r`n        const effectiveCheckedCount = Math.max(checkedCount, displayResultsList.length);`r`n        const issueCount = getIssueResultCount(displayResultsList);`r`n        const passCount = effectiveCheckedCount - issueCount;"
$content = $content -replace "const passRate = checkedCount > 0 \? Math\.round\(\(passCount / checkedCount\) \* 100\) : 0;", "const passRate = effectiveCheckedCount > 0 ? Math.round((passCount / effectiveCheckedCount) * 100) : 0;"
$content = $content -replace "document\.getElementById\('l10nTotalChecked'\)\.textContent = checkedCount;", "document.getElementById('l10nTotalChecked').textContent = effectiveCheckedCount;"
$content = $content -replace "if \(checkResults\.length === 0\) \{", "if (displayResultsList.length === 0) {"

$content = $content -replace "if \(progress && state\.progress\) progress\.textContent = state\.progress;", "if (progress && state.progress !== undefined) progress.textContent = state.progress;"
$content = $content -replace "if \(batches && state\.batches\) batches\.textContent = state\.batches;", "if (batches && state.batches !== undefined) batches.textContent = state.batches;"
$content = $content -replace "if \(failures && state\.failures\) failures\.textContent = state\.failures;", "if (failures && state.failures !== undefined) failures.textContent = state.failures;"

$content = $content -replace "function updateL10nRetryFailedButton\(\) \{\s*const failedCount = currentL10nFailedBatches\.length;", "function updateL10nRetryFailedButton() {`r`n        const failedCount = currentL10nFailedBatches.length;`r`n        updateWorkspaceTaskMonitor({ failures: String(failedCount) });"

$content = $content -replace "function downloadL10nReport\(fileName\) \{\s*downloadWorkbookFile\(buildL10nReportWorkbook\(checkResults\), fileName\);\s*\}", @'
function downloadL10nReport(fileName) {
        const resultsToDownload = getDisplayCheckResults();
        if (resultsToDownload.length === 0) {
            setStatus('warning', '没有可下载的检测结果', '当前页面还没有检测结果或实时结果。');
            return;
        }
        downloadWorkbookFile(buildL10nReportWorkbook(resultsToDownload), fileName);
    }
'@

$content = $content -replace "if \(checkResults\.length === 0\) \{\s*alert\('[^']*'\);\s*return;\s*\}", "if (getDisplayCheckResults().length === 0) {`r`n            alert('没有检测结果可下载');`r`n            return;`r`n        }"

Set-Content -LiteralPath $path -Value $content -NoNewline
Write-Host "Patched $path"
