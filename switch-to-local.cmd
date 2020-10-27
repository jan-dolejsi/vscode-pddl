:: this script assumes the two repositories are cloned to the same parent directory as this one

call npm uninstall pddl-workspace
call npm uninstall ai-planning-val

call npm install ..\pddl-workspace --save
call npm install ..\ai-planning-val.js --save
