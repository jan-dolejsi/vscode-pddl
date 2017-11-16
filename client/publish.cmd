:: https://code.visualstudio.com/docs/extensions/publish-extension

call vsce ls
pause
call vsce package
:: https://code.visualstudio.com/docs/editor/extension-gallery#_install-from-a-vsix
echo test extension 
call code --install-extension pddl-2.0.1.vsix
pause
call vsce publish --packagePath pddl-2.0.1.vsix 
::major minor patch 