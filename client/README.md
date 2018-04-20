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

![auto_completion](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_auto_completion.gif)

Some PDDL constructs are supported with smart snippets, which are aware of where you are in the document and what is in your model:

![timed_initial_literals_snippets](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_timed_initial_snippets.gif)

### Syntactic errors

PDDL parser can be configured to run in the background and draw attention to syntactic errors, so you can fix them before running the planner. This dramatically shortens the time you need to come up with a valid PDDL.

![parser_configuration](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_parser_configuration.gif)

To learn more about how to configure the extension to work with one of the parsers available or even your own, read this [wiki page](https://github.com/jan-dolejsi/vscode-pddl/wiki/Configuring-the-PDDL-parser).

### Run the planner and visualize plans

The planner can be invoked in the context of a currently edited PDDL file. There are two ways how to do that via the user interface.

- Type `Ctrl + Shift + P` and type _plan_ to filter the list of available commands. The _Run the planner and visualize the plan_ command should be visible.
- Right click on the PDDL file and select  _Run the planner and visualize the plan_
- Alternatively you can set up a keyboard shortcut such as `Alt + P` to be associated with the above command (see VS Code documentation for that)

There are multiple scenarios supported:

- if command is invoked on the domain file,
    - and if single corresponding problem file is open, the planner will run without asking further questions
    - and if multiple corresponding problem files are open, the list of applicable problem files will appear and the user will select one.
- if command is invoked on a problem file, the domain file (if open in the editor) will be selected automatically.

Domain and problem files correspond to each other, if:

- they have the same domain name i.e. `(domain name)` and
- they are located in the same folder and
- both files are open in the editor.

![planner](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan.gif)

See other [useful keyboard shortcuts for working with PDDL in VS Code](https://github.com/jan-dolejsi/vscode-pddl/wiki/keyboard-shortcuts).

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

### Planning with command-line switches

When using a planner executable, further command-line options may be specified.

![planner](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_plan_optimize.gif)

### Auto-completion snippets for symmetric and sequential initialization

Creating a realistic problem files to test the domain may be tedious. Here are several ways to make it substantially faster:

Initializing a sequence of symmetric relationships.

![planner](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_sequence_init.gif)

Initializing a symmetric relationships.

![planner](https://raw.githubusercontent.com/wiki/jan-dolejsi/vscode-pddl/img/PDDL_symmetric_init.gif)

## Known Issues

See unfixed issues and submit new ones [here][github pddl issues].

## Release Notes

See [CHANGELOG](CHANGELOG.md).


## Source

[Github](https://github.com/jan-dolejsi/vscode-pddl)

### For more information

- [PDDL][PDDL]

**Enjoy!**

[PDDL]: https://en.wikipedia.org/wiki/Planning_Domain_Definition_Language
[github pddl issues]: https://github.com/jan-dolejsi/vscode-pddl/issues