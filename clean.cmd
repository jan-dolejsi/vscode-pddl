rmdir /S /Q node_modules
rmdir /S /Q out
del package-lock.json

rmdir /S /Q views\common\node_modules
rmdir /S /Q views\common\out
rmdir /S /Q views\common\out-test
del views\common\package-lock.json

rmdir /S /Q views\planview\node_modules
rmdir /S /Q views\planview\out
rmdir /S /Q views\planview\out-test
del views\planview\package-lock.json

rmdir /S /Q views\searchview\node_modules
rmdir /S /Q views\searchview\out
rmdir /S /Q views\searchview\out-test
del views\searchview\package-lock.json

rmdir /S /Q views\modelview\node_modules
rmdir /S /Q views\modelview\out
rmdir /S /Q views\modelview\out-test
del views\modelview\package-lock.json