rmdir /S node_modules
rmdir /S out
del package-lock.json

rmdir /s views\common\node_modules
rmdir /s views\common\out
rmdir /s views\common\out-test
del views\common\package-lock.json

rmdir /s views\planview\node_modules
rmdir /s views\planview\out
rmdir /s views\planview\out-test
del views\planview\package-lock.json

rmdir /s views\searchview\node_modules
rmdir /s views\searchview\out
rmdir /s views\searchview\out-test
del views\searchview\package-lock.json
