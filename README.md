# Planning Domain Description Language Support

This extension makes VS Code a great place for modeling planning domains. Read more [about PDDL][PDDL].

## Features

Extension is activated on any `.pddl` files (commonly holding domain definitions) or files with no extension (commonly used for problem definitions).

### Snippets

Following snippets are supported if you start typing following prefix

- `domain`: creates a domain skeleton
- `action`: instantaneous action
- `action-durative`: durative action
- `problem`: creates a problem skeleton

![snippets](https://raw.githubusercontent.com/jan-dolejsi/vscode-pddl/master/images/snippets.gif)

### Syntax highlighting

Commonly used PDDL keywords are highlighted.

## Known Issues

See unfixed issues and submit new ones [here][github pddl issues].

## Release Notes

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