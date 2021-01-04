call npm uninstall pddl-workspace
call npm uninstall ai-planning-val

:: rmdir node_modules\pddl-workspace
:: rmdir node_modules\ai-planning-val

:: rmdir /S node_modules

call npm install pddl-workspace ai-planning-val --save

call npm install