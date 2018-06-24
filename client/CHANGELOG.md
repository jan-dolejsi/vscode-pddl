# What's new

## [Unreleased]

Debugging plan happenings.

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

* missing PDDL requirements in syntax highlighting: `strips, typing, negative-preconditions, disjunctive-preconditions, equality, existential-preconditions, universal-preconditions, quantified-preconditions, conditional-effects, fluents, numeric-fluents, adl, durative-actions, duration-inequalities, continuous-effects, derived-predicates, timed-initial-literals, preferences, constraints, action-costs, timed-initial-fluents`

### Changed

- fixed parameters to action snippets
- banner color

## 1.0.0 - 2017-04-15

### Added

- Initial release
- PDDL Snippets for `domain`, `problem`, `action` and `durative-action`.
- Syntax highlighting for commonly used PDDL features

## Future work

- Port custom html views to webview API
- Review configuration properties scope - which properties should be moved to 'application' scope?
- Validate new symbol name while renaming using `prepareRename`
- Rename parameters and objects
- Auto-completion for constant/object names.
- Plan debugger
- Removal of the language server
- More general matching of domain file to problem file across workspace folder structure

## Note to contributors

Note for open source contributors: all notable changes to the "pddl" extension will be documented in this file.

Check [Keep a Changelog](http://keepachangelog.com/) for recommendations on how to structure this file.

[Unreleased]: https://github.com/jan-dolejsi/vscode-pddl/compare/v2.6.6...HEAD
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
