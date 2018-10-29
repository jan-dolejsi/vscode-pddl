@echo off
:: https://code.visualstudio.com/docs/extensions/publish-extension

call export-md.cmd
start CHANGELOG.html
echo Check the CHANGELOG file that just opened in your favorit browser before you continue.
pause

:: must use NPM 5.5.1, because later versions have this issue:
:: https://github.com/Microsoft/vscode-vsce/issues/246
call npm install -g npm@5.5.1

call vsce ls
echo Review the files included before you continue
pause
call vsce package
:: https://code.visualstudio.com/docs/editor/extension-gallery#_install-from-a-vsix
echo Installing the extension locally...
::major minor patch 
call code --install-extension pddl-2.6.12.vsix
echo Test extension before you continue
pause
call vsce publish --packagePath pddl-2.6.12.vsix 
