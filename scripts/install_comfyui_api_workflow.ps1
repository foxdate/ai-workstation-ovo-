# 将 ComfyUI API 工作流 JSON 安装到 zhiquan_workspace/comfyui_api_workflow.json
# 用法: .\scripts\install_comfyui_api_workflow.ps1 [-InputFile] path\to\file.json
# 或:   Get-Content .\payload.json | .\scripts\install_comfyui_api_workflow.ps1

param(
    [Parameter(Position = 0)]
    [string]$InputFile = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$py = Join-Path $root "scripts\install_comfyui_api_workflow.py"

if (-not (Test-Path $py)) {
    Write-Error "未找到: $py"
    exit 2
}

$argsList = @()
if ($DryRun) { $argsList += "--dry-run" }

if ($InputFile -eq "" -or $InputFile -eq "-") {
    $json = [Console]::In.ReadToEnd()
    if ([string]::IsNullOrWhiteSpace($json)) {
        Write-Host "用法: .\scripts\install_comfyui_api_workflow.ps1 path\to\api_or_prompt.json"
        Write-Host "或从管道传入 JSON。"
        exit 1
    }
    $json | & python $py - @argsList
} else {
    & python $py $InputFile @argsList
}
exit $LASTEXITCODE
