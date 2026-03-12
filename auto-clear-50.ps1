## Auto-clear at 50% — fired by context-manager
# Captures the active tab immediately, then: Escape → wait → /cc
# /cc then handles the definitive save + auto-clear.ps1 for /clear

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms

# Step 1: Capture active tab NOW (before anything changes)
$wtProc = Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $wtProc -or -not $wtProc.MainWindowHandle) { exit 1 }

$wtEl = [System.Windows.Automation.AutomationElement]::FromHandle($wtProc.MainWindowHandle)
$tabCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::TabItem
)
$tabs = $wtEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCondition)

$myTabName = ""
foreach ($tab in $tabs) {
    try {
        $sp = $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
        if ($sp.Current.IsSelected) {
            $myTabName = $tab.Current.Name
            break
        }
    } catch {}
}
if (-not $myTabName) { exit 1 }

# Step 2: Wait a moment for the current tool to finish
Start-Sleep -Seconds 1

# Step 3: Re-focus our tab (user may have switched)
$tabs = $wtEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCondition)
foreach ($tab in $tabs) {
    if ($tab.Current.Name -eq $myTabName) {
        $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
        break
    }
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Focus50 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
}
'@
[Focus50]::SetForegroundWindow($wtProc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 500

# Step 4: Escape (stop Claude if mid-response)
[System.Windows.Forms.SendKeys]::SendWait("{ESC}")
Start-Sleep -Seconds 2

# Step 5: Send /cc — this does the definitive save and fires auto-clear.ps1 for /clear
[System.Windows.Forms.SendKeys]::SendWait("/cc{ENTER}")
