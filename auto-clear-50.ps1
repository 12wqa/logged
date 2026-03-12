## Auto-clear at 50% — fired by context-manager
# Captures the active tab immediately, then: Escape → wait → /cc
# /cc then handles the definitive save + auto-clear.ps1 for /clear
# Uses clipboard + Ctrl+V for text delivery (SendKeys doesn't reach ConPTY)

$logFile = Join-Path $env:USERPROFILE ".claude\auto-clear-50.log"
function Log($msg) { "$(Get-Date -Format 'HH:mm:ss') $msg" | Out-File -Append $logFile }
"" | Out-File $logFile

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName System.Windows.Forms

# Step 1: Capture active tab NOW (before anything changes)
$wtProc = Get-Process WindowsTerminal -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $wtProc -or -not $wtProc.MainWindowHandle) { Log "ERROR: No WT process"; exit 1 }

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
            Log "Active tab: '$myTabName'"
            break
        }
    } catch {}
}
if (-not $myTabName) { Log "ERROR: No selected tab"; exit 1 }

# Step 2: Wait a moment for the current tool to finish
Log "Sleeping 1s..."
Start-Sleep -Seconds 1

# Step 3: Re-focus our tab (user may have switched)
$tabs = $wtEl.FindAll([System.Windows.Automation.TreeScope]::Descendants, $tabCondition)
foreach ($tab in $tabs) {
    if ($tab.Current.Name -eq $myTabName) {
        $tab.GetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern).Select()
        Log "Tab re-selected"
        break
    }
}

Add-Type @'
using System;
using System.Runtime.InteropServices;
public class Focus50 {
    [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
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
        inputs[0].type = 0; inputs[0].dwFlags = 0x0002;
        inputs[1].type = 0; inputs[1].dwFlags = 0x0004;
        SendInput(2, inputs, System.Runtime.InteropServices.Marshal.SizeOf(typeof(INPUT)));
    }
}
'@

[Focus50]::SetForegroundWindow($wtProc.MainWindowHandle) | Out-Null
Start-Sleep -Milliseconds 200

# Click terminal content area for keyboard focus
[Focus50]::ClickAt($wtProc.MainWindowHandle, 0.5, 0.7)
Start-Sleep -Milliseconds 300

# Step 4: Escape (stop Claude if mid-response)
[System.Windows.Forms.SendKeys]::SendWait("{ESC}")
Log "Sent Escape"
Start-Sleep -Seconds 2

# Step 5: Send /cc via clipboard paste (same approach as auto-clear.ps1)
[System.Windows.Forms.Clipboard]::SetText("/")
[System.Windows.Forms.SendKeys]::SendWait("^v")
Log "Pasted /"
Start-Sleep -Milliseconds 500

[System.Windows.Forms.Clipboard]::SetText("cc")
[System.Windows.Forms.SendKeys]::SendWait("^v")
Log "Pasted cc"
Start-Sleep -Milliseconds 500

[System.Windows.Forms.SendKeys]::SendWait("^m")
Log "Sent Enter (Ctrl+M)"
