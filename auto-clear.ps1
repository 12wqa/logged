param([int]$Delay = 3)

$logFile = Join-Path $env:USERPROFILE ".claude\auto-clear.log"
function Log($msg) { "$(Get-Date -Format 'HH:mm:ss') $msg" | Out-File -Append $logFile }
"" | Out-File $logFile

Log "Starting auto-clear (delay=${Delay}s)"

# Step 1: Capture active tab before user switches away
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms

$wtProc = Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $wtProc -or -not $wtProc.MainWindowHandle) { Log "ERROR: No WindowsTerminal process"; exit 1 }
Log "Found WT process: $($wtProc.Id), hwnd: $($wtProc.MainWindowHandle)"

$wtEl = [System.Windows.Automation.AutomationElement]::FromHandle($wtProc.MainWindowHandle)
$tabCondition = New-Object System.Windows.Automation.PropertyCondition(
    [System.Windows.Automation.AutomationElement]::ControlTypeProperty,
    [System.Windows.Automation.ControlType]::TabItem
)
$tabs = $wtEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCondition)
Log "Found $($tabs.Count) tabs"

# Find the currently selected tab
$myTab = $null
$myTabName = ""
foreach ($tab in $tabs) {
    try {
        $selectPattern = $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
        if ($selectPattern.Current.IsSelected) {
            $myTab = $tab
            $myTabName = $tab.Current.Name
            Log "Active tab: '$myTabName'"
            break
        }
    } catch { Log "Tab check error: $_" }
}

if (-not $myTab) { Log "ERROR: No selected tab found"; exit 1 }

# Step 2: Wait for Claude to finish responding
Log "Sleeping ${Delay}s..."
Start-Sleep -Seconds $Delay

# Step 3: Focus our tab (user may have switched away)
Log "Re-focusing tab '$myTabName'"
try {
    $selectPattern = $myTab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern)
    $selectPattern.Select()
    Log "Tab selected via original reference"
} catch {
    Log "Original tab ref stale, re-finding..."
    $tabs = $wtEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCondition)
    foreach ($tab in $tabs) {
        if ($tab.Current.Name -eq $myTabName) {
            $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
            Log "Tab re-found and selected"
            break
        }
    }
}

Start-Sleep -Milliseconds 300

# Step 4: Bring WT to foreground
Add-Type @'
using System;
using System.Runtime.InteropServices;
public class WinHelper {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out RECT rect);
    [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT { public int Left, Top, Right, Bottom; }

    [StructLayout(LayoutKind.Explicit, Size = 40)]
    public struct INPUT {
        [FieldOffset(0)] public uint type;
        [FieldOffset(8)] public int dx;
        [FieldOffset(12)] public int dy;
        [FieldOffset(16)] public uint mouseData;
        [FieldOffset(20)] public uint dwFlags;
        [FieldOffset(24)] public uint time;
        [FieldOffset(32)] public IntPtr dwExtraInfo;
    }
    [DllImport("user32.dll", SetLastError=true)]
    public static extern uint SendInput(uint n, INPUT[] inputs, int size);

    public static void ClickAt(IntPtr hwnd, double xPct, double yPct) {
        RECT r;
        GetWindowRect(hwnd, out r);
        int cx = r.Left + (int)((r.Right - r.Left) * xPct);
        int cy = r.Top + (int)((r.Bottom - r.Top) * yPct);
        SetCursorPos(cx, cy);
        var inputs = new INPUT[2];
        inputs[0].type = 0; inputs[0].dwFlags = 0x0002; // MOUSEEVENTF_LEFTDOWN
        inputs[1].type = 0; inputs[1].dwFlags = 0x0004; // MOUSEEVENTF_LEFTUP
        SendInput(2, inputs, System.Runtime.InteropServices.Marshal.SizeOf(typeof(INPUT)));
    }
}
'@

[WinHelper]::SetForegroundWindow($wtProc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 200

# Click terminal content area — moves keyboard focus from tab bar to terminal pane
[WinHelper]::ClickAt($wtProc.MainWindowHandle, 0.5, 0.7)
Start-Sleep -Milliseconds 300

$fg = [WinHelper]::GetForegroundWindow()
Log "Foreground: $fg (match: $($fg -eq $wtProc.MainWindowHandle))"

# Step 5: Paste /clear + Ctrl+M, then continue prompt + Ctrl+M
# No delays — let it all queue in ConPTY input buffer
# Claude processes /clear when idle, then sees "continue with your task" as next input

# Paste / first — triggers slash command mode
[System.Windows.Forms.Clipboard]::SetText("/")
[System.Windows.Forms.SendKeys]::SendWait("^v")
Log "Pasted /"
Start-Sleep -Milliseconds 300

# Paste clear — completes the command in autocomplete
[System.Windows.Forms.Clipboard]::SetText("clear")
[System.Windows.Forms.SendKeys]::SendWait("^v")
Log "Pasted clear"
Start-Sleep -Milliseconds 300

# Ctrl+M = Enter — confirms the slash command
[System.Windows.Forms.SendKeys]::SendWait("^m")
Log "Done"
