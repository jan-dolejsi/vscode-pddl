:: this script assumes the two repositories are cloned to the same parent directory as this one

call npm uninstall pddl-workspace
call npm uninstall ai-planning-val
call npm uninstall pddl-planning-service-client
call npm uninstall pddl-gantt

call npm install ..\pddl-workspace --save
call npm install ..\ai-planning-val.js --save
call npm install ..\pddl-planning-service-client --save
call npm install ..\pddl-gantt --save
