Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")
AppDir = FSO.GetParentFolderName(WScript.ScriptFullName)
WshShell.CurrentDirectory = AppDir

' Semak jika pelayan sudah hidup; jika belum, hidupkan di latar belakang tanpa tetingkap terminal (0 = tersembunyi)
On Error Resume Next
Set Http = CreateObject("MSXML2.ServerXMLHTTP")
Http.open "GET", "http://localhost:5174", False
Http.send
If Err.Number <> 0 Or Http.status <> 200 Then
  Err.Clear
  WshShell.Run "cmd /c npm run dev", 0, False
  ' Tunggu sehingga pelayan sedia (maksimum 45 saat)
  For i = 1 To 45
    WScript.Sleep 1000
    Http.open "GET", "http://localhost:5174", False
    Http.send
    If Err.Number = 0 And Http.status = 200 Then Exit For
    Err.Clear
  Next
End If
On Error GoTo 0

' Buka laman web CampusOS terus dalam pelayar lalai pengguna
WshShell.Run "http://localhost:5174", 1, False
