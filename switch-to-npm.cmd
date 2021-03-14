call npm uninstall pddl-workspace
call npm uninstall ai-planning-val
call npm uninstall pddl-planning-service-client
call npm uninstall pddl-gantt

:: rmdir node_modules\pddl-workspace
:: rmdir node_modules\ai-planning-val

:: rmdir /S node_modules

call npm install pddl-workspace@latest ai-planning-val@latest pddl-planning-service-client@latest pddl-gantt@latest --save

call npm install