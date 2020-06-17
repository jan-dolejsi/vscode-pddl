# PDDL support - What's new?

## 2.18.0

### Features

### Line plots for multiple metric expressions

If your planner supports multiple `(:metric ...)` expressions in the problem file (VAL actually does),
you can use it to get some ad-hoc expressions displayed on a line plot below the plan.
This is very useful, to debug numerically-rich domains.

![Plan metric plots](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/plan_metric_plots.jpg)

### Other improvements

- Auto completion for (:constraints ) includes the nested (and ), which I always forget
- Val std-error stream is also now presented in the _Problems_ pane.
- Support for DAY (and WEEK) time resolution in plans.
- To minimize the refresh of plan visualization, the plans are _no longer_ re-painted when upon the planner exit.

### Fixes

- Fixed bug, where the test results/outcomes were not being displayed on the tree, if the tree was first-time-expanded _during_ the execution of the tests.
- Fixed regression on the visual search debugger related to selection of nodes on the tree.
- Fixed response to failing plan validation. Instead of opening the _Problems_ pane, we open the _Output_ pane, where the detailed VAL output is printed.
- Small fix for the Overview Page, when it is closed before the current configuration is posted to it.
- Async service call handles multiple plans and xml plan format
- Fixed bug that caused the extension to hang in an endless loop, while resolving a PDDL symbol references (while hover-over)
- Step up to target ES2019

## 2.17.3

Escaping spaces in VAL paths on MacOS.
This is to fix [Issue 57](https://github.com/jan-dolejsi/vscode-pddl/issues/57).

## 2.17.2

Added POPF `PlannerProvider`. Fixed default planner syntax to `$(planner) $(options) $(domain) $(problem)`.

## [2.17.1]

### Planner switching

Support for multiple planners, extensibility (other extensions can now inject planner providers) and easy switching between them either
using the _PDDL: Select planner_ command, <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>P</kbd> or via the status bar item.
Previous planner configuration settings (`pddlPlanner.executableOrService` and `pddlPlanner.executableOptions`) are now deprecated
and the extension automatically migrates them to `pddl.planners` and `pddl.selectedPlanner`. The migration is supported for all places,
where the configuration settings are stored in VS Code: the _User_ settings, _Workspace_ and _WorkspaceFolder_ settings.
Setting `pddl.showPlannerInStatusBar` may be used to hide the planner selector in the status bar (if you only ever use one planner).

![PDDL Planner Configuration](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_planner_configuration.gif)

The original command _PDDL: Configure planner_ changed behavior. It now triggers re-configuration of the currently selected planner.

### Other fixes

- Planner output target, parser and validator configuration on Overview Page now sensitive to workspace folder selection
- Refactored the `pddl-workspace` (API for other extensions to inject their custom PDDL functionality) to use `vscode-uri` form of file Uri rather than string.
- Overview page does no longer show fake (design-time) content in case something goes wrong during initialization (this was rather confusing)

## [2.16.0]

- PDDL Test Explorer
  - icons facelift and context menu refinement (frequently used commands are visible when you hover)
  - optimized PTest discovery (faster test tree initialization in large workspaces)
  - empty test tree shows the _welcome_ message that helps creating tests for active PDDL domains
  - test _Show definition_ command opens the JSON file highlighting the correct element more successfully now thanks to `jsonc-parser`
- planning.domains catalog expanding with progress indication
- PDDL Overview page now shows _gear_ button next to the Configuration title that shows all the settings for this extension
- refactoring: typescript compiler errors in _strict_ mode in the PTest folder addressed

![Test Explorer](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_Test_Explorer.gif)

## [2.15.7] Visualization of visited states

The search tree debugger now shows states that were already visited in the search (or are deemed worse than any state previously visited by the planner) in black.
Here is the [Search Tree Debugger API](https://github.com/jan-dolejsi/vscode-pddl/wiki/Search-tree-debugger-API#post-statevisitedorworse) that a planner needs to send the information to.

## [2.15.6] Improved VAL binary download and configuration merging

### Fixes

- VAL binary download now supports merging any pre-existing configuration (e.g. custom Parser, Validate) with the newly downloaded binaries. You can decide whether you want to keep your previous configuration, or overwrite it with the downloaded binaries.
- Setting `pddl.valVerbose` now toggles additional logging (to the console visible in Help > Toggle Developer Tools).

### Extensibility for custom PDDL flavors

The Extension underwent major clean-up and its guts were replaced by [pddl-workspace](https://github.com/jan-dolejsi/pddl-workspace)
and [ai-planning-val.js](https://github.com/jan-dolejsi/ai-planning-val.js).
As a result, the PDDL Extension for VS Code is now extensible for creators for non-standard PDDL, parser and planner implementations.

This is how you can create VS Code extension that hooks up to the PDDL Workspace, injects custom functionality and listens to file change events.

```typescript
import { ExtensionContext, extensions, Extension } from 'vscode';
import { PddlWorkspace, PddlWorkspaceExtension, FileInfo, parser } from 'pddl-workspace';

class MyCustomPddlInfo extends FileInfo {

    // todo: put your own properties and methods here

    getLanguage(): PddlLanguage {
        return PddlLanguage.PDDL;
    }
}

class MyCustomPddlParser extends parser.PddlFileParser<MyCustomPddlInfo> {
    async tryParse(fileUri: string, fileVersion: number, fileText: string, syntaxTree: parser.PddlSyntaxTree, positionResolver: DocumentPositionResolver): Promise<MyCustomPddlInfo | undefined> {

        if (/* is my custom PDDL? */) {
            return new MyCustomPddlInfo(fileUri, fileVersion, '', syntaxTree, positionResolver);
        }
        else {
            return undefined;
        }
    }
}

class MyCustomPddlWorkspaceExtension extends PddlWorkspaceExtension {

    getPddlParsers(): parser.PddlFileParser<FileInfo>[] | undefined {
        return [new MyCustomPddlParser()];
    }
}

export function activate() {

    const pddlExtension = extensions.getExtension<PddlWorkspace>('jan-dolejsi.pddl');
    if (pddlExtension) {
        if (pddlExtension.isActive) {
            const pddlWorkspace = pddlExtension.exports;

            pddlWorkspace.addExtension(new MyCustomPddlWorkspaceExtension());

            // get notified about file updates
            pddlWorkspace.on(PddlWorkspace.UPDATED, (fileInfo: FileInfo) => {
                console.log(`File updated: ${fileInfo.name}`);
            });
        }
    }
}
```

## [2.15.5] Improved plan metric parsing

- Plan metric parsing [Issue #50](https://github.com/jan-dolejsi/vscode-pddl/issues/50)
  - plan metric in scientific notation
  - negative plan metric
  - tests
- Dependency clean-up
- Removal of npm dependency
- Simplified version upgrades

## [2.15.4] Upgrades and CI

- Planning Domain Session generation email sending is repaired. VS Code changed behavior of the `env.openExternal(Uri)` API and prevented it from opening `mailto:` URLs.
- Updated to Typescript 3.7.3
  - Bulk replaced Typescript `||` with `??` operator where appropriate (i.e. when returning default numeric or more generally non-boolean values).
  - Simplified code by optional chaining using the `.?` Elvis operator.
- More Typescript strict semantic checking clean-up
- GitHub Actions used for CI

## [2.15.3] Bug fixes

- Fixed generated problem file/tab name for the pre-parse preview
- Support for spaces in problem template pre-process command-line
- Demoted Jinja2 errors to parsing problems make it possible to edit the files
- Configuration selector menu shows current value
- Introduced configuration to disable the model hierarchy decorator (for perf reasons)
- Added PDDL3.1 `undefined` to syntax highlighting
- To address the [Issue #49](https://github.com/jan-dolejsi/vscode-pddl/issues/49) confusion why the search debugger is not displaying anything, when a planning service is called, the extension will now show a warning message that the search debugger config switch is being ignored.
- Removed tips that were not effective at teaching how to use the more hidden features [Issue #47](https://github.com/jan-dolejsi/vscode-pddl/issues/49) as suggested and fixed by [@boramalper](https://github.com/jan-dolejsi/vscode-pddl/pull/48)

## [2.15.2] Predicate and function references

- predicate/function references in hover and decorations (image needed)
- async planner service output parsing to support more than JSON
- async planner service ptest support for local configuration.json file
- vis-network upgraded to v6.4.4
- fix for stricter Webview content security policy that came with VS Code 1.40.2
- fix for domain type hierarchy view that mishandled 0 index as undefined and missed an edge
- initial state visualization: added unparametrised functions/predicates, added asymmetric predicates/functions to the relationship graph.
- search debugger search tree pans the network view to keep the selected node in the view.
- fixed the bulk renaming of predicates/functions that did not propagate to problem files.
- fixed issue in object hierarchy graphic that was showing deleted objects
- filtering workspace events to avoid event bursts

## [2.15.1] Fixes and upgrades

- upgrade to vscode 1.40
- upgrade to TypeScript 3.7.2
- clean-up
- fix for type hierarchy parsing that miss the " - object"
- moving views to a dedicated 'views' folder
- more robust action/variable parameter parsing
- eagerly using the Elvis operator
- constraint partial order view
- network/graph settings UI
- improved view icons
- types vs objects visualized in different color per request from Gilles
- Document symbols for problem files
- Domain processes and events are included into document symbols
- Improved parsing of large domains by processing the parser output incrementally
- Removed some 15MB from the extension package by reviewing the package content
- New plan preview menu with more options including preview width dimension.
- New location for the VAL binaries download under VS Code extension global storage path. The binaries now survive extension upgrade. Terminal window is open on linux to suggest the user to chmod the binaries.

## [2.15.0] PDDL Model Visualization

### Domain `:types` hierarchy and problem `:objects` and `:init` visualization

A "View" _code lens_ is displayed above selected PDDL sections such as `:init` section of problem files. Clicking it will open a graphical representation of the initial state for easy review.
So far object _properties_ and _relationships_ are displayed in a tabular form and a directed graph is available to visualize 2D-symmetric predicates or functions i.e. predicates or functions whose first two arguments are of the same type.
For example predicate `(path ?from ?to)` or function `(distance ?a ?b)` will be visualized on a graph.

![Model visualization](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_model_visualization.gif)

### Excluding actions from swim-lane plan visualization by configuring selected parameters to be ignored

It is now possible to exclude some action parameters from swim-lane plan visualization. This is useful for action parameters, which are just marginally involved in the action conditions, and displaying such action in the swim-lane of the given object makes the diagram confusing. To configure this, add `ignoreActionParameters` into the _domain_.planviz.json file, where _domain_ matches your domain file name. This example will exclude `?to` and `?from` parameters of any action starting with `move`. It also exclude any parameter with name ending with the `_reserved` suffix:

```json
{
    "ignoreActionParameters": [
        {
            "action": "^move",
            "parameterPattern": "^(to|from)$"
        },
        {
            "action": ".+",
            "parameterPattern": "_reserved$"
        }
    ]
}
```

### Auto-completion

Extended auto-completion to requirements inside `(:requirements )` and onto parameter names (i.e. symbols starting with ?).

### Fixes

- Large domain/problem files now parse correctly. Previously the parser output buffer was fixed to the node.js limit and beyond certain size, PDDL file errors and warnings would stop displaying.
- Code Action to declare undeclared predicates/functions is now case insensitive (because the VAL parser reports warnings in lowercase)
- _ValueSeq_ outputs warnings about unsatisfied pre-conditions. These now do not break the ValueSeq output parser. The warnings go to the log.
- Fixed parsing of timed initial literals of `at` predicates.
- Clicking on an action name in the plan will reveal it in an already open editor window, rather than opening a new panel in the same editor group.

## [2.14.4] Context-sensitive auto-completion suggestions

- Auto-completion of domain, problem file structures is context sensitive now and only suggests structures that are valid in the given place
- Enable the on-type PDDL formatter to get help with shaping the whitespace around your PDDL code (namely indentation) for better readability of your models. To give it a try, enable the _Editor: Format On Type_ and _PDDL: Formatter_ setting options.
- ValStep repro `run.cmd` batch file was updated to latest version of ValStep's syntax.
- PDDL Problem file parsing re-worked to use the Syntax Tree

## [2.14.2] ValStep upgrade and plan line plot improvement

### VAL upgrade

Upgrade to VAL build 37. If it does not pop-up, open the 'PDDL: Overview Page' command and upgrade VAL from there.
This upgrade includes improvement of ValStep robustness for (much) larger plans.

### Plan visualization

Use the _PDDL: Plan Report > Line Plot > Group By Lifted_ setting to enable/disable grouping of line-plots by lifted variable. When disabled, one chart is generated for each grounded function.

Optionally override the _PDDL: Plan Report width (in pixels) for exporting_ to fine tune how the report looks.
For abnormal screen sizes or DPI settings, it the plan visualization width (in VS Code) can now be set using the _PDDL: Plan visualization width (in pixels)_ setting.

Fixed opening the plan report in the default browser.

## [2.14.1] Fixes

- added `:object-fluent` requirement to the syntax highlighter
- support for plans in an XML format

## [2.14.0] Parameter [F2] renaming and undeclared predicate/function auto-fix

### Features

* Renaming of action/process/event/forall/derived parameters. Click on a `?` parameter and press _F2_. ![Undeclared predicates/functions code action](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_parameter_type_renaming.gif)
* Declaring undeclared predicates and functions: ![Undeclared predicates/functions code action](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_undeclared_predicate_function.gif)

### Fixes

* For PDDL files under version control, the _git_ repo version of the domain/problem files would appear as one of the real domain/problem files in the workspace, which was very confusing. They should no longer surface.

## [2.13.1] Improved support for template-based problem generation

### New Features

* With a single click you can add all necessary files for a Nunjucks-based problem template generation.
![Nunjucks sample](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_nunjucks_sample.gif)
* For templated problem files a code action (bulb) can open the live preview of the generated problem file
![Templated problem preview](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_templated_problem_preview.gif)
* Early preview of domain-specific plan/state visualization via the new `planVisualizer` property in the `<<domain>>.planviz.json` config file.
* Generated problem file previews are live updating when the data in .json file is modified!

### Fixes

* Previously the editor did not support invoking the planner on a template-generated problem file.
* When authoring PDDL problem templates, errors are reported as diagnostic problem, and/or instead of the generated test. This is far less intrusive for the user experience.
* Visualization of instantaneous actions in the plan - the bars are now fully filled, instead of looking like if they were ending in the relaxed plan.
* The plan visualization was missing some numeric function plots, when the initial and final value of the function was the same.

## [2.13.0] - VAL binaries available for MacOS

### Features

VAL binaries are now available for Mac OS as well as Linux and Windows. If you are a Mac user, download them using the `PDDL: Download VAL` command or when prompted.

![One-click VAL download](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_update_VAL.gif)

Added syntax highlighting for [PDDL+](https://planning.wiki/ref/pddlplus/domain) features such as the `:time` requirement and `process` or `event`.

Added code actions corresponding to parser warning:

* empty .pddl file suggests applying the domain/problem snippet.
* missing PDDL requirement warning offers to add the requirement to `:requirement`

Enriched action hover-over info. It now details action parameters and documentation comment.

![Missing requirements and unused predicates/functions](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_missing_requirements_unused_predicates.gif)

Predicate/function documentation comments are picked-up from both above and to-the-right location relative to the declaration.

```pddl
(:functions
    ; some general comments

    ; Accumulates cost
    (cost) ; [$]
)
```

Unused functions or predicates are rendered as faded.

### Fixes

Type/predicate/function renaming fixes

* new name is validated before applying the bulk-rename
* de-duplicating parser warnings/errors (VAL Parser repeats the missing requirement warning many times)
* errors while downloading VAL binaries are now reported up to the user
* previous VAL binaries are properly deleted after upgrade to the latest version

### Engineering

* file path and URI manipulations now delegated to the `vscode-uri` package and unit tests more robust for execution on MacOS
* minimum version of VS Code is now 1.32
* rewritten the PDDL domain/problem regex parsing by a PDDL tokenizer, which allows inspecting the syntax tree and implementing context-sensitive features correctly

## [2.12.2] - 2019-07-08 - ICAPS 2019 Update

### News

This YouTube channel now shows how to use the PDDL extension to its full potential: [Hands-on PDDL Tutorial](https://youtu.be/XW0z8Oik6G8)

### New features

#### PDDL parser and plan validation tools auto-download

The _PDDL Overview Page_ suggests to download the [VAL](https://github.com/KCL-Planning/VAL) tools that include the PDDL parser, plan validator and couple other derived utilities for plan evaluation. This democratises many of the features that were available in experimental mode for the last 12(!) months.\
This YouTube video shows the download experience: [PDDL Tooling - Episode 1: Planning.Domains session](https://youtu.be/XW0z8Oik6G8)\
This video shows the benefits of having the VAL tools: [PDDL Tooling - Episode 4: Working with plans](https://youtu.be/BFlCz49ETcA)

#### PDDL domain/problem/plan file associations

You can now enjoy the freedom of having your PDDL files spread across any directory structure.

The VS Code PDDL extension had rigid convention for matching domain and problem files to each other. They had to be in the same folder and both open in the editor. Failing that, the editor was not able to naturally associate your files to each other. That would prevent you from invoking the planner, or validator seamlessly.

If one of the rules above is not satisfied, the editor will not naturally associate your files to each other. In that case it shows a validation error suggesting to apply a _Quick Fix_ via the 💡 (bulb) symbol, which lets you find the corresponding domain/problem file from following scopes:

1. suggested files, if multiple candidates were found
1. currently open files in the editor
1. other files in the workspace
1. any other file selectable from the computer storage

![domain/problem/plan associations](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_explicit_domain-problem-plan_associations.gif)

#### PDDL Test Report

PDDL Testing now shows results on a report page. This is far more readable than the summary in the `PDDL Test Output` window, which is now removed.
I removed the `PDDL Test Output` channel to simplify UX.

### Fixes

- Ask for confirmation before discarding changes in session files.
- PDDL Planner configuration can now be picked up from a workspace folder configuration.
- Modal warning when sending PDDL to a new service
- Cleaned-up tips
- Planning.Domains interactions improvements ahead of the upcoming ICAPS tutorial.

## [2.11.8] - 2019-07-05

### Fixes

- Activating the extension upon the `pddl.downloadVal` command.
- Improved Valstep error reporting.
- Instantaneous actions visualized correctly in object swim-lanes.
- Valstep error repro export uses full valstep path rather than relying on valstep in the `%path%`. Thanks, Christian.

### New Features

- Added configuration for asynchronous planning services exposing a `/request` RESTful interface. Configuration may be retrieved from a `*.plannerConfiguration.json` or a `.json` file.
- Tooltip on plan visualization plan selection bars now explain that the size of the bar correspond to the given plan metric value.

## [2.11.7] - 2019-06-28

### Preview of VAL tools download

VAL binaries are now automatically downloadable.

## [2.11.5] - 2019-06-24

### PDDL Test execution for all tests in the workspace

It is now possible to click on a folder in the PDDL Tests panel or even on the _Run all_ button in the toolbar and all tests nested within that folder, or in the workspace will be executed respectively.

### Configuration alerts on Overview Page

Overview Page shows non-intrusive alerts when the extension configuration is not optimal.

![Overview Page shows alerts](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/OverviewPage.jpg)

### Planning.Domains session

#### Plugin configuration support

Planning.Domains Editor Sessions use plug-ins that save their own configuration.
The `solver` plugin's configuration (i.e. the URL of the solver service) is now replicated into the workspace folder's settings. This is stored in `.vscode/settings.json` file:

```json
{
    "pddlPlanner.executableOrService": "http://localhost:8087/solve"
}
```

When local session changes are committed back to the server, the solver URL is *not* included.

#### Gamifying PDDL trainings

Include a `.ptest.json` file into the template session, create classroom, open the Test Explorer (View > Open View ... > Test > PDDL TESTS) and click the _Run All_ button in the toolbar. This runs the test cases from all the student sessions and displays the pass/fail results.
First student with passing tests wins ... a diploma :-!

#### Allowing checkout when untracked local files exist

Untracked local files are no longer preventing session update to latest server-side version. This means the user may deal with version conflicts by renaming files and merging using the VS Code Diff. Manually.

#### Classroom: PDDL-Testing student sessions

Planning.Domains classroom student sessions are no longer created in a sub-folder of the template session. If the template included a `.ptest.json` file with _unit_ test definitions, they may all now be executed using one click on the "Run all" button in the PDDL TEST panel toolbar. 

### Clean-up

Removed traces a legacy configuration from predecessor VS Code extension.

## [2.11.4] - 2019-06-19

### Fixes

#### PDDL Overview Page

- Hello World example command on the Overview Page now works even when no workspace folder was selected, and properly shows error messages when files with conflicting names are already present.
- PDDL Sample git repo cloning is fixed (the command no longer accepts _Uri_, but string)

## [2.11.3] - 2019-06-17

### Planning.Domains classroom generation from a template session

Planning.Domains session may be used as a template for an entire classroom bulk creation.

The command _PDDL: Generate Planning.Domains classroom sessions from this template..._ automate the duplication of this session into any number of student sessions. A prompt pops up to submit student names and/or email addresses in a semi-colon separated list. If email address is included, the default email client pops up with a prepared message for each student.
When all sessions are created, a dedicated VS Code workspace is created for the classroom and VS Code automatically opens it.

![Planning.Domains classroom generation](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/Planning.Domains_classroom.gif)

### Other improvements

- Search Debugger: fit tree to available viewport with "F"
- Planning.Domains session supports file renaming
- ValStep errors reporting was enhanced to be able to send  the input data as a bug report

### Codebase engineering work

- more async I/O
- tslint warnings addressed

## [2.11.2] - 2019-05-28

## New features

### Search Debugger

Following keyboard shortcuts are available to navigate or manipulate the search tree view:

- Typing a number using <kbd>0</kbd>-<kbd>9</kbd> selects the state with the matching Order ID.
- Change shape of a state to highlight states of interest using:
  - <kbd>b</kbd>: box,
  - <kbd>d</kbd>: diamond,
  - <kbd>s</kbd>: star,
  - <kbd>t</kbd>: triangle,
  - <kbd>h</kbd>: hexagon,
  - <kbd>q</kbd>: square,
  - <kbd>e</kbd>: ellipse (default)
- Toggle auto-fitting of the tree to the viewport using <kbd>f</kbd> to avoid losing focus, while search is progressing
- <kbd>Shift</kbd>+<kbd>F</kbd> to fit search tree to viewport

Dead-end states are visualized with brown color.
Tree branches(s) leading to goal state(s) are painted in green color.

The Search Debugger may now be configured (see the `pddlSearchDebugger.stateIdPattern` configuration setting) with a pattern to parse the state ID.
The visualization then respects the IDs assigned by the planner rather than using its own numbering scheme
(which is used if the received state ID does not respect the pattern).

Both tree nodes and edges now show an informative tooltip when mouse hover-over.

## Fixes

Search Debugger may be re-used without resetting and the line plot will handle gracefully that states are added with assorted Order IDs. It maintains mapping between the state order ID and and its dataset row ID.
The tree/chart was not responding to clicking on the Search Debugger helpful actions inside the Gantt chart. It was the case of actions occurring in the planhead more than once.

## [2.11.1] - 2019-05-20

## New features

### Planning.Domains sessions

The online [Planning.Domains](http://editor.planning.domains) editor has a concept of a session. _Session Details_ pane shows links to open the session online / offline. The _offline_ links are handled by VS Code, if installed.

There are two ways to get started:

1. Using a command:
   - _PDDL: Download Planning.domains session_ and pasting the _Session Unique ID_
1. By navigating to this URL in your favorite web browser:
   - vscode://jan-dolejsi.pddl/planning.domains/session/_readOnlyHash_ or
   - vscode://jan-dolejsi.pddl/planning.domains/session/edit/_readWriteHash_.

The session files are downloaded into a selected workspace folder and may be interacted with via the _Source Control_ pane.

![Planning.Domains Editor Session in VS Code](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/Planning.Domains_sessions_in_VSCode.gif)

Session files may be deleted, renamed as well as added. The _Source Control_ pane shows the diff as usual. To open _Source Control_ select the `View > SCM` menu.

The _Source Control_ pane has icons for:

- uploading changes to Planning.Domains,
- discarding local changes and
- checking if a new version of the session is available.

The [...] menu contains three more options:

- Session may be duplicated (as a new writable session), which is useful when the session was open as read-only.
- Session may be open in the default browser, or
- shared via email, if default email client is installed to handle the `mailto:` protocol.

Using the _duplicate session_ and _share via email_ commands, a teacher can create a session for everyone in the classroom and monitor progress of all students from VS Code.

![Planning.Domains Sessions for classroom](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/Planning.Domains_classroom_in_VSCode.gif)

The status bar of VS Code shows the state of the session. If multiple session folders are included in the VS Code workspace, the session of interest may be selected using the top part of the _Source Control_ pane.

![Source control status](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/Planning.Domains_SCM_status.gif)

This is what the different symbols in the status bar mean:

1. cloud download icon - shows if a new version of the session is available for download
1. repository icon - helps distinguishing Planning.Domain sessions from other types of source control e.g. Git
1. pencil icon - is displayed if the session is in read/write mode
1. time info - how long ago was the currently checked-out version saved to the server (clicking it opens up the list of versions to select)
1. dot icon - is displayed if the session was modified locally
1. two circular arrows icon - when clicked, VS Code checks whether a new version of the session(s) is available on the server.

## [2.10.2] - 2019-05-17

### Bug fixes

- [Issue #23](https://github.com/jan-dolejsi/vscode-pddl/issues/23) Planner or parser that is configured as  `java -javaagent ...` are now not surrounded by double-quotes.

### Changes

Search debugger only listens to local http traffic via 127.0.0.1.
Search debugger view shows the port number in the tooltip of the _signal_ icon.

## [2.10.0] - 2019-05-11

This version introduces the _ultimate_ AI Planning educational tool and a powerful search debugger tool at the same time. It explains how the heuristic function guides the search and at the same time it can be used to understand why the planner has hard time finding the plan for given planning problem and where does the domain model need to be tightened.

Start the Search Debugger using the _PDDL: Start search debugger_ command. Stop it by the _PDDL: Stop search debugger_ or pressing the _cell phone signal_ icon. While the search debugger is active, it listens to the planner messages and visualizes the progress of the plan search in several ways:

1. line plot of state heuristic value and estimate of makespan
1. search tree
1. best-state-so-far is visualized in terms of planhead, helpful actions and relaxed plan.

![PDDL Search Visualization](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_search_debugger.gif)

When the search stops, the states may be navigated and explored in three ways:

1. using keyboard up, down, left, right buttons to navigate states in the search tree
1. using keyboard shift+left and shift+right to navigate all states in order of discovery as layed out on the line plot
1. by clicking on helpful actions to jump to the child state that expands that action (if actually created)

While the Search Debugger is active, any planning _PDDL: Run the planner and display the plan_ requests are instrumented to send search progress info to the Search Debugger. This is achieved by appending a switch to the command line options. The switch may be configured using the `pddlSearchDebugger.plannerCommandLine` setting.

The search debugger may be enabled/disabled by clicking on the bug-like icon in the status bar.
For even smoother experience, the execution target setting may be switched to _Search debugger_ too to keep the Search debugger window in the forefront.

If the planner outputs even more detailed log for every state, the log file could be synchronously navigated (scrolled to the same state). Select the log file that corresponds to the search being debugged by pressing the 🗎 icon. The log entry that corresponds to the state is matched using the regular expression pattern configurable by the  `pddlSearchDebugger.stateLogPattern` setting.

To participate in this visual search debugging the planning engine must implement a HTTP client. An example of what data is expected may be found in the [mock search](https://github.com/jan-dolejsi/vscode-pddl/blob/master/src/searchDebugger/MockSearch.ts).

## [2.9.1] - 2019-04-09

The extension activation is now postponed till a .pddl, .plan, .happenings file is open, not just present in the workspace. The extension is also activated when the Test pane or Planning.Domains file tree is open, as well as when several key commands are invoked by the user. This results in faster start-up of VS Code in the context of projects that have a mixture of code and PDDL models.

Refactored the plan visualization from deprecated `vscode.previewHtml` command to `WebView` API.

Added _PDDL: Preview plan_ command to visualize any `.plan` file.

Added `pddlPlanner.executionTarget` configuration option to direct planner executable output to a _terminal_ window instead of the _output_ window. This can be configured on the _Overview page_.
The _Terminal_ option is useful when the planner takes keyboard input while executing. In case of the _Terminal_, the plan(s) are not visualized. Planner could be stopped by _Ctrl+C_ (or equivalent).

Fixed issues caused by case-sensitive action/predicate/function/type name matching, which resulted in missing hover-over and jumping to definition options.

## [2.9.0] - 2019-02-16

### Added

Added tree view of the [Planning.Domains](http://planning.domains) PDDL collection. The domain, problem and plan files are downloaded and displayed as read-only files and the planner may be invoked on them as usual.

![Planning.Domains PDDL collection browser](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_planning.domains_browsing.gif)

## [2.8.2] - 2019-02-10

### Fixes

- Only displaying this page during start-up for major nd minor updates, not fixes.
- Added PDDL Reference to overview page [https://github.com/nergmada/pddl-reference](https://github.com/nergmada/pddl-reference)
- Fixed plan export, where actions at time 0 (zero) were printed without any time - violating valid PDDL format for plans

## [2.8.1] - 2019-02-06

### Added

- added link to the [VS Code Icons Extension](https://marketplace.visualstudio.com/items?itemName=vscode-icons-team.vscode-icons), which now provides icons for .pddl, .plan and .happenings files.

### Bug fixes

- [Issue #16](https://github.com/jan-dolejsi/vscode-pddl/issues/16) Domain file and problem file shouldn't require to have case sensitive domain name identical
- planners and parsers implemented with node.js are correctly not double-quoted (same as `java -jar ...`)

## [2.8.0] - 2019-01-28

### Added

- Added Overview page, which summarizes learning resources and centralizes configuration. The overview page shows up at most once per hour upon VS Code activation. If it does not come up (perhaps because it was permanently dismissed by the user), it may still be invoked using command _PDDL: Show overview page_.
- Exposed command to configure the VAL/validate tool. Try invoking command _PDDL: Configure VAL/Validate tool_. It lets you select the executable, if you have it.
- Added a warning, when PDDL code is sent to a (remote) planning service for the first time. The user must give consent that they trust that service with their PDDL model.

## [2.7.3] - 2019-01-14

Bug fixes

- more robust way of finding out which state variables does the plan affect. This now works for plans that contain hundreds of actions.

## [2.7.2] - 2019-01-10

New features

- Elapsed time used by the planner is printed to the output window when the planner finishes.

Bug fixes

- Planners configured via path are double quoted if they contain spaces, unless the command already includes double quotes or it is a java -jar kind of a command.
- Python pre-processing of problem files (transformation of the problem file before applied before PDDL parsing) is fixed. To test, use this syntax at the top of hte problem file:

```;;!pre-parsing:{type: "python", command: "../../scripts/transform.py", args: ["../data.json"]}```

- Python interpretter in the %path%, or as selected by the Python VS Code extension would be invoked.

## [2.7.1] - 2019-01-07

Added support for passing optional switches to planner service when involing the planner via the _PDDL: Run the planner and display the plan_ command. For example: specify options `param1=value1` to pass them via URL query as `http://host:port/solve?param1=value1`.

Added `forall` and `exists` into syntax highlighting.

Made plan parsing more robust with different whitespace (e.g. inside square brackets).

Plan numeric value charts (experimental feature, because a separate executable is needed) now works regardless of upper/lower case function names by changing command line arguments to lower case. It also correctly shows step change functions, functions with more than 1 parameter and is faster, because it first checks which functions are updated by the plan before asking the external utility for plot values.

The _PDDL: Normalize and compare 2 plans_ command now shows the plan diff as before, but when those plans are modified afterwards, the normalized diff updates accordingly. The diff now shows the final state values, so the diff can be used for plan equivalency check.

![Normalized plan diff with final state values](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_diff_with_values.gif)

Added the _PDDL: Normalize and evaluate plan_ command to expose in isolation the transformation used by the _PDDL: Normalize and compare 2 plans_ command.

![Normalize and evaluate plan](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_final_state_values.gif)

Extension now helps enabling `File > Auto save` during start-up.

Valstep (experimental feature) utility can now be selected from the file system upon first usage.

Good news. Starting from 2.6.12, the extension starts-up on Linux as well. Please raise an issue in GitHub, if you are still experiencing problems.

## [2.6.12] - 2018-10-29

This is a fix of 2.6.11, because there were more extension activation issues on Linux.

### Added

Added the ability to convert `.happenings` file back to `.plan`. This is useful, when you need to manually adjust a temporal plan, while gettign it annotated by the numeric effect values, and then you want to convert it back to a `.plan` format to get it validated. This feature is also useful, when your planner has the capability to output a planhead or relaxed plan in the `.happenings` format and you want to Diff it against a different plan to find the point where your planner takes an unexpected decision. To convert `.happenings` to `.plan`, right click on the happenings file and select the _PDDL: Convert happenings to plan..._ command.

![Happenings to Plan conversion and validation](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_happenings_to_plan.gif)

Control+click on action names in `.plan` or `.happenings` files to jump to the action definition in the domain file. Hovering over action names shows a simple hover pane.

Elapsed time is being displayed while planner is running.

### Fixed

Normalized plan comparison (_PDDL: Normalize and compare 2 plans_ right-mouse button option in the Explorer sidebar pane) now also sorts actions that start at the same time by the action name alphabetically.

Fixed problems that Linux users were experiencing.

The _What's new_ opens in a new tab inside VS Code now, not in the default browser.

## [2.6.10] - 2018-09-24

### Added

Normalized plan comparison. Plans from different planners are hard to compare due to different formatting of the output. Normalized diff re-formats the plan, removes all extra lines or comments, shifts plan times (by a convention plans start at time _epsilon_) and opens the Diff window.

![Plan normalized diff](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_diff.gif)

### Modified

When specifying command-line arguments for the planner, they were being acumulated in the history and re-used. But only exactly as previously specified. As the combinations of parameters get more complex and verbose, the inability to edit options from the history render the history useless. Now the previously used command-line options may be edited before re-submitting.

The user experience of the plan-resume/re-planning test case geneneration was improved. The user may select a folder for all the generated, so they are easy to git-ignore in the repository.

## [2.6.9] - 2018-09-12

Fixes in the happenings effect evaluation for numbers output in a scientific notation.

Added simple [Python-based problem file templating sample](https://github.com/jan-dolejsi/vscode-pddl-samples/tree/master/ScriptedTemplating)

To test robustness of your planning model, you can auto-generate a "plan-resume" re-planning test suite. Open a _.happenings_ file and select `PDDL: Execute plan and generate plan-resume test cases` from the context menu. This command executes the happenings and evaluates all intermediate states in the course of the plan. Then it generates a problem file for each of those states (treating them as new initial states) and the same goal. The command then also summarizes all those new problem files into a new test manifest named after the problem file `<problem_file_name>_re-planning.ptest.json`, which you can open in the Test Explorer and run as a test suite. This way you can test whether your domain model includes actions to recover from possible plan failures. You can then manually edit those generated problem files to model actual plan failure modes.

![Plan Happenings to plan-resume re-planning test suite generation.](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_resume_re-planning_test_suite_generation.gif)

For this to work, the setting `pddl.valStepPath` must be set to the location of the ValStep utility, which is currently not distributed with the extension. There is a known issue with time-initial literals and fluents - they are not re-included into the generated problem files.

## [2.6.8] - 2018-07-27

Any errors in templated problem generation are now reported as syntax errors and are therefore easier to find and fix.
Add a `;;!pre-parsing:...` meta instruction to the top of the problem template and the pre-processing is executed before the problem file is examined by the PDDL parser.

![Problem template errors](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_problem_template_errors.gif)

More elaborate support for .happenings files now offers syntactic validation and in experimental mode also plan execution and decoration of the file with action effects.

![Plan Happenings effect evaluations](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_happenings_effect_evaluation.gif)

For this to work, the setting `pddl.valStepPath` must be set with the location of the ValStep utility, which is currently not distributed with the extension.

## [2.6.7] - 2018-07-05

### Documentation

Getting started documentation was added thanks to feedback from fellow [ICAPS](http://icaps18.icaps-conference.org) attendees.

## [2.6.6] - 2018-06-19

### Bug-fixes

Fixed .plan and .happenings export to existing files.

Users that clicked "Never" on the prompt to submit feedback to the VS Code Extension Marketplace will now really _never_ see the prompt.

Renamed configuration key _pddlPlan.validatorPath_ to _pddl.validatorPath_. Existing settings must be updated manually.

### Technical debt

Removed dead language-server code.

Reverted _compile_ and _watch_ tasks in `tasks.json` and related scripts in `package.json` files to avoid VS Code reporting compilation errors in files that _do not exist_ (because they are reported with wrong relative path).

## [2.6.5] - 2018-06-07

### Plan and Plan Happenings support

Added support for .plan files in the format of the usual PDDL planner output.
A .plan file can be generated using an option in the Plan Visualization menu (&#x2630;), or using a _PDDL: Export plan to a file..._ command.

A context menu option in .plan file _PDDL: Convert plan to happenings..._ supports export to a .happenings file.

Both plan formats are covered by syntax highlighting and .plan files have a context menu option _PDDL: Validate plan_, which requires the `validate` executable path to be configured in the _pddl.validatorPath_ setting. See [VAL](https://github.com/KCL-Planning/VAL) for more details.

Problems in .plan files are displayed in the Problems panel of VS Code as long as a corresponding problem and domain files (located in the same folder) are open in the editor and the `validate` executable location is configured via the _pddl.validatorPath_ setting.

![Plan validation](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_validation.gif)

### Improved auto-completion support

- Predicates and Functions now display the documentation string
- Snippet is available for continuous numeric effects
- Clearer description of many auto-completion items: more descriptive text and proper markdown rendering.

![Improved auto-completion](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_auto_completion2.gif)

### Problem generation from templates

When the problem template file and corresponding generated problem file are open side-by side, the edits in the template are reflected in the generated problem file as a live preview as you type.

![Templated problem file generation with live preview](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_templated_problem_live_preview.gif)

Language Server pattern was removed. Both auto-completion and PDDL parsing is now happening in the extension main process (i.e. client).

### Bug-fixes

Fixed issues arising when using a planning service.

## [2.6.4] - 2018-05-28

### Bug-fixes

- Test cases that fail in the pre-processing step (e.g. Python script fails), the test case result now correctly shows as failed.
- The Plan Visualization menu (&#x2630;) now displays at a fixed top-right location above the action list.
- The action tool tip in Plan Visualization text is better aligned, so numbers are visible even for long action names.

## [2.6.3] - 2018-05-16

- Added performance measurement to the PDDL test output console.

```text
Executing tests from .ptest.json.
☑ case1.pddl (1.631 sec)
☑ case2.pddl (1.716 sec)
☒ case3.pddl (0.982 sec)
    Actual plan is NOT matching any of the expected plans.
☐ case4
    Killed by the user.
Finished executing tests from .ptest.json.
```

- Added action end time into plan visualization action tooltip.
- Added support for PDDL Test case description property in the `*.ptest.json` schema, which gets displayed as tooltip in the tree.

## [2.6.2] - 2018-05-13

- Plan visualization now displays a menu symbol &#x2630; in the top-right corner, which shows applicable commands. The first command displayed there is the _PDDL: Generate plan report_.

![Plan visualization menu](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_viz_menu.jpg)

- Plan visualization includes start time and duration in action tool-tip.

![Plan visualization tooltip](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_viz_tooltip.jpg)

- Bug fixes to make Test explorer more robust.
- More robust parsing of type inheritance

## [2.6.1] - 2018-05-07

- PDDL Test explorer tree with test file viewing, planner execution and expected plan(s) assertion

![Test Explorer](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_Test_Explorer.gif)

- Support for templated problem files supported by test explorer. Supported pre-processors are any shell commands, python scripts, nunjucks and jinja2.

![Templated PDDL](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_Templated_problem_files.gif)

- Experimental: Support for PDDL parsing of templated problem files via pre-parsing preprocessing meta instruction
- Additional code folding control via `;;(` and `;;)` instructions helps with long problem files

![Init block folding](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_init_block_folding.gif)

- Upgraded to latest typescript, mocha and node versions
- Fixed symbol at position implementation (used by hover, reference and definition provider)
- Promoted diagnostic Hints to Info to make them appear in the 'Problem' pane

## [2.5.1] - 2018-04-20

When executing the planning engine, the UI shows feedback in a form of a cancelable notification. This makes it much easier to find the cancel button.

![cancel_planning](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_cancel_planning.gif)

Improved syntax highlighting.

![syntax_highlighting](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_syntax_highlighting.png)

Added support for bracket matching for a popular templating library (`{{` matches `}}` and `{%` matches `%}`).

Added dynamic code snippets for Timed Initial Literals (TIL) and Timed Initial Fluents (TIF).

![timed_initial_literals_snippets](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_timed_initial_snippets.gif)

## [2.5.0] - 2018-03-28

Better support for PDDL object types (i.e. types declared in the ```(:types )``` section). Select _Go to Definition_ (or press <kbd>F12</kbd>), _Find all References_ and _Rename_ (or <kbd>F2</kbd>) operations are now supported.

PDDL language configuration was improved - hyphens inside identifiers work as expected in the editor.

Implemented predicate and function renaming. Try this: put cursor into predicate/function name, press <kbd>F2</kbd>, modify the name and press <kbd>Enter</kbd>.
![symbol_renaming](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_symbol_renaming.gif)

Improved function/predicate/type hover-over tooltip markdown rendering by moving the code from the language server directly to the extension. It is more readable and the documentation may use markdown syntax too.

Replaced backslashes with forward slashes in configuration entries.

Added keyboard shortcut <kbd>Alt</kbd> + <kbd>P</kbd> to the _PDDL: Run the planner and display the plan_ command.

Extension is activated also when one of the `PDDL: Configure ...` commands is invoked, in addition to a PDDL file be opened.

Plan visualization configuration `<domain>.planviz.json` file now supports regular expression matching for action names to be hidden. Plan visualization of function values is more robust (but slower) for larger domains. Graphs are not shown for functions with constant values.

Added syntax highlighting and auto-completion for the `:derived` keyword.

Added wiki page with [useful keyboard shortcuts for working with PDDL in VS Code](https://github.com/jan-dolejsi/vscode-pddl/wiki/keyboard-shortcuts).

## [2.4.2] - 2017-12-15

### HTML report for plan details

Additional command for plan report export to a self-contained HTML file.
When the Plan preview pane is open (when the planner finishes a successful execution), press `Control + Shift + P` and type _PDDL_ to the command window. Select the option _PDDL: Generate plan report_. A new default browser window opens with a self-contained report HTML file. It is generated into the temporary folder.

Note: If the report contains graphs showing function values, it only displays the graphs when open in the Chrome browser.

### Context-sensitive auto-complete snippet for symmetric initialization

Auto-complete snippet for symmetric predicate and/or function initialization.

Symmetric predicate initialization example: `(road A B) (road B A)`

Symmetric function initialization example: `(= (distance A B) 13) (= (distance B A) 13)`

To trigger the snippet, start typing 'init' inside the problem `(:init )` section.

### Fixes

Fixed the PDDL parser to work with domains that completely omit the `(:types )` section.

### Other features

Opt-in visualization of plan function values. Experimental.

Plan visualization details may be fine-tuned using an additional file `<domain>.planviz.json`. Following syntax is supported:

```json
{
    "excludeActions": [
        "action-to-be-hidden",
        "another-action"
    ]
}
```

Lastly, we are changing the versioning scheme to allow for safe distribution of intermediate builds to early adopters.

## [2.0.3] - 2017-12-01

Fixed the 'there is no corresponding domain/problem open in the editor' as well as stale PDDL file content while launching the planner.

Planner executable working directory is set to the folder in which the domain and problem files are located.

Entered planner or parser executable/service location is trimmed for whitespace.

## [2.0.2] - 2017-11-23

Plan visualization that features color-coding of actions and swim-lanes for objects per types.

All commands this extension contributes were renamed to start with the 'PDDL:' prefix. That makes them easy to find when pressing _Ctrl + Shift + P_ and is also more consistent with other extensions.

Improved the snippets - they now use 4 character indentation uniformly, which makes it easier to keep the formatting while editing them further.

The `assign` numeric effect was missing in the auto-completion options and was now added.

Clean-up in the code. The .css and .js files needed by the HTML plan preview are now served as static resources from the disk (in the extension installation).

Added Mocha-based unit tests to test the classes in the `common` module.

PDDL parser was extended to pick up the constants and objects from domain/problem file. Those are used in the plan visualization, but not yet in the editor auto-completion for example.

## [2.0.1] - 2017-11-16

New command added to _Configure PDDL Planner_. Added configuration to override the planner command-line syntax.
Added support for solver.planning.domains/solve web service.
Supporting non-auto-saving editor mode by creating temp files for domain/problem when launching the planner.
Fixed an issue with some domains where the extension was hanging (while regexp parsing the types).

## [2.0.0] - 2017-11-10

PDDL Language Server now provides rich PDDL syntax validation, hover info, Go to Definition, Find All References, Jump to symbol, Auto-completion, configuration of custom PDDL parser, planner execution and plan visualization.

## [1.0.2] - 2017-10-16

Simplified snippets and added tabstops/placeholders to them, so they are easy to fill in with content.

## [1.0.1] - 2017-10-06

### Added

- missing PDDL requirements in syntax highlighting: `strips, typing, negative-preconditions, disjunctive-preconditions, equality, existential-preconditions, universal-preconditions, quantified-preconditions, conditional-effects, fluents, numeric-fluents, adl, durative-actions, duration-inequalities, continuous-effects, derived-predicates, timed-initial-literals, preferences, constraints, action-costs, timed-initial-fluents`

### Changed

- fixed parameters to action snippets
- banner color

## 1.0.0 - 2017-04-15

### Added

- Initial release
- PDDL Snippets for `domain`, `problem`, `action` and `durative-action`.
- Syntax highlighting for commonly used PDDL features

## Future work

- Review configuration properties scope - which properties should be moved to 'application' scope?
- Rename objects and constants
- Auto-completion for constant/object names.
- Review the ViewColumn usage following the Grid View feature availability in VS Code
- Add a search into the virtual file system for the IPC benchmarks and adapt it to the test cases manifests for ease of use
- Add Happenings to Problem explicit mapping
- Interactive stepping through plans (aka debugging).
- Icons: https://code.visualstudio.com/updates/v1_31#_updated-octicons
- CodeAction to remove unnecessary requirements etc..
- Predicate/function usage decoration and dependency map displayed via the Call Hierarchy
- more precise context sensitive auto completion

## Note to contributors

Note for open source contributors: all notable changes to the "pddl" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

[Unreleased]: https://github.com/jan-dolejsi/vscode-pddl/compare/v2.18.0...HEAD
[2.16.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.17.1...v2.18.0
[2.16.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.16.0...v2.17.1
[2.15.7]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.15.7...v2.16.0
[2.15.7]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.15.6...v2.15.7
[2.15.6]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.15.5...v2.15.6
[2.15.5]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.15.4...v2.15.5
[2.15.4]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.15.3...v2.15.4
[2.15.3]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.15.2...v2.15.3
[2.15.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.15.1...v2.15.2
[2.15.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.15.0...v2.15.1
[2.15.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.14.4...v2.15.0
[2.14.4]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.14.2...v2.14.4
[2.14.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.14.1...v2.14.2
[2.14.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.14.0...v2.14.1
[2.14.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.13.1...v2.14.0
[2.13.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.13.0...v2.13.1
[2.13.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.12.2...v2.13.0
[2.12.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.11.8...v2.12.2
[2.11.8]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.11.7...v2.11.8
[2.11.7]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.11.5...v2.11.7
[2.11.5]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.11.4...v2.11.5
[2.11.4]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.11.3...v2.11.4
[2.11.3]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.11.2...v2.11.3
[2.11.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.11.1...v2.11.2
[2.11.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.10.2...v2.11.1
[2.10.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.10.0...v2.10.2
[2.10.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.9.1...v2.10.0
[2.9.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.9.0...v2.9.1
[2.9.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.8.2...v2.9.0
[2.8.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.8.1...v2.8.2
[2.8.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.8.0...v2.8.1
[2.8.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.7.3...v2.8.0
[2.7.3]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.7.1...v2.7.3
[2.7.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.12...v2.7.1
[2.6.12]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.10...v2.6.12
[2.6.10]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.9...v2.6.10
[2.6.9]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.8...v2.6.9
[2.6.8]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.7...v2.6.8
[2.6.7]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.6...v2.6.7
[2.6.6]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.5...v2.6.6
[2.6.5]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.4...v2.6.5
[2.6.4]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.3...v2.6.4
[2.6.3]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.2...v2.6.3
[2.6.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.1...v2.6.2
[2.6.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.5.1...v2.6.1
[2.5.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.5.0...v2.5.1
[2.5.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.4.2...v2.5.0
[2.4.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.0.3...v2.4.2
[2.0.3]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.0.2...v2.0.3
[2.0.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.0.1...v2.0.2
[2.0.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.0.0...v2.0.1
[2.0.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v1.0.2...v2.0.0
[1.0.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v1.0.1...v1.0.2
[1.0.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/1.0.0...v1.0.1
