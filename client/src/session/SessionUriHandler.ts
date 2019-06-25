/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
import { Uri, commands, UriHandler } from 'vscode';
import { SESSION_COMMAND_LOAD } from './SessionSourceControl';

/** Handles system-wide URI requests. Note that each session can register only one UriHandler! */
export class SessionUriHandler implements UriHandler {

    handlers: UriMatchHandler[];

    constructor() {
        this.handlers = [
            new ReadOnlySessionUriHandler(),
            new ReadWriteSessionUriHandler()
        ];
    }

    handleUri(uri: Uri): void {
        this.handlers
            .filter(h => h.matches(uri))
            .forEach(h => h.handle(uri));
    }
}

interface UriMatchHandler {
    matches(uri: Uri): boolean;
    handle(uri: Uri): void;
}

class SingleArgumentUriHandler implements UriMatchHandler {

    constructor(private pattern: RegExp, private command: string) {}

    matches(uri: Uri): boolean {
        this.pattern.lastIndex = 0;
        let matchGroups = this.pattern.exec(uri.path);
        return matchGroups !== null;
    }

    handle(uri: Uri): void {
        this.pattern.lastIndex = 0;
        let matchGroups = this.pattern.exec(uri.path);
        if (matchGroups) {
            let argumentValue = matchGroups[1];
            commands.executeCommand(this.command, argumentValue);
        }
    }
}
class ReadOnlySessionUriHandler extends SingleArgumentUriHandler {
    constructor() {
        super(/\/planning.domains\/session\/(\w+)$/i, SESSION_COMMAND_LOAD);
    }
}

class ReadWriteSessionUriHandler extends SingleArgumentUriHandler {
    constructor() {
        super(/\/planning.domains\/session\/edit\/(\w+)$/i, SESSION_COMMAND_LOAD);
    }
}