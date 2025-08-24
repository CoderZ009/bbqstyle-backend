@echo off
echo Adding baseurl.js to HTML files...

for %%f in (*.html) do (
    if /i not "%%f"=="headerall.html" (
    if /i not "%%f"=="headerwomen.html" (
    if /i not "%%f"=="headermen.html" (
    if /i not "%%f"=="headerhome.html" (
    if /i not "%%f"=="footer.html" (
        findstr /c:"baseurl.js" "%%f" >nul 2>&1
        if errorlevel 1 (
            powershell -Command "(Get-Content '%%f') -replace '(\s*<script[^>]*>)', '    <script src=\"js/baseurl.js\"></script>$1' | Set-Content '%%f.tmp'"
            if exist "%%f.tmp" (
                move "%%f.tmp" "%%f" >nul
                echo Added baseurl.js to %%f
            )
        ) else (
            echo Skipping %%f - baseurl.js already exists
        )
    )))))
)

echo Done!