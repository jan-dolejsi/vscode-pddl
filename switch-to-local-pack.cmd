:: this script assumes the two repositories are cloned to the same parent directory as this one

call npm uninstall pddl-workspace

cd ..\pddl-workspace
call npm install
del pddl-workspace-*.tgz
call npm pack

cd ..\vscode-pddl
call npm install ..\pddl-workspace\pddl-workspace-4.0.0.tgz --save

call npm uninstall ai-planning-val
cd ..\ai-planning-val.js
del ai-planning-val-*.tgz
call npm pack

cd ..\vscode-pddl
call npm install ..\ai-planning-val.js\ai-planning-val-2.4.1.tgz --save
