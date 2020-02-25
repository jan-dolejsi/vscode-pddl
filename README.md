# Contributing to `vscode-pddl` extension

Are you looking for the [End-user documentation](client/README.md)?

## Building extension

Run `npm install`.

This will ensure the extension dependencies are downloaded using the `--no-optional` switch.

## Packaging extension

Install the VS Code extension packaging tool:

```bash
npm install -g vsce
```

The extension must be packaged on computers that have the `npm` version <= 5.5.1 installed globally. This is because of an issue with optional dependencies that `vsce` is wrongly enforcing via the `npm list --production --parsable --depth=99999` command.

Extension packaging and publishing is automated by the `client/publish.cmd` script - obviously only defined for Windows.

## Testing the extension

Run `npm test` when all VS Code windows are closed.

## Making a release

Modify following files:

- Update the version in `client/package.json`
- Update the version in `client/publish.cmd`
- Add section about new features and fixes on top of the `client\CHANGELOG.md` and refer to Git tag at the bottom of the file
- Add end-user documentation about new features to `client\README.md`

## Credits

Icons made by [Pixel perfect](https://www.flaticon.com/authors/pixel-perfect) from [www.flaticon.com](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/).

Development of this extension was supported by [Schlumberger](https://www.slb.com). Visit [careers.slb.com](https://careers.slb.com/).
