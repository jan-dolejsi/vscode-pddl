# Planning Domain Description Language Support

[![Downloads](https://vsmarketplacebadge.apphb.com/downloads/jan-dolejsi.pddl.svg?subject=Downloads)](https://marketplace.visualstudio.com/items?itemName=jan-dolejsi.pddl)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/jan-dolejsi.pddl.svg?subject=Installations)](https://marketplace.visualstudio.com/items?itemName=jan-dolejsi.pddl)
[![Ratings](https://vsmarketplacebadge.apphb.com/rating-star/jan-dolejsi.pddl.svg?subject=Reviews)](https://marketplace.visualstudio.com/items?itemName=jan-dolejsi.pddl&ssr=false#review-details)
[![VS Code PDDL Extension CI/CD](https://github.com/jan-dolejsi/vscode-pddl/workflows/Build/badge.svg)](https://github.com/jan-dolejsi/vscode-pddl/actions?query=workflow%3ABuild)

This extension makes VS Code a great place for modeling planning domains.

This extension brings PDDL to the family of first-class languages with the level of support on par with c#, python or javascript. It aims to help the novice and empower the expert by following features:

* planning domain modeling
* planning domain validation by number of regression or scalability test cases
* planning solution industrializing by problem file generation from templates
* plan validation

Extension is activated on any `.pddl` files (commonly holding domain or problem definitions) or selected PDDL commands to configure parser and planner.

## Getting started

### Creating PDDL files and running the planner

Simplest way to get started is to:

1. open a blank folder in VS Code using _File > Open Folder..._,
1. create two blank files using _File > New File_ named `domain.pddl` and `problem.pddl`, both files will show up in the _Explorer_ pane, open them side by side in the editor,
1. open the _domain.pddl_ file and type ```domain```. The auto-completion suggests to insert the entire structure of the domain file. Use the <kbd>Tab</kbd> and <kbd>Enter</kbd> keys to skip through the placeholders and make your selections.
1. open the _problem.pddl_ file and type ```problem```. The auto-completion suggests to insert the entire structure of the problem file. Make sure that the `(domain name)` here matches the name selected in the domain file.
1. When prompted to install the VAL (i.e. Validator) tools, follow the instructions. This will bring a PDDL parser and plan validation utilities to your experience.
1. When you are ready to run the planner on your domain and problem files (both must be open in the editor), invoke the planner via context menu on one of the file text content, or via the <kbd>Alt</kbd> + <kbd>P</kbd> shortcut. The [planning.domains](http://solver.planning.domains/) solver will be used, so do not send any confidential PDDL code.
1. Configure your own PDDL planner by following [instructions](https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-planner).

![PDDL Planner Configuration](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_planner_configuration.gif)

### Explore VS Code PDDL show-cases

To exercise the features of this PDDL Extension, clone this [vscode-pddl-samples](https://github.com/jan-dolejsi/vscode-pddl-samples/) repository and open the folder in VS Code. Follow the instructions and explanations in the [readme](https://github.com/jan-dolejsi/vscode-pddl-samples/blob/master/README.md).

> You can copy the following URL to your browser's address bar and open it, it will let you select where you want to clone the repo onto your local storage and opens it for you in VS Code - all automated:
>
> vscode://vscode.git/clone?url=https%3A%2F%2Fgithub.com%2Fjan-dolejsi%2Fvscode-pddl-samples

### Starting from existing PDDL models

Open [editor.planning.domains](http://editor.planning.domains/) in your browser, select _Import_ from the menu and browse the catalog of all the International Planning Competition benchmarks. Or find more examples [here](https://github.com/SoarGroup/Domains-Planning-Domain-Definition-Language/tree/master/pddl).\
To get back from the online editor to VS Code, save your files into a session and click "Open offline".

## Features

### Snippets

Following snippets are supported if you start typing following prefix

* `domain`: creates a domain skeleton
* `action`: instantaneous action
* `action-durative`: durative action
* `problem`: creates a problem skeleton

![snippets](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/snippets.gif)

### Syntax highlighting

Commonly used PDDL keywords are highlighted.

![syntax_highlighting](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_syntax_highlighting.png)

### Hover, go to definition and find all references

Similar to other programing languages, you can hover over a PDDL predicate, function or type and see the definition. If some comments are placed on the same line, they are also displayed while hovering. The code comments may include markdown syntax.
![hover_markdown](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_hover_markdown.gif)

You can jump to definition of predicates and functions in two ways: _Ctrl+click_ or _Right-click > Go to Definition_ menu.

You can also right click on such symbol and select _Find All References_.

![hover_go_to_definition_references](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_symbol_definition_and_references.gif)

### Jump to Symbol e.g. predicate/function/action

Use the VS Code keyboard shortcut _Ctrl + Shift + O_ to open up the symbol listing. That lists all predicates, functions and actions in the domain file. That way you may review the full list of actions in a concise way and jump to their declaration.

![symbol_listing](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_symbol_listing.gif)

### Global predicate/function/type/parameter renaming

Put cursor into a predicate, function or type name and press _F2_ to rename its appearances in the domain file and all associated problem files currently open in the editor.

![symbol_renaming](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_symbol_renaming.gif)

It is also possible to rename a `?<parameter>` name within a parametrised scope e.g. action/process/effect/derived predicate or function.

![Parameter renaming](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_parameter_type_renaming.gif)

### Auto-completion

When typing in the domain or problem file characters such as `(`, `:` or `?`, Visual Studio Code pops up the suggested keywords or names of predicates/functions/parameters or other PDDL language constructs.

![Auto-completion](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_auto_completion.gif)

Some PDDL constructs are supported with smart snippets, which are aware of where you are in the document and what is in your model:

![Auto-completion with smart snippets - continuous decrease](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_auto_completion2.gif)

![Auto-completion with smart snippets - timed initial literals/fluents](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_timed_initial_snippets.gif)

### Syntactic errors

PDDL parser can be configured to run in the background and draw attention to syntactic errors, so you can fix them before running the planner. This dramatically shortens the time you need to come up with a valid PDDL.

![PDDL Parser Configuration](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_parser_configuration.gif)

To learn more about how to configure the extension to work with one of the parsers available or even your own, read this [wiki page](https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser).

#### Auto-fixing PDDL parser warning

The VAL PDDL parser produces some warnings, that could be automatically fixed with a code action. Code actions are presented in the user interface by a light bulb. For example missing requirements could be automatically inserted:

![Missing requirements and unused predicates/functions warnings](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_missing_requirements_unused_predicates.gif)

Undeclared predicates and functions may also be automatically declared:

![Undeclared predicates/functions code action](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_undeclared_predicate_function.gif)

### Model visualization

A "View" _code lens_ is displayed above selected PDDL sections such as `:init` section of problem files. Clicking it will open a graphical representation of the initial state for easy review.
So far object _properties_ and _relationships_ are displayed in a tabular form and a directed graph is available to visualize 2D-symmetric predicates or functions i.e. predicates or functions whose first two arguments are of the same type.
For example predicate `(path ?from ?to)` or function `(distance ?a ?b)` will be visualized on a graph.

![Model visualization](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_model_visualization.gif)

### Run the planner and visualize plans

The planner can be invoked in the context of a currently edited PDDL file. There are two ways how to do that via the user interface.

* Type `Ctrl + Shift + P` or `F1` and type _plan_ to filter the list of available commands. The _PDDL: Run the planner and visualize the plan_ command should be visible.
* Right click on the PDDL file and select  _PDDL: Run the planner and visualize the plan_
* Alternatively you can set up a keyboard shortcut such as `Alt + P` to be associated with the above command (see VS Code documentation for that)

There are multiple scenarios supported:

* if command is invoked on the domain file,
  * and if single corresponding problem file is open, the planner will run without asking further questions
  * and if multiple corresponding problem files are open, the list of applicable problem files will appear and the user will select one.
* if command is invoked on a problem file, the domain file (if open in the editor) will be selected automatically.

Domain, problem and plan/happenings files correspond to each other, if:

* they have the same domain name i.e. `(domain name)` and
* they are located in the same folder and
* both files are open in the editor.

![planner](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan.gif)

Control+click on action names in `.plan` files to jump to the action definition in the domain file.

If one of the rules above is not satisfied, the editor will not naturally associate your files to each other. In that case it shows a validation error suggesting to apply a _Quick Fix_, which lets you find the corresponding domain/problem file from following scopes:

* suggested files, if multiple candidates were found
* currently open files in the editor
* other files in the workspace
* any other file selectable from the computer storage

![domain/problem/plann associations](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_explicit_domain-problem-plan_associations.gif)

#### Line plots for multiple metric expressions

If your planner supports multiple `(:metric ...)` expressions in the problem file (VAL actually does),
you can use it to get some ad-hoc expressions displayed on a line plot below the plan.
This is very useful, to debug numerically-rich domains.

![Plan metric plots](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/plan_metric_plots.jpg)

#### Running the planner interactively

See configuration setting `pddlPlanner.executionTarget` to select where is the planner executable started. You can either direct planner executable output to a _Terminal_ window instead of the _Output window_. This can be configured on the _Overview page_.
The _Terminal_ option is useful when the planner takes keyboard input while executing. In case of the _Terminal_, the plan(s) are not visualized. Planner could be stopped by _Ctrl+C_ (or equivalent).

The planner output can be re-directed between the three destinations simply using a button in the stats bar:

![Planner output re-direction switch in status bar](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/pddl_planner_output_target_selector_status_bar.gif)

#### Hide actions from plan visualization

Plan visualization details may be fine-tuned using an additional file `<domain>.planviz.json`, where `<domain>` refers to the domain file name without the `.pddl` extension, placed into the same folder as the domain file. Following syntax is supported:

```json
{
    "excludeActions": [
        "action-to-be-hidden",
        "^prefix_",
        "suffix$"
    ]
}
```

The entries may use regular expression pattern. Note that backslashes in the regex must be doubled up to comply with JSON syntax.

#### Excluding actions from swim-lane plan visualization by configuring selected parameters to be ignored

It is now possible to exclude selected action parameters from swim-lane plan visualization. This is useful for action parameters, which are just marginally involved in the action conditions, and displaying such action in the swim-lane of the given object makes the diagram confusing. To configure this, add `ignoreActionParameters` into the `_domain_.planviz.json` file, where _domain_ matches your domain file name. This example will exclude `?to` and `?from` parameters of any action starting with `move`. It also exclude any parameter with name ending with the `_reserved` suffix:

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

#### Generate plan report

Plan visualization displays a menu symbol &#x2630; in the top-right corner, which shows applicable commands. For example the _PDDL: Generate plan report_, which opens the plan report generated into a self-contained HTML file that you can save and share/email.

![Plan visualization menu](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_viz_menu.jpg)

#### Exporting plan to a file

The Planner Output plan visualization pane displays a menu symbol &#x2630; in the top-right corner. One of the options is _Export as .plan file_. When this option is selected, the file name and location can be specified.

#### Plan file visualization

Right-clicking on any `.plan` file offers _PDDL: Preview plan_ command to visualize the plan. However, the plan must start with the meta data lines linking it to a domain and problem names:

```pddl
;;!domain: domain-name
;;!problem: problem-name
```

### Planning with command-line switches

When using a planner executable, further command-line options may be specified.

![planner_command-line_options](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_optimize.gif)

### Auto-completion snippets for symmetric and sequential initialization

Creating a realistic problem files to test the domain may be tedious. Here are several ways to make it substantially faster:

Initializing a sequence of symmetric relationships.

![sequence_initialization](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_sequence_init.gif)

Initializing a symmetric relationships.

![symmetric_initialization](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_symmetric_init.gif)

## Regression testing of PDDL domains

The _PDDL Tests_ explorer tree lists all configured test cases and supports single test execution as well as a bulk test execution.

![Test Explorer](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_Test_Explorer.gif)

If no tests are present in the workspace, a button shows up suggesting test creation for currently open domain and problem(s).

It is also possible to add test case based on recent call
to the planning engine from the hamburger menu on the plan
preview pane.

To add a test case, create a file named `*.ptest.json` anywhere in the workspace. This is a simple example:

```JSON
{
    "defaultDomain": "StripsRover.pddl",
    "defaultOptions": "",
    "cases": [
        {"problem": "pfile1"},
        {"problem": "pfile2"},
        {"problem": "pfile3"}
    ]
}
```

Use other JSON properties like `expectedPlans` to define the test assertion or `options` to specify command-line options to use.

Interesting by-product of this feature is that it can be used to give effective demos. Prepare a specific `<name>.ptest.json` for your planned demo. Right click on each test and select the _Open PDDL domain and test problem_ and both files open side-by-side in the editor. Show the code and run the planner. Then move to the next test case - demo.

All tests under a given directory may be executed by right clicking on the folder and selecting the _run all_ command.
All tests in the workspace may be executed by clicking the _Run all_ button in the _PDDL TESTS_ pane's toolbar.

![Test Report](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_Test_Report.gif)

## Problem file generation

In order to test the PDDL domain model and its scalability, it is useful to be able to generate realistic problem files from real data. However, as the PDDL model is under development, so is the structure of the problem files. Those test problem file quickly get out of date and are pain to maintain by hand. There are multiple ways how to generate problem files now. Simplest is to use one of the supported templating libraries, which are powerful enough to satisfy great number of use cases. If that is not sufficient (e.g. data needs to be retrieved from a database, cloud service and heavily manipulated), you can invoke any script or program by specifying the command-line call. Such program, however, must accept the templated problem file on its standard input and provide the actual PDDL via its standard output.

There are several templating options supported out of the box:

* [Nunjucks](https://mozilla.github.io/nunjucks/)
* [Jinja2](http://jinja.pocoo.org/docs/2.10/templates/)
* Python script
* Command-line command

But there is a [wealth of templating libraries](https://en.wikipedia.org/wiki/Comparison_of_web_template_engines), including Razor [see RazorTemplates](https://github.com/volkovku/RazorTemplates), which is popular in asp.net, or [T4](https://msdn.microsoft.com/en-us/library/bb126445.aspx).

Nunjucks and Jinja2 are two very similar templating engines, but differ in some important details. Nunjucks runs natively in Javascript and the file generation will not cause perceivable delays, while Jinja2 needs to invoke Python and will slow down your development process somewhat.

![Problem template errors](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_problem_template_errors.gif)

For the ultimate flexibility, here is how to configure a Python script to do a custom pre-processing of the problem file:

```JSON
{
    "defaultDomain": "domain.pddl",
    "defaultProblem": "problem_template.pddl",
    "defaultOptions": "",
    "cases": [
        {
            "label": "Case #1",
            "preProcess": {
                "kind": "nunjucks",
                "data": "case1_data.json"
            }
        },
        {
            "label": "Case #1.1",
            "preProcess": {
                "kind": "jinja2",
                "data": "case1_data.json"
            }
        },
        {
            "label": "Case #2",
            "preProcess": {
                "kind": "command",
                "command": "myprogram.exe",
                "args": [
                    "case2_data.json",
                    "some_switch",
                    42
                ]
            }
        },
        {
            "label": "Case #3",
            "preProcess": {
                "kind": "python",
                "script": "../scripts/populate_template.py",
                "args": [
                    "case3_data.json"
                ]
            }
        }
    ]
)
```

![Templated PDDL](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_Templated_problem_files.gif)

Note that if you are referring to other files such as Python scripts or JSON data files in the `.ptest.json`, you may use relative path i.e. relative to the path, where the `.ptest.json` file is located as that is the runtime context in which the pre-processor will be executed.

The templated problem file and the problem file generated using the pre-processed PDDL test case may be open side-by-side and used as a live preview of the code generation.

![Templated problem file generation with live preview](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_templated_problem_live_preview.gif)

### Problem generation via a Python script

This is what happens if you set `"kind": "python"`: Before executing the test, the extension runs the `populate_transform.py` script using the `python` command, pipes the `problem_template.pddl` onto it and reads the PDDL output of the script. The script uses the data from the configured .json file in this case, but as this is basically a command-line argument, you could refer to a database table just as well.

If you have multiple python installations (e.g. 2.7, 3.5), there are several ways how to indicate which one you want to use:

* python executable is in the %path%
* you are using the [Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) to select the python runtime
* you simply configure the python executable path via the `python.pythonPath` setting property

## Normalized plan comparison

Plans from different planners are hard to compare due to different formatting of the output. Normalized diff re-formats the plan, removes all extra lines or comments, orders simultaneous actions alphabetically, shifts plan times (by a convention plans start at time _epsilon_) and opens the Diff window.
Open file explorer pane, select two _.plan_ files, right-click and select _PDDL: Normalize and compare 2 plans_.

![Plan normalized diff](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_diff.gif)

If the valstep utility (experimental feature) is configured, the diff also includes the final state values. This is useful when you want to check that the plan leads to the exact same goal state despite some minor differences in the action sequence (e.g. different permutations or redundant actions).

![Normalized plan diff with final state values](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_diff_with_values.gif)

### Plan final state evaluation

The _PDDL: Normalize and evaluate plan_ command exposes in isolation the transformation used by the _PDDL: Normalize and compare 2 plans_ command. In addition, this is a live preview, which evaluates your plan changes on-the-fly.

![Normalize and evaluate plan](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_final_state_values.gif)

## Plan validation

A .plan file can be generated using an option in the Plan Visualization menu (&#x2630;), or using a _PDDL: Export plan to a file..._ command.

All .plan files have a context menu option _PDDL: Validate plan_, which requires the `Validate` executable path to be configured in the _pddl.validatorPath_ setting. See [VAL](https://github.com/KCL-Planning/VAL) for more details.

Sometimes it is more convenient to create a desired plan by hand and using the `Validate` tool to find out what is wrong in the domain model. While manually modifying the .plan file, all parsing and validation problems are displayed in the Problems panel of VS Code as long as a corresponding problem and domain files (located in the same folder) are open in the editor and the `Validate` executable location is configured via the _pddl.validatorPath_ setting.

![Plan validation](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_validation.gif)

## Plan happenings validation

A context menu option in .plan file _PDDL: Convert plan to happenings..._ supports export to a `.happenings` file. This shows the exact temporal sequence of action starts and ends.
This notation is more convenient when checking temporal plans for correctness.

Control+click on action names in `.plan` or `.happenings` files to jump to the action definition in the domain file.

This is the syntax supported by the preview:

```PDDL Plan Happenings
;;!domain: airport-ground-operations
;;!problem: _1plane

; timed initial fluent
1.000: (= (available_fuel-truck truck1) 1000)
; timed initial literal
5.000: set (final-approach p1)
5.001: start (land p1 rw1)
5.100: unset (final-approach p1)
7.001: end (land p1 rw1)

; re-occurring actions
10.001: start (land p1 rw1) #2
12.001: end (land p1 rw1) #2
```

All first occurrences of happenings are `#1` implicitly. Labeling the first occurrence as `#1` is optional.
Instructions `start` and `end` label durative span actions. Instructions `set` and `unset` label timed-initial literals (TILs). Instruction `(= (function) value)` is for timed-initial fluents (TIFs).

To convert `.happenings` back to `.plan`, right click on the happenings file and select the _PDDL: Convert happenings to plan..._ command.

![Happenings to Plan conversion and validation](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_happenings_to_plan.gif)

## Plan Happenings effect evaluation

Plan happenings (.happenings) files may be executed and action effects listed as decorations in the code editor.

![Plan Happenings effect evaluations](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_happenings_effect_evaluation.gif)

For this to work, the setting `pddl.valStepPath` must be set with the location of the ValStep utility, which is currently not distributed with the extension.

## Plan Happenings -> domain completeness test suite auto-generation

To test robustness of your planning model, you can auto-generate a "plan-resume" re-planning test suite. Open a _.happenings_ file and select `PDDL: Execute plan and generate plan-resume test cases` from the context menu. This command executes the happenings and evaluates all intermediate states in the course of the plan. Then it generates a problem file for each of those states (treating them as new initial states) and the same goal. The command then also summarizes all those new problem files into a new test manifest named after the problem file `<problem_file_name>_re-planning.ptest.json`, which you can open in the Test Explorer and run as a test suite. You get to select the folder for all the generated files. This way you can test whether your domain model includes actions to recover from possible plan failures. You can then manually edit those generated problem files to model actual plan failure modes.

![Plan Happenings to plan-resume re-planning test suite generation.](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_resume_re-planning_test_suite_generation.gif)

For this to work, the setting `pddl.valStepPath` must be set to the location of the ValStep utility, which is currently not distributed with the extension. There is a known issue with time-initial literals and fluents - they are not re-included into the generated problem files.

## Search Debugging

Search Debugging is the _ultimate_ AI Planning educational tool and a powerful search debugger tool at the same time. It explains how the heuristic function guides the search and at the same time it can be used to understand why the planner has hard time finding the plan for given planning problem and where does the domain model need to be tightened.

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

The search debugger may be enabled/disabled by clicking on the bug-like icon in the status bar.

If the planner outputs even more detailed log for every state, the log file could be synchronously navigated (scrolled to the same state). Select the log file that corresponds to the search being debugged by pressing the 🗎 icon. The log entry that corresponds to the state is matched using the regular expression pattern configurable by the  `pddlSearchDebugger.stateLogPattern` setting.

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
- Fit the entire tree into the viewport by <kbd>F</kbd>

Dead-end states are visualized with brown color.
Tree branches(s) leading to goal state(s) are painted in green color.

The Search Debugger may now be configured (see the `pddlSearchDebugger.stateIdPattern` configuration setting) with a pattern to parse the state ID.
The visualization then respects the IDs assigned by the planner rather than using its own numbering scheme
(which is used if the received state ID does not respect the pattern).

Both tree nodes and edges now show an informative tooltip when mouse hover-over.

To participate in this visual search debugging the planning engine must implement a HTTP client. An example of what data is expected may be found in the [mock search](https://github.com/jan-dolejsi/vscode-pddl/blob/master/src/searchDebugger/MockSearch.ts).

## Block folding in `:init` section of the problem file

For large problem files, it is convenient to be able to fold blocks of statements between `;;(` and `;;)` comments lines.

![Init block folding](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_init_block_folding.gif)

## Planning.Domains integration

### Browsing the Planning.Domains PDDL collection

The file explorer side bar includes a tree displaying the [Planning.Domains](http://planning.domains) PDDL collection.
The domain, problem and plan files are downloaded and displayed as read-only files and the planner may be invoked on them as usual.

![Planning.Domains PDDL collection browser](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_planning.domains_browsing.gif)

### Planning.Domains sessions

The online [Planning.Domains editor](http://editor.planning.domains) has a concept of a session. _Session Details_ pane shows links to open the session online / offline. The _offline_ links are handled by VS Code, if installed.

There are two ways to get started:

1. Using a command:
   * _PDDL: Download Planning.domains session_ and pasting the _Session Unique ID_
1. By navigating to this URL in your favorite web browser:
   * vscode://jan-dolejsi.pddl/planning.domains/session/_readOnlyHash_ or
   * vscode://jan-dolejsi.pddl/planning.domains/session/edit/_readWriteHash_.

The session files are downloaded into a selected workspace folder and may be interacted with via the _Source Control_ pane.

![Planning.Domains Editor Session in VS Code](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/Planning.Domains_sessions_in_VSCode.gif)

Planning.Domains Editor Sessions use plug-ins that save their own configuration.
The `solver` plugin's configuration (i.e. the URL of the solver service) is now replicated into the workspace folder's settings. This is stored in `.vscode/settings.json` file:

```json
{
    "pddl.planners": [
        {
            "kind": "SERVICE_SYNC",
            "url": "http://localhost:12345/solve",
            "title": "http://localhost:12345/solve",
            "canConfigure": true
        }
    ]
}
```

When local session changes are committed back to the server, the solver URL is *not* included.

Session files may be deleted, renamed as well as added. The _Source Control_ pane shows the diff as usual. To open _Source Control_ select the `View > SCM` menu.

The _Source Control_ pane has icons for:

* uploading changes to Planning.Domains,
* discarding local changes and
* checking if a new version of the session is available.

The [...] menu contains more options:

* Session may be duplicated (as a new writable session), which is useful when the session was open as read-only.
* Session may be open in the default browser,
* Session may be shared via email, if default email client is installed to handle the `mailto:` protocol, or
* Session may be used as a template to generate entire classroom of sessions, while emailing every student a link to theri session using the _PDDL: Generate Planning.Domains classroom sessions from this template..._ command.

Using the _duplicate session_ and _share via email_ commands, a teacher can create a session for everyone in the classroom and monitor progress of all students from VS Code.

![Planning.Domains Sessions for classroom](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/Planning.Domains_classroom_in_VSCode.gif)

The command _PDDL: Generate Planning.Domains classroom sessions from this template..._ automate the duplication of this session into any number of student sessions. A prompt pops up to submit student names and/or email addresses in a semi-colon separated list. If email address is included, the default email client pops up with a prepared message for each student.
When all sessions are created, a dedicated VS Code workspace is created for the classroom and VS Code automatically opens it.

![Planning.Domains classroom generation](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/Planning.Domains_classroom.gif)

#### Gamifying PDDL trainings

Include a `.ptest.json` file into the template session, create classroom using the , open the Test Explorer (View > Open View ... > Test > PDDL TESTS) and click the _Run All_ button in the toolbar. This runs the test cases from all the student sessions and displays the pass/fail results.
First student with passing tests wins ... a diploma :-!

#### Working with multiple-sessions in VS Code

The support for multiple sessions or even the entire classroom of sessions per student is built using the VS Code Workspace Folders facility. Each workspace folder in this case is its own Source Control root. The Source Control panel lets you select the session you want to interact with and the status bar starts from the left with a version indicator pertaining to the selected (or first) workspace folder.

The status bar of VS Code shows the state of the session. If multiple session folders are included in the VS Code workspace, the session of interest may be selected using the top part of the _Source Control_ pane.

![Source control status](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/Planning.Domains_SCM_status.gif)

This is what the different symbols in the status bar mean:

1. cloud download icon - shows if a new version of the session is available for download
1. repository icon - helps distinguishing Planning.Domain sessions from other types of source control e.g. Git
1. pencil icon - is displayed if the session is in read/write mode
1. time info - how long ago was the currently checked-out version saved to the server (clicking it opens up the list of versions to select)
1. dot icon - is displayed if the session was modified locally
1. two circular arrows icon - when clicked, VS Code checks whether a new version of the session(s) is available on the server.

## Known Issues

See unfixed issues and submit new ones [here][github pddl issues].

## Release Notes

See [CHANGELOG](CHANGELOG.md).

## Source

[Github](https://github.com/jan-dolejsi/vscode-pddl)

### For more information

* See other [useful keyboard shortcuts for working with PDDL in VS Code](https://github.com/jan-dolejsi/vscode-pddl/wiki/keyboard-shortcuts).
* Read more about [PDDL][PDDL]

## Credits

Icons made by [Pixel perfect](https://www.flaticon.com/authors/pixel-perfect) from [www.flaticon.com](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/).

Development of this extension was supported by [Schlumberger](https://www.slb.com). Visit [careers.slb.com](https://careers.slb.com/).

**Enjoy!**

[PDDL]: https://en.wikipedia.org/wiki/Planning_Domain_Definition_Language
[github pddl issues]: https://github.com/jan-dolejsi/vscode-pddl/issues
