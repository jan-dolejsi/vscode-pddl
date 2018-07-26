# Planning Domain Description Language Support

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
1. When prompted to configure a _PDDL Parser_, follow the instructions, or select _Later_ to postpone this if you do not have a PDDL parser handy. See [more info](https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser).
1. When you are ready to run the planner on your domain and problem files (both must be open in the editor), invoke the planner via context menu on one of the file text content, or via the <kbd>Alt</kbd> + <kbd>P</kbd> shortcut. The [planning.domains](http://solver.planning.domains/) solver will be used, so do not send any confidential PDDL code.
1. Configure your own PDDL planner by following [instructions](https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-planner).

### Explore VS Code PDDL show-cases

To exercise the features of this PDDL Extension, clone this [vscode-pddl-samples](https://github.com/jan-dolejsi/vscode-pddl-samples/) repository and open the folder in VS Code. Follow the instructions and explanations in the [readme](https://github.com/jan-dolejsi/vscode-pddl-samples/blob/master/README.md).

> You can copy the following URL to your browser's address bar and open it, it will let you select where you want to clone the repo onto your local storage and opens it for you in VS Code - all automated: 

> vscode://vscode.git/clone?url=https%3A%2F%2Fgithub.com%2Fjan-dolejsi%2Fvscode-pddl-samples

### Starting from existing PDDL models

Open [editor.planning.domains](http://editor.planning.domains/) in your browser, select _Import_ from the menu and browse the catalog of all the International Planning Competition benchmarks. Or find more examples [here](https://github.com/SoarGroup/Domains-Planning-Domain-Definition-Language/tree/master/pddl).

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

### Global predicate/function/type renaming

Put cursor into a predicate, function or type name and press _F2_ to rename its appearances in the domain file and all associated problem files currently open in the editor.

![symbol_renaming](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_symbol_renaming.gif)

### Auto-completion

When typing in the domain or problem file characters such as `(` or `:`, Visual Studio Code pops up the suggested keywords or names of predicates/functions.

![Auto-completion](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_auto_completion.gif)

Some PDDL constructs are supported with smart snippets, which are aware of where you are in the document and what is in your model:

![Auto-completion with smart snippets - continuous decrease](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_auto_completion2.gif)

![Auto-completion with smart snippets - timed initial literals/fluents](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_timed_initial_snippets.gif)

### Syntactic errors

PDDL parser can be configured to run in the background and draw attention to syntactic errors, so you can fix them before running the planner. This dramatically shortens the time you need to come up with a valid PDDL.

![PDDL Parser Configuration](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_parser_configuration.gif)

To learn more about how to configure the extension to work with one of the parsers available or even your own, read this [wiki page](https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser).

### Run the planner and visualize plans

The planner can be invoked in the context of a currently edited PDDL file. There are two ways how to do that via the user interface.

* Type `Ctrl + Shift + P` and type _plan_ to filter the list of available commands. The _PDDL: Run the planner and visualize the plan_ command should be visible.
* Right click on the PDDL file and select  _PDDL: Run the planner and visualize the plan_
* Alternatively you can set up a keyboard shortcut such as `Alt + P` to be associated with the above command (see VS Code documentation for that)

There are multiple scenarios supported:

* if command is invoked on the domain file,
    - and if single corresponding problem file is open, the planner will run without asking further questions
    - and if multiple corresponding problem files are open, the list of applicable problem files will appear and the user will select one.
* if command is invoked on a problem file, the domain file (if open in the editor) will be selected automatically.

Domain and problem files correspond to each other, if:

* they have the same domain name i.e. `(domain name)` and
* they are located in the same folder and
* both files are open in the editor.

![planner](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan.gif)

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

#### Generate plan report

Plan visualization displays a menu symbol &#x2630; in the top-right corner, which shows applicable commands. For example the _PDDL: Generate plan report_, which opens the plan report generated into a self-contained HTML file that you can save and share/email.

![Plan visualization menu](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_viz_menu.jpg)

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

Use other JSON properties like `expecedPlans` to define the test assertion or `options` to specify command-line options to use.

Interesting by-product of this feature is that it can be used to give effective demos. Right click on the _Open PDDL domain and test problem_ and both files open side-by-side in the editor. This lends itself well to switching between different models during a presentation/meeting/review.

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

## Plan validation

A .plan file can be generated using an option in the Plan Visualization menu (&#x2630;), or using a _PDDL: Export plan to a file..._ command.

All .plan files have a context menu option _PDDL: Validate plan_, which requires the `validate` executable path to be configured in the _pddl.validatorPath_ setting. See [VAL](https://github.com/KCL-Planning/VAL) for more details.

Sometimes it is more convenient to create a desired plan by hand and using the `validate` tool to find out what is wrong in the domain model. While manually modifying the .plan file, all parsing and validation problems are displayed in the Problems panel of VS Code as long as a corresponding problem and domain files (located in the same folder) are open in the editor and the `validate` executable location is configured via the _pddl.validatorPath_ setting.

![Plan validation](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_validation.gif)

## Plan happenings validation

A context menu option in .plan file _PDDL: Convert plan to happenings..._ supports export to a .happenings file. This shows the exact temporal sequence of action starts and ends.

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
```

This notation is more convenient when checking temporal plans for correctness.

## Plan Happenings effect evaluation

Plan happenings (.happenings) files may be executed and action effects listed as decorations in the code editor.

![Plan Happenings effect evaluations](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_happenings_effect_evaluation.gif)

For this to work, the setting `pddl.valStepPath` must be set with the location of the ValStep utility, which is currently not distributed with the extension.

## Block folding in `:init` section of the problem file

For large problem files, it is convenient to be able to fold blocks of statements between `;;(` and `;;)` comments lines.

![Init block folding](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_init_block_folding.gif)

## Known Issues

See unfixed issues and submit new ones [here][github pddl issues].

## Release Notes

See [CHANGELOG](CHANGELOG.md).

## Source

[Github](https://github.com/jan-dolejsi/vscode-pddl)

### For more information

* See other [useful keyboard shortcuts for working with PDDL in VS Code](https://github.com/jan-dolejsi/vscode-pddl/wiki/keyboard-shortcuts).
* Read more about [PDDL][PDDL]

**Enjoy!**

[PDDL]: https://en.wikipedia.org/wiki/Planning_Domain_Definition_Language
[github pddl issues]: https://github.com/jan-dolejsi/vscode-pddl/issues
