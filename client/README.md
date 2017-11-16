# Planning Domain Description Language Support

This extension makes VS Code a great place for modeling planning domains. Read more [about PDDL][PDDL].

## Features

Extension is activated on any `.pddl` files (commonly holding domain or problem definitions) or files with no extension (sometimes used for problem definitions). It brings PDDL to the family of first-class languages with the level of support on par with c#, python or javascript.

### Snippets

Following snippets are supported if you start typing following prefix

- `domain`: creates a domain skeleton
- `action`: instantaneous action
- `action-durative`: durative action
- `problem`: creates a problem skeleton

![snippets](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/snippets.gif)

### Syntax highlighting

Commonly used PDDL keywords are highlighted.

### Hover, go to definition and find all references

Similar to other programing languages, you can hover over a PDDL predicate, function or type and see the definition. If some comments are placed on the same line, they are also displayed while hovering.

You can jump to definition of predicates and functions in two ways: _Ctrl+click_ or _Right-click > Go to Definition_ menu.

You can also right click on such symbol and select _Find All References_.

![hover_go_to_definition_references](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_symbol_definition_and_references.gif)

### Jump to Symbol

Use the VS Code keyboard shortcut _Ctrl + Shift + O_ to open up the symbol listing. That lists all predicates, functions and actions in the domain file. That way you may review the full list of actions in a concise way and jump to their declaration.

![symbol_listing](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_symbol_listing.gif)

### Auto-completion

When typing in the domain or problem file characters such as `(` or `:`, Visual Studio Code pops up the suggested keywords or names of predicates/functions.

![auto_completion](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_auto_completion.gif)

### Syntactic errors

PDDL parser can be configured to run in the background and draw attention to syntactic errors, so you can fix them before running the planner. This dramatically shortens the time you need to come up with a valid PDDL.

![parser_configuration](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_parser_configuration.gif)

To learn more about how to configure the extension to work with one of the parsers available or even your own, read this [wiki page](https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser).

### Run the planner and visualize plans

The planner can be invoke in the context of a currently edited PDDL file. There are two ways how to do that via the user interface.

- Type `Ctrl + Shift + P` and type _plan_ to filter the list of available commands. The _Run the planner and visualize the plan_ command should be visible.
- Right click on the PDDL file and select  _Run the planner and visualize the plan_
- Alternatively you can set up a keyboard shortcut such as `Alt + P` to be associated with the above command (see VS Code documentation for that)

There are multiple scenarios supported:

- if command is invoked on the domain file,
    - and if single corresponding problem file is open, the planner will run without asking further questions
    - and if multiple corresponding problem files are open, the list of applicable problem files will appear and the user will select one.
- if command is invoked on a problem file, the domain file (if open in the editor) will be selected automatically.

Domain and problem files correspond to each other, if:

- they have the same domain name and
- they are located in the same folder and
- both files are open in the editor.

![planner](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan.gif)

### Planning with command-line switches

When using a planner executable, further command-line options may be specified.

![planner](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_optimize.gif)

## Known Issues

See unfixed issues and submit new ones [here][github pddl issues].

## Release Notes

### 2.0.1

New command added to _Configure PDDL Planner_. Added configuration to override the planner command-line syntax.
Added support for solver.planning.domains/solve web service.
Supporting non-auto-saving editor mode by creating temp files for domain/problem when launching the planner.
Fixed an issue with some domains where the extension was hanging (while regexp parsing the types).

### 2.0.0

PDDL Language Server now provides rich PDDL syntax validation, hover info, Go to Definition, Find All References, Jump to symbol, Auto-completion, configuration of custom PDDL parser, planner execution and plan visualization.

### 1.0.2

Simplified snippets and added tabstops/placeholders to them, so they are easy to fill in with content.

### 1.0.1

Added missing `:requirements` options and fixed up the code snippets.

### 1.0.0

Initial release with simple syntax highlighting and code snippets.

-----------------------------------------------------------------------------------------------------------

## Source

[Github](https://github.com/jan-dolejsi/vscode-pddl)

### For more information

- [PDDL][PDDL]

**Enjoy!**

[PDDL]: https://en.wikipedia.org/wiki/Planning_Domain_Definition_Language
[github pddl issues]: https://github.com/jan-dolejsi/vscode-pddl/issues