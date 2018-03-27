# What's new?

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

* missing PDDL requirements in syntax highlighting: `strips, typing, negative-preconditions, disjunctive-preconditions, equality, existential-preconditions, universal-preconditions, quantified-preconditions, conditional-effects, fluents, numeric-fluents, adl, durative-actions, duration-inequalities, continuous-effects, derived-predicates, timed-initial-literals, preferences, constraints, action-costs, timed-initial-fluents`

### Changed

* fixed parameters to action snippets
* banner color

## 1.0.0 - 2017-04-15

### Added

* Initial release
* PDDL Snippets for `domain`, `problem`, `action` and `durative-action`.
* Syntax highlighting for commonly used PDDL features

## [Unreleased]

* Rename parameters and objects
* Auto-completion for constant/object names.
* Plan debugger
* Domain _unit_ testing

Note for open source contributors: all notable changes to the "pddl" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

[Unreleased]: https://github.com/jan-dolejsi/vscode-pddl/compare/v2.5.0...HEAD
[2.5.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.4.2...v2.5.0
[2.4.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.0.3...v2.4.2
[2.0.3]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.0.2...v2.0.3
[2.0.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.0.1...v2.0.2
[2.0.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/v2.0.0...v2.0.1
[2.0.0]:https://github.com/jan-dolejsi/vscode-pddl/compare/v1.0.2...v2.0.0
[1.0.2]:https://github.com/jan-dolejsi/vscode-pddl/compare/v1.0.1...v1.0.2
[1.0.1]:https://github.com/jan-dolejsi/vscode-pddl/compare/1.0.0...v1.0.1
